/**
 * API: base de conocimiento normativa (fuente interna del RAG).
 *  GET /api/knowledge              -> lista documentos (con filtros por source/category)
 *  POST /api/knowledge             -> añade un nuevo documento
 *  GET /api/knowledge?q=...        -> búsqueda/retrieval de demostración
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { retrieve, invalidateIndex } from "@/lib/rag/retriever";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  const source = req.nextUrl.searchParams.get("source");
  const category = req.nextUrl.searchParams.get("category");

  // Modo "retrieval": simula la recuperación RAG para una consulta
  if (q && q.trim().length > 0) {
    const chunks = await retrieve(q, 5);
    return NextResponse.json({ query: q, chunks });
  }

  const where: { source?: string; category?: string } = {};
  if (source) where.source = source;
  if (category) where.category = category;

  const docs = await db.knowledgeDocument.findMany({
    where,
    orderBy: [{ source: "asc" }, { article: "asc" }],
  });

  // Devuelve también las categorías y fuentes disponibles para filtros UI
  const allDocs = await db.knowledgeDocument.findMany({
    select: { source: true, category: true },
  });
  const sources = [...new Set(allDocs.map((d) => d.source))].sort();
  const categories = [...new Set(allDocs.map((d) => d.category))].sort();

  return NextResponse.json({ docs, sources, categories });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.title || !body?.content) {
      return NextResponse.json(
        { error: "Se requieren title y content" },
        { status: 400 },
      );
    }
    const doc = await db.knowledgeDocument.create({
      data: {
        title: body.title,
        source: body.source ?? "Personalizado",
        article: body.article ?? "—",
        category: body.category ?? "General",
        content: body.content,
        keywords: body.keywords ?? "",
        url: body.url ?? null,
      },
    });
    invalidateIndex();
    return NextResponse.json({ doc });
  } catch (err) {
    console.error("[api/knowledge POST]", err);
    return NextResponse.json(
      { error: "No se pudo agregar el documento" },
      { status: 500 },
    );
  }
}
