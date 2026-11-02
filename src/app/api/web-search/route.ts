/**
 /** API: búsqueda web externa (fuente externa del pipeline RAG).
  *  POST /api/web-search   Body: { query: string, num?: number }
  *
  * Usa `searchWeb` del módulo `web-search`, que:
  *   1. Prioriza el `webSearch` del adaptador LLM (Z.ai, si lo soporta).
  *   2. Si no (OpenAI/Groq/Together/Ollama), cae a DuckDuckGo (sin clave).
  *
  * Por lo tanto la búsqueda web funciona con cualquier modelo de LLM.
  */
 import { NextRequest, NextResponse } from "next/server";
 import { z } from "zod";
 import { WebSearchBodySchema } from "@/lib/validation/schemas";
 import { searchWeb } from "@/lib/web-search";
 import { db } from "@/lib/db";

 export const runtime = "nodejs";

 export async function POST(req: NextRequest) {
   try {
     const body = await req.json().catch(() => null);
     const parsed = WebSearchBodySchema.safeParse(body);
     if (!parsed.success) {
       return NextResponse.json(
         { error: "Datos inválidos en el cuerpo de la petición", details: parsed.error.flatten() },
         { status: 400 },
       );
     }

     const { query, num } = parsed.data;
     const results = await searchWeb(query, num);

     // Persiste para trazabilidad.
     const persisted: { id: string; query: string; url: string; title: string; snippet: string; hostName: string; }[] = [];

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
