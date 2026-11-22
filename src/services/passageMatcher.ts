import type { DocumentIndex, IndexedPassage } from '../domain/schemas';

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MatchResult {
  passage: IndexedPassage | null;
  reason?: string;
}

/**
 * Matches a user's native text selection on a given PDF page
 * against the normalized DocumentIndex passages for that page.
 */
export function matchSelectionToPassage(
  index: DocumentIndex,
  page: number,
  rawSelection: string
): MatchResult {
  const query = normalizeForMatch(rawSelection);
  if (query.length < 2) {
    return {
      passage: null,
      reason: 'Select at least 2 characters to anchor an edit.',
    };
  }

  // Explicitly exclude running headers and footers (tolerant to partial selections)
  const excludedHeaderFooterPatterns = [
    /platform\s+editor\s*[-\u2013\u2014]\s*internal/i,
    /editor\s*[-\u2013\u2014]\s*internal\s+draft/i,
    /do\s+not\s+distribute/i,
    /october\s+2026/i,
    /7\s+october/i,
  ];
  if (excludedHeaderFooterPatterns.some((pattern) => pattern.test(query))) {
    return {
      passage: null,
      reason:
        'Running headers and footers are excluded from editing and indexing.',
    };
  }

  const pagePassages = index.passages.filter((p) => p.page === page);

  // 0. Exact full-passage match first (case-sensitive so "Rejected" matches the Status cell,
  // while lowercase "rejected" inside a sentence falls through to substring matching)
  const trimmedRaw = rawSelection.trim().replace(/\s+/g, ' ');
  const exactMatch = pagePassages.find(
    (p) => p.text.trim().replace(/\s+/g, ' ') === trimmedRaw
  );
  if (exactMatch) {
    return { passage: exactMatch };
  }

  // 1. Exact substring match (most common case when selecting a word/phrase/sentence)
  const substringMatch = pagePassages.find((p) =>
    normalizeForMatch(p.text).includes(query)
  );
  if (substringMatch) {
    return { passage: substringMatch };
  }

  // 2. Reverse match: sort by longest passage first and prevent short table cells
  // (e.g. "Pending", "Rejected") from capturing much longer unrelated selections
  const reverseCandidates = [...pagePassages]
    .sort((a, b) => b.text.length - a.text.length)
    .filter((p) => {
      const norm = normalizeForMatch(p.text);
      return query.includes(norm) && query.length <= norm.length * 1.5;
    });

  if (reverseCandidates.length > 0) {
    return { passage: reverseCandidates[0] };
  }

  // 3. Token overlap fallback for slight PDF textLayer spacing quirks
  const queryTokens = new Set(query.split(' ').filter((t) => t.length > 1));
  let bestPassage: IndexedPassage | null = null;
  let bestScore = 0;

  for (const passage of pagePassages) {
    const passageNorm = normalizeForMatch(passage.text);
    let hits = 0;
    for (const token of queryTokens) {
      if (passageNorm.includes(token)) hits++;
    }
    const score = queryTokens.size > 0 ? hits / queryTokens.size : 0;
    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      bestPassage = passage;
    }
  }

  if (bestPassage) {
    return { passage: bestPassage };
  }

  return {
    passage: null,
    reason:
      'Selection could not be matched to an indexed passage on this page. Try selecting within a single paragraph or choose a passage from the outline.',
  };
}