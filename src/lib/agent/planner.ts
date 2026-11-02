/** =========================================================================
 *  Planner — planificación y toma de decisiones — ArquiRegula Chile
 *  (Rubric IL2.3)
 *
 *  Estrategia de planificación:
 *    1. Clasifica la consulta en una intención (rag / web / doc / clarify /
 *       general) y predice la cantidad de etapas necesarias.
 *    2. Genera un plan de pasos ordenados (PlanStep) que combina herramientas
 *       y decisiones.
 *    3. Durante la ejecución se adapta: si un paso falla o produce pocos
 *       resultados, el plan se reescribe; si el contexto es insuficiente,
 *       se pregunta al usuario (clarification).
 *
 *  La toma de decisiones es hiperpura:
 *    - Reglas deterministas (tipos de documento, presencia de comuna, etc.)
 *    - Clasificación sugerida por LLM (con fallback determinista)
 *    - Evaluación de estado del plan (paso actual, éxito/fracaso)
 * =========================================================================
 */

import type { Plan, PlanStep, ToolName, FlowId } from "./types";
import { v4 as uuid } from "uuid";
import { SHORT_TERM_MAX_MESSAGES } from "./types";
import { FLOW_REGISTRY, planFlow } from "./flow";
import { MemoryManager } from "./memory";

// ---------------------------------------------------------------------------
// Clasificación de intenciones (determinista + LLM)
// ---------------------------------------------------------------------------

export type Intent =
  | "general"    // consulta abierta, no requiere herramienta específica
  | "rag"        // conocimiento normativo interno
  | "web"        // datos actualizados / locales
  | "document"   // generar un documento
  | "clarify"    // necesita aclaración del usuario
  | "multi"      // múltiples etapas (consulta + documento + memoria)

/**
 * Detecta semánticamente la intención de la consulta.
 * Reemplazable por una etapa de "thinking" de LLM en el futuro.
 */
export function classifyIntent(query: string): Intent {
  const q = query.toLowerCase();

  // Generación de documento
  if (/(generar|elaborar|redactar|hacer|crear|crear un|construir|montar) (un?|un?|el|la|los|las|el?|un?)\s*(documento|memoria|checklist|formulario|dictamen|informe|plano|hoja|borrador)/.test(q)) {
    return "document";
  }
  if (/(memoria explicativa|checklist dom|formulario único|dictamen previo)/.test(q)) {
    return "document";
  }

  // Búsqueda web (datos actualizados/locals)
  if (/(comuna|cobro|ordenanza de cobros|tarifa|precio|valor|reciente|actual|último|nuevo|modificación|cambió|como se hace|qué pasa|actualización|actualizaciones|normativa mayor 202[4-5])/.test(q)) {
    return "web";
  }

  // Múltiples etapas
  if (/(memoria explicativa|costo|documentos necesarios|pasos|procedimiento|checklist|regulización|certificado)/.test(q)) {
    return "multi";
  }

  // Conocimiento normativo interno
  if (/(regularizar|permo? municipal|permiso|te?xto|dirección de obras|DOM|OGUC|LGUC|artículo|ley|documento de (indicación|solicitud)|anteproyecto)/.test(q)) {
    return "rag";
  }

  return "general";
}

// ---------------------------------------------------------------------------
// Plan class (implementación simple con estado)
// ---------------------------------------------------------------------------

function createStepId(): string {
  return uuid();
}

export class PlanImpl implements Plan {
  id: string;
  sessionId: string | null;
  goal: string;
  steps: PlanStep[];
  status: "pending" | "in_progress" | "completed" | "aborted";
  createdAt: string;
  updatedAt: string;

  constructor(props: { sessionId: string | null; goal: string }) {
    this.id = createStepId();
    this.sessionId = props.sessionId;
    this.goal = props.goal;
    this.steps = [];
    this.status = "pending";
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
  }

  addStep(tool: ToolName | "synthesize" | "ask_clarify" | "compaction", description: string, args: Record<string, unknown> = {}): PlanStep {
    const step: PlanStep = {
      id: createStepId(),
      tool,
      description,
      status: "pending",
      args,
      result: undefined,
      error: undefined,
    };
    this.steps.push(step);
    this.updatedAt = new Date().toISOString();
    return step;
  }

  markRunning(stepId: string): void {
    const step = this.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = "running";
      this.updatedAt = new Date().toISOString();
    }
  }

  markCompleted(stepId: string, result?: string): void {
    const step = this.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = "success";
      if (result) step.result = result;
      this.updatedAt = new Date().toISOString();
    }
  }

  markFailed(stepId: string, error: string): void {
    const step = this.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = "failed";
      step.error = error;
      this.updatedAt = new Date().toISOString();
    }
  }

  get stepIndex(): number {
    return this.steps.findIndex((s) => s.status === "pending" || s.status === "running");
  }

  isComplete(): boolean {
    return this.steps.every((s) => s.status === "success" || s.status === "skipped");
  }
}

// ---------------------------------------------------------------------------
// Decisión del planificador
// ---------------------------------------------------------------------------

export interface PlannerInput {
  query: string;
  sessionId: string | null;
  intent: Intent;
  numPreviousMessages: number;
  memoryItems: number;
  docType?: string;
  caseData?: string;
  flowId?: FlowId;
}

export interface Decision {
  /** Tipo de acción primaria: planear, ejecutar herramienta, aclarar, sintetizar, compactar. */
  type: "plan" | "execute_tool" | "clarify" | "synthesize" | "compaction" | "stop" | "flow";
  flowId?: FlowId;
  plan?: Plan;
  tool?: ToolName;
  args?: Record<string, unknown>;
  stepId?: string;
  question?: string; // si type === clarify
  response?: string; // si type === synthesize / compaction
}

/**
 * Planificador principal. Dado la intención de la consulta y el estado de la
 * sesión, produce un Plan y la primera sub-acción a ejecutar.
 */
export function planAgentTurn(
  input: PlannerInput,
): Decision {
  const { query, sessionId, intent, numPreviousMessages, memoryItems, docType, caseData, flowId } = input;

  // Si el usuario especificó un flujo, usar ese flujo en lugar de la intención.
  if (flowId && FLOW_REGISTRY.get(flowId)) {
    const flow = FLOW_REGISTRY.get(flowId)!;
    const plan = planFlow(flow, {
      sessionId,
      query,
      caseData: { docType: docType ?? flow.documentType ?? "memoria_explicativa" },
      memory: {} as MemoryManager,
    });
    return { type: "flow" as const, flowId, plan };
  }

  // Si el usuario necesita clarificar, no planear.
  if (intent === "clarify") {
    return { type: "clarify", question: "¿Podrías darme un poco más de detalle para poder ayudarte? Por ejemplo: el tipo de obra, la comuna, el destino de la misma, o si ya contaste con algún documento." };
  }

  // 1. Construir el plan
  const plan = new PlanImpl({ sessionId, goal: `Responder/generar: ${query}` });

  // Etapa 0: consultar memoria a largo plazo (continuidad)
  plan.addStep("recall", "Recuperar hechos y caso guardados en memoria a largo plazo");

  // Según la intención, añadir paso/s:
  switch (intent) {
    case "document": {
      // Document → descomponer en plan: 1) recuperar normativa, 2) redactar, 3) citar, 4) persistir
      plan.addStep("query_knowledge", "Recuperar normativa aplicable al tipo de documento", { query: query });
      plan.addStep("generate_document", "Redactar documento formal", { docType: docType ?? "memoria_explicativa", caseData: caseData ?? "" });
      plan.addStep("remember", "Guardar el caso generado en memoria a largo plazo", { content: "Caso reportado para regularización", kind: "case" });
      plan.addStep("synthesize", "Presentar el documento al usuario con fuentes y firmas", {});
      break;
    }

    case "web": {
      // Web → consultar web, evaluar resultados, luego responder
      plan.addStep("web_search", "Buscar información actualizada (cobros, normativa municipal)", { query: query });
      plan.addStep("query_knowledge", "Consolidar con la base de conocimiento interna", { query: query });
      plan.addStep("synthesize", "Responder integrado con fuentes internas y externas", {});
      break;
    }

    case "multi": {
      // Múltiples etapas: razonamiento + posible documento
      plan.addStep("query_knowledge", "Identificar documentos/normativa requeridos", { query: query });
      plan.addStep("recall", "Recuperar contexto previo del caso", {});
      // Decide si se necesita documento: heurística
      if (/costo|precio|valor|cuánto|montos/i.test(query)) {
        plan.addStep("web_search", "Obtener precios/datos actualizados", { query: query });
      }
      plan.addStep("synthesize", "Síntesis final with steps + sources", {});
      break;
    }

    case "rag": {
      // Conocimiento interno: consulta RAG, responder
      plan.addStep("query_knowledge", "Recuperar fragmentos normativos", { query: query });
      plan.addStep("synthesize", "Responder con fuentes citadas", {});
      break;
    }

    case "general": {
      // General: razonamiento sin herramienta definida → LLM puro
      plan.addStep("synthesize", "Respuesta del agente con base en el conocimiento interno", {});
      break;
    }
  }

  // 2. Decide la primera acción:
  //    - Si el plan tiene 1 paso → ejecutar directamente (eficiencia)
  //    - Si tiene >1 → plan + ejecutar el primer paso
  const firstStep = plan.steps[0];
  if (plan.steps.length === 1) {
    return {
      type: "execute_tool",
      tool: firstStep.tool as ToolName,
      args: firstStep.args as Record<string, unknown>,
      stepId: firstStep.id,
    };
  }

  // 3. Plan completo + ejecutar paso 1
  return {
    type: "plan",
    plan,
    tool: firstStep.tool as ToolName,
    args: firstStep.args as Record<string, unknown>,
    stepId: firstStep.id,
  };
}

/**
 * Adaptador: decide si un paso falló y sugiere reponerlo con un fallback.
 * No transforma el plan, solo reporta la decisión de adaptación.
 */
export interface AdaptationDecision {
  shouldAdapt: boolean;
  stepId?: string;
  reason: string;
  fallback?: ToolName | "skip" | "ask_clarify";
}

export function adaptStep(stepId: string, step: PlanStep, fallbackTool?: ToolName): AdaptationDecision {
  if (step.status === "failed") {
    if (step.error?.includes("no results") || step.error?.includes("empty")) {
      // Si RAG devolvió pocos resultados, intentar web
      if (fallbackTool === "web_search") {
        return { shouldAdapt: true, stepId, reason: "RAG sin resultados, reemplazar por búsqueda web", fallback: fallbackTool };
      }
      // Sin web disponble, saltar
      return { shouldAdapt: true, stepId, reason: "RAG sin resultados y web no disponible, omitir paso", fallback: "skip" };
    }
    // Fallo genérico: volver a intentar la misma herramienta
    return { shouldAdapt: true, stepId, reason: `Paso falló: ${step.error}`, fallback: step.tool as ToolName };
  }
  return { shouldAdapt: false, reason: "Paso OK" };
}
