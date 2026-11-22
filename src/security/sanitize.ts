import DOMPurify from 'dompurify';

export const ALLOWED_RICH_TEXT_TAGS = [
  'p',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'br',
] as const;

const BLOCK_TAG_REGEX = /^<(p|ul|ol)\b/i;

/**
 * Sanitiza HTML do editor, comentários ricos ou sugestões (sempre untrusted input).
 * Remove scripts, atributos de eventos, estilos inline e tags fora da allowlist.
 */
export function sanitizeRichText(dirtyHtml: string): string {
  return DOMPurify.sanitize(dirtyHtml, {
    ALLOWED_TAGS: [...ALLOWED_RICH_TEXT_TAGS],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  }).trim();
}

/**
 * Garante formato canónico compatível com Tiptap (<p>...</p>) quando o input
 * é texto simples sem elemento de bloco.
 */
export function toCanonicalRichText(input: string): string {
  const sanitized = sanitizeRichText(input);
  if (!sanitized) return '';
  if (BLOCK_TAG_REGEX.test(sanitized)) {
    return sanitized;
  }
  return `<p>${sanitized}</p>`;
}

/**
 * Sanitiza texto simples (ex.: nome do autor ou rótulos), removendo qualquer HTML
 * e descodificando entidades de forma segura.
 */
export function sanitizePlainText(dirtyText: string): string {
  const stripped = DOMPurify.sanitize(dirtyText, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
  return decodeHtmlEntities(stripped).trim();
}

/**
 * Extrai texto plano normalizado a partir de HTML sanitizado, preservando espaços
 * entre blocos e descodificando entidades HTML (&amp; -> &).
 */
export function htmlToPlainText(html: string): string {
  const safeHtml = sanitizeRichText(html);
  const withBlockSpacing = safeHtml
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|h2|h3|li)>/gi, ' ');

  const stripped = DOMPurify.sanitize(withBlockSpacing, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });

  return decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(text: string): string {
  if (typeof document === 'undefined') {
    return text;
  }
  const container = document.createElement('div');
  container.innerHTML = text;
  return container.textContent ?? '';
}