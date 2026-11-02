/** =========================================================================
 *  API: memoria dentro de una sesión (IL2.2) — ruta /api/sessions/[id]/memory
 *  GET    /api/sessions/[id]/memory -> hechos de memoria de una sesión
 *  POST   /api/sessions/[id]/memory -> guarda un hecho en la sesión actual
 *
 *  Permite al agente consultar y acumular contexto específico de la sesión
 *  (datos del caso, eventos, correcciones) durante el flujo prolongado.
 * =========================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MemoryManager } from "@/lib/agent/memory";

const memoryManager = new MemoryManager();

// ---------------------------------------------------------------------------
// GET: hechos de memoria de una sesión
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entries = await memoryManager.recall("", id); // recall filtra por sessionId
  // El recall de MemoryManager filtra por sessionId y kind; aquí volvemos a leer con el store para incluir todos los kinds.
  const entriesDb = await db.memoryEntry.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    sessionId: id,
    entries: entriesDb.map((e) => ({
      id: e.id,
      kind: e.kind,
      content: e.content,
      metadata: e.metadata ?? {},
      createdAt: e.createdAt.toISOString(),
    })),
    count: entriesDb.length,
  });
}

// ---------------------------------------------------------------------------
// POST: guardar un hecho en la sesión
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const { content, kind = "episodic", metadata = {} } = body ?? {};

    if (!content || typeof content !== "string" || content.trim().length < 5) {
      return NextResponse.json(
        { error: "Se requiere 'content' (texto >= 5 caracteres)" },
        { status: 400 },
      );
    }

    const allowedKinds = ["episodic", "case", "preference", "summary", "feedback"];
    if (!allowedKinds.includes(kind)) {
      return NextResponse.json(
        { error: `kind inválido. Válidos: ${allowedKinds.join(", ")}` },
        { status: 400 },
      );
    }

    const entry = await memoryManager.remember(
      content,
      kind as any,
      id,
      metadata,
    );

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    console.error("[api/sessions/[id]/memory POST]", err);
    return NextResponse.json(
      {
        error: "No se pudo guardar la memoria de la sesión",
        detail: err instanceof Error ? err.message : "Error",
      },
      { status: 500 },
    );
  }
}
