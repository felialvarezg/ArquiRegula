/** Esquemas de validación de entrada para los endpoints de la API.
 *
 * Usa `zod` (v4) para garantiar que los datos que llegan al LLM/router
 * tengan la forma esperada, evitando errores en el pipeline.
 *

 */
import { z } from "zod";

/** Para POST /api/chat */
export const ChatBodySchema = z.object({
  /** Mensaje del usuario (requerido, no vacío, mínimo 1 caracter tras trim) */
  message: z
    .string()
    .trim()
    .min(1, "Se requiere el campo 'message' en el body."),
  /** Id de sesión opcional (puede ser null o undefined) */
  sessionId: z.string().nullable().optional(),
  /** Id de flujo opcional */
  flowId: z.string().optional(),
  /** Tipo de documento opcional */
  type: z.string().optional(),
  /** Antecedentes del caso (registro libre) */
  caseData: z.record(z.string(), z.unknown()).optional(),
});

/** Para POST /api/generate-document */
export const GenerateDocumentBodySchema = z.object({
  type: z.enum([
    "memoria_explicativa",
    "checklist_dom",
    "formulario_unico",
    "dictamen_previo",
  ]),
  caseData: z.record(z.string(), z.unknown()).optional(),
});

/** Para POST /api/web-search */
export const WebSearchBodySchema = z.object({
  query: z.string().trim().min(1, "campo 'query' requerido"),
  num: z.number().int().min(1).max(15).optional(),
});
