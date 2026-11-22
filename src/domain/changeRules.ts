import {
  htmlToPlainText,
  toCanonicalRichText,
} from '../security/sanitize';
import type { IndexedPassage } from './schemas';

export interface ChangeEvaluation {
  hasChanged: boolean;
  formattingOnly: boolean;
  isDeletion: boolean;
  originalText: string;
  proposedText: string;
  sanitizedOriginalHtml: string;
  sanitizedProposedHtml: string;
}

function normalizeHtml(html: string): string {
  return html
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Avalia se houve alteração real entre o conteúdo original e o proposto.
 * Normaliza ambos para o formato canónico de bloco (<p>...</p>) antes de comparar,
 * evitando falsos positivos quando texto cru do PDF é carregado no Tiptap.
 */
export function evaluateChangeContent(
  originalInput: string,
  proposedInput: string
): ChangeEvaluation {
  const sanitizedOriginalHtml = toCanonicalRichText(originalInput);
  const rawProposedHtml = toCanonicalRichText(proposedInput);

  const originalText = htmlToPlainText(sanitizedOriginalHtml);
  const proposedText = htmlToPlainText(rawProposedHtml);

  const isDeletion = originalText.length > 0 && proposedText.length === 0;
  const sanitizedProposedHtml = isDeletion ? '' : rawProposedHtml;

  const textChanged = originalText !== proposedText;
  const markupChanged =
    normalizeHtml(sanitizedOriginalHtml) !== normalizeHtml(sanitizedProposedHtml);

  const hasChanged = textChanged || markupChanged;
  const formattingOnly = !textChanged && markupChanged;

  return {
    hasChanged,
    formattingOnly,
    isDeletion,
    originalText,
    proposedText,
    sanitizedOriginalHtml,
    sanitizedProposedHtml,
  };
}

export function canEditPassage(
  passage: IndexedPassage
): { allowed: true } | { allowed: false; reason: string } {
  if (!passage.editable) {
    return {
      allowed: false,
      reason:
        passage.lockReason ??
        'This passage is locked and cannot be edited.',
    };
  }
  return { allowed: true };
}