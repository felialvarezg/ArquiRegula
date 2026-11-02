/** API: listado de documentos de regularización generados en una sesión.
 *  GET /api/sessions/[id]/documents
 *
 * Devuelve todos los documentos (Markdown) generados por la sesión,
 * ordenados de más reciente a más antiguo. Incluye metadatos y contenido.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await db.chatSession.findUnique({
    where: { id },
    select: {
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          title: true,
          content: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ documents: session.documents ?? [] });
}
