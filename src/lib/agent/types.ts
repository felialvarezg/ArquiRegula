/** =========================================================================
 *  Agent type definitions — ArquiRegula Chile
 *  (Rubric IL2.1 · IL2.2 · IL2.3)
 *
 *  Core interfaces for the agent framework:
 *    - Tools (query / writing / reasoning / memory / planning)
 *    - Plans & plan steps
 *    - Agent state (short-term + long-term context)
 *    - Decision model (plan · execute · clarify · synthesize)
 *    - Final turn result with memory snapshot
 * =========================================================================
 */

import type { RetrievedChunk } from "@/lib/rag/retriever";
import { MemoryManager } from "./memory";

/** Every tool exposed by the agent, keyed by a stable name. */
export type ToolName =
  | "query_knowledge" // RAG: consulta la base interna de normativa
  | "web_search"      // Búsqueda externa (Z.ai / OpenAI web)
  | "generate_document" // Escritura: genera un documento formal
  | "summarize"       // Resumen (compresión de contexto)
  | "remember"        // Escritura en memoria a largo plazo
  | "recall"          // Recuperación de memoria a largo plazo
  | "search_memory";  // Recuperación híbrida (caso + preferencias)

/** JSON Schema fragment describing the parameters of a tool. */
export interface ToolInputSchema {
  type: "object";
  properties: Record<string, { type: string; description: string; default?: unknown }>;
  required: string[];
}

/** A callable tool with a typed schema and an execution function. */
export interface Tool {
  readonly name: ToolName;
  readonly description: string;
  readonly parameters: ToolInputSchema;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

/** Result returned by any tool execution. */
export interface ToolResult {
  readonly content: string; // texto visible (respuesta o detalle)
  readonly kind?: "text" | "json"; // para serialización
  readonly data?: unknown; // artefacto (markdown, fetch, etc.)
}

/** A single step of a multi-stage plan. */
export interface PlanStep {
  id: string;
  tool: ToolName | "synthesize" | "ask_clarify" | "compaction";
  description: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  args: Record<string, unknown>;
  result?: string;
  error?: string;
}

/** A complete plan with ordered steps and lifecycle state. */
export interface Plan {
  id: string;
  sessionId: string | null;
  goal: string;
  steps: PlanStep[];
  status: "pending" | "in_progress" | "completed" | "aborted";
  createdAt: string;
  updatedAt: string;
}

/** Kind of stored long-term memory. */
export type MemoryKind =
  | "episodic" // hechos extraídos de la conversación
  | "case"     // datos del caso (propietario, comuna, obra...)
  | "preference" // preferencias del usuario
  | "summary"  // resumen de sesión (continuidad)
  | "feedback" // correcciones explícitas del usuario;

export interface MemoryEntry {
  id: string;
  sessionId: string | null; // null = global (dominio/compañero)
  kind: MemoryKind;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Active agent state: short-term context (history) + long-term memory. */
export interface AgentContext {
  sessionId: string | null;
  currentTurn: number;
  maxTurnsBeforeCompaction: number;
  recentMessages: Array<{
    role: "user" | "assistant";
    content: string;
    toolCalls?: string[];
  }>;
  sessionSummary: string | null;
  longTermMemory: MemoryEntry[];
  lastPlan: Plan | null;
  lastResponse?: string;
  toolsUsed: string[];
}

/** Decision taken by the planner at a given turn. */
export type AgentAction =
  | { type: "plan"; plan: Plan }
  | { type: "execute_tool"; tool: ToolName; args: Record<string, unknown>; stepId: string }
  | { type: "ask_clarify"; question: string }
  | { type: "synthesize"; response: string }
  | { type: "compaction"; summary: string }
  | { type: "stop" }
  | { type: "flow"; flowId: FlowId; plan: Plan };

/** Result of a full agent turn (rinde la IL2.2 + IL2.3). */
export interface AgentTurnResult {
  response: string;
  sources: RetrievedChunk[];
  webSources: Array<{ title: string; url: string; snippet: string; hostName: string }>;
  toolsUsed: string[];
  memory: {
    entries: MemoryEntry[];
    summary: string; // fragmento persistido de la sesión
  };
  provider: string;
  decision: AgentAction;
}

/** Identificador de un flujo de trabajo arquitectónico o de regulación del campo. */

/** Identificador de un flujo de trabajo arquitectónico o de regulación del campo. */
export type FlowId =
  | "dictamen_previo"
  | "checklist_supervision"
  | "verificacion_dominio"
  | "externalizacion_uso"
  | "reclasificacion_suelo"
  | "verificacion_normativa";

/** Un paso de flujo (heredado de PlanStep con condición y fallback). */
export interface FlowStep {
  id: string;
  tool: ToolName | "synthesize" | "ask_clarify" | "compaction";
  description: string;
  args?: Record<string, unknown>;
  condition?: (input: FlowInput) => boolean;
  fallback?: ToolName;
}

/** Definición de un flujo de trabajo: arquitectura o regulación del campo. */
export interface Flow {
  id: FlowId;
  name: string;
  label: string;
  description: string;
  documentType?: DocumentType;
  steps: FlowStep[];
  caseDataSchema: FlowInput;
}

/** Esquema de entrada de un flujo (campo base del caso). */
export interface FlowInput {
  name: string;
  label: string;
  description: string;
  type: "object" | "string" | "boolean" | "number";
  required: string[];
  properties: Record<string, { type: string; description: string; default?: unknown }>;
}

/** Estado compartido de un flujo durante la ejecución. */
export interface FlowContext {
  sessionId: string | null;
  query: string;
  caseData: Record<string, unknown>;
  memory: MemoryManager;
}

/** Decisión de planificación que incluye un flujo. */
export type FlowDecision =
  | { type: "flow"; flowId: FlowId; plan: Plan }
  | { type: "clarify"; question: string };

/** Registro de flujos disponibles (IL2.1: arquitectura del agente con herramientas). */
export interface FlowRegistry {
  get(id: FlowId): Flow | undefined;
  list(): Flow[];
  add(flow: Flow): void;
}

/** Tipos de documento soportados por la herramienta `generate_document` (uno de ellos ya previos `dictamen_previo`, `checklist_dom`, `formulario_unico`). */
export const DOCUMENT_TYPES = {
  memoria_explicativa: {
    label: "Memoria Explicativa de Regularización",
    description: "Documento técnico que describe la obra a regularizar, su origen, estado y marco normativo aplicable. Requerido por OGUC Art. 5.3.1.",
  },
  checklist_dom: {
    label: "Checklist de Documentos DOM",
    description: "Listado de verificación de todos los antecedentes que deben presentarse ante la DOM según el tipo de trámite.",
  },
  formulario_unico: {
    label: "Borrador Formulario Único",
    description: "Borrador con los datos a consignar en el Formulario Único de Edificación para permiso o regularización.",
  },
  dictamen_previo: {
    label: "Dictamen Previo / Informe Técnico",
    description: "Informe técnico que analiza la viabilidad de regularización de una obra existente conforme a la normativa vigente.",
  },
} as const;

export type DocumentType = keyof typeof DOCUMENT_TYPES;

/** Máximo número de mensajes manteniéndose en el contexto corto antes de compactar. */
export const SHORT_TERM_MAX_MESSAGES = 20;
