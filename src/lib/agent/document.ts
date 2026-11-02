/** =========================================================================

 *  Genera documentos formales de regularización de obras (Markdown) usando
 *  RAG + LLM. Es reutilizable por:
 *    - La herramienta `generate_document` del kit de herramientas del agente
 *    - El API `/api/generate-document`
 *    - El script de demostración
 *
 *  Sin dependencias de otros módulos del agente (uso de `./document` evita
 *  ciclos entre `architecture-agent` ↔ `tool`).
 * =========================================================================
 */

import type { RetrievedChunk } from "@/lib/rag/retriever";
import { retrieve } from "@/lib/rag/retriever";
import { getLLM } from "@/lib/llm";
import { buildRagContextBlock } from "@/lib/rag/prompts";
import { DOCUMENT_GENERATION_PROMPT } from "@/lib/rag/prompts";

/** Genera un documento formal usando RAG + LLM. */
export async function generateRegularizationDocument(params: {
  docType: string;
  docLabel: string;
  caseData: string;
}): Promise<{ content: string; sources: RetrievedChunk[] }> {
  const { docLabel, caseData } = params;

  // 1. Recupera normativa relevante a partir del caso
  const sources = await retrieve(caseData, 6);

  // 2. Construye el prompt con contexto RAG
  const prompt = DOCUMENT_GENERATION_PROMPT
    .replace("{DOC_TYPE}", docLabel)
    .replace("{CASE_DATA}", caseData)
    .replace("{RAG_CONTEXT}", buildRagContextBlock(sources));

  // 3. Llama a LLM
  const llm = await getLLM();
  const result = await llm.createChatCompletion([
    {
      role: "system",
      content: "Eres un arquitecto redactor experto en documentación de regularización de obras en Chile.",
    },
    { role: "user", content: prompt },
  ]);

  const content = result.content || "(No se pudo generar el documento.)";
  return { content, sources };
}
