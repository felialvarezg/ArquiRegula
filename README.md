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

```
Usuario ──▶ Orquestador ──▶ RAG interno (SQLite, TF-IDF + boost)
                │         └─▶ Web externo (web_search)
                ▼
              LLM (chat.completions)
                │
                ▼
        Respuesta trazable
        (sources + toolsUsed persistidos)
```

**Componentes clave:**

| Componente | Archivo | Función |
|---|---|---|
| Recuperador RAG | `src/lib/rag/retriever.ts` | TF-IDF + boost estructural sobre corpus normativo en SQLite |
| Prompts | `src/lib/rag/prompts.ts` | System prompt experto, reglas de citación, anti-alucinación |
| Orquestador | `src/lib/agent/architecture-agent.ts` | Integra RAG + web_search + LLM + control de contexto |
| Cliente SDK | `src/lib/zai.ts` | Singleton de `z-ai-web-dev-sdk` |
| Seed normativo | `prisma/seed.ts` | 23 fragmentos reales de LGUC/OGUC/Ley 19.537 |
| API chat | `src/app/api/chat/route.ts` | Endpoint REST con persistencia trazable |

El diagrama completo y la justificación detallada están en el **informe técnico PDF** (`public/informe-arquiregula-chile.pdf`).

## Estructura del repositorio

```
.
├── prisma/
│   ├── schema.prisma           # Modelos: KnowledgeDocument, ChatSession, ChatMessage, GeneratedDocument, WebSource
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
│   │   │   └── architecture-agent.ts
│   │   ├── zai.ts              # Cliente 
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

  ## ENDPOINTS

# Consulta al agente

POST http://localhost:3000/api/chat
{
  "message": "¿Qué documentos necesito para regularizar una vivienda sin permiso?"
}


# Generar documento formal
POST http://localhost:3000/api/generate-document {
  "type": "memoria_explicativa",
  "caseData": {
    "propietario": "María González",
    "comuna": "Ñuñoa",
    "tipoObra": "Ampliación vivienda",
    "superficie": "45 m²"
  }
}
# Explorar corpus normativo
GET http://localhost:3000/api/knowledge

# Probar recuperación RAG
GET "http://localhost:3000/api/knowledge?q=regularizar%20vivienda%20sin%20permiso"



## Referencias normativas

- Biblioteca del Congreso Nacional de Chile. (1975). *Ley General de Urbanismo y Construcciones* [DFL 458]. https://www.bcn.cl/leychile/navegar?idNorma=13560
- Biblioteca del Congreso Nacional de Chile. (1992). *Ordenanza General de Urbanismo y Construcciones* [DS 47]. https://www.bcn.cl/leychile/navegar?idNorma=8201
- Biblioteca del Congreso Nacional de Chile. (1997). *Ley de Copropiedad Inmobiliaria* [Ley 19.537]. https://www.bcn.cl/leychile/navegar?idNorma=17137
- Ministerio de Vivienda y Urbanismo. (2025). *DDU 521 — Regularización de viviendas*. https://www.minvu.gob.cl
