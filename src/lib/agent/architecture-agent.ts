/** =========================================================================

 * 
 *  Módulo público que expone la interfaz principal del agente para las APIs
 *  de Next.js:
 *    - `runAgentTurn`          → ejecución de un turno con plan + memoria
 *    - `generateRegularizationDocument` → generación de documentos
 *    - `AgentTurnResult`       → tipo de resultado trazable
 *
 *  Esta capa reexporta desde los módulos internos del framework del agente
 *  (orchestrator, document) para mantener la compatibilidad con el código
 *  existente (`chat/route.ts`, `generate-document/route.ts`).
 * =========================================================================
 */

// Tipos públicos
export type {
  AgentTurnResult,
  Plan,
  PlanStep,
  MemoryEntry,
  ToolName,
  ToolResult,
  AgentContext,
  AgentAction,
  DocumentType,
} from "./types";

export {
  DOCUMENT_TYPES,
} from "./types";

// Ejecución de un turno completo (orquestación + plan + memoria)
export { runAgentTurn } from "./orchestrator";

// Generación de documentos formales (RAG + LLM)
export { generateRegularizationDocument } from "./document";

// Flujos de trabajo (arquitectura + regulación del campo)
export { FLOW_REGISTRY, planFlow, type FlowId, type Flow, type FlowStep, type FlowInput, type FlowContext, type FlowDecision } from "./flow";
