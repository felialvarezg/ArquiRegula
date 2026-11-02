# ArquiRegula Chile — Arquitectura y Orquestación del Agente

Documento técnico que explica el diseño e implementación del agente del
proyecto ArquiRegula (Estudio de Arquitectura con IA). Este documento
responde al (documentar el diseño e
implementación del agente, explicando la orquestación entre componentes y su
relación con el flujo de trabajo automatizado que resuelve un requerimiento
organizacional).

---

## 1. Antecedentes y requerimiento organizacional

**Organización (ficticia, representativa del rubro):** estudio de arquitectura
que atiende a propietarios particulares cuyas obras fueron construidas sin
permiso municipal y requieren regularización ante la Dirección de Obras
Municipales (DOM).

**Problema:** la preparación manual de la memoria explicativa, el checklist de
antecedentes y los formularios de regularización consume varias horas del
arquitecto por caso, presenta errores de citación normativa y dificulta
mantener referencias actualizadas.

**Objetivo del flujo automatizado:** reducir en ≥ 50 % el tiempo de
redacción de la documentación, garantizar citación trazable de LGUC/OGUC y
integrar fuentes web externas para normativa reciente.

**Requerimiento que resuelve:** el agente recibe una consulta del usuario sobre
regularización de obras y debe:
1. Consultar conocimiento normativo interno (RAG).
2. Decidir si conviene consulrar web externa (datos actualizados/locals).
3. Redactar y escuchar documentación formal (memoria, checklist, formulario).
4. Mantener coherencia entre turnos (memoria).
5. Persistir trazabilidad para auditoría.

---

## 2. Arquitectura en capas

El agente se organiza en **5 capas** que se orquestan en el flujo de cada
turno:

```
┌─────────────────────────────────────────────────────────────┐
│  Capa de presentación / API (Next.js App Router)           │
│  /api/chat, /api/generate-document, /api/memory ...        │
└───────────────────────────┬───────────────────────────────┘
                            │ (solicitud + sesión)
┌───────────────────────────▼───────────────────────────────┐
│  Capa de orquestación (orchestrator)                       │
│  runAgentTurn → plan → ejecuta pasos → memoria → síntesis  │
└───────────────────────────┬───────────────────────────────┘
                            │ llama
┌───────────────────────────▼───────────────────────────────┐
│  Capa de herramientas (Tool)                               │
│  query_knowledge · web_search · generate_document          │
│  summarize · remember · recall · search_memory             │
└───────────────────────────┬───────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────┐
│  Capa de inteligencia (LLM + RAG)                          │
│  Adaptador LLM (OpenAI-Z.ai) · retriever TF-IDF · prompts  │
└───────────────────────────┬───────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────┐
│  Capa de datos persistentes (SQLite / Prisma)              │
│  KnowledgeDocument · ChatSession · ChatMessage             │
│  GeneratedDocument · WebSource · MemoryEntry               │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Componentes y orquestación

### 3.1 Campo `lib/agent` (framework del agente)

| Archivo | Responsabilidad |
|---|---|
| `types.ts` | Tipos centrales: `Tool`, `Plan`, `PlanStep`, `MemoryEntry`, `AgentContext`, `AgentAction`, `AgentTurnResult`. |
| `tool.ts` | Registro de herramientas (`ToolRegistry`). Cada herramienta expone un `execute(args)` con esquema JSON. Las 7 herramientas built-in: `query_knowledge`, `web_search`, `generate_document`, `summarize`, `remember`, `recall`, `search_memory`. |
| `planner.ts` | Generador de planes y t María de decisión: `classifyIntent`, `PlanImpl`, `planAgentTurn`, `adaptStep`. |
| `memory.ts` | `MemoryManager`: memoria a corto plazo (ventana deslizante + compactación) e a largo plazo (entradas persistidas). |
| `orchestrator.ts` | Flujo completo de un turno: actualiza contexto → planifica → ejecuta pasos → adapta fallos → guarda hechos → sintetiza. |
| `document.ts` | `generateRegularizationDocument`: RAG + LLM para redacción de documentos formales. |
| `architecture-agent.ts` | Capa pública que reexporta `runAgentTurn` y `generateRegularizationDocument` para las APIs. |

### 3.2 Capa `lib/rag`

- `retriever.ts`: recuperación híbrida TF-IDF + boost sobre SQLite (23
  fragmentos LGUC/OGUC/Ley 19.537).
- `prompts.ts`: system prompts expertos, reglas de citación, templates de
  contexto RAG y web, y la `DOCUMENT_GENERATION_PROMPT`.

### 3.3 Capa `lib/llm`

- `llm.ts`: adaptador unificado. Detecta proveedor (`zai` por defecto,
  `openai` si hay `OPENAI_API_KEY`). Expo `createChatCompletion` y
  (opcionalmente) `webSearch`.
- `zai.ts`: cliente singleton del SDK `z-ai-web-dev-sdk`.

### 3.4 Capa de datos

Prisma con SQLite (`db`). Modelos:
- `KnowledgeDocument` (corpus RAG)
- `ChatSession` / `ChatMessage` (historial y trazabilidad)
- `GeneratedDocument` (documentos generados)
- `WebSource` (fuentes web)
- **`MemoryEntry` (nuevo)**: hechos de memoria a largo plazo

---

## 4. Procesos de memoria (IL2.2)

El agente implementa **memoria de corto y largo plazo** para mantener
coherencia en tareas prolongadas.

### 4.1 Memoria a corto plazo (working memory)

- **Ventana deslizante:** se conservan los últimos `SHORT_TERM_MAX_MESSAGES`
  (20) mensajes del usuario y asistente del contexto.
- **Compactación automática:** cuando `currentTurn >= maxTurnsBeforeCompaction`
  (6), el `MemoryManager` resume los mensajes recientes en un resumen
  ejecutivo y lo persiste como `kind = "summary"`.
- **Continuidad:** el resumen se inyecta de nuevo en el siguiente turno, de
  modo que el agente no "olvida" el estado de la conversación.

### 4.2 Memoria a largo plazo (episodic + case + preference + feedback)

Las entradas se guardan en `memory_entry` (tabla SQLite). Tipos de hechos:

| Kind | Uso |
|---|---|
| `case` | Datos del caso (propietario, comuna, superficie, tipo de obra). |
| `preference` | Preferencias del usuario (explicaciones paso a paso, citar normas). |
| `summary` | Resumen de sesión (continuidad). |
| `feedback` | Aclaraciones o correcciones explícitas. |
| `episodic` | Hechos extraídos de la conversación. |

### 4.3 Recuperación y enriquecimiento

- `recall(query, sessionId)` recupera hechos relevantes del caso, preferencias
  y resumen de una sesión.
- Tras generar la respuesta, `extractAndStore()` extrae hechos visibles y los
  persiste (heurística textual; el LLM puede sustituirla).
- `search_memory` permite al usuario/consulta recobrar hechos guardados.

---

## 5. Planificación y toma de decisión 

### 5.1 Clasificación de intenciones

`classifyIntent(query)` asigna la intención de la consulta a uno de:
`general`, `rag`, `web`, `document`, `clarify`, `multi`. Es determinista por
reglas de texto; es reemplazable por una etapa de "thinking" de LLM.

### 5.2 Planificador

`planAgentTurn(input)` genera un `Plan` con pasos ordenados:

- `document` → recuperar normativa → redactar documento → guardar caso en
  memoria → sintetizar.
- `web` → web_search → query_knowledge → sintetizar.
- `multi` → query_knowledge → recall → (opcional web_search para costos) →
  sintetizar.
- `rag` → query_knowledge → sintetizar.
- `general` → sintetizar (sin herramienta definida).

### 5.3 Ejecución y adaptación

- Se ejecutan los pasos uno a uno.
- Si un paso falla, `decideFallback()` elige un paso alternativo
  (ej. `web_search` → `query_knowledge` si la web no está disponible) o
  reintenta la misma herramienta hasta 3 veces.
- El plan se marca `in_progress` → `completed`/`aborted` con trazabilidad de
  cada paso (status, result, error).

### 5.4 Decisiones adaptativas

- Si la búsqueda web no está disponible en el proveedor → se salta a
  `query_knowledge`.
- Si `query_knowledge` devuelve pocos resultados → se activa `web_search`.
- Si el contexto es insuficiente → el planificador genera una pregunta de
  aclaración al usuario (`action: "clarify"`).

---

## 6. Herramientas

El agente expone un kit de herramientas con esquemas tipados y ejecución
seguura:

| Herramienta | Tipo | Descripción |
|---|---|---|
| `query_knowledge` | Consulta | RAG interno (TF-IDF + boost). |
| `web_search` | Consulta | Búsqueda externa (Z.ai / OpenAI web). |
| `generate_document` | Escritura | Redacta memoria, checklist, formulario o dictamen en Markdown. |
| `summarize` | Razonamiento/escritura | Comprime texto (compactación de contexto). |
| `remember` | Escritura | Guarda hechos en memoria a largo plazo. |
| `recall` | Consulta | Recupera hechos de memoria a largo plazo. |
| `search_memory` | Consulta | Recupera de forma híbrida (caso + preferencias). |

Cada herramienta es inyectada en el registro y ejecutada por el
orquestador, lo que demuestra el uso de un **framework de agentes** con
herramientas registradas y un bucle de ejecución (no heurística ad-hoc).

---

## 7. Flujo de un turno (orquestación de componentes)

```
1. runAgentTurn(query, sessionId)
   ├─ Actualiza historial corto (recentMessages)
   ├─ classifyIntent(query) → intención
   ├─ planAgentTurn(...) → Plan (pasos ordenados)
   ├─ Si action === "clarify" → responder pregunta (memory.remember feedback)
   ├─ ejecutar cada planStep:
   │    ├─ executeToolStep(step) → ToolResult
   │    ├─ si falla → decideFallback() → reemplazar paso
   │    └─ si paso terminal → detener
   ├─ guardar hechos en memoria (memory.remember)
   ├─ compactar contexto si turn ≥ 6 (memory.compactSession)
   └─ extraer y guardar hechos del mensaje del asistente
   └─ devolver AgentTurnResult { response, sources, webSources,
     toolsUsed, memory, provider, decision }
```

---

## 8. API REST de la aplicación

| Ruta | Método | Función |
|---|---|---|
| `/api/chat` | POST | Orquesta el agente (runAgentTurn). |
| `/api/generate-document` | POST | Genera documento formal (genera_document). |
| `/api/knowledge` | GET/POST | Corpus RAG + prueba de recuperación. |
| `/api/web-search` | POST | Búsqueda web externa. |
| `/api/sessions` | GET/POST/DELETE | Gestión de sesiones. |
| `/api/sessions/[id]` | GET | Detalle de sesión con mensajes y documentos. |
| `/api/memory` | GET/POST | Memoria global (listar/guardar hechos). |
| `/api/sessions/[id]/memory` | GET/POST | Memoria dentro de una sesión. |

---

