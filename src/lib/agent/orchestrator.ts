/** =========================================================================
 *  Orchestrator — agente completo — ArquiRegula Chile
 *  (Rubric IL2.1 · IL2.2 · IL2.3)
 *
 *  Flujo de un turno:
 *    1. Recupera/navega contexto (ventana corta + resumen de sesión + memoria).
 *    2. Planifica (planificador → paso ordenado).
 *    3. Ejecuta los pasos de la plan, adaptando fallos.
 *    4. Guarda hechos en memoria a largo plazo (continuidad).
 *    5. Síntesis final + trazabilidad (fuentes, herramientas, memoria).
 *
 *  Diseño:
 *    - Plan → secuencia de pasos (tool / synthesize / clarify / compaction).
 *    - Tool → ejecución de consultas, escritura, memoria.
 *    - MemoryManager → memoria corto + largo plazo.
 *    - Adaptación → si un paso falla, el planifica decide el fallback.
 * =========================================================================
 */

import type {
  AgentTurnResult,
  Plan,
  AgentAction,
  ToolName,
  ToolResult,
  MemoryEntry,
} from "@/lib/agent/types";
import { PlanImpl, planAgentTurn } from "@/lib/agent/planner";
import { BUILTIN_TOOLS, getTool, executeTool } from "@/lib/agent/tool";
import { MemoryManager } from "@/lib/agent/memory";
import { retrieve, invalidateIndex } from "@/lib/rag/retriever";
import { getLLM, getActiveProvider } from "@/lib/llm";
import { buildRagContextBlock, buildWebContextBlock } from "@/lib/rag/prompts";
import { SHORT_TERM_MAX_MESSAGES } from "@/lib/agent/types";
import { classifyIntent as classifyIntentFn, type Intent } from "@/lib/agent/planner";
import type { PlanStep } from "@/lib/agent/types";
import { FLOW_REGISTRY, FlowDecision, type FlowId, type FlowContext, planFlow } from "@/lib/agent/flow";

// ---------------------------------------------------------------------------
// Estados transientes por turno (mantiene el estado entre mensajes)
// ---------------------------------------------------------------------------

interface TurnState {
  context: {
    sessionId: string | null;
    currentTurn: number;
    maxTurnsBeforeCompaction: number;
    recentMessages: Array<{ role: "user" | "assistant"; content: string; toolCalls?: string[] }>;
    sessionSummary: string | null;
    longTermMemory: MemoryEntry[];
    lastPlan: Plan | null;
    toolsUsed: string[];
  };
  memory: MemoryManager;
  externalErrorCount: Record<string, number>;
  lastPlanExecution: {
    plan: Plan;
    successes: string[];
    failures: string[];
  };
}

// ---------------------------------------------------------------------------
// Inyección de dependencias (para testing)
// ---------------------------------------------------------------------------

interface OrchestratorDep {
  planner: typeof planAgentTurn;
  planImpl: typeof PlanImpl;
  memory: MemoryManager;
  getTool: typeof getTool;
  executeTool: typeof executeTool;
  retrieve: typeof retrieve;
  invalidateIndex: typeof invalidateIndex;
  llm: typeof getLLM;
  provider: typeof getActiveProvider;
  ragBlock: typeof buildRagContextBlock;
  webBlock: typeof buildWebContextBlock;
}

// Instancia por defecto
const deps: OrchestratorDep = {
  planner: planAgentTurn,
  planImpl: PlanImpl,
  memory: new MemoryManager(),
  getTool,
  executeTool,
  retrieve,
  invalidateIndex,
  llm: getLLM,
  provider: getActiveProvider,
  ragBlock: buildRagContextBlock,
  webBlock: buildWebContextBlock,
};

function getDeps(): OrchestratorDep {
  return deps;
}

// ---------------------------------------------------------------------------
// Estado compartido del agente, por sesión.
// ---------------------------------------------------------------------------

const sharedStates = new Map<string | null, TurnState>();

function ensureState(sessionId: string | null): TurnState {
  let state = sharedStates.get(sessionId);
  if (!state) {
    const memory = new MemoryManager();
    state = {
      context: {
        sessionId,
        currentTurn: 0,
        maxTurnsBeforeCompaction: 6,
        recentMessages: [],
        sessionSummary: null,
        longTermMemory: [],
        lastPlan: null,
        toolsUsed: [],
      },
      memory,
      externalErrorCount: {},
      lastPlanExecution: { plan: { id: "", sessionId: null, goal: "", steps: [], status: "pending" as const, createdAt: "", updatedAt: "" }, successes: [], failures: [] },
    };
    sharedStates.set(sessionId, state);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Adaptación: decide fallback cuando un paso falla
// ---------------------------------------------------------------------------

function decideFallback(
  toolName: ToolName,
  lastError: string,
  state: TurnState,
): ToolName | null {
  // Si la herramienta falló por error externo (ej. web no disponible) y el
  // paso anterior era `web_search`, saltar a `query_knowledge`.
  if (toolName === "web_search" && (lastError.includes("no support") || lastError.includes("no disponible"))) {
    return "query_knowledge";
  }
  // Evitar bucles: si falla 3 veces la misma herramienta, omitirla.
  const count = (state.externalErrorCount[toolName] ?? 0) + 1;
  state.externalErrorCount[toolName] = count;
  if (count >= 3) {
    return null;
  }
  return toolName;
}

// ---------------------------------------------------------------------------
// Principal: ejecuta un turno completo
// ---------------------------------------------------------------------------

/**
 * Ejecuta un turno completo del agente con planificación y memoria.
 *
 * @param query consulta del usuario
 * @param sessionId sesión (opcional, null = global)
 * @param previousMessages historial si el estado compartido está vacío
 * @returns resultado del turno con trazabilidad y memoria
 */
export async function runAgentTurn(
  query: string,
  sessionId: string | null = null,
  previousMessages: Array<{ role: "user" | "assistant"; content: string }> = [],
): Promise<AgentTurnResult> {
  const state = ensureState(sessionId);
  const d = getDeps();

  // Rehydrate the short-term context after a server restart or a new worker.
  if (state.context.recentMessages.length === 0 && previousMessages.length > 0) {
    state.context.recentMessages = previousMessages.slice(-SHORT_TERM_MAX_MESSAGES).map((message) => ({ ...message }));
  }

  // 1. Actualizar historial corto
  state.context.recentMessages.push({ role: "user", content: query, toolCalls: ["user"] });
  state.context.currentTurn += 1;

  // 2. Clasificar la intención y planificar
  const intent: Intent = classifyIntentFn(query);
  const planDecision = d.planner({
    query,
    sessionId,
    intent,
    numPreviousMessages: state.context.recentMessages.length,
    memoryItems: state.context.longTermMemory.length,
  });

  if (planDecision.type === "clarify") {
    const response = `💡 ${planDecision.question}`;
    d.memory.remember(response, "feedback", sessionId, { source: "clarification_prompt" });
    state.context.recentMessages.push({ role: "assistant", content: response });
    return {
      response,
      sources: [],
      webSources: [],
      toolsUsed: ["clarify"],
      memory: { entries: [], summary: "" },
      provider: d.provider(),
      decision: planDecision as AgentAction,
    };
  }

  // 3. Si el planificador devolvió un flujo, generarlo y ejecutarlo
  if (planDecision.type === "flow") {
    const flowId = planDecision.flowId as FlowId;
    const flow = FLOW_REGISTRY.get(flowId);
    if (!flow) {
      return {
        response: `❌ Flujo desconocido: ${planDecision.flowId}. Usa un flujo válido de ${FLOW_REGISTRY.list().map((f) => f.id).join(", ")}`,
        sources: [],
        webSources: [],
        toolsUsed: ["clarify"],
        memory: { entries: [], summary: "" },
        provider: d.provider(),
        decision: { type: "ask_clarify", question: "Flujo no válido." },
      };
    }
    // Construye el plan del flujo con los datos del caso
    const ctx: FlowContext = {
      sessionId,
      query,
      caseData: {} as Record<string, unknown>,
      memory: d.memory,
    };
    // Injectar caseData si se provee (por ejemplo desde el body de la API)
    if (typeof planDecision.args?.caseData === "object" && planDecision.args.caseData) {
      ctx.caseData = planDecision.args.caseData as Record<string, unknown>;
    }
    const plan = planFlow(flow, ctx);
    plan.status = "in_progress";
    state.context.lastPlan = plan;

    const planSteps: Array<{ id: string; result?: string; error?: string }> = [];
    const toolResults: ToolResult[] = [];

    for (const step of plan.steps) {
      // Actualiza estado del plan en el contexto
      if (state.context.lastPlan) {
        state.context.lastPlan.steps = plan.steps.map((s) => ({ ...s }));
      }

      if (step.tool === "synthesize" || step.tool === "compaction") {
        step.status = "success";
        continue;
      }
      if (step.tool === "ask_clarify") {
        step.status = "success";
        planSteps.push({ id: step.id, result: "¿Podrías compartir los antecedentes que faltan para revisar el caso?" });
        break;
      }

      const toolResult = await executeToolStep(step, query, sessionId, d);
      toolResults.push(toolResult);
      planSteps.push({ id: step.id, result: toolResult.content, error: toolResult.kind === "text" && toolResult.content.includes("Error") ? toolResult.content : undefined });

      if (toolResult.kind === "text" && toolResult.content.includes("Error")) {
        // Adaptación: si falla, reemplazar el paso por un fallback
        const fallback = decideFallback(step.tool as ToolName, toolResult.content, state);
        if (fallback) {
          const idx = plan.steps.findIndex((s) => s.id === step.id);
          if (idx >= 0) {
            const failed = plan.steps.splice(idx, 1)[0];
            const replacement = { ...failed, tool: fallback, status: "pending" as const, error: undefined } as PlanStep;
            plan.steps.splice(idx, 0, replacement);
            if (state.context.lastPlan) {
              state.context.lastPlan.steps = plan.steps.map((s) => ({ ...s }));
            }
            continue;
          }
        }
        step.status = "failed";
        step.error = toolResult.content;
      } else {
        step.status = "success";
        step.result = toolResult.content;
      }

      // Si es un paso terminal (sintetizar, aclarar, compactar), finalizar
    }

    if (state.context.lastPlan) {
      state.context.lastPlan.steps = plan.steps.map((s) => ({ ...s }));
    }

    // 4. Guardar hechos en memoria (continuidad)
    for (const step of plan.steps) {
      if (step.tool === "generate_document") {
        const saved = await d.memory.remember(
          `Documento generado (${flow.id}): ${step.description}`,
          "summary",
          sessionId,
          { docType: typeof step.args?.docType === "string" ? step.args.docType : "memoria_explicativa", source: "generate_document_step", flow: flow.id },
        );
        planSteps.push({ id: step.id, result: `Memoria guardada: ${saved.id}` });
      }
    }

    // 5. Síntesis final: responder al usuario
    const finalResponse = await synthesizeAgentResponse(plan, planSteps, query, state.context.recentMessages.slice(0, -1));
    state.context.recentMessages.push({ role: "assistant", content: finalResponse });

    // 6. Compactar contexto si corresponde (continuidad)
    if (state.context.currentTurn >= state.context.maxTurnsBeforeCompaction) {
      const { summary: compactedSummary } = await d.memory.compactSession(
        sessionId ?? "global",
        state.context.recentMessages.map((m) => ({ role: m.role, content: m.content })),
        state.context.currentTurn,
        state.context.maxTurnsBeforeCompaction,
      );
      if (compactedSummary) {
        planSteps.push({ id: "compaction", result: "Contexto compactado" });
      }
    }

    // Extraer y guardar hechos del mensaje del asistente final
    if (finalResponse) {
      const extracted = await d.memory.extractAndStore(finalResponse, sessionId, { source: "orchestrator_turn" });
      if (extracted.length > 0) {
        planSteps.push({ id: "memory_extract", result: `Hechos guardados: ${extracted.length}` });
      }
    }

    return {
      response: finalResponse,
      sources: collectKnowledgeSources(toolResults),
      webSources: collectWebSources(toolResults),
      toolsUsed: Array.from(new Set(plan.steps.filter((step) => step.status === "success" && !["synthesize", "ask_clarify", "compaction"].includes(step.tool)).map((step) => step.tool))),
      memory: {
        entries: state.context.longTermMemory,
        summary: planSteps.find((s) => s.id === "compaction")?.result ?? "Sin resumen compactado este turno.",
      },
      provider: d.provider(),
      decision: { type: "flow" as const, flowId: flow.id, plan },
    };
  }

  // 4. Ejecutar los pasos del plan
  const plan = planDecision.plan ?? new d.planImpl({ sessionId, goal: `Responder: ${query}` });
  plan.status = "in_progress";
  state.context.lastPlan = plan;

  const planSteps: Array<{ id: string; result?: string; error?: string }> = [];
  const toolResults: ToolResult[] = [];

  for (const step of plan.steps) {
    // Actualiza estado del plan en el contexto
    if (state.context.lastPlan) {
      state.context.lastPlan.steps = plan.steps.map((s) => ({ ...s }));
    }

    if (step.tool === "synthesize" || step.tool === "compaction") {
      step.status = "success";
      continue;
    }
    if (step.tool === "ask_clarify") {
      step.status = "success";
      planSteps.push({ id: step.id, result: "¿Podrías compartir los antecedentes que faltan para revisar el caso?" });
      break;
    }

    const toolResult = await executeToolStep(step, query, sessionId, d);
    toolResults.push(toolResult);
    planSteps.push({ id: step.id, result: toolResult.content, error: toolResult.kind === "text" && toolResult.content.includes("Error") ? toolResult.content : undefined });

    if (toolResult.kind === "text" && toolResult.content.includes("Error")) {
      // Adaptación: si falla, reemplazar el paso por un fallback
      const fallback = decideFallback(step.tool as ToolName, toolResult.content, state);
      if (fallback) {
        const idx = plan.steps.findIndex((s) => s.id === step.id);
        if (idx >= 0) {
          const failed = plan.steps.splice(idx, 1)[0];
          const replacement = { ...failed, tool: fallback, status: "pending" as const, error: undefined } as PlanStep;
          plan.steps.splice(idx, 0, replacement);
          if (state.context.lastPlan) {
            state.context.lastPlan.steps = plan.steps.map((s) => ({ ...s }));
          }
          continue;
        }
      }
      step.status = "failed";
      step.error = toolResult.content;
    } else {
      step.status = "success";
      step.result = toolResult.content;
    }

    // Si es un paso terminal (sintetizar, aclarar, compactar), finalizar
  }

  if (state.context.lastPlan) {
    state.context.lastPlan.steps = plan.steps.map((s) => ({ ...s }));
  }

  // 4. Guardar hechos en memoria (continuidad)
  for (const step of plan.steps) {
    if (step.tool === "generate_document") {
      const saved = await d.memory.remember(
        `Documento generado: ${step.description}`,
        "summary",
        sessionId,
        { docType: typeof step.args?.docType === "string" ? step.args.docType : "memoria_explicativa", source: "generate_document_step" },
      );
      planSteps.push({ id: step.id, result: `Memoria guardada: ${saved.id}` });
    }
  }

  // 5. Síntesis final: responder al usuario
  const finalResponse = await synthesizeAgentResponse(plan, planSteps, query, state.context.recentMessages.slice(0, -1));

  // 6. Compactar contexto si corresponde (continuidad)
  if (state.context.currentTurn >= state.context.maxTurnsBeforeCompaction) {
    const { summary: compactedSummary } = await d.memory.compactSession(
      sessionId ?? "global",
      state.context.recentMessages.map((m) => ({ role: m.role, content: m.content })),
      state.context.currentTurn,
      state.context.maxTurnsBeforeCompaction,
    );
    if (compactedSummary) {
      planSteps.push({ id: "compaction", result: "Contexto compactado" });
    }
  }

  // Extraer y guardar hechos del mensaje del asistente final
  if (finalResponse) {
    const extracted = await d.memory.extractAndStore(finalResponse, sessionId, { source: "orchestrator_turn" });
    if (extracted.length > 0) {
      planSteps.push({ id: "memory_extract", result: `Hechos guardados: ${extracted.length}` });
    }
  }

  state.context.recentMessages.push({ role: "assistant", content: finalResponse });

  return {
    response: finalResponse,
    sources: collectKnowledgeSources(toolResults),
    webSources: collectWebSources(toolResults),
    toolsUsed: Array.from(new Set(plan.steps.filter((step) => step.status === "success" && !new Set<string>(["synthesize", "ask_clarify", "compaction"]).has(step.tool)).map((step) => step.tool))),
    memory: {
      entries: state.context.longTermMemory,
      summary: planSteps.find((s) => s.id === "compaction")?.result ?? "Sin resumen compactado este turno.",
    },
    provider: d.provider(),
    decision: { type: "plan" as const, plan },
  };
}

function collectKnowledgeSources(results: ToolResult[]): AgentTurnResult["sources"] {
  const sources = results.flatMap((result) => Array.isArray(result.data) ? result.data : []);
  const unique = new Map<string, AgentTurnResult["sources"][number]>();

  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const item = source as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.title !== "string") continue;
    unique.set(item.id, {
      id: item.id,
      title: item.title,
      source: typeof item.source === "string" ? item.source : "",
      article: typeof item.article === "string" ? item.article : "",
      category: typeof item.category === "string" ? item.category : "",
      content: typeof item.preview === "string" ? item.preview : typeof item.content === "string" ? item.content : "",
      url: typeof item.url === "string" ? item.url : null,
      score: typeof item.score === "number" ? item.score : 0,
    });
  }

  return [...unique.values()];
}

function collectWebSources(results: ToolResult[]): AgentTurnResult["webSources"] {
  const sources = results.flatMap((result) => Array.isArray(result.data) ? result.data : []);
  const unique = new Map<string, AgentTurnResult["webSources"][number]>();

  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const item = source as Record<string, unknown>;
    if (typeof item.url !== "string" || typeof item.title !== "string" || typeof item.hostName !== "string") continue;
    unique.set(item.url, {
      title: item.title,
      url: item.url,
      snippet: typeof item.snippet === "string" ? item.snippet : "",
      hostName: typeof item.hostName === "string" ? item.hostName : "",
    });
  }

  return [...unique.values()];
}

// ---------------------------------------------------------------------------
// Sintetizador: transforma pasos + herramientas en respuesta visible
// ---------------------------------------------------------------------------

function synthesizeResponse(plan: Plan, planSteps: Array<{ id: string; result?: string; error?: string }>): string {
  const successSteps = plan.steps.filter((s) => s.status === "success").map((s) => `  • ${s.description}`);
  const toolResults = planSteps
    .filter((s) => s.result && !s.result.includes("Error"))
    .map((s) => s.result);

  const lines: string[] = [];
  if (successSteps.length === 0 && toolResults.length === 0) {
    return "He procesado tu solicitud siguiendo el plan, pero no obtengo resultados visibles. Verifica la consulta e intenta de nuevo.";
  }

  if (toolResults.length > 0) {
    lines.push(toolResults.join("\n\n"));
  }
  if (successSteps.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("He completado el plan:");
    lines.push(...successSteps);
  }

  return lines.join("\n");
}

/** Convierte resultados de herramientas en una respuesta útil y fundamentada. */
export async function synthesizeAgentResponse(
  plan: Plan,
  planSteps: Array<{ id: string; result?: string; error?: string }>,
  query: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): Promise<string> {
  const fallback = synthesizeResponse(plan, planSteps);
  const evidence = planSteps
    .filter((step) => step.result && !step.result.includes("Error"))
    .map((step) => `${step.id}: ${step.result}`)
    .join("\n\n")
    .slice(0, 14000);

  if (!evidence.trim()) return fallback;

  try {
    const llm = await getLLM();
    const previousContext = history.slice(-8).map((message) => `${message.role}: ${message.content}`).join("\n").slice(0, 5000);
    const completion = await llm.createChatCompletion([
      {
        role: "system",
        content: "Eres ArquiRegula, un asistente técnico para regularización de edificaciones en Chile. Responde en español claro y práctico. Usa primero los antecedentes recuperados; distingue hechos de inferencias, no inventes artículos ni requisitos, cita la fuente y el artículo solo cuando aparezcan en los antecedentes. Si la evidencia no alcanza, dilo y pregunta qué dato falta. No muestres JSON ni pasos internos del agente.",
      },
      {
        role: "user",
        content: `Conversación reciente:\n${previousContext || "Sin mensajes anteriores."}\n\nConsulta actual:\n${query}\n\nAntecedentes recuperados por las herramientas:\n${evidence}\n\nEntrega una respuesta directa, organizada y accionable.`,
      },
    ]);
    return completion.content.trim() || fallback;
  } catch (error) {
    console.warn("[agent synthesis] Se usó la respuesta de respaldo:", error instanceof Error ? error.message : error);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Ejecución de un paso individual
// ---------------------------------------------------------------------------

async function executeToolStep(
  step: PlanStep,
  query: string,
  sessionId: string | null,
  d: OrchestratorDep,
): Promise<ToolResult> {
  const tool = d.getTool(step.tool as ToolName);
  if (!tool) {
    return { content: `Herramienta no disponible: ${step.tool}` };
  }

  // Mapear args del paso a lo que la herramienta espera
  const args: Record<string, unknown> = { ...step.args };

  // Si el paso no define args (sintética), proveer defaults por intención
  const intent = classifyIntentFn(query);
  if (step.tool === "query_knowledge" && !args.query) {
    args.query = query;
  }
  if (step.tool === "web_search" && !args.query) {
    args.query = `${query} Chile regularización edificación DOM`;
  }
  if (step.tool === "generate_document" && !args.caseData) {
    args.caseData = "Sin antecedentes proporcionados (POR COMPLETAR)";
  }
  if (step.tool === "generate_document" && !args.docType && intent === "document") {
    args.docType = "memoria_explicativa";
  }

  return d.executeTool(step.tool as ToolName, args);
}

// ---------------------------------------------------------------------------
// API pública (para la capa API de Next.js)
// ---------------------------------------------------------------------------

/** Actualización de historial corto del agente. */
export function updateShortTerm(
  state: TurnState,
  query: string,
  sessionId: string | null,
): void {
  state.context.recentMessages.push({ role: "user", content: query, toolCalls: ["user"] });
  state.context.sessionId = sessionId ?? null;
  state.context.currentTurn += 1;
}

/** Ejecuta un paso individual del plan. */
export { executeToolStep };

/** Convierte los pasos del plan en la respuesta visible al usuario. */
export { synthesizeResponse };

/** Decisión de fallback cuando un paso falla. */
export { decideFallback };

/** Generador de documento con el mismo contrato que el original. */
export { invalidateIndex };
