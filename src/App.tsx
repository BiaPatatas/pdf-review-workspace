import { useMemo, useState } from 'react';
import { SOURCE_DOCUMENT_INDEX } from './data/documentIndex';
import { SEED_CHANGES } from './data/seedChanges';
import { canEditPassage } from './domain/changeRules';
import type { IndexedPassage } from './domain/schemas';
import { matchSelectionToPassage } from './services/passageMatcher';
import { PdfViewer } from './components/PDFViewer';
import './App.css';

export function App() {
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(SOURCE_DOCUMENT_INDEX.pageCount);
  const [selectedPassage, setSelectedPassage] = useState<IndexedPassage | null>(
    SOURCE_DOCUMENT_INDEX.passages[0]
  );
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [lastSelectedText, setLastSelectedText] = useState<string>('');

  // Temporary seed changes for Milestone 2 (replaced by localStorage repository in Milestone 3)
  const changes = SEED_CHANGES;

  const pagePassages = useMemo(
    () => SOURCE_DOCUMENT_INDEX.passages.filter((p) => p.page === currentPage),
    [currentPage]
  );

  function handleTextSelected(text: string, page: number) {
    setLastSelectedText(text);
    const result = matchSelectionToPassage(SOURCE_DOCUMENT_INDEX, page, text);
    if (result.passage) {
      setSelectedPassage(result.passage);
      setSelectionNotice(null);
    } else {
      setSelectedPassage(null);
      setSelectionNotice(result.reason ?? 'Could not match selection.');
    }
  }

  function handleSelectPassage(passage: IndexedPassage) {
    setSelectedPassage(passage);
    setCurrentPage(passage.page);
    setSelectionNotice(null);
    setLastSelectedText('');
  }

  const editCheck = selectedPassage ? canEditPassage(selectedPassage) : null;

  return (
    <div className="workspace-layout">
      <header className="workspace-header">
        <div>
          <h1>PDF Review Workspace</h1>
          <p className="subtitle">{SOURCE_DOCUMENT_INDEX.title}</p>
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
            <h2>Selected Passage</h2>
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
                <p className="passage-text">{selectedPassage.text}</p>
                {editCheck && !editCheck.allowed ? (
                  <div className="locked-alert" role="alert">
                    <strong>Protected legal text:</strong> {editCheck.reason}
                  </div>
                ) : (
                  <p className="hint-text">
                    Editable passage — rich-text editor will connect here in Milestone 3.
                  </p>
                )}
              </div>
            ) : (
              <p>Select text in the PDF or pick a passage below.</p>
            )}
          </section>

          <section className="card">
            <h2>Tracked Changes (Seed Preview)</h2>
            <ul className="changes-list">
              {changes.map((chg) => (
                <li
                  key={chg.id}
                  className={`change-item status-${chg.status.toLowerCase()}`}
                >
                  <div className="change-header">
                    <span className={`status-badge badge-${chg.status.toLowerCase()}`}>
                      {chg.status}
                    </span>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        const target = SOURCE_DOCUMENT_INDEX.passages.find(
                          (p) => p.id === chg.passageId
                        );
                        if (target) handleSelectPassage(target);
                      }}
                    >
                      Page {chg.page} · {chg.section}
                    </button>
                  </div>
                  <p className="diff-original">
                    <strong>Original:</strong> {chg.originalText}
                  </p>
                  <p className="diff-proposed">
                    <strong>Proposed:</strong> {chg.proposedText}
                  </p>
                  {chg.comment && (
                    <p className="change-comment">Note: {chg.comment}</p>
                  )}
                </li>
              ))}
            </ul>
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
                        onClick={() => handleSelectPassage(p)}
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