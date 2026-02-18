/**
 * Escapes HTML special characters to prevent XSS when embedding
 * user-supplied text into HTML strings (e.g. print windows).
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
