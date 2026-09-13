/**
 * Orquestador del Agente de Arquitectura (ArquiRegula Chile).
 *
 * (Indicadores IL1.2 e IL1.3)
 *
 * Flujo del agente:
 *  1. Recibe consulta del usuario + historial de la sesión.
 *  2. Recupera fragmentos normativos relevantes vía RAG (retriever.ts).
 *  3. Decide si conviene consulta web externa (heurística por presencia de
 *     términos locales: comuna, municipalidad, plan regulador comunal, tarifa).
 *  4. Construye el prompt final con el sistema + contexto RAG + contexto web.
 *  5. Llama al LLM (vía adaptador unificado) y devuelve respuesta + trazabilidad.
 *
 * La trazabilidad (fuentes usadas, herramientas invocadas) se persiste en
 * ChatMessage para auditoría (IL1.4 - justificación y trazabilidad).
 */
import { getLLM, getActiveProvider, type ChatMessageInput } from "@/lib/llm";
import { retrieve, type RetrievedChunk } from "@/lib/rag/retriever";
import {
  ARCHITECT_AGENT_SYSTEM_PROMPT,
  buildRagContextBlock,
  buildWebContextBlock,
} from "@/lib/rag/prompts";
import type { ChatMessage } from "@prisma/client";

export interface AgentTurnResult {
  response: string;
  sources: RetrievedChunk[];
  webSources: { title: string; url: string; snippet: string; hostName: string }[];
  toolsUsed: string[];
  provider: string;
}

/** Términos que sugieren necesidad de búsqueda web externa. */
const WEB_TRIGGERS = [
  "comuna",
  "municipalidad",
  "plan regulador comunal",
  "ordenanza de cobros",
  "tarifa",
  "costo",
  "precio",
  "2024",
  "2025",
  "reciente",
  "actual",
  "último",
  "nuevo",
  "modificación",
  "cambió",
];

function shouldSearchWeb(query: string): boolean {
  const q = query.toLowerCase();
  return WEB_TRIGGERS.some((t) => q.includes(t));
}

/** Construye el historial de mensajes para el LLM desde los registros DB. */
function buildHistoryMessages(history: ChatMessage[], systemPrompt: string): ChatMessageInput[] {
  const messages: ChatMessageInput[] = [{ role: "system", content: systemPrompt }];
  for (const m of history) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role as "user" | "assistant", content: m.content });
    }
  }
  return messages;
}

/**
 * Ejecuta un turno del agente.
 *
 * @param query Consulta del usuario
 * @param history Historial previo de la sesión (en orden cronológico)
 */
export async function runAgentTurn(
  query: string,
  history: ChatMessage[],
): Promise<AgentTurnResult> {
  const llm = await getLLM();
  const provider = getActiveProvider();

  // 1. Recuperación RAG (fuente interna)
  const sources = await retrieve(query, 5);

  // 2. Decisión de búsqueda web (fuente externa)
  const toolsUsed: string[] = ["rag_retriever"];
  let webSources: AgentTurnResult["webSources"] = [];

  if (shouldSearchWeb(query)) {
    if (llm.webSearch) {
      toolsUsed.push("web_search");
      try {
        const enrichedQuery = `${query} Chile regularización edificación DOM LGUC OGUC`;
        const results = await llm.webSearch(enrichedQuery, 4);
        webSources = results.slice(0, 4).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          hostName: r.hostName,
        }));
      } catch (err) {
        console.error("[agent] web_search falló:", err);
      }
    } else {
      // Proveedor sin web_search (ej. OpenAI) — se registra como no disponible
      toolsUsed.push("web_search_unavailable");
    }
  }

  // 3. Construcción de prompts
  const ragBlock = buildRagContextBlock(sources);
  const webBlock = buildWebContextBlock(webSources);

  const systemPrompt = ARCHITECT_AGENT_SYSTEM_PROMPT.replace("{RAG_CONTEXT}", ragBlock).replace(
    "{WEB_CONTEXT}",
    webBlock,
  );

  const messages = buildHistoryMessages(history, systemPrompt);
  messages.push({ role: "user", content: query });

  // 4. Llamada al LLM (adaptador unificado)
  const result = await llm.createChatCompletion(messages);

  const response =
    result.content ||
    "(El agente no pudo generar una respuesta. Intente reformular la consulta.)";

  return {
    response,
    sources,
    webSources,
    toolsUsed,
    provider,
  };
}

/**
 * Genera un documento formal de regularización.
 * (Usado por /api/generate-document)
 */
export async function generateRegularizationDocument(params: {
  docType: string;
  docLabel: string;
  caseData: string;
}): Promise<{ content: string; sources: RetrievedChunk[] }> {
  const { docLabel, caseData } = params;

  // Recupera normativa relevante a partir del caso
  const sources = await retrieve(caseData, 6);

  const { DOCUMENT_GENERATION_PROMPT } = await import("@/lib/rag/prompts");
  const prompt = DOCUMENT_GENERATION_PROMPT.replace("{DOC_TYPE}", docLabel)
    .replace("{CASE_DATA}", caseData)
    .replace("{RAG_CONTEXT}", buildRagContextBlock(sources));

  const llm = await getLLM();
  const result = await llm.createChatCompletion([
    {
      role: "system",
      content:
        "Eres un arquitecto redactor experto en documentación de regularización de obras en Chile.",
    },
    { role: "user", content: prompt },
  ]);

  const content = result.content || "(No se pudo generar el documento.)";

  return { content, sources };
}
