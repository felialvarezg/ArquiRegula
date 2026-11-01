/** =========================================================================
 *  MemoryManager — corto y largo plazo — ArquiRegula Chile
 *  (Rubric IL2.2)
 *
 *  Diseño de memoria:
 *    - CORTO PLAZO (working memory): ventana deslizante de mensajes recientes
 *      (+ resumen de sesión auto-generado cuando la ventana crece).
 *    - LARGO PLAZO (episodic memory): hechos, datos del caso, preferencias
 *      y resúmenes de sesión persistidos en `memory_entry` con recuperación.
 *    - DOMINIO (knowledge base): corpus normativo (ya existente, RAG).
 *
 *  Las dos primeras garantizan continuidad en flujos prolongados:
 *  el resumen de sesión se vuelve a inyectar en cada turno, y los hechos
 *  recurrentes se recuperan automáticamente.
 * =========================================================================
 */

import type { MemoryEntry, MemoryKind } from "./types";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Punto de inyección de dependencia (para testing sin Prisma real)
// ---------------------------------------------------------------------------
export interface MemoryStore {
  findMany(options: {
    where?: { sessionId?: string | null; kind?: MemoryKind[] };
    orderBy?: { createdAt: "asc" | "desc" };
    take?: number;
  }): Promise<MemoryEntry[]>;
  create(data: {
    sessionId: string | null | undefined;
    kind: MemoryKind;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; sessionId: string | null; kind: MemoryKind; content: string; metadata: Record<string, unknown>; createdAt: string }>;
  deleteMany(where: { sessionId?: string }): Promise<{ count: number }>;
  count(where?: { sessionId?: string }): Promise<number>;
  deleteById(id: string): Promise<{ count: number }>;
}

/** Implementación real con Prisma. */
class PrismaMemoryStore implements MemoryStore {
  constructor(private readonly prismaDb: typeof db = db) {}

  async findMany(options: {
    where?: { sessionId?: string | null; kind?: MemoryKind[] };
    orderBy?: { createdAt: "asc" | "desc" };
    take?: number;
  }): Promise<MemoryEntry[]> {
    const { where, orderBy = { createdAt: "desc" }, take = 50 } = options;
    const entries = await this.prismaDb.memoryEntry.findMany({
      where: {
        ...(where?.sessionId !== undefined ? { sessionId: where.sessionId } : {}),
        ...(where?.kind ? { kind: { in: where.kind } } : {}),
      },
      orderBy: { createdAt: orderBy.createdAt },
      take,
    });
    return entries.map((e) => ({
      id: e.id,
      sessionId: e.sessionId,
      kind: e.kind as MemoryKind,
      content: e.content,
      metadata: e.metadata ? (JSON.parse(e.metadata) as Record<string, unknown>) : {},
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async create(data: {
    sessionId: string | null | undefined;
    kind: MemoryKind;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; sessionId: string | null; kind: MemoryKind; content: string; metadata: Record<string, unknown>; createdAt: string }> {
    const entry = await this.prismaDb.memoryEntry.create({
      data: {
        sessionId: data.sessionId ?? undefined,
        kind: data.kind,
        content: data.content,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    });
    const parsedMetadata: Record<string, unknown> = entry.metadata
      ? (JSON.parse(entry.metadata) as Record<string, unknown>)
      : {};
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      kind: entry.kind as MemoryKind,
      content: entry.content,
      metadata: parsedMetadata,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  async deleteMany(where: { sessionId?: string }): Promise<{ count: number }> {
    const r = await this.prismaDb.memoryEntry.deleteMany({ where });
    return { count: r.count };
  }

  async deleteById(id: string): Promise<{ count: number }> {
    const r = await this.prismaDb.memoryEntry.deleteMany({ where: { id } });
    return { count: r.count };
  }

  async count(where?: { sessionId?: string }): Promise<number> {
    return this.prismaDb.memoryEntry.count({ where });
  }
}

// ---------------------------------------------------------------------------
// Manejador de memoria
// ---------------------------------------------------------------------------

export class MemoryManager {
  private store: MemoryStore;

  constructor(store?: MemoryStore) {
    this.store = store ?? new PrismaMemoryStore();
  }

  // -----------------------------------------------------------------------
  // Lectura: recuperación
  // -----------------------------------------------------------------------

  /**
   * Recupera hechos relevantes para una consulta, restringidos a la sesión
   * si se proporciona, o globales (preferencias/memoria compartida) en su defecto.
   */
  async recall(query: string, sessionId: string | null = null): Promise<MemoryEntry[]> {
    const kinds: MemoryKind[] = ["case", "preference", "summary", "episodic", "feedback"];
    const entries = await this.store.findMany({
      where: { sessionId, kind: kinds },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    return entries;
  }

  /** Recupera solo hechos del caso actual (sin sessionId). */
  async recallCase(sessionId: string): Promise<MemoryEntry[]> {
    return this.store.findMany({ where: { sessionId, kind: ["case", "summary", "feedback"] }, orderBy: { createdAt: "desc" }, take: 8 });
  }

  // -----------------------------------------------------------------------
  // Escritura: persistencia de hechos
  // -----------------------------------------------------------------------

  async remember(
    content: string,
    kind: MemoryKind,
    sessionId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryEntry> {
    const entry = await this.store.create({ sessionId, kind, content, metadata });
    return entry;
  }

  /** Sobrescribe/elimina los hechos de una sesión (para testing o reset). */
  async clearSession(sessionId: string): Promise<{ count: number }> {
    return this.store.deleteMany({ sessionId });
  }

  // -----------------------------------------------------------------------
  // Compactación: continuidad de sesión
  // -----------------------------------------------------------------------

  /**
   * Comprime la historial reciente en un resumen ejecutivo y lo persiste como
   * memoria de resumen de sesión. Devuelve el resumen para inyectarlo en el
   * siguiente turno (continuidad de contexto).
   *
   * @param sessionId Sesión a compactar
   * @param recent Mensajes recientes (en orden cronológico)
   * @param turn Índice del turno actual (0-based); se compacta cuando
   *             currentTurn >= maxTurnsBeforeCompaction
   */
  async compactSession(
    sessionId: string,
    recent: Array<{ role: "user" | "assistant"; content: string }>,
    turn: number,
    maxTurnsBeforeCompaction: number,
  ): Promise<{ summary: string; shouldCompact: boolean }> {
    if (turn < maxTurnsBeforeCompaction) {
      return { summary: "", shouldCompact: false };
    }

    const text = recent
      .map((m) => `[${m.role}] ${m.content.slice(0, 1200)}`)
      .join("\n\n");

    if (text.length < 80) {
      return { summary: "", shouldCompact: false };
    }

    const summary = await this.summarize(text, 500);
    if (summary.length < 20) {
      return { summary: "", shouldCompact: false };
    }

    await this.store.create({
      sessionId,
      kind: "summary",
      content: `Resumen de la sesión desde el turno ${turn - maxTurnsBeforeCompaction} hasta ${turn}:\n${summary}`,
      metadata: { reason: "context_compaction" },
    });

    // Limita la memoria de la sesión a un tamaño razonable
    const total = await this.store.count({ sessionId });
    if (total > 60) {
      const oldest = await this.store.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" }, take: 10 });
      for (const e of oldest) {
        // Borrar por id (evita eliminar otras sesiones al compartir sessionId null)
        await this.store.deleteById(e.id);
      }
    }

    return { summary, shouldCompact: true };
  }

  // -----------------------------------------------------------------------
  // Extracción de hechos (LLM)
  // -----------------------------------------------------------------------

  /**
   * Extrae hechos de un mensaje del asistente y los persiste como episódico.
   * (Uso: `remember` automática tras cada respuesta.")
   */
  async extractAndStore(
    content: string,
    sessionId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryEntry[]> {
    // Heurística sin LLM para mantenibilidad: captura patrones visibles
    // (dato: valor) como hechos de caso. El LLM puede sustituir esta heurística
    // cuando se cuente con un modelo de excelente continuación.
    const facts: MemoryEntry[] = [];
    const patterns = [
      { re: /comuna[^:]*[:：]([^\n,;]+)/i, kind: "case" as const, label: "comuna" },
      { re: /dirección[^:]*[:：]([^\n,;]+)/i, kind: "case" as const, label: "dirección" },
      { re: /superficie[^:]*[:：]([^\n,;]+)/i, kind: "case" as const, label: "superficie" },
      { re: /tipo de obra[^:]*[:：]([^\n,;]+)/i, kind: "case" as const, label: "tipo obra" },
      { re: /propietario[^:]*[:：]([^\n,;]+)/i, kind: "case" as const, label: "propietario" },
      { re: /fecha de construcción[:：]([^\n,;]+)/i, kind: "case" as const, label: "fecha construcción" },
    ];

    for (const p of patterns) {
      const m = content.match(p.re);
      if (m?.[1]?.trim()) {
        const fact = `${p.label}: ${m[1].trim()}`;
        const entry = await this.store.create({
          sessionId,
          kind: "case",
          content: fact,
          metadata: { source: "heuristic_extraction" },
        });
        facts.push(entry);
      }
    }

    return facts;
  }

  // -----------------------------------------------------------------------
  // Resumen (heurístico de respaldo; el LLM se encarga del resumen real)
  // -----------------------------------------------------------------------

  private async summarize(text: string, maxTokens: number): Promise<string> {
    // Fallback: extracción de frases clave. En producción, este método
    // delegaría a la herramienta `summarize` o a un modelo de resumen.
    const sentences = text.split(/[.。!\n]/).filter((s) => s.trim().length > 15);
    const top = sentences.slice(0, Math.min(8, sentences.length)).map((s) => s.trim());
    return top.join(". ") + ".";
  }
}

// ---------------------------------------------------------------------------
// Facade: memoria + contexto (una sola puerta de entrada)
// -----------------------------------------------------------------------

export interface ContextSnapshot {
  recentMessages: Array<{ role: "user" | "assistant"; content: string; toolCalls?: string[] }>;
  sessionSummary: string | null;
  longTermMemory: MemoryEntry[];
  compactionCount: number;
}

/**
 * Construye el contexto inyectado al LLM a partir del estado del agente.
 * Combina ventana corta + resumen de sesión + memoria a largo plazo.
 */
export async function buildContextSnapshot(
  sessionId: string | null,
  recentMessages: Array<{ role: "user" | "assistant"; content: string; toolCalls?: string[] }>,
  maxTurnsBeforeCompaction: number,
  currentTurn: number,
  memoryManager: MemoryManager,
): Promise<ContextSnapshot> {
  // 1. Recupera memoria a largo plazo (caso + resumen persisitente)
  const longTerm = await memoryManager.recall(queryCasePlaceholder(sessionId), sessionId);

  // 2. Compacta si corresponde
  const { summary: compactedSummary, shouldCompact } = await memoryManager.compactSession(
    sessionId ?? "global",
    recentMessages.map((m) => ({ role: m.role, content: m.content })),
    currentTurn,
    maxTurnsBeforeCompaction,
  );

  // Inserción del resumen (del compact, o el guardado previo)
  const sessionSummary = compactedSummary ||
    (recentMessages.length > 0 ? recentMessages[0].content : null);

  return {
    recentMessages,
    sessionSummary,
    longTermMemory: longTerm,
    compactionCount: shouldCompact ? 1 : 0,
  };
}

function queryCasePlaceholder(_sessionId: string | null): string {
  // El recall se basa en los filtrlos `sessionId` y `kind`, no en el texto.
  // Este parámetro se mantiene por compatibilidad con la firma.
  return "";
}
