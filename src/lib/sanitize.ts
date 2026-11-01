/**
 * Escapa HTML para prevenir XSS cuando se renderiza contenido dinámico.
 * Úsese con `dangerouslySetInnerHTML` para evitar inyección de scripts.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
