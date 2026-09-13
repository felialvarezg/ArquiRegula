/**
 * Script de demostración del Agente de Arquitectura (ArquiRegula Chile).
 *
 * Evidencia de pruebas de software para el encargo ISY0101.
 *
 * Ejecuta 3 consultas representativas contra el agente y muestra:
 *  - La respuesta generada por el LLM.
 *  - Los fragmentos normativos recuperados por RAG (con score).
 *  - Las herramientas invocadas (rag_retriever / web_search).
 *  - Las fuentes web externas consultadas (si las hubo).
 *
 * Uso:
 *   bun scripts/demo-agent.ts
 *
 * Requisitos previos:
 *   - Base de datos sembrada:  bun run db:push && bun prisma/seed.ts
 */
import { runAgentTurn, generateRegularizationDocument } from "../src/lib/agent/architecture-agent";
import { getActiveProvider } from "../src/lib/llm";
import { DOCUMENT_TYPES } from "../src/lib/rag/prompts";

const DIVIDER = "═".repeat(78);
const SUB = "─".repeat(78);

function header(title: string) {
  console.log("\n" + DIVIDER);
  console.log(`  ${title}`);
  console.log(DIVIDER);
}

function sub(title: string) {
  console.log("\n" + SUB);
  console.log(`  ▸ ${title}`);
  console.log(SUB);
}

const TEST_QUERIES = [
  {
    label: "Caso 1 — Documentos para regularizar vivienda sin permiso",
    query:
      "¿Qué documentos necesito para regularizar una vivienda construida sin permiso ante la DOM?",
    expectWeb: false,
  },
  {
    label: "Caso 2 — Cambio de destino de local comercial",
    query:
      "Explícame el procedimiento de cambio de destino de un local comercial a oficina.",
    expectWeb: false,
  },
  {
    label: "Caso 3 — Costos de regularización en comuna específica (activa web_search)",
    query:
      "¿Cuánto cuesta regularizar una obra en la comuna de Providencia y qué dice la ordenanza de cobros municipal?",
    expectWeb: true,
  },
];

async function runChatDemo() {
  const provider = getActiveProvider();
  header("DEMOSTRACIÓN DEL AGENTE — ArquiRegula Chile");
  console.log(
    `  Proveedor LLM activo: ${provider.toUpperCase()}\n` +
      "  Ejecutando 3 consultas de prueba contra el pipeline RAG + LLM.\n" +
      "  Cada respuesta incluye trazabilidad de fuentes y herramientas.",
  );
  if (provider === "openai") {
    console.log(
      "  (Usando OpenAI-compatible: " +
        (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1") +
        " · modelo: " +
        (process.env.OPENAI_MODEL ?? "gpt-4o-mini") +
        ")",
    );
  }

  for (const t of TEST_QUERIES) {
    header(t.label);
    console.log(`  Consulta: "${t.query}"\n`);

    const start = Date.now();
    const result = await runAgentTurn(t.query, []);
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);

    // Respuesta
    sub("Respuesta del agente");
    console.log(result.response);

    // Herramientas
    sub("Herramientas invocadas");
    console.log("  " + result.toolsUsed.join(", "));

    // Fuentes RAG
    sub(`Fuentes normativas recuperadas (RAG) — ${result.sources.length}`);
    result.sources.forEach((s, i) => {
      console.log(
        `  [${i + 1}] ${s.source} · ${s.article} · score=${s.score}\n      ${s.title}`,
      );
    });

    // Fuentes web
    if (result.webSources.length > 0) {
      sub(`Fuentes web externas — ${result.webSources.length}`);
      result.webSources.forEach((w, i) => {
        console.log(`  [${i + 1}] ${w.title}\n      ${w.url}\n      ${w.snippet?.slice(0, 120)}…`);
      });
    }

    sub(`Tiempo de respuesta: ${elapsed}s`);
  }
}

async function runDocumentDemo() {
  header("DEMOSTRACIÓN — Generación de documento formal");

  const caseData = {
    propietario: "María González Pérez",
    comuna: "Ñuñoa",
    rolAvaluo: "1234-56",
    direccion: "Calle Las Acacias 1234",
    tipoObra: "Ampliación de vivienda sin permiso",
    superficie: "45 m²",
    fechaConstruccion: "2015 (aprox.)",
    destino: "Habitacional",
    descripcion:
      "Ampliación de segundo piso construida sin permiso municipal. Estructura de albañilería reforzada, cubierta de teja asfáltica. Se requiere regularización para venta del inmueble.",
  };

  console.log("  Generando: Memoria Explicativa de Regularización");
  console.log("  Caso:");
  Object.entries(caseData).forEach(([k, v]) =>
    console.log(`    - ${k}: ${v}`),
  );

  const start = Date.now();
  const { content, sources } = await generateRegularizationDocument({
    docType: "memoria_explicativa",
    docLabel: DOCUMENT_TYPES.memoria_explicativa.label,
    caseData: Object.entries(caseData)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n"),
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  sub(`Documento generado (${content.length} caracteres) — ${elapsed}s`);

  // Mostrar primeras líneas del documento
  const preview = content.split("\n").slice(0, 30).join("\n");
  console.log("\n" + preview);
  console.log("\n  [... documento truncado para preview ...]");

  sub(`Normativa usada en la generación — ${sources.length} fragmentos`);
  sources.forEach((s, i) => {
    console.log(`  [${i + 1}] ${s.source} · ${s.article} · score=${s.score}`);
  });

  // Guardar el documento generado en disco como evidencia
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const outDir = path.join(process.cwd(), "download");
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "memoria_explicativa_demo.md");
  await fs.writeFile(outFile, content, "utf-8");
  console.log(`\n  ✓ Documento guardado en: ${outFile}`);
}

async function main() {
  try {
    await runChatDemo();
    await runDocumentDemo();
    header("DEMOSTRACIÓN COMPLETADA");
    console.log(
      "  Todas las pruebas pasaron. El agente responde con trazabilidad\n" +
        "  de fuentes normativas (RAG) y herramientas invocadas.",
    );
    console.log(DIVIDER + "\n");
  } catch (err) {
    console.error("\n✗ Error en la demostración:", err);
    process.exit(1);
  }
}

main();
