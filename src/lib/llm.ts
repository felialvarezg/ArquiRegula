/**
 * Adaptador LLM unificado.
 *
 * Permite que el agente funcione con:
 *   1. Z.ai SDK (z-ai-web-dev-sdk) — cuando se ejecuta dentro del entorno Z.ai Code
 *   2. OpenAI / APIs compatibles — cuando se ejecuta en una máquina externa
 *
 * APIs compatibles con OpenAI que puedes usar:
 *   - OpenAI (https://api.openai.com/v1)
 *   - Groq (https://api.groq.com/openai/v1) — gratuito, rápido
 *   - Together AI (https://api.together.xyz/v1) — créditos gratuitos
 *   - Ollama local (http://localhost:11434/v1) — gratis, sin internet
 *
 * Configuración vía variables de entorno (.env):
 *   OPENAI_API_KEY=tu-key-aqui
 *   OPENAI_BASE_URL=https://api.openai.com/v1   (opcional, por defecto OpenAI)
 *   OPENAI_MODEL=gpt-4o-mini                     (opcional, por defecto gpt-4o-mini)
 *
 * Si OPENAI_API_KEY no está definida, se usa Z.ai automáticamente.
 */

export interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
}

export interface LLMAdapter {
  name: string;
  createChatCompletion(messages: ChatMessageInput[]): Promise<ChatCompletionResult>;
  /** Solo Z.ai implementa esto. En otros proveedores devuelve false. */
  webSearch?(query: string, num?: number): Promise<WebSearchResult[]>;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  hostName: string;
}

// ---------------------------------------------------------------------------
// Detección de proveedor
// ---------------------------------------------------------------------------

export function getActiveProvider(): "openai" | "zai" {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0) {
    return "openai";
  }
  return "zai";
}

// ---------------------------------------------------------------------------
// Adaptador OpenAI (y compatibles: Groq, Together, Ollama)
// ---------------------------------------------------------------------------

class OpenAIAdapter implements LLMAdapter {
  name = "openai";
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY!;
    this.baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  }

  async createChatCompletion(messages: ChatMessageInput[]): Promise<ChatCompletionResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI API error ${response.status}: ${errorBody.slice(0, 500)}\n` +
          `Verifica OPENAI_API_KEY, OPENAI_BASE_URL y OPENAI_MODEL en .env`,
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    return { content, model: data.model ?? this.model };
  }

  // OpenAI no tiene web_search integrado en este adaptador
  async webSearch(): Promise<WebSearchResult[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Adaptador Z.ai (SDK original)
// ---------------------------------------------------------------------------

class ZAIAdapter implements LLMAdapter {
  name = "zai";
  private zaiInstance: any = null;

  private async getZai() {
    if (!this.zaiInstance) {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      try {
        this.zaiInstance = await ZAI.create();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Configuration file not found") || msg.includes(".z-ai-config")) {
          throw new Error(
            "No se encontró configuración de LLM.\n\n" +
              "OPCIÓN 1 — Usar OpenAI (recomendado para tu máquina):\n" +
              "  1. Crea un archivo .env en la raíz del proyecto\n" +
              "  2. Añade: OPENAI_API_KEY=sk-tu-key-aqui\n" +
              "  3. (Opcional) OPENAI_BASE_URL=https://api.openai.com/v1\n" +
              "  4. (Opcional) OPENAI_MODEL=gpt-4o-mini\n\n" +
              "OPCIÓN 2 — Usar Z.ai:\n" +
              "  1. Crea .z-ai-config con tus credenciales de Z.ai\n\n" +
              "Más info en README.md sección 'Configuración del LLM'",
          );
        }
        throw err;
      }
    }
    return this.zaiInstance;
  }

  async createChatCompletion(messages: ChatMessageInput[]): Promise<ChatCompletionResult> {
    const zai = await this.getZai();
    // El SDK de Z.ai usa role "assistant" para system prompts
    const zaiMessages = messages.map((m) => ({
      role: m.role === "system" ? ("assistant" as const) : (m.role as "user" | "assistant"),
      content: m.content,
    }));

    const completion = await zai.chat.completions.create({
      messages: zaiMessages,
      thinking: { type: "disabled" },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    return { content, model: "zai" };
  }

  async webSearch(query: string, num = 5): Promise<WebSearchResult[]> {
    const zai = await this.getZai();
    const results = await zai.functions.invoke("web_search", {
      query,
      num,
    });
    if (!Array.isArray(results)) return [];
    return results.map((r: any) => ({
      title: r.name,
      url: r.url,
      snippet: r.snippet,
      hostName: r.host_name,
    }));
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let adapterInstance: LLMAdapter | null = null;

export async function getLLM(): Promise<LLMAdapter> {
  if (!adapterInstance) {
    const provider = getActiveProvider();
    adapterInstance = provider === "openai" ? new OpenAIAdapter() : new ZAIAdapter();
  }
  return adapterInstance;
}
