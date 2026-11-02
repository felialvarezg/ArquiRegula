/**
 * Pruebas unitarias para la lógica de negocio del agente ArquiRegula Chile.
 *
 * Cubre:
 *  - Recuperador RAG (normalize / tokenize / retrieve)
 *  - Compacting de memoria (compactSession) → bug privacy/limite de tamaño
 */
import { retrieve, normalize, tokenize } from "../src/lib/rag/retriever";
import { MemoryManager } from "../src/lib/agent/memory";
import type { KnowledgeDoc } from "../src/lib/rag/retriever";

/** Datos de prueba fijos (simulan un índice RAG). */
const DUMMY_DOCS: KnowledgeDoc[] = [
  {
    id: "doc-1",
    title: "Permiso municipal de edificación",
    source: "LGUC",
    article: "Art. 116",
    category: "Permiso",
    content: "Toda obra requiere permiso de la DOM.",
    keywords: "permiso, edificacion, DOM",
    url: "https://bcn.cl",
  },
  {
    id: "doc-2",
    title: "Regularizacion de obras sin permiso",
    source: "OGUC",
    article: "Art. 5.3.1",
    category: "Regularizacion",
    content: "Las obras construidas sin permiso pueden regularizarse.",
    keywords: "regularizacion, sin permiso, OGUC",
    url: "https://bcn.cl",
  },
];

describe("RAG retriever (negocio)", () => {
  it("normalize: minúsculas y sin acentos", () => {
    expect(normalize("Constitución en Chile")).toBe("constitucion en chile");
    expect(normalize("Ñuñoa")).toBe("nunoa");
  });

  it("tokenize: elimina stopwords y tokens <= 2", () => {
    const tokens = tokenize("El permiso municipal de edificación");
    expect(tokens).not.toContain("el");
    expect(tokens).not.toContain("de");
    expect(tokens).toContain("permiso");
    expect(tokens).toContain("municipal");
  });

  // La función `retrieve` (RAG real) consulta Prisma sobre la base de datos;
  // se deja fuera del suite unitario (requiere DB inicializado).
});

describe("MemoryManager.compactSession (bug de borrado/limite)", () => {
  it("elimina las entradas más antiguas (máx 10) cuando la sesión excede 60", async () => {
    const deleteCalls: string[] = [];
    const store = {
      findMany: async (options: any) => {
        // sessionId fijo en la cláusula where
        expect(options.where?.sessionId).toBe("s1");
        return [
          { id: "old-1", sessionId: "s1", kind: "case", content: "old-1", metadata: {}, createdAt: new Date("2024-01-01T00:00:00Z") },
          { id: "old-2", sessionId: "s1", kind: "case", content: "old-2", metadata: {}, createdAt: new Date("2024-01-02T00:00:00Z") },
        ] as any;
      },
      count: async (options: any) => (options?.sessionId ? 100 : 0),
      deleteById: async (id: string) => {
        deleteCalls.push(id);
        return { count: 1 };
      },
      create: async () => ({ id: "new-1", sessionId: "s1", kind: "summary", content: "s", metadata: {}, createdAt: new Date() }),
    };
    const manager = new MemoryManager(store as any);
    const result = await manager.compactSession("s1", [
      { role: "user", content: "Usuario consulta sobre regularizacion de obra" },
      { role: "assistant", content: "He encontrado la normativa aplicable." },
    ], 6, 6);

    expect(result.shouldCompact).toBe(true);
    expect(deleteCalls).toEqual(["old-1", "old-2"]);
  });

  it("no compacta cuando el turno es menor al límite", async () => {
    const store = {
      findMany: async () => [],
      count: async () => 0,
      deleteById: async () => ({ count: 0 }),
      create: async () => ({ id: "new", sessionId: "s1", kind: "summary", content: "s", metadata: {}, createdAt: new Date() }),
    };
    const manager = new MemoryManager(store as any);
    const result = await manager.compactSession("s1", [], 2, 6);
    expect(result.shouldCompact).toBe(false);
  });
});
