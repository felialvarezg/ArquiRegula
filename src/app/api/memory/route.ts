/** =========================================================================
 
 *  Endpoints:
 *    GET    /api/memory               -> lista memoria global
 *    POST   /api/memory               -> guarda un hecho (episodic/case/preference/summary/feedback)
 *    GET    /api/sessions/[id]/memory -> memoria dentro de una sesión
 *    POST   /api/sessions/[id]/memory -> guarda un hecho en sesión
 *
 *  Permite demostrar la continuidad de tareas en flujos prolongados:
 *  los hechos extraídos se almacenan en memoria a largo plazo y se recuperan
 *  en los turnos siguientes para mantener contexto.
 * =========================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MemoryManager } from "@/lib/agent/memory";

const memoryManager = new MemoryManager();

// ---------------------------------------------------------------------------
// Memoria global (dominio, preferencias compartidas, etc.)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const sessionId = searchParams.get("sessionId") ?? null;

  const where: { kind?: string; sessionId?: string } = {};
  if (kind && kind !== "all") where.kind = kind;
  if (sessionId) where.sessionId = sessionId;

  const entries = await db.memoryEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      sessionId: e.sessionId,
      kind: e.kind,
      content: e.content,
      metadata: e.metadata ?? {},
      createdAt: e.createdAt.toISOString(),
    })),
    count: entries.length,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const { content, kind = "episodic", sessionId = null, metadata = {} } = body ?? {};

    if (!content || typeof content !== "string" || content.trim().length < 5) {
      return NextResponse.json({ error: "Se requiere 'content' (texto >= 5 caracteres)" }, { status: 400 });
    }

    const allowedKinds = ["episodic", "case", "preference", "summary", "feedback"];
    if (!allowedKinds.includes(kind)) {
      return NextResponse.json({ error: `kind inválido. Válidos: ${allowedKinds.join(", ")}` }, { status: 400 });
    }

    const entry = await memoryManager.remember(
      content,
      kind as any,
      sessionId ?? null,
      metadata,
    );

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    console.error("[api/memory POST]", err);
    return NextResponse.json(
      { error: "No se pudo guardar la memoria", detail: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
