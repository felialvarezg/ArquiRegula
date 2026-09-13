/**
 * Cliente singleton del SDK Z.ai (z-ai-web-dev-sdk).
 *
 * IMPORTANTE: z-ai-web-dev-sdk SOLO puede usarse en el backend.
 * Este módulo jamás debe importarse desde componentes cliente.
 *
 * CONFIGURACIÓN REQUERIDA:
 * El SDK busca un archivo `.z-ai-config` en:
 *   1. El directorio raíz del proyecto (./.z-ai-config)
 *   2. El directorio home del usuario (~/.z-ai-config)
 *   3. El directorio del sistema (/etc/.z-ai-config)
 *
 * Si ves el error "Configuration file not found or invalid", copia
 * `.z-ai-config.example` a `.z-ai-config` y completa tu API key.
 */
import ZAI from "z-ai-web-dev-sdk";

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

export async function getZAI() {
  if (!zaiInstance) {
    try {
      zaiInstance = await ZAI.create();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Configuration file not found") || msg.includes(".z-ai-config")) {
        throw new Error(
          "Falta el archivo de configuración de Z.ai.\n\n" +
            "Para resolverlo:\n" +
            "  1. Copia .z-ai-config.example a .z-ai-config\n" +
            "  2. Edita .z-ai-config y reemplaza TU_API_KEY_AQUI por tu API key de Z.ai\n" +
            "  3. Vuelve a ejecutar el comando\n\n" +
            "El archivo debe estar en la raíz del proyecto o en ~/.z-ai-config",
        );
      }
      throw err;
    }
  }
  return zaiInstance;
}

export type ZAIClient = Awaited<ReturnType<typeof ZAI.create>>;
