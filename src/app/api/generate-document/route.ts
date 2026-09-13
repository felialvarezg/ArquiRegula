/**
 * API: generación de documentos de regularización.
 *  POST /api/generate-document
 *
 * Body: {
 *   sessionId?: string,
 *   type: "memoria_explicativa" | "checklist_dom" | "formulario_unico" | "dictamen_previo",
 *   caseData: {
 *     propietario?: string,
 *     comuna?: string,
 *     rolAvaluo?: string,
 *     direccion?: string,
 *     tipoObra?: string,
 *     superficie?: string,
 *     fechaConstruccion?: string,
 *     destino?: string,
 *     descripcion?: string,
 *   }
 * }
 *
 * Devuelve el documento generado en Markdown + las fuentes normativas usadas.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateRegularizationDocument } from "@/lib/agent/architecture-agent";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/rag/prompts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.type || !body?.caseData) {
      return NextResponse.json(
        { error: "Se requieren 'type' y 'caseData'" },
        { status: 400 },
      );
    }

    const type = body.type as DocumentType;
    if (!DOCUMENT_TYPES[type]) {
      return NextResponse.json(
        { error: `Tipo de documento inválido. Válidos: ${Object.keys(DOCUMENT_TYPES).join(", ")}` },
        { status: 400 },
      );
    }

    // Serializa los datos del caso en texto legible para el LLM
    const caseData = objectToCaseText(body.caseData);

    const { content, sources } = await generateRegularizationDocument({
      docType: type,
      docLabel: DOCUMENT_TYPES[type].label,
      caseData,
    });

    const title = DOCUMENT_TYPES[type].label;

    // Persiste el documento si hay sesión
    let sessionId = body.sessionId as string | undefined;
    if (sessionId) {
      const created = await db.generatedDocument.create({
        data: {
          sessionId,
          type,
          title,
          content,
          metadata: JSON.stringify(body.caseData),
        },
      });
      return NextResponse.json({
        document: created,
        sources,
        type,
        label: title,
      });
    }

    return NextResponse.json({
      document: { title, content, type },
      sources,
      type,
      label: title,
    });
  } catch (err) {
    console.error("[api/generate-document POST]", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: "No se pudo generar el documento", detail: message },
      { status: 500 },
    );
  }
}

/** Convierte el objeto caseData en un texto estructurado legible por el LLM. */
function objectToCaseText(data: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    propietario: "Nombre del propietario",
    comuna: "Comuna",
    rolAvaluo: "Rol de avalúo",
    direccion: "Dirección del predio",
    tipoObra: "Tipo de obra a regularizar",
    superficie: "Superficie construida (m²)",
    fechaConstruccion: "Fecha aproximada de construcción",
    destino: "Destino o uso actual",
    descripcion: "Descripción de la obra y antecedentes",
    pisos: "Número de pisos",
    materiales: "Materiales predominantes",
    planRegulador: "Zonificación del plan regulador (si se conoce)",
    observaciones: "Observaciones adicionales",
  };

  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === "") continue;
    const label = labels[key] ?? key;
    lines.push(`- ${label}: ${value}`);
  }
  if (lines.length === 0) {
    return "(No se proporcionaron antecedentes específicos. El usuario debe completarlos.)";
  }
  return lines.join("\n");
}
