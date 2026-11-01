/** =========================================================================
 *  Flow system — nuevos flujos de trabajo arquitectónicos y de regulación
 *  del campo para ArquiRegula Chile.
 *
 *  Cobertura:
 *    - Dictamen previo / informe técnico
 *    - Checklist de supervisión técnica
 *    - Verificación de dominio público
 *    - Aviso de cambio de uso (externalización)
 *    - Reclasificación de suelo
 *    - Verificación de normativa vigente
 *
 *  Cada flujo define una secuencia de pasos (tools + synthesis) y un
 *  esquema de entrada `caseData`. El `FlowRegistry` expone los flujos y
 *  el `planFlow` genera un `Plan` a partir de un flujo (usado por el
 *  orquestador y el planner).
 * =========================================================================
 */

import type {
  Flow,
  FlowId,
  FlowInput,
  FlowStep,
  FlowContext,
  FlowDecision,
  FlowRegistry,
  Plan,
  PlanStep,
  ToolName,
} from "@/lib/agent/types";
import { v4 as uuid } from "uuid";
import { PlanImpl } from "@/lib/agent/planner";

// ---------------------------------------------------------------------------
// Definición de cada flujo
// ---------------------------------------------------------------------------

const dictamenPrevioFlow: Flow = {
  id: "dictamen_previo",
  name: "dictamen_previo",
  label: "Dictamen Previo / Informe Técnico",
  description:
    "Genera un informe técnico que analiza la viabilidad de regularización de una obra existente conforme a la normativa vigente (OGUC/DOM).",
  documentType: "dictamen_previo",
  steps: [
    {
      id: "dict-query",
      tool: "query_knowledge",
      description: "Recuperar normativa aplicable al dictamen previo",
      args: { query: "dictamen previo regularización obra Chile" },
    },
    {
      id: "dict-dominio",
      tool: "query_knowledge",
      description: "Verificar requisitos de dominio público y titularidad",
      args: { query: "dominio público regularización edificación" },
    },
    {
      id: "dict-generate",
      tool: "generate_document",
      description: "Redactar dictamen previo / informe técnico",
      args: { docType: "dictamen_previo", caseData: "{{caseData}}" },
    },
    {
      id: "dict-synthesize",
      tool: "synthesize",
      description: "Presentar el dictamen con fuentes y firmas",
    },
  ],
  caseDataSchema: {
    name: "caseData",
    label: "Datos del caso",
    description: "Datos del caso para el dictamen previo",
    type: "object",
    required: ["propietario", "comuna", "direccion", "tipoObra"],
    properties: {
      propietario: { type: "string", description: "Nombre del propietario" },
      comuna: { type: "string", description: "Comuna de la obra" },
      direccion: { type: "string", description: "Dirección" },
      tipoObra: { type: "string", description: "Tipo de obra" },
      superficie: { type: "string", description: "Superficie" },
      fechaConstruccion: { type: "string", description: "Fecha de construcción" },
      destino: { type: "string", description: "Destino del uso" },
      descripcion: { type: "string", description: "Descripción de la obra" },
    },
  },
};

const checklistSupervisionFlow: Flow = {
  id: "checklist_supervision",
  name: "checklist_supervision",
  label: "Checklist de Supervisión Técnica",
  description:
    "Genera un checklist de supervisión técnica de obra según OGUC, incluyendo los controles y actas asociadas.",
  documentType: "checklist_dom",
  steps: [
    {
      id: "chk-query",
      tool: "query_knowledge",
      description: "Recuperar requisitos de supervisión técnica",
      args: { query: "supervisión técnica obra Chile OGUC" },
    },
    {
      id: "chk-controles",
      tool: "query_knowledge",
      description: "Identificar controles según tipo de obra",
      args: { query: "controles de supervisión edificio vivienda comuna" },
    },
    {
      id: "chk-generate",
      tool: "generate_document",
      description: "Generar checklist de supervisión",
      args: { docType: "checklist_dom", caseData: "{{caseData}}" },
    },
    {
      id: "chk-synthesize",
      tool: "synthesize",
      description: "Presentar el checklist de supervisión",
    },
  ],
  caseDataSchema: {
    name: "caseData",
    label: "Datos del caso",
    description: "Datos del caso para el checklist de supervisión",
    type: "object",
    required: ["comuna", "tipoObra"],
    properties: {
      comuna: { type: "string", description: "Comuna" },
      tipoObra: { type: "string", description: "Tipo de obra" },
      codigoEdificacion: { type: "string", description: "Código edificacion" },
      pisos: { type: "number", description: "Número de pisos" },
      materiales: { type: "string", description: "Materiales" },
      zonaUso: { type: "string", description: "Zona de uso" },
    },
  },
};

const verificacionDominioFlow: Flow = {
  id: "verificacion_dominio",
  name: "verificacion_dominio",
  label: "Verificación de Dominio Público",
  description:
    "Verifica dominio público y titularidad, recuperando casos similares de memoria y generando un formulario de certificación.",
  documentType: "formulario_unico",
  steps: [
    {
      id: "dom-query",
      tool: "query_knowledge",
      description: "Recuperar requisitos de dominio público",
      args: { query: "dominio público certificación propiedad Chile" },
    },
    {
      id: "dom-memory",
      tool: "search_memory",
      description: "Buscar casos similares en memoria (si está disponible)",
      args: { query: "dominio público {{caseData.comuna}}" },
    },
    {
      id: "dom-generate",
      tool: "generate_document",
      description: "Generar formulario de certificación de dominio",
      args: { docType: "formulario_unico", caseData: "{{caseData}}" },
    },
    {
      id: "dom-synthesize",
      tool: "synthesize",
      description: "Presentar la verificación de dominio",
    },
  ],
  caseDataSchema: {
    name: "caseData",
    label: "Datos del caso",
    description: "Datos del caso para la verificación de dominio",
    type: "object",
    required: ["propietario", "comuna", "direccion"],
    properties: {
      propietario: { type: "string", description: "Nombre del propietario" },
      comuna: { type: "string", description: "Comuna" },
      direccion: { type: "string", description: "Dirección" },
      tipoObra: { type: "string", description: "Tipo de obra" },
      codigoPropiedad: { type: "string", description: "Código de propiedad" },
    },
  },
};

const externalizacionUsoFlow: Flow = {
  id: "externalizacion_uso",
  name: "externalizacion_uso",
  label: "Aviso de Cambio de Uso (Externalización)",
  description:
    "Genera un aviso de cambio de uso / externalización, integrando la ordenanza municipal de la comuna.",
  documentType: "formulario_unico",
  steps: [
    {
      id: "ext-query",
      tool: "query_knowledge",
      description: "Recuperar requisitos de externalización de uso",
      args: { query: "externalización uso suelo comuna Chile" },
    },
    {
      id: "ext-web",
      tool: "web_search",
      description: "Buscar ordenanza municipal de la comuna",
      args: { query: "{{caseData.comuna}} externalización uso" },
    },
    {
      id: "ext-generate",
      tool: "generate_document",
      description: "Generar aviso de cambio de uso",
      args: { docType: "formulario_unico", caseData: "{{caseData}}" },
    },
    {
      id: "ext-synthesize",
      tool: "synthesize",
      description: "Presentar el aviso de cambio de uso",
    },
  ],
  caseDataSchema: {
    name: "caseData",
    label: "Datos del caso",
    description: "Datos del caso para la externalización de uso",
    type: "object",
    required: ["comuna", "codigoEdificacion", "zonaUsoActual", "zonaUsoNueva"],
    properties: {
      comuna: { type: "string", description: "Comuna" },
      codigoEdificacion: { type: "string", description: "Código edificacion" },
      direccion: { type: "string", description: "Dirección" },
      zonaUsoActual: { type: "string", description: "Zona de uso actual" },
      zonaUsoNueva: { type: "string", description: "Zona de uso nueva" },
      tipoObra: { type: "string", description: "Tipo de obra" },
    },
  },
};

const reclasificacionSueloFlow: Flow = {
  id: "reclasificacion_suelo",
  name: "reclasificacion_suelo",
  label: "Reclasificación de Suelo",
  description:
    "Genera un informe de reclasificación de suelo y modificaciones urbanísticas, revisando términos municipales de uso de suelo.",
  documentType: "memoria_explicativa",
  steps: [
    {
      id: "reclass-query",
      tool: "query_knowledge",
      description: "Recuperar normativa de reclasificación de suelo",
      args: { query: "reclasificación suelo modificaciones urbanísticas Chile" },
    },
    {
      id: "reclass-web",
      tool: "web_search",
      description: "Buscar términos municipales de uso de suelo",
      args: { query: "{{caseData.comuna}} uso de suelo" },
    },
    {
      id: "reclass-generate",
      tool: "generate_document",
      description: "Generar informe de reclasificación de suelo",
      args: { docType: "memoria_explicativa", caseData: "{{caseData}}" },
    },
    {
      id: "reclass-synthesize",
      tool: "synthesize",
      description: "Presentar el informe de reclasificación",
    },
  ],
  caseDataSchema: {
    name: "caseData",
    label: "Datos del caso",
    description: "Datos del caso para la reclasificación de suelo",
    type: "object",
    required: ["comuna", "codigoEdificacion", "zonaUso", "sueloAnterior", "sueloNuevo"],
    properties: {
      comuna: { type: "string", description: "Comuna" },
      codigoEdificacion: { type: "string", description: "Código edificacion" },
      direccion: { type: "string", description: "Dirección" },
      zonaUso: { type: "string", description: "Zona de uso" },
      sueloAnterior: { type: "string", description: "Suelo anterior" },
      sueloNuevo: { type: "string", description: "Suelo nuevo" },
      objetivoObra: { type: "string", description: "Objetivo de la obra" },
    },
  },
};

const verificacionNormativaFlow: Flow = {
  id: "verificacion_normativa",
  name: "verificacion_normativa",
  label: "Verificación de Normativa Vigente",
  description:
    "Verifica la normativa vigente (actualizaciones 2024-2025) integrando búsqueda web con la base de conocimiento interno.",
  documentType: undefined,
  steps: [
    {
      id: "norm-web",
      tool: "web_search",
      description: "Buscar normativa reciente (mayor 2024)",
      args: { query: "{{caseData.temaNormativo}} Chile DDU 2025" },
    },
    {
      id: "norm-query",
      tool: "query_knowledge",
      description: "Consolidar con la base de conocimiento interno",
      args: { query: "{{caseData.temaNormativo}}" },
    },
    {
      id: "norm-synthesize",
      tool: "synthesize",
      description: "Responder con fuentes verificadas",
    },
  ],
  caseDataSchema: {
    name: "caseData",
    label: "Datos del caso",
    description: "Datos del caso para la verificación de normativa",
    type: "object",
    required: ["comuna", "temaNormativo"],
    properties: {
      comuna: { type: "string", description: "Comuna" },
      temaNormativo: { type: "string", description: "Tema normativo a verificar" },
      fechaConsulta: { type: "string", description: "Fecha de consulta" },
    },
  },
};

// ---------------------------------------------------------------------------
// Registro de flujos
// ---------------------------------------------------------------------------

/** Registro de todos los flujos disponibles (arquitectura + regulación del campo). */
export const FLOW_REGISTRY: FlowRegistry = {
  get(id) {
    const flows = [dictamenPrevioFlow, checklistSupervisionFlow, verificacionDominioFlow, externalizacionUsoFlow, reclasificacionSueloFlow, verificacionNormativaFlow];
    return flows.find((f) => f.id === id);
  },
  list() {
    return [dictamenPrevioFlow, checklistSupervisionFlow, verificacionDominioFlow, externalizacionUsoFlow, reclasificacionSueloFlow, verificacionNormativaFlow];
  },
  add(flow) {
    // Para el scope de este proyecto los flujos son estáticos; se mantiene la interfaz.
  },
};

// ---------------------------------------------------------------------------
// Construcciones de pasos a partir de un flujo
// ---------------------------------------------------------------------------

/**
 * Genera un `Plan` a partir de un `Flow`.
 * Cada paso del flujo se convierte en un `PlanStep`.
 */
export function planFlow(flow: Flow, ctx: FlowContext): Plan {
  const plan = new PlanImpl({ sessionId: ctx.sessionId, goal: `Flujo: ${flow.name}` });

  for (const step of flow.steps) {
    const planStep: PlanStep = {
      id: step.id ?? uuid(),
      tool: step.tool,
      description: step.description,
      status: "pending",
      args: { ...step.args },
    };

    // Reemplazar placeholders `{{caseData.X}}` por el valor real del caso
    if (planStep.args) {
      planStep.args = replacePlaceholders(planStep.args, ctx.caseData);
    }

    plan.addStep(planStep.tool as PlanStep["tool"], planStep.description, planStep.args as Record<string, unknown>);
  }

  return plan;
}

/** Reemplaza placeholders `{{caseData.X}}` por `caseData.X`. */
function replacePlaceholders(data: Record<string, unknown>, caseData: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      result[key] = replaceSinglePlaceholder(value, caseData);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function replaceSinglePlaceholder(text: string, caseData: Record<string, unknown>): string {
  // {{caseData.X}} → caseData.X
  let result = text.replace(/\{\{\s*caseData\.([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    return String(caseData[key] ?? match);
  });
  // {{caseData}} (sin clave) → JSON.stringify(caseData) para pasarlo al generador
  result = result.replace(/\{\{\s*caseData\s*\}\}/g, (match) => {
    return JSON.stringify(caseData);
  });
  return result;
}

// ---------------------------------------------------------------------------
// Re-exportación de tipos públicos
// ---------------------------------------------------------------------------

export type { FlowId, Flow, FlowStep, FlowInput, FlowContext, FlowDecision, FlowRegistry };
