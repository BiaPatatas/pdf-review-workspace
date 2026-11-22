import { useMemo, useState } from 'react';
import { SOURCE_DOCUMENT_INDEX } from './data/documentIndex';
import { canEditPassage, evaluateChangeContent } from './domain/changeRules';
import type { ChangeStatus, IndexedPassage, TrackedChange, Suggestion } from './domain/schemas';
import {
  changeRepository,
  loadSessionAuthor,
  saveSessionAuthor,
} from './repositories/changeRepository';
import {
  htmlToPlainText,
  sanitizePlainText,
  sanitizeRichText,
  toCanonicalRichText,
} from './security/sanitize';
import { matchSelectionToPassage } from './services/passageMatcher';
import { PdfViewer } from './components/PDFViewer';
import { RichTextEditor } from './components/RichTextEditor';
import './App.css';
import { SuggestionsPanel } from './components/SuggestionsPanel';


function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedPassage(text: string, excerpt: string) {
  const trimmed = excerpt.trim();
  if (!trimmed) return text;

  const pattern = trimmed.split(/\s+/).map(escapeRegExp).join('\\s+');
  const regex = new RegExp(`(${pattern})`, 'i');
  const match = regex.exec(text);

  if (!match || match.index === undefined) {
    return text;
  }

  const start = match.index;
  const end = start + match[0].length;

  return (
    <>
      {text.slice(0, start)}
      <mark className="excerpt-highlight">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function App() {
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(SOURCE_DOCUMENT_INDEX.pageCount);
  const [selectedPassage, setSelectedPassage] = useState<IndexedPassage | null>(
    SOURCE_DOCUMENT_INDEX.passages[0]
  );
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [lastSelectedText, setLastSelectedText] = useState<string>('');

  // Persisted reviewer session name and tracked changes
  const [sessionAuthor, setSessionAuthor] = useState<string>(() =>
    loadSessionAuthor()
  );
  const [changes, setChanges] = useState<TrackedChange[]>(() =>
    changeRepository.getAll()
  );

  // Editor draft state (keyed by passage + reset counter so Tiptap reinitializes cleanly)
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [draftProposedHtml, setDraftProposedHtml] = useState<string>(() =>
    toCanonicalRichText(SOURCE_DOCUMENT_INDEX.passages[0].text)
  );
  const [draftCommentHtml, setDraftCommentHtml] = useState<string>('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [rejectedSuggestionIds, setRejectedSuggestionIds] = useState<string[]>([]);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | undefined>(undefined);

  const pagePassages = useMemo(
    () => SOURCE_DOCUMENT_INDEX.passages.filter((p) => p.page === currentPage),
    [currentPage]
  );

  function selectPassageForReview(passage: IndexedPassage, excerpt = '') {
    setSelectedPassage(passage);
    setCurrentPage(passage.page);
    setSelectionNotice(null);
    setLastSelectedText(excerpt);
    setDraftProposedHtml(toCanonicalRichText(passage.text));
    setDraftCommentHtml('');
    setActiveSuggestionId(undefined);
    setSaveMessage(null);
    setEditorResetKey((k) => k + 1);
  }

  function handleTextSelected(text: string, page: number) {
    const result = matchSelectionToPassage(SOURCE_DOCUMENT_INDEX, page, text);
    if (result.passage) {
      selectPassageForReview(result.passage, text);
    } else {
      setSelectionNotice(result.reason ?? 'Could not match selection.');
    }
  }

  function handleAuthorChange(value: string) {
    setSessionAuthor(value);
    saveSessionAuthor(value);
  }

  const editCheck = selectedPassage ? canEditPassage(selectedPassage) : null;

  const evaluation = useMemo(() => {
    if (!selectedPassage) return null;
    return evaluateChangeContent(selectedPassage.text, draftProposedHtml);
  }, [selectedPassage, draftProposedHtml]);

  const overlappingChanges = useMemo(() => {
    if (!selectedPassage) return [];
    return changes.filter((c) => c.passageId === selectedPassage.id);
  }, [changes, selectedPassage]);

  function handleSaveChange() {
    if (!selectedPassage || !editCheck?.allowed || !evaluation?.hasChanged) {
      return;
    }

    const now = new Date().toISOString();
    const cleanCommentHtml = sanitizeRichText(draftCommentHtml);
    const cleanCommentText = htmlToPlainText(cleanCommentHtml);
    const cleanAuthor = sanitizePlainText(sessionAuthor) || 'Reviewer Session';

    

    const newChange: TrackedChange = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `chg-${Date.now()}`,
      passageId: selectedPassage.id,
      page: selectedPassage.page,
      section: selectedPassage.section,
      originalText: evaluation.originalText,
      proposedText: evaluation.proposedText,
      originalHtml: evaluation.sanitizedOriginalHtml,
      proposedHtml: evaluation.sanitizedProposedHtml,
      formattingOnly: evaluation.formattingOnly,
      status: 'Pending',
      author: cleanAuthor,
      createdAt: now,
      updatedAt: now,
      ...(cleanCommentText
        ? { comment: cleanCommentText, commentHtml: cleanCommentHtml }
        : {}),
      source: activeSuggestionId ? 'suggestion' : 'manual',
      ...(activeSuggestionId ? { suggestionId: activeSuggestionId } : {}),
    };

    const updated = changeRepository.save(newChange);
    setChanges(updated);
    setActiveSuggestionId(undefined);
    setDraftProposedHtml(toCanonicalRichText(selectedPassage.text));
    setDraftCommentHtml('');
    setEditorResetKey((k) => k + 1);
    setSaveMessage(
      evaluation.formattingOnly
        ? 'Formatting-only change saved as Pending.'
        : 'Tracked change saved as Pending.'
    );
  }

  function handleStatusChange(changeId: string, status: ChangeStatus) {
    const updated = changeRepository.updateStatus(changeId, status);
    setChanges(updated);
  }

  function handleRemoveChange(changeId: string) {
    const updated = changeRepository.remove(changeId);
    setChanges(updated);
  }

  function handleAcceptSuggestion(suggestion: Suggestion) {
  const targetPassage = SOURCE_DOCUMENT_INDEX.passages.find(
    (p) => p.id === suggestion.passageId
  );
  if (!targetPassage || !canEditPassage(targetPassage).allowed) return;

  const evalResult = evaluateChangeContent(
    targetPassage.text,
    suggestion.proposedHtml
  );
  if (!evalResult.hasChanged) return;

  const now = new Date().toISOString();
  const cleanAuthor = sanitizePlainText(sessionAuthor) || 'Reviewer Session';
  const cleanRationale = sanitizePlainText(suggestion.rationale);

  const acceptedChange: TrackedChange = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `chg-${Date.now()}`,
    passageId: targetPassage.id,
    page: targetPassage.page,
    section: targetPassage.section,
    originalText: evalResult.originalText,
    proposedText: evalResult.proposedText,
    originalHtml: evalResult.sanitizedOriginalHtml,
    proposedHtml: evalResult.sanitizedProposedHtml,
    formattingOnly: evalResult.formattingOnly,
    status: 'Accepted',
    author: cleanAuthor,
    createdAt: now,
    updatedAt: now,
    comment: `[${suggestion.category} suggestion] ${cleanRationale}`,
    source: 'suggestion',
    suggestionId: suggestion.id,
  };

  const updated = changeRepository.save(acceptedChange);
  setChanges(updated);
  setRejectedSuggestionIds((prev) => [...prev, suggestion.id]);
  setSaveMessage(`Accepted ${suggestion.category} suggestion and stored change.`);
}

function handleEditSuggestion(suggestion: Suggestion) {
  const targetPassage = SOURCE_DOCUMENT_INDEX.passages.find(
    (p) => p.id === suggestion.passageId
  );
  if (!targetPassage || !canEditPassage(targetPassage).allowed) return;

  setSelectedPassage(targetPassage);
  setCurrentPage(targetPassage.page);
  setSelectionNotice(null);
  setLastSelectedText('');
  setDraftProposedHtml(sanitizeRichText(suggestion.proposedHtml));
  setDraftCommentHtml(
    toCanonicalRichText(`[${suggestion.category} suggestion] ${suggestion.rationale}`)
  );
  setActiveSuggestionId(suggestion.id);
  setSaveMessage('Suggestion loaded into editor. Review and save when ready.');
  setEditorResetKey((k) => k + 1);
}

function handleRejectSuggestion(suggestionId: string) {
  setRejectedSuggestionIds((prev) =>
    prev.includes(suggestionId) ? prev : [...prev, suggestionId]
  );
}

  return (
    <div className="workspace-layout">
      <header className="workspace-header">
        <div>
          <h1>PDF Review Workspace</h1>
          <p className="subtitle">{SOURCE_DOCUMENT_INDEX.title}</p>
        </div>

        <div className="header-right">
          <div className="author-control">
            <label htmlFor="session-author-input">Reviewer / Session:</label>
            <input
              id="session-author-input"
              type="text"
              value={sessionAuthor}
              onChange={(e) => handleAuthorChange(e.target.value)}
              placeholder="Reviewer Session"
            />
          </div>

          <nav className="page-controls" aria-label="PDF page navigation">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </button>
            <span aria-live="polite">
              Page {currentPage} of {numPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
            >
              Next
            </button>
          </nav>
        </div>
      </header>

      <main className="workspace-main">
        <section className="pdf-pane" aria-label="Original PDF document">
          <div className="pane-banner">
            Original PDF (read-only). Select any text to anchor a review change.
          </div>
          {selectionNotice && (
            <div className="notice-banner" role="status" aria-live="polite">
              {selectionNotice}
            </div>
          )}
          <PdfViewer
            fileUrl={SOURCE_DOCUMENT_INDEX.sourceFile}
            pageNumber={currentPage}
            onNumPagesLoaded={setNumPages}
            onTextSelected={handleTextSelected}
          />
        </section>

        <aside className="side-pane" aria-label="Review panel">
          <section className="card">
            <h2>Selected Passage &amp; Proposal Editor</h2>
            {selectedPassage ? (
              <div className="selected-passage-box">
                <div className="meta-row">
                  <span className="pill">Page {selectedPassage.page}</span>
                  <span className="pill">{selectedPassage.section}</span>
                  <span className="pill">{selectedPassage.blockType}</span>
                </div>

                {lastSelectedText && (
                  <p className="selection-excerpt">
                    <strong>Selected excerpt:</strong> &ldquo;{lastSelectedText}&rdquo;
                  </p>
                )}

                <p className="passage-text">
                  {renderHighlightedPassage(
                    selectedPassage.text,
                    lastSelectedText
                  )}
                </p>

                {overlappingChanges.length > 0 && (
                  <div className="overlap-notice" role="status">
                    <strong>Overlapping edit notice:</strong>{' '}
                    {overlappingChanges.length} existing change(s) already touch
                    this passage. New edits will be stored side-by-side until
                    resolved.
                  </div>
                )}

                {editCheck && !editCheck.allowed ? (
                  <div className="locked-alert" role="alert">
                    <strong>Protected legal text:</strong> {editCheck.reason}
                  </div>
                ) : (
                  <div className="editor-form">
                    <RichTextEditor
                      key={`proposal-${selectedPassage.id}-${editorResetKey}`}
                      label="Proposed wording"
                      helperText="Keyboard shortcuts supported (Ctrl+B, Ctrl+I, Ctrl+U). Formatting-only edits are tracked."
                      initialHtml={draftProposedHtml}
                      onChange={setDraftProposedHtml}
                    />

                    <RichTextEditor
                      key={`comment-${selectedPassage.id}-${editorResetKey}`}
                      label="Optional comment / tone note"
                      initialHtml={draftCommentHtml}
                      onChange={setDraftCommentHtml}
                      compact
                    />

                    <div className="editor-actions">
                      <button
                        type="button"
                        className="primary-btn"
                        disabled={!evaluation?.hasChanged}
                        onClick={handleSaveChange}
                      >
                        Save Tracked Change
                      </button>

                      {evaluation?.formattingOnly && (
                        <span className="pill pill-info">
                          Formatting-only change detected
                        </span>
                      )}
                      {evaluation?.isDeletion && (
                        <span className="pill pill-warn">
                          Deletion proposal
                        </span>
                      )}
                    </div>

                    {saveMessage && (
                      <p className="save-confirmation" role="status" aria-live="polite">
                        {saveMessage}
                      </p>
                    )}
                  </div>
                  
                )}
                
              </div>
            ) : (
              <p>Select text in the PDF or pick a passage below.</p>
            )}
          </section>

          <SuggestionsPanel
                  selectedPassage={selectedPassage}
                  allChanges={changes}
                  rejectedSuggestionIds={rejectedSuggestionIds}
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onEditSuggestion={handleEditSuggestion}
                  onRejectSuggestion={handleRejectSuggestion}
                  onNavigateToPassage={(passageId) => {
                    const target = SOURCE_DOCUMENT_INDEX.passages.find(
                      (p) => p.id === passageId
                    );
                    if (target) selectPassageForReview(target);
                  }}
                />

          <section className="card">
            <h2>Tracked Changes ({changes.length})</h2>
            {changes.length === 0 ? (
              <p className="hint-text">
                No tracked changes yet. Select an editable passage above and
                propose a wording or formatting change.
              </p>
            ) : (
              <ul className="changes-list">
                {changes.map((chg) => (
                  <li
                    key={chg.id}
                    className={`change-item status-${chg.status.toLowerCase()}`}
                  >
                    <div className="change-header">
                      <div className="badge-group">
                        <span
                          className={`status-badge badge-${chg.status.toLowerCase()}`}
                        >
                          {chg.status}
                        </span>
                        {chg.formattingOnly && (
                          <span className="pill pill-info">Formatting only</span>
                        )}
                        {chg.proposedText === '' && (
                          <span className="pill pill-warn">Deletion</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          const target = SOURCE_DOCUMENT_INDEX.passages.find(
                            (p) => p.id === chg.passageId
                          );
                          if (target) selectPassageForReview(target);
                        }}
                      >
                        Page {chg.page} &middot; {chg.section}
                      </button>
                    </div>

                    <div className="change-meta">
                      <span>By {chg.author}</span>
                      <span>&middot;</span>
                      <time dateTime={chg.createdAt}>
                        {formatTimestamp(chg.createdAt)}
                      </time>
                    </div>

                    <div className="diff-block">
                      <strong>Original:</strong>
                      <div
                        className="rich-preview"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeRichText(chg.originalHtml),
                        }}
                      />
                    </div>

                    <div className="diff-block">
                      <strong>Proposed:</strong>
                      {chg.proposedText === '' ? (
                        <p className="deletion-label">
                          <em>[Remove passage]</em>
                        </p>
                      ) : (
                        <div
                          className="rich-preview"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeRichText(chg.proposedHtml),
                          }}
                        />
                      )}
                    </div>

                    {(chg.commentHtml || chg.comment) && (
                      <div className="change-comment">
                        <strong>Comment:</strong>
                        {chg.commentHtml ? (
                          <div
                            className="rich-preview"
                            dangerouslySetInnerHTML={{
                              __html: sanitizeRichText(chg.commentHtml),
                            }}
                          />
                        ) : (
                          <p className="rich-preview">{chg.comment}</p>
                        )}
                      </div>
                    )}

                    <div className="change-actions" role="group" aria-label="Change status actions">
                      <button
                        type="button"
                        className="action-btn action-accept"
                        disabled={chg.status === 'Accepted'}
                        onClick={() => handleStatusChange(chg.id, 'Accepted')}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="action-btn action-reject"
                        disabled={chg.status === 'Rejected'}
                        onClick={() => handleStatusChange(chg.id, 'Rejected')}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="action-btn"
                        disabled={chg.status === 'Pending'}
                        onClick={() => handleStatusChange(chg.id, 'Pending')}
                      >
                        Pending
                      </button>
                      <button
                        type="button"
                        className="action-btn action-remove"
                        onClick={() => handleRemoveChange(chg.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>Page {currentPage} Indexed Passages</h2>
            <ul className="outline-list">
              {pagePassages.map((p) => {
                const count = changes.filter((c) => c.passageId === p.id).length;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={selectedPassage?.id === p.id}
                      className={`outline-button ${
                        selectedPassage?.id === p.id ? 'active' : ''
                      } ${!p.editable ? 'locked' : ''}`}
                      onClick={() => selectPassageForReview(p)}
                    >
                      <span className="outline-section">
                        {p.section} {!p.editable && '(Locked)'}
                      </span>
                      <span className="outline-preview">
                        {p.text.slice(0, 72)}
                        {p.text.length > 72 ? '...' : ''}
                      </span>
                      {count > 0 && (
                        <span className="pill">{count} change(s)</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;