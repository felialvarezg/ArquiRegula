# ArquiRegula  — Agente de IA para Regularización de Edificaciones

Agente basado en LLM y pipeline RAG que genera documentación de regularización de obras ante la Dirección de Obras Municipales (DOM) de Chile, fundamentada en la **Ley General de Urbanismo y Construcciones (LGUC — DFL 458/1975)**, la **Ordenanza General de Urbanismo y Construcciones (OGUC — DS 47/1992)** y la **Ley de Copropiedad Inmobiliaria (Ley 19.537)**.



## Tabla de contenidos

- [Descripción del caso](#descripción-del-caso)
- [Arquitectura de la solución](#arquitectura-de-la-solución)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Instalación y ejecución](#instalación-y-ejecución)
- [Script de demostración](#script-de-demostración)
- [API REST](#api-rest)
- [Mapeo a indicadores de logro](#mapeo-a-indicadores-de-logro)
- [Referencias normativas](#referencias-normativas)

## Descripción del caso

**Organización (ficticia, representativa del rubro):** Estudio de arquitectura pequeño/mediano que atiende a propietarios particulares cuyas obras fueron construidas sin permiso municipal y requieren regularización ante la DOM.

**Problema:** La preparación manual de la memoria explicativa, el checklist de antecedentes y los formularios de regularización consume varias horas del arquitecto por caso, presenta errores de citación normativa y dificulta mantener referencias actualizadas frente a una normativa extensa y cambiante.

**Objetivos medibles:**

1. Reducir en ≥ 50 % el tiempo de redacción de documentación de regularización.
2. Garantizar citación trazable de LGUC/OGUC en cada respuesta del agente.
3. Integrar fuentes web externas (BCN, MINVU, municipios) para normativa reciente o datos comunales.

**Motivación para IA + RAG:** Las consultas son informacionales y normativas, encajan en un pipeline RAG. Un agente autónomo combina un corpus interno (leyes) con búsqueda web externa (fuentes oficiales actualizadas) y conserva trazabilidad de fuentes por cada mensaje emitido.

## Arquitectura de la solución

```text
Usuario ──▶ Orquestador ──▶ Flujo de trabajo (Flow) ──▶ RAG interno (SQLite, TF-IDF + boost)
                │                    │                    └─▶ Web externo (web_search)
                │                    ▼
                │              LLM (chat.completions) + Tools registry
                │                    │
                ▼                    ▼
        Respuesta trazable   Memoria a largo plazo
        (sources, toolsUsed)   (memory_entry, compactación)
```

**Componentes clave:**

| Componente | Archivo | Función |
|---|---|---|
| Recuperador RAG | `src/lib/rag/retriever.ts` | TF-IDF + boost estructural sobre corpus normativo en SQLite |
| Prompts | `src/lib/rag/prompts.ts` | System prompt experto, reglas de citación, anti-alucinación |
| Orquestador | `src/lib/agent/orchestrator.ts` | Ejecuta turnos con plan + memoria + flujos |
| Flujos | `src/lib/agent/flow.ts` | Registry de 6 flujos de regulación del campo |
| Tool registry | `src/lib/agent/tool.ts` | Instancia y ejecución de herramientas (query/write/reason) |
| MemoryManager | `src/lib/agent/memory.ts` | Memoria corto + largo plazo, compactación y recuperación |
| Planner | `src/lib/agent/planner.ts` | Clasificación de intención y planificación adaptativa |
| Cliente SDK | `src/lib/zai.ts` | Singleton de `z-ai-web-dev-sdk` |
| Seed normativo | `prisma/seed.ts` | 23 fragmentos reales de LGUC/OGUC/Ley 19.537 |
| API chat | `src/app/api/chat/route.ts` | Endpoint REST con persistencia trazable |

El diagrama completo y la justificación detallada están en el **informe técnico PDF** (`public/informe-arquiregula-chile.pdf`).

## Mecanismos del agente 

El agente no es un `if` monolítico, sino un **framework de agentes** con:

- **Herramientas registradas (`src/lib/agent/tool.ts`):** `query_knowledge` (RAG),
  `web_search`, `generate_document` (escritura), `summarize`, `remember`,
  `recall`, `search_memory`. Cada herramienta tiene un esquema JSON y una
  función `execute()`, inyectada y ejecutada por el orquestador.
- **Memoria a corto y largo plazo (`src/lib/agent/memory.ts`):** ventana
  deslizante de mensajes + compactación automática → resumen de sesión
  (`memory_entry`), con recuperación (`recall`) y extracción de hechos
  (`extractAndStore`) para continuidad en flujos prolongados.
- **Planificador y toma de decisiones (`src/lib/agent/planner.ts`):**
  `classifyIntent` (general / rag / web / document / clarify / multi),
  `Plan` con pasos ordenados, `planAgentTurn` y `adaptStep` que reacciona
  ante fallos (ej. web → rag, o aclaración al usuario).

|Flujo de un turno: `runAgentTurn` → clasifica intención → genera Plan →
ejecuta pasos (herramientas) → adapta fallos → guarda hechos en memoria →
sintetiza respuesta + trazabilidad.

## Flujos de trabajo  — regulación del campo

El agente soporta **6 flujos** de trabajo arquitectónico y de regulación del campo,
definidos en `src/lib/agent/flow.ts` y registrados en `FLOW_REGISTRY`:

| Flujo | Descripción | Documento de salida |
|---|---|---|
| `dictamen_previo` | Dictamen previo / informe técnico | `dictamen_previo` (OGUC) |
| `checklist_supervision` | Checklist de supervisión técnica | `checklist_dom` (DOM) |
| `verificacion_dominio` | Verificación de dominio público | `formulario_unico` |
| `externalizacion_uso` | Aviso de cambio de uso | `formulario_unico` |
| `reclasificacion_suelo` | Reclasificación de suelo | `memoria_explicativa` |
| `verificacion_normativa` | Verificación de normativa vigente (2024-2025) | ninguno |

Cada flujo define una secuencia de pasos (`query_knowledge`, `web_search`,
`generate_document`, `synthesize`) + un `caseData` con los datos del caso.
El `planFlow` genera un `Plan` a partir de un flujo; el orquestador lo ejecuta
con el mismo mecanismo de plan + memoria + adaptación que los turnos normales.

## Estructura del repositorio

```text
.
├── prisma/
│   ├── schema.prisma           # Modelos: KnowledgeDocument, ChatSession, ChatMessage, GeneratedDocument, WebSource, MemoryEntry
│   └── seed.ts                 # Siembra del corpus normativo chileno
├── scripts/
│   └── demo-agent.ts           # Evidencia de pruebas (3 consultas + generación de documento)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/           # POST /api/chat  → orquestación del agente
│   │   │   ├── sessions/       # CRUD de sesiones
│   │   │   ├── knowledge/      # Corpus + prueba de recuperación
│   │   │   ├── generate-document/
│   │   │   └── web-search/     # Búsqueda web extern
│   ├── lib/
│   │   ├── rag/
│   │   │   ├── retriever.ts    # Pipeline RAG (TF-IDF + boost)
│   │   │   └── prompts.ts      # Prompts optimizados y justificados
│   │   ├── agent/
│   │   │   ├── architecture-agent.ts
│   │   │   ├── flow.ts         # Flujos de trabajo (arquitectura + regulación del campo)
│   │   │   ├── memory.ts       # Memoria corto + largo plazo
│   │   │   ├── orchestrator.ts # Orquestador de turnos + flujos
│   │   │   ├── planner.ts      # Planificación y toma de decisiones
│   │   │   ├── tool.ts         # Registry de herramientas
│   │   │   └── types.ts        # Tipos del agente
│   │   ├── zai.ts              # Cliente Z.ai
│   │   └── db.ts               # Prisma client
│   └── components/agent/       # Header / Footer (UI mínima)
├── public/
│   └── informe-arquiregula-chile.pdf
├── download/
│   └── memoria_explicativa_demo.md   # Salida del script de demostración
└── README.md
```

## Instalación y ejecución

**Requisitos:** Node.js 18+ (recomendado v20 o superior) y npm (incluido con Node.js). Conexión a internet para el SDK Z.ai y la búsqueda web.



### Paso 0 — Configurar el LLM (IMPORTANTE)

El agente necesita un proveedor de LLM para funcionar.



**Proveedores compatibles (todos usan el mismo formato):**

| Proveedor | BASE_URL | MODEL | ¿Costo? |
|---|---|---|---|
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o-mini` | Pago |
| **Groq**  | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | **Gratis** |
| **Together AI** | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Créditos gratis |
| **Ollama local** | `http://localhost:11434/v1` | `llama3.2` | **Gratis, sin internet** |



### Paso 1 — Instalar dependencias


# 1. Instalar dependencias
npm install

# 2. Generar el cliente de Prisma (necesario tras npm install)
npx prisma generate

# 3. Inicializar la base de datos (crea el archivo SQLite)
npm run db:push

# 4. Sembrar el corpus normativo (23 fragmentos de LGUC/OGUC/Ley 19.537)
npm run seed

# 5. Levantar el servidor de desarrollo
npm run dev


El servidor quedará disponible en `http://localhost:3000`.


**Casos de prueba:**

1. *Documentos para regularizar vivienda sin permiso* — valida RAG puro (5 fragmentos recuperados, sin web).
2. *Cambio de destino de local comercial* — valida recuperación sobre OGUC Art. 5.3.2.
3. *Costos de regularización en comuna específica* — valida activación de `web_search` por heurística.

El documento generado se guarda en `download/memoria_explicativa_demo.md`.

## API REST

| Método | Ruta | Parámetros | Descripción |
|--------|------|-----------|-------------|
| POST | `/api/chat` | `message` (string, requerido) · `sessionId` (string, opcional) · `history` (Array, opcional) | Consulta al agente (orquesta herramientas, memoria, plan). Devuelve `sessionId`, `response`, `sources`, `webSources`, `toolsUsed`. |
| POST | `/api/generate-document` | `type` (string, requerido) · `caseData` (object, requerido) | Genera un documento formal (memoria explicativa, checklist DOM, formulario único, dictamen previo). |
| GET | `/api/knowledge` | `q`, `source`, `category` | Explora el corpus RAG o prueba recuperación. |
| POST | `/api/knowledge` | `title`, `content`, `source`, `article`, `category`, `keywords`, `url` | Añade un documento al corpus (invalida el índice RAG). |
| POST | `/api/memory` | `content` (string, requerido) · `kind` (opcional: episodic/case/preference/summary/feedback) · `sessionId` · `metadata` | Guarda un hecho en memoria a largo plazo. |
| GET | `/api/memory` | `kind`, `sessionId` | Lista memoria (filtros). |
| POST | `/api/sessions/[id]/memory` | `content` · `kind` · `metadata` | Guarda un hecho en memoria de una sesión específica. |
| GET | `/api/sessions/[id]/memory` | — | Lista memoria de una sesión. |
| GET | `/api/sessions` | — | Lista sesiones (con conteo de mensajes). |
| POST | `/api/sessions` | `title` · `context` | Crea una sesión. |
| DELETE | `/api/sessions?id=` | `id` | Elimina una sesión. |
| GET | `/api/sessions/[id]` | — | Detalle de sesión (mensajes + documentos). |
| POST | `/api/web-search` | `query`, `num` | Búsqueda web externa (requiere Z.ai / proveedor con `webSearch`). |

### Ejemplos (POST)

**Consulta al agente** — con continuidad de sesión
```json
POST http://localhost:3000/api/chat
{
  "message": "¿Qué documentos necesito para regularizar una vivienda sin permiso?",
  "sessionId": "123"   // opcional; si no se envía, se crea una nueva sesión
}
```

**Generar documento formal**
```json
POST http://localhost:3000/api/generate-document
{
  "type": "memoria_explicativa",
  "caseData": {
    "propietario": "María González",
    "comuna": "Ñuñoa",
    "tipoObra": "Ampliación vivienda",
    "superficie": "45 m²",
    "destino": "Habitacional",
    "fechaConstruccion": "2015 (aprox.)",
    "descripcion": "Ampliación de segundo piso..."
  }
}
```

**Guardar memoria (realidad extraída)**
```json
POST http://localhost:3000/api/memory
{
  "content": "Caso: Ampliación de vivienda sin permiso, Ñuñoa, 45 m².",
  "kind": "case",
  "sessionId": "123",
  "metadata": { "source": "demo_agent", "turn": 1 }
}
```

### Ejemplos (GET)

**Explorar corpus RAG**
```
GET http://localhost:3000/api/knowledge?q=regularizar%20vivienda%20sin%20permiso
```

**Lista memoria (filtro por sesión y kind)**
```
GET http://localhost:3000/api/memory?sessionId=123&kind=case
```

## Para el agente (orquestación interna)

Algunos parámetros internos son ajustables según el flujo de un turno:

| Función | Parámetro | Tipo | Valor por defecto | Uso |
|---------|-----------|------|-------------------|-----|
| `runAgentTurn` | `query` | `string` | — | Consulta del usuario. |
| | `sessionId` | `string \| null` | `null` | Sesión donde se guarda el contexto. |
| | `previousMessages` | `Array<{role, content}>` | `[]` | Historial previo para la continuación de tareas. |
| `MemoryManager` | `maxTurnsBeforeCompaction` | `number` | `6` | Elegir compactar el contexto tras N turnos. |
| | `recover(query, sessionId)` | `query`, `sessionId` | — | Recupera hechos de la memoria a largo plazo. |
| | `remember(content, kind, sessionId, metadata)` | `string`, `MemoryKind`, `string \| null` | — | Guarda un hecho en memoria a largo plazo. |
| `Planner` | `classifyIntent(query)` | `string` | — | Clasifica la intención (general / rag / web / document / clarify / multi). |
| | `planAgentTurn(input)` | `object` | — | Genera un `Plan` con pasos ordenados. |

## Referencias normativas

- Biblioteca del Congreso Nacional de Chile. (1975). *Ley General de Urbanismo y Construcciones* [DFL 458]. https://www.bcn.cl/leychile/navegar?idNorma=13560
- Biblioteca del Congreso Nacional de Chile. (1992). *Ordenanza General de Urbanismo y Construcciones* [DS 47]. https://www.bcn.cl/leychile/navegar?idNorma=8201
- Biblioteca del Congreso Nacional de Chile. (1997). *Ley de Copropiedad Inmobiliaria* [Ley 19.537]. https://www.bcn.cl/leychile/navegar?idNorma=17137
- Ministerio de Vivienda y Urbanismo. (2025). *DDU 521 — Regularización de viviendas*. https://www.minvu.gob.cl
