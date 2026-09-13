/**
 * API: búsqueda web externa (fuente externa del pipeline RAG).
 *  POST /api/web-search   Body: { query: string, num?: number }
 *
 * Usa el adaptador LLM unificado. Solo Z.ai soporta web_search;
 * con OpenAI se devuelve un mensaje indicando que no está disponible.
 */
import { NextRequest, NextResponse } from "next/server";
import { getLLM, getActiveProvider } from "@/lib/llm";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.query || typeof body.query !== "string") {
      return NextResponse.json(
        { error: "Se requiere 'query' en el body" },
        { status: 400 },
      );
    }
    const num = Math.min(Math.max(Number(body.num) || 8, 1), 15);
    const provider = getActiveProvider();

    if (provider !== "zai") {
      return NextResponse.json({
        results: [],
        warning:
          "Búsqueda web no disponible con el proveedor actual (" +
          provider +
          "). Web search requiere Z.ai SDK. El agente seguirá funcionando solo con RAG interno.",
      });
    }

    const llm = await getLLM();
    if (!llm.webSearch) {
      return NextResponse.json({
        results: [],
        warning: "El proveedor actual no soporta búsqueda web.",
      });
    }

    const results = await llm.webSearch(
      `${body.query} Chile regularización edificación`,
      num,
    );

    // Persiste para trazabilidad
    const persisted: {
      id: string;
      query: string;
      url: string;
      title: string;
      snippet: string;
      hostName: string;
    }[] = [];

    for (const r of results.slice(0, num)) {
      const created = await db.webSource.create({
        data: {
          query: body.query,
          url: r.url,
          title: r.title,
          snippet: r.snippet,
          hostName: r.hostName,
        },
      });
      persisted.push({
        id: created.id,
        query: body.query,
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        hostName: r.hostName,
      });
    }

    return NextResponse.json({ results: persisted });
  } catch (err) {
    console.error("[api/web-search POST]", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: "No se pudo completar la búsqueda", detail: message },
      { status: 500 },
    );
  }
}
