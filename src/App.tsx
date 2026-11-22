import { useMemo, useState } from 'react';
import { SOURCE_DOCUMENT_INDEX } from './data/documentIndex';
import { canEditPassage, evaluateChangeContent } from './domain/changeRules';
import { mockSuggestionProvider } from './data/mockSuggestions';
import type {
  ChangeStatus,
  IndexedPassage,
  Suggestion,
  TrackedChange,
} from './domain/schemas';
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
import { SuggestionsPanel } from './components/SuggestionsPanel';
import './App.css';

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

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
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
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | undefined>(
    undefined
  );
  const [editingChangeId, setEditingChangeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'changes' | 'suggestions'>('changes');

  const pendingSuggestionsCount = useMemo(() => {
    const appliedIds = new Set(
      changes.map((c) => c.suggestionId).filter(Boolean)
    );
    return mockSuggestionProvider
      .getAllSuggestions()
      .filter(
        (s) => !rejectedSuggestionIds.includes(s.id) && !appliedIds.has(s.id)
      ).length;
  }, [changes, rejectedSuggestionIds]);

  const pagePassages = useMemo(
    () => SOURCE_DOCUMENT_INDEX.passages.filter((p) => p.page === currentPage),
    [currentPage]
  );

  function selectPassageForReview(passage: IndexedPassage, excerpt = '') {
    setSelectedPassage(passage);
    setCurrentPage(passage.page);
    setSelectionNotice(null);
    setEditingChangeId(null);
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
  return changes.filter(
    (c) => c.passageId === selectedPassage.id && c.id !== editingChangeId
  );
}, [changes, selectedPassage, editingChangeId]);

  function handleSaveChange() {
  if (!selectedPassage || !editCheck?.allowed || !evaluation?.hasChanged) {
    return;
  }

  const now = new Date().toISOString();
  const cleanCommentHtml = sanitizeRichText(draftCommentHtml);
  const cleanCommentText = htmlToPlainText(cleanCommentHtml);
  const cleanAuthor = sanitizePlainText(sessionAuthor) || 'Reviewer Session';

  const existing = editingChangeId
    ? changes.find((c) => c.id === editingChangeId)
    : undefined;

  const changeRecord: TrackedChange = {
    id:
      existing?.id ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `chg-${Date.now()}`),
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
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(cleanCommentText
      ? { comment: cleanCommentText, commentHtml: cleanCommentHtml }
      : {}),
    source: existing?.source ?? (activeSuggestionId ? 'suggestion' : 'manual'),
    ...(existing?.suggestionId ?? activeSuggestionId
      ? { suggestionId: existing?.suggestionId ?? activeSuggestionId }
      : {}),
  };

  const updated = existing
    ? changeRepository.update(changeRecord)
    : changeRepository.save(changeRecord);

  setChanges(updated);
  setEditingChangeId(null);
  setActiveSuggestionId(undefined);
  setDraftProposedHtml(toCanonicalRichText(selectedPassage.text));
  setDraftCommentHtml('');
  setEditorResetKey((k) => k + 1);
  setSaveMessage(
    existing
      ? 'Tracked change updated and set to Pending.'
      : evaluation.formattingOnly
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
  if (editingChangeId === changeId) {
    setEditingChangeId(null);
  }
}

  function handleEditTrackedChange(chg: TrackedChange) {
    const target = SOURCE_DOCUMENT_INDEX.passages.find(
      (p) => p.id === chg.passageId
    );
    if (!target || !canEditPassage(target).allowed) return;

    setSelectedPassage(target);
    setCurrentPage(target.page);
    setSelectionNotice(null);
    setLastSelectedText('');
    setEditingChangeId(chg.id);
    setDraftProposedHtml(sanitizeRichText(chg.proposedHtml));
    setDraftCommentHtml(
      chg.commentHtml
        ? sanitizeRichText(chg.commentHtml)
        : chg.comment
          ? toCanonicalRichText(chg.comment)
          : ''
    );
    setActiveSuggestionId(chg.suggestionId);
    setSaveMessage('Loaded tracked change into editor.');
    setEditorResetKey((k) => k + 1);
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
    setSaveMessage(
      `Accepted ${suggestion.category} suggestion and stored change.`
    );
  }

  function handleEditSuggestion(suggestion: Suggestion) {
    const targetPassage = SOURCE_DOCUMENT_INDEX.passages.find(
      (p) => p.id === suggestion.passageId
    );
    if (!targetPassage || !canEditPassage(targetPassage).allowed) return;

    setSelectedPassage(targetPassage);
    setCurrentPage(targetPassage.page);
    setSelectionNotice(null);
    setEditingChangeId(null);
    setLastSelectedText('');
    setActiveTab('changes');
    setDraftProposedHtml(sanitizeRichText(suggestion.proposedHtml));
    setDraftCommentHtml(
      toCanonicalRichText(
        `[${suggestion.category} suggestion] ${suggestion.rationale}`
      )
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
      <a href="#review-panel" className="skip-link">
        Skip to review panel
      </a>
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

        </div>
      </header>

      <main className="workspace-main">
        <section className="pdf-pane" aria-label="Original PDF document">
          <div className="pdf-topbar">
            <span className="pdf-topbar-note">
              Original PDF (read-only) &mdash; select text to anchor a change
            </span>
            <nav className="page-controls" aria-label="PDF page navigation">
              <button
                type="button"
                className="pdf-nav-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                &lsaquo; Previous
              </button>
              <span className="pdf-page-indicator" aria-live="polite">
                Page {currentPage} of {numPages}
              </span>
              <button
                type="button"
                className="pdf-nav-btn"
                onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                disabled={currentPage >= numPages}
              >
                Next &rsaquo;
              </button>
            </nav>
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

        <aside id="review-panel" className="side-pane" aria-label="Review panel">
          <div
            className="review-tabs"
            role="tablist"
            aria-label="Review workspace views"
          >
            <button
              type="button"
              role="tab"
              id="tab-changes"
              aria-selected={activeTab === 'changes'}
              aria-controls="panel-changes"
              className={`review-tab ${activeTab === 'changes' ? 'active' : ''}`}
              onClick={() => setActiveTab('changes')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Changes</span>
              <span className="tab-count">{changes.length}</span>
            </button>

            <button
              type="button"
              role="tab"
              id="tab-suggestions"
              aria-selected={activeTab === 'suggestions'}
              aria-controls="panel-suggestions"
              className={`review-tab ${activeTab === 'suggestions' ? 'active' : ''}`}
              onClick={() => setActiveTab('suggestions')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
              </svg>
              <span>Suggestions</span>
              <span className="tab-count">{pendingSuggestionsCount}</span>
            </button>
          </div>

          {activeTab === 'changes' ? (
            <div
              id="panel-changes"
              role="tabpanel"
              aria-labelledby="tab-changes"
              className="tab-panel-stack"
            >
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
                        {editingChangeId
                          ? 'Update Tracked Change'
                          : 'Save Tracked Change'}
                      </button>

                      {editingChangeId && (
                        <button
                          type="button"
                          className="card-btn card-btn-edit"
                          onClick={() => {
                            setEditingChangeId(null);
                            setDraftProposedHtml(
                              toCanonicalRichText(selectedPassage.text)
                            );
                            setDraftCommentHtml('');
                            setSaveMessage(null);
                            setEditorResetKey((k) => k + 1);
                          }}
                        >
                          Cancel edit
                        </button>
                      )}

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
                          <p
                            className="save-confirmation"
                            role="status"
                            aria-live="polite"
                          >
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

              <section className="card">
                <h2>Tracked Changes ({changes.length})</h2>
                {changes.length === 0 ? (
                  <p className="hint-text">
                    No tracked changes yet. Select an editable passage above and
                    propose a wording or formatting change.
                  </p>
                ) : (
                  <ul className="changes-list">
                    {changes.map((chg) => {
                      const initial = (chg.author.trim()[0] || 'R').toUpperCase();
                      return (
                        <li
                          key={chg.id}
                          className={`change-card status-${chg.status.toLowerCase()}`}
                        >
                          <div className="change-card-top">
                            <div className="badge-group">
                              <span
                                className={`status-pill status-pill-${chg.status.toLowerCase()}`}
                              >
                                {chg.status === 'Pending' && (
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    aria-hidden="true"
                                  >
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                  </svg>
                                )}
                                {chg.status === 'Accepted' && (
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
                                )}
                                {chg.status === 'Rejected' && (
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    aria-hidden="true"
                                  >
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                )}
                                {chg.status}
                              </span>
                              {chg.formattingOnly && (
                                <span className="pill pill-info">
                                  Formatting only
                                </span>
                              )}
                              {chg.proposedText === '' && (
                                <span className="pill pill-warn">Deletion</span>
                              )}
                            </div>

                            <button
                              type="button"
                              className="page-jump-btn"
                              onClick={() => {
                                const target = SOURCE_DOCUMENT_INDEX.passages.find(
                                  (p) => p.id === chg.passageId
                                );
                                if (target) selectPassageForReview(target);
                              }}
                            >
                              <span>Page {chg.page}</span>
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

                          <div className="change-section-label">{chg.section}</div>

                          <div className="change-diff-grid">
                            <div className="diff-col">
                              <span className="diff-label diff-label-original">
                                ORIGINAL
                              </span>
                              <div
                                className={`rich-preview diff-text-original ${
                                  chg.formattingOnly ? 'no-strike' : ''
                                }`}
                                dangerouslySetInnerHTML={{
                                  __html: sanitizeRichText(chg.originalHtml),
                                }}
                              />
                            </div>

                            <div className="diff-col">
                              <span className="diff-label diff-label-proposed">
                                PROPOSED
                              </span>
                              {chg.proposedText === '' ? (
                                <p className="deletion-label">
                                  <em>[Remove passage]</em>
                                </p>
                              ) : (
                                <div
                                  className="rich-preview diff-text-proposed"
                                  dangerouslySetInnerHTML={{
                                    __html: sanitizeRichText(chg.proposedHtml),
                                  }}
                                />
                              )}
                            </div>
                          </div>

                          <hr className="change-divider" />

                          <div className="change-meta-section">
                            {(chg.commentHtml || chg.comment) && (
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
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
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

                            <div className="change-author-row">
                              <span className="author-avatar" aria-hidden="true">
                                {initial}
                              </span>
                              <span className="author-name">{chg.author}</span>
                              <span className="meta-dot">&middot;</span>
                              <time
                                  dateTime={chg.createdAt}
                                  title={new Date(chg.createdAt).toLocaleString()}
                                >
                                  {formatShortDate(chg.createdAt)}
                                </time>
                            </div>
                          </div>

                          <hr className="change-divider" />

                          <div
                            className="change-card-actions"
                            role="group"
                            aria-label="Change status actions"
                          >
                            <button
                              type="button"
                              className="card-btn card-btn-accept"
                              disabled={chg.status === 'Accepted'}
                              onClick={() => handleStatusChange(chg.id, 'Accepted')}
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
                              onClick={() => handleEditTrackedChange(chg)}
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
                              className="card-btn card-btn-reject"
                              disabled={chg.status === 'Rejected'}
                              onClick={() => handleStatusChange(chg.id, 'Rejected')}
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

                            <button
                              type="button"
                              className="card-btn card-btn-remove"
                              onClick={() => handleRemoveChange(chg.id)}
                              aria-label="Remove tracked change"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="card">
                <h2>Page {currentPage} Indexed Passages</h2>
                <ul className="outline-list">
                  {pagePassages.map((p) => {
                    const count = changes.filter(
                      (c) => c.passageId === p.id
                    ).length;
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
            </div>
          ) : (
            <div
              id="panel-suggestions"
              role="tabpanel"
              aria-labelledby="tab-suggestions"
              className="tab-panel-stack"
            >
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
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;