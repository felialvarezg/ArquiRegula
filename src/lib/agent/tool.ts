/** =========================================================================
 *  Tool registry + ejecución — ArquiRegula Chile
 *  (Rubric IL2.1)
 *
 *  Expone la interfaz `Tool` y un `ToolRegistry` que gestiona la inyección y
 *  ejecución de herramientas. Cada herramienta es un objeto inyectado con su
 *  esquema JSON de parámetros, lo que permite que el planificador elija qué
 *  herramienta llamar y con qué argumentos, en lugar de depender de heurísticas
 *  ad-hoc.
 * =========================================================================
 */

import type {
  Tool,
  ToolName,
  ToolInputSchema,
  ToolResult,
  MemoryEntry,
  MemoryKind,
} from "@/lib/agent/types";
import { retrieve } from "@/lib/rag/retriever";
import { getLLM, getActiveProvider } from "@/lib/llm";
import type { DocumentType } from "@/lib/rag/prompts";
import { DOCUMENT_TYPES, DOCUMENT_GENERATION_PROMPT, buildRagContextBlock } from "@/lib/rag/prompts";
import { db } from "@/lib/db";
import { generateRegularizationDocument } from "@/lib/agent/document";

/** Respuesta estandarizada de una herramienta `query_knowledge`. */
export interface KnowledgeResult {
  id: string;
  title: string;
  source: string;
  article: string;
  category: string;
  content: string;
  url: string | null;
  score: number;
}

/** Respuesta estandarizada de `web_search`. */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  hostName: string;
}

// ---------------------------------------------------------------------------
// Herramientas built-in
// ---------------------------------------------------------------------------

/** Consulta la base de conocimiento (RAG interno). */
export async function toolQueryKnowledge(
  query: string,
  topK = 5,
): Promise<KnowledgeResult[]> {
  const chunks = await retrieve(query, topK);
  return chunks.map((c) => ({
    id: c.id,
    title: c.title,
    source: c.source,
    article: c.article,
    category: c.category,
    content: c.content,
    url: c.url,
    score: c.score,
  }));
}

/** Búsqueda web externa. Requiere un proveedor que exponga `webSearch`. */
export async function toolWebSearch(
  query: string,
  num = 4,
): Promise<WebSearchResult[]> {
  const llm = await getLLM();
  if (!llm.webSearch) return [];
  const results = await llm.webSearch(`${query} Chile regularización edificación DOM LGUC OGUC`, num);
  return results.slice(0, num).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet,
    hostName: r.hostName,
  }));
}

/** Escritura: genera un documento formal (memoria, checklist, formulario, dictamen). */
export async function toolGenerateDocument(
  docType: DocumentType,
  caseData: string,
): Promise<{ content: string; sources: KnowledgeResult[] }> {
  const { content, sources } = await generateRegularizationDocument({
    docType,
    docLabel: DOCUMENT_TYPES[docType].label,
    caseData,
  });
  return {
    content,
    sources: sources.map((c) => ({
      id: c.id,
      title: c.title,
      source: c.source,
      article: c.article,
      category: c.category,
      content: c.content,
      url: c.url,
      score: c.score,
    })),
  };
}

/** Resumen de texto (uso: compresión de contexto a largo plazo). */
export async function toolSummarize(text: string, maxTokens = 600): Promise<string> {
  const llm = await getLLM();
  const prompt = `Resume el siguiente texto en máximo ${maxTokens} tokens, conservando los datos más relevantes (nombres, números, normativa, pasos). Devuelve SOLO el resumen, sin encabezados.

Texto:
${text}`;

  const result = await llm.createChatCompletion([
    { role: "system", content: "Eres un resumen ejecutivo." },
    { role: "user", content: prompt },
  ]);
  return (result.content || "").trim();
}

// ---------------------------------------------------------------------------
// Memory herramientas (illas IL2.2)
// ---------------------------------------------------------------------------

/**
 * Recupera información de memoria a largo plazo (caso + preferencias)
 * para enriquecer la respuesta del agente.
 */
export async function toolRecall(
  query: string,
  sessionId: string | null,
): Promise<Array<{ content: string; kind: string }>> {
  const entries = await db.memoryEntry.findMany({
    where: {
      sessionId: sessionId ?? undefined,
      OR: [
        { kind: "case" },
        { kind: "preference" },
        { kind: "summary" },
        { kind: "feedback" },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return entries.map((e) => ({ content: e.content, kind: e.kind }));
}

/**
 * Guarda un hecho extraído en memoria a largo plazo.
 */
export async function toolRemember(
  content: string,
  kind: "episodic" | "case" | "preference" | "summary" | "feedback",
  sessionId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<MemoryEntry> {
  const entry = await db.memoryEntry.create({
    data: {
      sessionId,
      kind,
      content,
      metadata: JSON.stringify(metadata),
    },
  });
  const parsedMetadata: Record<string, unknown> = entry.metadata
    ? (JSON.parse(entry.metadata) as Record<string, unknown>)
    : {};
  return {
    id: entry.id,
    sessionId: entry.sessionId,
    kind: entry.kind as MemoryKind,
    content: entry.content,
    metadata: parsedMetadata,
    createdAt: entry.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Registro de herramientas
// ---------------------------------------------------------------------------

export const BUILTIN_TOOLS: Tool[] = [
  {
    name: "query_knowledge",
    description:
      "Consulta la base de conocimiento normativo interno (RAG) sobre regularización de obras en Chile. Devuelve fragmentos con fuente, artículo y score.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Consulta en lenguaje natural" },
        topK: { type: "number", description: "Número de fragmentos a devolver", default: 5 },
      },
      required: ["query"],
    },
    async execute(args: { query: string; topK?: number }): Promise<ToolResult> {
      try {
        const results = await toolQueryKnowledge(args.query, args.topK ?? 5);
        const data = results.map((r) => ({
          id: r.id,
          title: r.title,
          source: r.source,
          article: r.article,
          category: r.category,
          url: r.url,
          score: r.score,
          preview: r.content.slice(0, 400),
        }));
        return {
          content: JSON.stringify({ count: data.length, results: data }, null, 2),
          kind: "json",
          data,
        };
      } catch (err) {
        return {
          content: `Error en query_knowledge: ${(err as Error).message}`,
          kind: "text",
        };
      }
    },
  },
  {
    name: "web_search",
    description:
      "Busca información en fuentes externas (web). Útil para datos actualizados (cobros comuna, reglamentos, recientes).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Consulta" },
        num: { type: "number", description: "Número de resultados", default: 4 },
      },
      required: ["query"],
    },
    async execute(args: { query: string; num?: number }): Promise<ToolResult> {
      try {
        const results = await toolWebSearch(args.query, args.num ?? 4);
        const data = results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet, hostName: r.hostName }));
        return {
          content: JSON.stringify({ count: data.length, results: data }, null, 2),
          kind: "json",
          data,
        };
      } catch (err) {
        return {
          content: `Error en web_search: ${(err as Error).message}`,
          kind: "text",
        };
      }
    },
  },
  {
    name: "generate_document",
    description:
      "Genera un documento formal de regularización en Markdown (memoria explicativa, checklist DOM, formulario único o dictamen previo).",
    parameters: {
      type: "object",
      properties: {
        docType: { type: "string", description: "Tipo de documento" },
        caseData: { type: "string", description: "Antecedentes del caso (MD o texto estructurado)" },
      },
      required: ["docType", "caseData"],
    },
    async execute(args: { docType: DocumentType; caseData: string }): Promise<ToolResult> {
      try {
        const { content, sources } = await toolGenerateDocument(args.docType, args.caseData);
        const data = sources.map((s) => ({ id: s.id, source: s.source, article: s.article, score: s.score }));
        return {
          content,
          kind: "text",
          data,
        };
      } catch (err) {
        return {
          content: `Error en generate_document: ${(err as Error).message}`,
          kind: "text",
        };
      }
    },
  },
  {
    name: "summarize",
    description:
      "Comprime un texto largo en un resumen ejecutivo (usado para compactar el contexto de la sesión).",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Texto a resumir" },
        maxTokens: { type: "number", description: "Límite aproximado de tokens", default: 600 },
      },
      required: ["text"],
    },
    async execute(args: { text: string; maxTokens?: number }): Promise<ToolResult> {
      try {
        const summary = await toolSummarize(args.text, args.maxTokens ?? 600);
        return { content: summary, kind: "text", data: summary };
      } catch (err) {
        return {
          content: `Error en summarize: ${(err as Error).message}`,
          kind: "text",
        };
      }
    },
  },
  {
    name: "remember",
    description:
      "Guarda un hecho extraído en memoria a largo plazo (caso, preferencia, resumen, feedback).",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Contenido del hecho" },
        kind: {
          type: "string",
          description: "Tipo de memoria",
        },
        metadata: { type: "object", description: "Metadatos adicionales (JSON)" },
        sessionId: { type: "string", description: "Id de la sesión (opcional)" },
      },
      required: ["content", "kind"],
    },
    async execute(args: {
      content: string;
      kind: "episodic" | "case" | "preference" | "summary" | "feedback";
      metadata?: Record<string, unknown>;
      sessionId?: string;
    }): Promise<ToolResult> {
      try {
        const entry = await toolRemember(args.content, args.kind, args.sessionId ?? null, args.metadata ?? {});
        return {
          content: `✓ Hecho guardado en memoria (id: ${entry.id}).`,
          kind: "text",
          data: entry,
        };
      } catch (err) {
        return {
          content: `Error en remember: ${(err as Error).message}`,
          kind: "text",
        };
      }
    },
  },
  {
    name: "recall",
    description:
      "Recupera información relevante de la memoria a largo plazo (caso, preferencias, resumen) para contextualizar la respuesta.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Consulta de recuperación" },
        sessionId: { type: "string", description: "Id de la sesión (opcional)" },
      },
      required: ["query"],
    },
    async execute(args: { query: string; sessionId?: string }): Promise<ToolResult> {
      try {
        const results = await toolRecall(args.query, args.sessionId ?? null);
        const data = results.map((r) => ({ kind: r.kind, content: r.content }));
        return {
          content: JSON.stringify({ count: data.length, results: data }, null, 2),
          kind: "json",
          data,
        };
      } catch (err) {
        return {
          content: `Error en recall: ${(err as Error).message}`,
          kind: "text",
        };
      }
    },
  },
  {
    name: "search_memory",
    description: "Busca recuerdos de la sesión que coinciden con la consulta del caso.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Términos que describen el antecedente a recuperar" },
        sessionId: { type: "string", description: "Id de la sesión" },
      },
      required: ["query"],
    },
    async execute(args: { query: string; sessionId?: string }): Promise<ToolResult> {
      try {
        const entries = await toolRecall(args.query, args.sessionId ?? null);
        const terms = args.query.toLocaleLowerCase("es").match(/[\p{L}\p{N}]{3,}/gu) ?? [];
        const ranked = entries
          .map((entry) => ({ ...entry, matches: terms.filter((term) => entry.content.toLocaleLowerCase("es").includes(term)).length }))
          .filter((entry) => terms.length === 0 || entry.matches > 0)
          .sort((a, b) => b.matches - a.matches)
          .slice(0, 5)
          .map(({ content, kind }) => ({ content, kind }));
        return {
          content: JSON.stringify({ count: ranked.length, results: ranked }, null, 2),
          kind: "json",
          data: ranked,
        };
      } catch (err) {
        return {
          content: `Error en search_memory: ${(err as Error).message}`,
          kind: "text",
        };
      }
    },
  },
];

/** Resuelve una herramienta por nombre (registro + búsqueda por nombre). */
export function getTool(name: ToolName): Tool | undefined {
  return BUILTIN_TOOLS.find((t) => t.name === name);
}

/** Lista todas las herramientas disponibles. */
export function listTools(): Tool[] {
  return [...BUILTIN_TOOLS];
}

/** Ejecuta una herramienta por nombre y argumentos (tipo seguro cast). */
export async function executeTool(
  name: ToolName,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) {
    return { content: `Herramienta desconocida: ${name}` };
  }
  // El tipo de `args` varía por herramienta; se asigna con un cast seguro.
  return tool.execute(args as never);
}
