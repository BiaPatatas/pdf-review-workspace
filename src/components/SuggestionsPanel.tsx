import { useMemo, useState } from 'react';
import { SOURCE_DOCUMENT_INDEX } from '../data/documentIndex';
import { mockSuggestionProvider } from '../data/mockSuggestions';
import type {
  IndexedPassage,
  Suggestion,
  TrackedChange,
} from '../domain/schemas';
import { sanitizePlainText, sanitizeRichText } from '../security/sanitize';
import { assembleModelContext } from '../services/contextAssembler';

interface SuggestionsPanelProps {
  selectedPassage: IndexedPassage | null;
  allChanges: TrackedChange[];
  rejectedSuggestionIds: string[];
  onAcceptSuggestion: (suggestion: Suggestion) => void;
  onEditSuggestion: (suggestion: Suggestion) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onNavigateToPassage: (passageId: string) => void;
}

export function SuggestionsPanel({
  selectedPassage,
  allChanges,
  rejectedSuggestionIds,
  onAcceptSuggestion,
  onEditSuggestion,
  onRejectSuggestion,
  onNavigateToPassage,
}: SuggestionsPanelProps) {
  const [showAllDocument, setShowAllDocument] = useState(false);

  const visibleSuggestions = useMemo(() => {
    const raw = showAllDocument
      ? mockSuggestionProvider.getAllSuggestions()
      : selectedPassage
        ? mockSuggestionProvider.getSuggestionsForPassage(selectedPassage.id)
        : [];

    const appliedSuggestionIds = new Set(
      allChanges.map((c) => c.suggestionId).filter(Boolean)
    );

    return raw.filter(
      (s) =>
        !rejectedSuggestionIds.includes(s.id) && !appliedSuggestionIds.has(s.id)
    );
  }, [selectedPassage, showAllDocument, rejectedSuggestionIds, allChanges]);

  const contextResult = useMemo(() => {
    if (!selectedPassage) return null;
    if (!selectedPassage.editable) {
      return {
        blocked: true as const,
        reason:
          selectedPassage.lockReason ??
          'Protected passage cannot be sent to a writing assistant.',
      };
    }

    try {
      const payload = assembleModelContext({
        index: SOURCE_DOCUMENT_INDEX,
        passageId: selectedPassage.id,
        allChanges,
      });
      return { blocked: false as const, payload };
    } catch (err) {
      return {
        blocked: true as const,
        reason:
          err instanceof Error
            ? err.message
            : 'Unable to assemble model context.',
      };
    }
  }, [selectedPassage, allChanges]);

  return (
    <section className="card" aria-label="Writing assistant suggestions">
      <div className="suggestions-header">
        <div>
          <h2>Writing Suggestions</h2>
          <p className="hint-text">
            Sample mock suggestions (local only &mdash; no document text leaves
            this browser). Treated as untrusted input; nothing changes until you
            accept.
          </p>
        </div>
        <button
          type="button"
          className="action-btn"
          aria-pressed={showAllDocument}
          onClick={() => setShowAllDocument((v) => !v)}
        >
          {showAllDocument ? 'Current passage only' : 'Show all samples'}
        </button>
      </div>

      {selectedPassage && !selectedPassage.editable && !showAllDocument ? (
        <div className="locked-alert" role="alert">
          <strong>Suggestions disabled:</strong> Protected legal text cannot be
          rewritten by a writing assistant.
        </div>
      ) : visibleSuggestions.length === 0 ? (
        <p className="hint-text">
          No pending sample suggestions for this passage. Toggle{' '}
          <strong>Show all samples</strong> to inspect suggestions across the
          document.
        </p>
      ) : (
        <ul className="suggestions-list">
          {visibleSuggestions.map((sug) => {
            const safeProposedHtml = sanitizeRichText(sug.proposedHtml);
            const safeRationale = sanitizePlainText(sug.rationale);

            return (
              <li key={sug.id} className="suggestion-item">
                <div className="change-header">
                  <div className="badge-group">
                    <span
                      className={`category-badge cat-${sug.category}`}
                    >
                      {sug.category}
                    </span>
                    <span className="pill">Sample / Mock</span>
                  </div>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onNavigateToPassage(sug.passageId)}
                  >
                    Page {sug.page} &middot; {sug.section}
                  </button>
                </div>

                <p className="suggestion-rationale">{safeRationale}</p>

                <div className="diff-block">
                  <strong>Suggested wording:</strong>
                  <div
                    className="rich-preview"
                    dangerouslySetInnerHTML={{ __html: safeProposedHtml }}
                  />
                </div>

                <div
                  className="change-actions"
                  role="group"
                  aria-label={`Actions for ${sug.category} suggestion`}
                >
                  <button
                    type="button"
                    className="action-btn action-accept"
                    onClick={() => onAcceptSuggestion(sug)}
                  >
                    Accept as Change
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => onEditSuggestion(sug)}
                  >
                    Edit in Editor
                  </button>
                  <button
                    type="button"
                    className="action-btn action-reject"
                    onClick={() => onRejectSuggestion(sug.id)}
                  >
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selectedPassage && contextResult && (
        <details className="context-inspector">
          <summary>
            LLM Context Payload Inspector (Page {selectedPassage.page} &middot;{' '}
            {selectedPassage.id})
          </summary>

          {contextResult.blocked ? (
            <div className="locked-alert" role="alert">
              <strong>Context assembly blocked:</strong> {contextResult.reason}
            </div>
          ) : (
            <div className="context-body">
              {contextResult.payload.security.promptInjectionDetected && (
                <div className="injection-alert" role="alert">
                  <strong>Prompt injection detected in context:</strong>{' '}
                  Untrusted document text contains instruction-override phrasing.
                  Isolated strictly as data.
                </div>
              )}
              <pre className="json-preview">
                {JSON.stringify(contextResult.payload, null, 2)}
              </pre>
            </div>
          )}
        </details>
      )}
    </section>
  );
}