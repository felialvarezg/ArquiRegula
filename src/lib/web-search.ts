/** Búsqueda web independiente del proveedor LLM (DuckDuckGo / Z.ai). */

import { getActiveProvider, getLLM } from "./llm";

/** Resultado de búsqueda (independiente del proveedor). */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  hostName: string;
}

// Motor de búsqueda por defecto. Cambiar a "bing" o "yahoo" en DuckDuckGo
// permite conseguir más resultados, pero google es el más consustancial.
const DDG_ENGINE = "html";

/**
 * Busca resultados web para `query`.
 *
 * Prioridad de ejecución:
 *  1. Si el proveedor LLM expone `webSearch` (Z.ai), se usa nativo.
 *  2. Si no (OpenAI/Groq/Together/Ollama), se cae a DuckDuckGo, que no
 *     requiere clave y funciona con cualquier backend del agente.
 *
 * @param query Consulta en lenguaje natural (se anexa "Chile regularización edificación").
 * @param num Número de resultados (mínimo 1, máximo 15).
 */
export async function searchWeb(query: string, num = 8): Promise<SearchResult[]> {
  // 1. Proveedor LLM con `webSearch` (Z.ai).
  const provider = getActiveProvider();
  const llm = await getLLM();

  // 2. Engine de DuckDuckGo: "html" o "bing".
  const engine = process.env.DDG_ENGINE ?? DDG_ENGINE;

  if (provider === "zai" && llm.webSearch) {
    return llm.webSearch(`${query} Chile regularización edificación`, num);
  }

  const results = await searchDuckDuckGo(
    `${query} Chile regularización edificación`,
    num,
    engine,
  );
  return results;
}

/**
 * Búsqueda vía DuckDuckGo (sin clave). Retorna una lista de resultados
 * normalizados como `SearchResult`.
 */
async function searchDuckDuckGo(
  query: string,
  num: number,
  engine: string,
): Promise<SearchResult[]> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no-cache", "1");
  url.searchParams.set("engines", engine);

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `DuckDuckGo error ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as DuckDuckGoResponse;

  const results: SearchResult[] = [];

  if (data.Response === "Success") {
    // Resultado primario (respuesta breve / resumen).
    if (data.AbstractText && data.AbstractURL) {
      const host = hostFromUrl(data.AbstractURL);
      results.push({
        title: data.Heading ?? data.AbstractText.slice(0, 120),
        url: data.AbstractURL,
        snippet: data.AbstractText,
        hostName: host,
      });
    }

    // Temas relacionados (párrafos, páginas, FAQ...).
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= num) break;
        if (!topic.Text || !topic.FirstURL) continue;
        const host = hostFromUrl(topic.FirstURL);
        results.push({
          title: (topic.Text as string).slice(0, 140),
          url: topic.FirstURL,
          snippet: (topic.Text as string).slice(0, 300),
          hostName: host,
        });
      }
    }
  } else {
    // Ej: "Did you mean: ..." o error de rate limit.
    const error = data.RelatedTopics?.[0]?.Text ?? data.AbstractText ?? "Sin resultados";
    // No es error crítico; se devuelve con los resultados disponibles.
  }

  return results.slice(0, num);
}

/** Extrae el hostname de una URL; devuelve '' si es inválida. */
function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Respuesta cruda de DuckDuckGo (tipado mínimo). */
interface DuckDuckGoResponse {
  Answer?: string;
  AbstractText?: string;
  AbstractURL?: string;
  Heading?: string;
  Keywords?: string;
  RelatedTopics?: Array<{
    Text?: string;
    FirstURL?: string;
  }>;
  Response?: string;
  Redirect?: boolean;
  Error?: string;
}
