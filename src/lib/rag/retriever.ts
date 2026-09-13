/**
 * Recuperador RAG para la base de conocimiento normativa chilena.
 *
 * Implementa recuperación híbrida (palabras clave + TF-IDF) sobre SQLite.
 * No usa embeddings vectoriales externos: calcula un scoring ponderado que
 * combina coincidencia de términos, frecuencia normalizada (TF) y bonus por
 * coincidencias en título/artículo. Esto cumple el principio RAG sin añadir
 * dependencias pesadas a la stack.
 *
 * Componentes:
 *  - Tokenización normalizada (lowercase, sin acentos, sin stopwords ES).
 *  - TF-IDF aproximado sobre la colección cargada en memoria.
 *  - Re-ranking por boost de título/artículo/categoría.
 */

import { db } from "@/lib/db";

// Stopwords en español para filtrar términos no informativos.
const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
  "a", "ante", "bajo", "con", "contra", "desde", "en", "entre", "hacia",
  "hasta", "para", "por", "según", "sin", "so", "sobre", "tras", "y", "o",
  "u", "ni", "que", "como", "cuando", "donde", "si", "no", "se", "su", "sus",
  "es", "son", "ser", "estar", "este", "esta", "esto", "estos", "estas",
  "ese", "esa", "eso", "esos", "esas", "lo", "le", "les", "mi", "tu",
  "yo", "ella", "ellos", "ellas", "me", "te", "nos", "os",
  "más", "menos", "muy", "tan", "tanto", "poco", "mucho", "todo", "nada",
  "algo", "algun", "alguna", "algunos", "algunas", "ningun", "ninguna",
  "otro", "otra", "otros", "otras", "mismo", "misma", "mismos", "mismas",
  "tal", "tales", "cuyo", "cuya", "cuyos", "cuyas", "cual", "cuales",
]);

export interface RetrievedChunk {
  id: string;
  title: string;
  source: string;
  article: string;
  category: string;
  content: string;
  url: string | null;
  score: number;
}

/** Normaliza texto: minúsculas, sin acentos, sin signos. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokeniza eliminando stopwords. */
function tokenize(text: string): string[] {
  const normalized = normalize(text);
  return normalized
    .split(" ")
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Calcula frecuencia de términos de un documento. */
function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  source: string;
  article: string;
  category: string;
  content: string;
  keywords: string;
  url: string | null;
}

/** Cache en memoria del índice invertido + DF por término. */
interface IndexedDoc {
  doc: KnowledgeDoc;
  tokens: string[];
  tf: Map<string, number>;
  norm: number; // norma L2 para similitud coseno
}

let indexCache: IndexedDoc[] | null = null;
let idfCache: Map<string, number> | null = null;
let lastDocCount = 0;

async function loadIndex(): Promise<{
  index: IndexedDoc[];
  idf: Map<string, number>;
}> {
  // Recarga si la cantidad de documentos cambió (seed dinámico)
  const currentCount = await db.knowledgeDocument.count();
  if (indexCache && idfCache && currentCount === lastDocCount) {
    return { index: indexCache, idf: idfCache };
  }

  const docs = await db.knowledgeDocument.findMany();
  const index: IndexedDoc[] = [];
  const df = new Map<string, number>(); // document frequency

  for (const d of docs) {
    const fullText = `${d.title} ${d.article} ${d.category} ${d.keywords} ${d.content}`;
    const tokens = tokenize(fullText);
    const tf = termFreq(tokens);

    // norma L2 del vector TF
    let norm = 0;
    for (const [, freq] of tf) norm += freq * freq;
    norm = Math.sqrt(norm);

    index.push({ doc: d, tokens, tf, norm });

    // DF: cuántos docs contienen cada término
    for (const term of tf.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const N = Math.max(docs.length, 1);
  const idf = new Map<string, number>();
  for (const [term, freq] of df) {
    idf.set(term, Math.log(1 + N / freq));
  }

  indexCache = index;
  idfCache = idf;
  lastDocCount = currentCount;

  return { index, idf };
}

/**
 * Recupera los fragmentos más relevantes para una consulta.
 * Combina similitud coseno TF-IDF con boost por coincidencia en
 * título / artículo / categoría / keywords.
 *
 * @param query Consulta del usuario
 * @param topK Número de fragmentos a devolver (default 5)
 */
export async function retrieve(
  query: string,
  topK = 5,
): Promise<RetrievedChunk[]> {
  const { index, idf } = await loadIndex();

  if (index.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    // Si no hay tokens útiles, devolver los primeros como fallback
    return index.slice(0, topK).map((i) => ({
      id: i.doc.id,
      title: i.doc.title,
      source: i.doc.source,
      article: i.doc.article,
      category: i.doc.category,
      content: i.doc.content,
      url: i.doc.url,
      score: 0,
    }));
  }

  const queryTf = termFreq(queryTokens);
  let queryNorm = 0;
  for (const [, freq] of queryTf) queryNorm += freq * freq;
  queryNorm = Math.sqrt(queryNorm);

  const scored: RetrievedChunk[] = index.map((indexed) => {
    // Similitud coseno ponderada por IDF
    let dot = 0;
    for (const [term, qFreq] of queryTf) {
      const dFreq = indexed.tf.get(term);
      if (!dFreq) continue;
      const idfVal = idf.get(term) ?? 0;
      dot += qFreq * dFreq * idfVal * idfVal;
    }
    const denom = queryNorm * indexed.norm || 1;
    let score = dot / denom;

    // Boost por coincidencia en campos estructurales
    const qLower = normalize(query);
    const titleNorm = normalize(indexed.doc.title);
    const articleNorm = normalize(indexed.doc.article);
    const categoryNorm = normalize(indexed.doc.category);
    const keywordsNorm = normalize(indexed.doc.keywords);

    for (const token of queryTokens) {
      if (titleNorm.includes(token)) score += 0.15;
      if (articleNorm.includes(token)) score += 0.2;
      if (categoryNorm.includes(token)) score += 0.1;
      if (keywordsNorm.includes(token)) score += 0.12;
    }

    // Bonus por frase exacta en título o keywords
    if (qLower.length > 5) {
      if (titleNorm.includes(qLower)) score += 0.5;
      if (keywordsNorm.includes(qLower)) score += 0.3;
    }

    return {
      id: indexed.doc.id,
      title: indexed.doc.title,
      source: indexed.doc.source,
      article: indexed.doc.article,
      category: indexed.doc.category,
      content: indexed.doc.content,
      url: indexed.doc.url,
      score: Math.round(score * 1000) / 1000,
    };
  });

  return scored
    .filter((s) => s.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Invalida el caché del índice (útil tras añadir documentos). */
export function invalidateIndex(): void {
  indexCache = null;
  idfCache = null;
  lastDocCount = 0;
}
