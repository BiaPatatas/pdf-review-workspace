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
  const [showAllDocument, setShowAllDocument] = useState(true);

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
    <section
      className="editorial-suggestions-panel"
      aria-label="Writing assistant suggestions"
    >
      <div className="editorial-hero">
        <div>
          
          <h2 className="editorial-title">Sample AI Suggestions</h2>
        </div>
        
      </div>

      
      <div className="suggestions-subbar">
        <strong className="suggestions-count-label">
          {visibleSuggestions.length} suggestion
          {visibleSuggestions.length === 1 ? '' : 's'} to review
        </strong>
        <button
          type="button"
          className="scope-toggle-btn"
          aria-pressed={showAllDocument}
          onClick={() => setShowAllDocument((v) => !v)}
        >
          {showAllDocument ? 'Across the document' : 'Current passage only'}
        </button>
      </div>

      {selectedPassage && !selectedPassage.editable && !showAllDocument ? (
        <div className="locked-alert" role="alert">
          <strong>Suggestions disabled:</strong> Protected legal text cannot be
          rewritten by a writing assistant.
        </div>
      ) : visibleSuggestions.length === 0 ? (
        <p className="hint-text">
          No pending sample suggestions{' '}
          {showAllDocument ? 'in this document' : 'for this passage'}.
        </p>
      ) : (
        <ul className="suggestions-list">
          {visibleSuggestions.map((sug) => {
            const safeProposedHtml = sanitizeRichText(sug.proposedHtml);
            const safeRationale = sanitizePlainText(sug.rationale);
            const categoryLabel =
              sug.category.charAt(0).toUpperCase() + sug.category.slice(1);

            return (
              <li key={sug.id} className="change-card suggestion-card-accent">
                <div className="change-card-top">
                  <div className="badge-group">
                    <span className={`editorial-cat-pill cat-${sug.category}`}>
                      <span className="cat-dot" aria-hidden="true" />
                      {categoryLabel}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="page-jump-btn"
                    onClick={() => onNavigateToPassage(sug.passageId)}
                  >
                    <span>Page {sug.page}</span>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>

                <div className="change-section-label">{sug.section}</div>

                <div className="change-diff-grid">
                  <div className="diff-col">
                    <span className="diff-label diff-label-original">
                      ORIGINAL
                    </span>
                    <p className="rich-preview diff-text-original">
                      {sug.originalText}
                    </p>
                  </div>

                  <div className="diff-col">
                    <span className="diff-label diff-label-proposed">
                      PROPOSED
                    </span>
                    <div
                      className="rich-preview diff-text-proposed"
                      dangerouslySetInnerHTML={{ __html: safeProposedHtml }}
                    />
                  </div>
                </div>

                <hr className="change-divider" />

                <div className="change-comment-row">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                  </svg>
                  <p className="rich-preview">{safeRationale}</p>
                </div>

                <hr className="change-divider" />

                <div
                  className="change-card-actions"
                  role="group"
                  aria-label={`Actions for ${sug.category} suggestion`}
                >
                  <button
                    type="button"
                    className="card-btn card-btn-accept"
                    onClick={() => onAcceptSuggestion(sug)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Accept
                  </button>

                  <button
                    type="button"
                    className="card-btn card-btn-edit"
                    onClick={() => onEditSuggestion(sug)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    Edit
                  </button>

                  <button
                    type="button"
                    className="card-btn card-btn-reject suggestion-reject-right"
                    onClick={() => onRejectSuggestion(sug.id)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
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