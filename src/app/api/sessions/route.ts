/**
 * API: gestión de sesiones de chat con el agente.
 *  GET  /api/sessions        -> lista sesiones
 *  POST /api/sessions        -> crea una nueva sesión
 *  DELETE /api/sessions?id=  -> elimina una sesión
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const sessions = await db.chatSession.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { messages: true } },
    },
  });
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = body?.title ?? "Nueva consulta";
    const context = body?.context ?? null;

    const session = await db.chatSession.create({
      data: { title, context },
    });

    return NextResponse.json({ session });
  } catch (err) {
    console.error("[api/sessions POST]", err);
    return NextResponse.json(
      { error: "No se pudo crear la sesión" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }
  await db.chatSession.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
