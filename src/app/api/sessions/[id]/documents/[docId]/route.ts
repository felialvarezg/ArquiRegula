/** API: detalle de un documento de regularización generado.
 *  GET /api/sessions/[id]/documents/[docId]
 *
 * Devuelve el documento completo (Markdown + metadatos) de una sesión,
 * verificando que pertenece a la sesión indicada.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;

  // 1. Verificar que la sesión exista
  const session = await db.chatSession.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  // 2. Verificar que el documento pertenece a la sesión
  const result = await db.chatSession.findUnique({
    where: { id },
    select: {
      documents: {
        where: { id: docId },
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

  const documents = result?.documents;
  if (!documents || documents.length === 0) {
    return NextResponse.json(
      { error: "Documento no encontrado en esta sesión" },
      { status: 404 },
    );
  }

  return NextResponse.json({ document: documents[0] });
}
