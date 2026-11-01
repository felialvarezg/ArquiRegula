/**
 /** API: chat con el Agente de Arquitectura.
  *  POST /api/chat
  *
  * Body: { sessionId?, message, flowId?, type? }
  *
  * Flujo:
  *  1. Crea o reutiliza sesión.
  *  2. Persiste el mensaje del usuario.
  *  3. Si `flowId` está presente y es un flujo registrado, ejecuta ese flujo.
  *     Si `type` es un tipo de documento (ej. `dictamen_previo`), genera un
  *     flujo documental temporal.
  *  4. Persiste la respuesta del agente con trazabilidad (fuentes, herramientas).
  *  5. Devuelve respuesta + fuentes + herramientas usadas + flujoId (si aplica).
  */
 import { NextRequest, NextResponse } from "next/server";
 import { db } from "@/lib/db";
 import {
   runAgentTurn,
   FLOW_REGISTRY,
   DOCUMENT_TYPES,
   type FlowId,
   type FlowContext,
   type FlowDecision,
   type PlanStep,
   type ToolName,
   type Plan,
   planFlow,
   } from "@/lib/agent/architecture-agent";
 import type { Flow } from "@/lib/agent/types";
 import { executeTool, getTool } from "@/lib/agent/tool";
import { synthesizeAgentResponse } from "@/lib/agent/orchestrator";
 import { classifyIntent as classifyIntentFn } from "@/lib/agent/planner";
 import { getActiveProvider } from "@/lib/llm";
import { z } from "zod";
import { ChatBodySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = ChatBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos en el cuerpo de la petición", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { message, sessionId, flowId, type, caseData } = parsed.data;
    const userMessage = message.trim();

    // 1. Validar flujo si se especificó un flowId
    let flow: Flow | undefined;
    if (flowId) {
      flow = FLOW_REGISTRY.get(flowId as FlowId);
      if (!flow) {
        return NextResponse.json(
          { error: `Flujo no válido: ${flowId}. Usa uno de: ${FLOW_REGISTRY.list().map(f => f.id).join(", ")}` },
          { status: 400 },
        );
      }
    }

    // 2. Crea o reutiliza sesión
    let session = sessionId
      ? await db.chatSession.findUnique({ where: { id: sessionId } })
      : null;
    if (!session) {
      session = await db.chatSession.create({
        data: {
          title: userMessage.slice(0, 60),
        },
      });
    }

    // 3. Persiste mensaje del usuario
    await db.chatMessage.create({
      data: { sessionId: session.id, role: "user", content: userMessage },
    });

    // Recupera historial (excluyendo el mensaje recién insertado para pasarlo limpio al agente)
    const history = await db.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    });
    // El último es el mensaje del usuario; lo pasamos aparte en runAgentTurn
    const historyForAgent = history.slice(0, -1);

    // 4. Decide cómo ejecutar el agente
    const runSessionId = session.id;
    let result: Awaited<ReturnType<typeof runAgentTurn>>;
    let executedFlowId: FlowId | null = null;

    if (flow) {
      // Flujo explícito: ejecutar planFlow
      const ctx: FlowContext = {
        sessionId: runSessionId,
        query: userMessage,
        caseData: { ...caseData },
        memory: new (await import("@/lib/agent/memory")).MemoryManager(),
      };
      if (typeof type === "string" && DOCUMENT_TYPES[type as keyof typeof DOCUMENT_TYPES]) {
        ctx.caseData = { ...caseData, docType: type };
      }
      const flowPlan = flow.steps.length ? planFlow(flow, ctx) : null;
      if (flowPlan) {
        // Usar runAgentTurn con un plan del flujo (solución temporal)
        // El orquestador futuro podrá ejecutar flowDecision directamente
        const planResult = await executeFlowPlan(
          flowPlan,
          flow.id,
          userMessage,
          runSessionId,
          historyForAgent as Array<{ role: "user" | "assistant"; content: string }>,
        );
        result = planResult;
        executedFlowId = flow.id;
      } else {
        result = await runAgentTurn(userMessage, runSessionId, historyForAgent as Array<{ role: "user" | "assistant"; content: string }>);
      }
    } else {
      // Turno normal (RAG + LLM + web)
      result = await runAgentTurn(
        userMessage,
        runSessionId,
        historyForAgent as Array<{ role: "user" | "assistant"; content: string }>,
      );
    }

    // 5. Persiste respuesta del agente con trazabilidad
    await db.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: result.response,
        sources: JSON.stringify({
          rag: result.sources,
          web: result.webSources,
          flowId: executedFlowId,
        }),
        toolsUsed: JSON.stringify(result.toolsUsed),
      },
    });

    // Actualiza timestamp y título si era la primera consulta
    await db.chatSession.update({
      where: { id: session.id },
      data: {
        updatedAt: new Date(),
        title:
          session.title === "Nueva consulta"
            ? userMessage.slice(0, 60)
            : session.title,
      },
    });

    // 6. Devuelve resultado (con flujo informado)
    return NextResponse.json({
      sessionId: session.id,
      response: result.response,
      sources: result.sources,
      webSources: result.webSources,
      toolsUsed: result.toolsUsed,
      flowId: executedFlowId ?? null,
    });
  } catch (err) {
    console.error("[api/chat POST]", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: "El agente no pudo procesar la consulta", detail: message },
      { status: 500 },
    );
  }
}

async function executeFlowPlan(
  plan: Plan,
  flowId: FlowId,
  query: string,
  sessionId: string | null,
  historyForAgent: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<Awaited<ReturnType<typeof runAgentTurn>>> {
  // Ejecuta correctamente los pasos del flujo, aplicando los mismos
  // mapeos de argumentos que el orquestador de turnos normal.
  const planSteps: Array<{ id: string; result?: string; error?: string }> = [];
  const sources = new Map<string, Awaited<ReturnType<typeof runAgentTurn>>["sources"][number]>();
  const webSources = new Map<string, Awaited<ReturnType<typeof runAgentTurn>>["webSources"][number]>();
  const toolsUsed = new Set<string>();

  for (const step of plan.steps) {
    if (step.tool === "synthesize" || step.tool === "compaction") {
      step.status = "success";
      continue;
    }
    if (step.tool === "ask_clarify") {
      step.status = "success";
      planSteps.push({ id: step.id, result: "¿Podrías compartir los antecedentes que faltan para revisar el caso?" });
      break;
    }

    const tool = getTool(step.tool as ToolName);
    if (!tool) {
      planSteps.push({ id: step.id, result: `Herramienta no disponible: ${step.tool}` });
      step.status = "failed";
      continue;
    }

    const args: Record<string, unknown> = { ...step.args };
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

    const toolResult = await executeTool(step.tool as ToolName, args);
    if (toolResult.kind === "json" || Array.isArray(toolResult.data)) {
      toolsUsed.add(step.tool);
      if (Array.isArray(toolResult.data)) {
        for (const item of toolResult.data) {
          if (!item || typeof item !== "object") continue;
          const entry = item as Record<string, unknown>;
          if (typeof entry.id === "string" && typeof entry.title === "string") {
            sources.set(entry.id, {
              id: entry.id,
              title: entry.title,
              source: typeof entry.source === "string" ? entry.source : "",
              article: typeof entry.article === "string" ? entry.article : "",
              category: typeof entry.category === "string" ? entry.category : "",
              content: typeof entry.preview === "string" ? entry.preview : "",
              url: typeof entry.url === "string" ? entry.url : null,
              score: typeof entry.score === "number" ? entry.score : 0,
            });
          }
          if (typeof entry.url === "string" && typeof entry.title === "string" && typeof entry.hostName === "string") {
            webSources.set(entry.url, {
              title: entry.title,
              url: entry.url,
              snippet: typeof entry.snippet === "string" ? entry.snippet : "",
              hostName: typeof entry.hostName === "string" ? entry.hostName : "",
            });
          }
        }
      }
    }
    planSteps.push({
      id: step.id,
      result: toolResult.content,
      error: toolResult.kind === "text" && toolResult.content.includes("Error") ? toolResult.content : undefined,
    });

    if (toolResult.kind === "text" && toolResult.content.includes("Error")) {
      step.status = "failed";
      step.error = toolResult.content;
    } else {
      step.status = "success";
      step.result = toolResult.content;
    }

  }

  const finalResponse = await synthesizeAgentResponse(plan, planSteps, query, historyForAgent);

  return {
    response: finalResponse,
    sources: [...sources.values()],
    webSources: [...webSources.values()],
    toolsUsed: [...toolsUsed],
    memory: { entries: [], summary: "Flujo ejecutado correctamente." },
    provider: getActiveProvider(),
    decision: { type: "flow" as const, flowId, plan },
  };
}
