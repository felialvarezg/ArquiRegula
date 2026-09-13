/**
 * API: chat con el Agente de Arquitectura.
 *  POST /api/chat
 *
 * Body: { sessionId?: string, message: string }
 *
 * Flujo:
 *  1. Crea o reutiliza sesión.
 *  2. Persiste el mensaje del usuario.
 *  3. Ejecuta runAgentTurn (RAG + LLM + web search).
 *  4. Persiste la respuesta del agente con trazabilidad (fuentes, herramientas).
 *  5. Devuelve respuesta + fuentes + herramientas usadas.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent/architecture-agent";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.message || typeof body.message !== "string") {
      return NextResponse.json(
        { error: "Se requiere 'message' en el body" },
        { status: 400 },
      );
    }

    const userMessage = body.message.trim();
    const sessionId: string | undefined = body.sessionId;

    // 1. Crea o reutiliza sesión
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

    // 2. Persiste mensaje del usuario
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

    // 3. Ejecuta el agente
    const result = await runAgentTurn(userMessage, historyForAgent);

    // 4. Persiste respuesta del agente con trazabilidad
    await db.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: result.response,
        sources: JSON.stringify(
          result.sources.map((s) => ({
            id: s.id,
            title: s.title,
            source: s.source,
            article: s.article,
            score: s.score,
            url: s.url,
          })),
        ),
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

    // 5. Devuelve resultado
    return NextResponse.json({
      sessionId: session.id,
      response: result.response,
      sources: result.sources,
      webSources: result.webSources,
      toolsUsed: result.toolsUsed,
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
