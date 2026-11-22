# PDF Review Workspace — Consolidated Engineering Document

This document consolidates all architectural decisions, product assumptions, tradeoffs, known limitations, future work, and automated/manual tests completed during the **PDF Review Workspace** exercise (12–18 hour scope).

---

## 1. Decision Log (Architectural & Product Decisions)

### 1.1 Architecture & Stack
* **Decision:** **Frontend-First Modular SPA** architecture using React + TypeScript + Vite with strict separation between UI, domain/indexing, security, and persistence layers (Repository pattern), deployed statically on Vercel.
* **Rationale:** The exercise does not require authentication or multi-user support; this maximizes time spent on the highest-weighted rubric areas (*Core workflow*, *Interface & accessibility*, and *Data model/retrieval*), avoiding backend boilerplate and cold starts.
* **Limitation / With More Time:** No shared cross-device persistence or server-side audit trail. In production, `ChangeRepository` would connect to a REST API backed by a relational database (PostgreSQL).

### 1.2 Incremental Execution Plan
* **Decision:** Six-milestone execution (13.5–16.5 hours), introducing domain/security unit tests in Milestone 1, a Vercel production smoke-test in Milestone 2, and a live LLM context payload inspector in Milestone 4.
* **Rationale:** De-risks production deployment early (specifically `pdfjs-dist` Web Worker bundling) and makes retrieval design and security boundaries directly inspectable during the live walkthrough.
* **Limitation / With More Time:** No full CI/CD pipeline with automated E2E tests and WCAG audits on every commit.

### 1.3 PDF Rendering & Side-Panel Approach
* **Decision:** Read-only rendering of the intact PDF via `pdfjs-dist` (`canvas` + native `TextLayer`), with the worker bundled through Vite (`?url`), explicit synchronization of `--scale-factor` and `--total-scale-factor` to `viewport.scale`, and a **side-panel** review workflow (no geometric canvas overlays).
* **Rationale:** Keeps the original PDF file untouched, ensures pixel-accurate native text selection, and prioritizes readability and full keyboard/screen-reader accessibility over fragile coordinate-based overlays.
* **Limitation / With More Time:** No zoom controls or highlights drawn directly over the PDF canvas. With more time, I would add responsive zoom and lightweight status-colored CSS highlights directly on matching `textLayer` spans.

### 1.4 Native Selection-to-Index Matching (`passageMatcher.ts`)
* **Decision:** Three-tier per-page matching (exact substring → length-ordered reverse match → token overlap), with quote/whitespace normalization, a 2-character minimum (to support `"JD"`), and explicit rejection of excluded running headers and footers.
* **Rationale:** Resilient to minor `pdfjs-dist` `textLayer` spacing quirks while preventing edits from anchoring to excluded running headers or footers.
* **Limitation / With More Time:** If an identical short phrase appears twice on the same page, it anchors to the first occurrence. With more time, I would use selection coordinates or `textLayer` DOM node indices to disambiguate.

### 1.5 Data Model & Validation (`schemas.ts` & `changeRules.ts`)
* **Decision:** Runtime-validated **Zod** contracts (`DocumentIndex`, `IndexedPassage`, `TableMeta`, `TrackedChange`, `Suggestion`), enforcing exactly 3 statuses (`Pending`, `Accepted`, `Rejected` — normalizing the Page 3 `"Acepted"` typo) and 3 suggestion categories (`grammar`, `syntax`, `style`). Stores both plain text and sanitized HTML, a `formattingOnly` flag, deletion proposal support (`proposedText: ""`), and `requiresHumanApproval: z.literal(true)`.
* **Rationale:** Strictly adheres to the draft's allowed states and labels, accurately detects formatting-only edits when words remain unchanged, supports proposing removal of the incomplete Page 3 list item, and enforces human-in-the-loop approval at the schema level.
* **Limitation / With More Time:** HTML comparison relies on normalized strings (sufficient because Tiptap serializes deterministically). With more time, I would implement structural ProseMirror AST comparison and an immutable per-change version audit log.

### 1.6 Document Index (`SOURCE_DOCUMENT_INDEX`)
* **Decision:** Structured, Zod-validated index for `source-document.pdf`, explicitly excluding running headers/footers (`excludedRegions`), indexing table cells with `tableMeta` (`tableId`, `row`, `column`, `columnHeader`), and locking protected legal wording on Page 3 (`editable: false`, `blockType: 'protected_legal'`).
* **Rationale:** Guarantees 100% accuracy for section grouping, status table metadata, and legal locks within 12–18 hours without fragile runtime coordinate-parsing heuristics.
* **Limitation / With More Time:** Coupled to `source-document.pdf`. For arbitrary PDFs, I would build an automated ingestion pipeline using `page.getTextContent()` (Y-band header/footer filtering and font-size heading detection) followed by a human review step to mark protected clauses.

### 1.7 Model Context Assembly (`ContextAssembler`)
* **Decision:** Scoped context window (`DEFAULT_CONTEXT_WINDOW = 1`, ±1 adjacent passage within the same section), inclusion of `Accepted` edits touching that window only, `tableMeta` preservation, hard blocking of protected passages (`editable: false`), explicit `untrustedDataBoundary: true`, and prompt-injection scanning across both passages and related accepted edits.
* **Rationale:** Avoids sending the entire file on every request, provides sufficient local context and table structure for tone/meaning, prevents automated rewrites of protected legal text, and mitigates the explicit Page 2 prompt-injection payload.
* **Limitation / With More Time:** Passage-count windowing and regex-based prompt-injection detection. With more time, I would add token-budgeted windowing, configurable sentence windows (`±2 sentences`), a server-side LLM proxy with structured delimiters, and Zod validation of model outputs.

### 1.8 Dynamic Rich-Text Editor & Accessibility (Tiptap)
* **Decision:** Two **Tiptap** (ProseMirror) editors — one for proposed wording and a `compact` one for optional comments/tone notes — with canonical `<p>...</p>` normalization, keyboard shortcuts (`Ctrl+B/I/U`, etc.), and a fully accessible toolbar (`aria-label`, `aria-pressed`, `:focus-visible`, navigable via `Tab`/`Enter`/`Space`).
* **Rationale:** Fulfills the dynamic editor requirement for both edits and comments, prevents false-positive diffs when plain PDF text is loaded into Tiptap, and guarantees full keyboard operability.
* **Limitation / With More Time:** No links (`<a>`), editable tables inside the editor, or inline word-level diffs (`<del>`/`<ins>`). With more time, I would add inline visual diffing and safe link support with strict `https://` protocol validation.

### 1.9 Persistence, Session & Overlapping Edits
* **Decision:** `localStorage` persistence encapsulated in `ChangeRepository` with Zod validation, plus an editable `Reviewer / Session` field persisted locally (no login). Overlapping edits on the same passage coexist side-by-side with an explicit notice; clicking **Edit** on a card updates it in-place (`changeRepository.update`), preserving `createdAt`, updating `updatedAt`, and resetting `status` to `Pending`.
* **Rationale:** Preserves changes across page refreshes (F5), avoids silent data loss on overlapping edits while the final rule is pending confirmation, and ensures any revised card goes through human approval again.
* **Limitation / With More Time:** Bounded by browser `localStorage` (~5MB) and single-user scope. With more time, I would migrate to a backend API with optimistic concurrency control, immutable version history, and an explicit conflict-resolution workflow.

### 1.10 Security & Privacy
* **Decision:** Strict `DOMPurify` allowlist (`p, strong, em, u, s, ul, ol, li, br`) with `ALLOWED_ATTR: []`, applied in defense-in-depth (both on write and before every `dangerouslySetInnerHTML` render). Zero external API or live LLM calls.
* **Rationale:** Mitigates XSS, event-handler attributes, and inline styles even if `localStorage` is tampered with or suggestions contain malicious payloads, and ensures internal draft text never leaves the browser.
* **Limitation / With More Time:** No dedicated application-server Content Security Policy (CSP) headers or server-side LLM guardrails.

### 1.11 Mock Suggestions & Context Inspector
* **Decision:** `mockSuggestionProvider` (behind a swappable `SuggestionProvider` interface) serving 5 curated suggestions (`grammar`, `syntax`, `style`) targeting intentional errors in `source-document.pdf`, clearly labeled `Sample / Mock`, with **Accept as Change**, **Edit in Editor**, and **Reject** actions, plus persistent hiding for suggestions already converted into tracked changes. Includes an expandable **LLM Context Payload Inspector** in the UI.
* **Rationale:** Meets the specification without exfiltrating internal drafts, respects protected legal text and open terminology (`JD`/`requisition`), and makes retrieval and prompt-injection defense directly verifiable.
* **Limitation / With More Time:** Static suggestions and in-memory tracking of rejected suggestion IDs. With more time, I would connect `SuggestionProvider` to an authenticated backend proxy and persist dismissed suggestions.

---

## 2. Clarifying Questions Sent & Documented Assumptions

Five written clarifying questions (citing exact page numbers and sentences) were sent to the reviewer before finalizing open areas. While awaiting a reply, the following documented defaults are active:

| # | Area (Reference) | Question Sent | Default Implemented |
| :--- | :--- | :--- | :--- |
| 1 | **Overlapping edits** (Page 1) | Should a second edit on the same sentence replace the first or sit beside it? | Stored **side-by-side** with an explicit overlap notice until resolved by a reviewer. |
| 2 | **Document terminology** (Page 2) | Should style suggestions standardize `job description`, `JD`, and `requisition`? | **Left as-is**; no suggestion automatically standardizes these terms. |
| 3 | **Indexing scope** (Page 2 & `document-notes.txt`) | Exclude running headers/footers? Context window size? How to index table cells? | Running headers/footers **excluded**; context defaults to **±1 adjacent passage in the same section**; table cells indexed **per cell with `tableMeta`**. |
| 4 | **Status typo & incomplete list item** (Page 3) | Normalize `"Acepted"` to `"Accepted"`? Fix or remove `"Because the status names are not final."`? | Data model/UI uses strictly `Pending`, `Accepted`, `Rejected`; a `grammar` suggestion fixes `"Acepted"`; a `syntax` suggestion completes the fragment while the editor also supports **deletion proposals**. |
| 5 | **Live model vs. mock** (Page 2) | Is calling a live LLM permitted, and under what data-handling rules? | **Local mock suggestions only** (`Sample / Mock`); no document text leaves the browser. |
| — | **Protected legal wording** (Page 3 & `document-notes.txt`) | Explicit document policy | *"Approved legal wording appear..."* and the entire *Final section* are **locked** from editing, suggestions, and context assembly. |

---

## 3. Automated Tests & Manual Verification

The test suite runs with **Vitest + React Testing Library** (`npm test`), with **18 passing tests across 4 files** (zero console warnings) and a clean production build (`tsc -b && vite build`).

### 3.1 Automated Test Suites

| Test File | Count | Coverage |
| :--- | :--- | :--- |
| `src/domain/marco1.test.ts` | 8 tests | Strict `DOMPurify` XSS sanitization preserving Tiptap tags; HTML entity decoding (`&amp;`, `&lt;`); no false-positive diffs when plain PDF text loads into `<p>`; **formatting-only** change detection; deletion proposals (`proposedText: ""`) validated by Zod; locking of both Page 3 protected legal passages; prompt-injection detection (Page 2) and protected-passage blocking in `ContextAssembler`; filtering to include only `Accepted` edits within the context window. |
| `src/repositories/changeRepository.test.ts` | 3 tests | Saving a `TrackedChange` to `localStorage` and reading it back after reload; updating status/content and removing changes; safe recovery from corrupted/invalid `localStorage` data via Zod validation. |
| `src/services/passageMatcher.test.ts` | 3 tests | Anchoring native PDF text selections to the right page passage; rejecting excluded running headers/footers; handling out-of-scope selections. |
| `src/App.integration.test.tsx` | 4 tests | End-to-end UI flows: accepting a mock `grammar` suggestion, persisting the change, and hiding the suggestion; blocking edits and suggestions on protected legal text (Page 3); flagging prompt injection in the **LLM Context Payload Inspector** (Page 2); showing an exclusion notice when selecting a running header. |

### 3.2 Manual Verifications Completed
* **Persistence across refresh (F5):** Created a formatting-only edit (`Ctrl+B`), verified the `Formatting-only change detected` indicator, refreshed the browser, and confirmed persistence with author and timestamp.
* **Keyboard accessibility (WCAG):** Full keyboard navigation (`Tab` / `Shift+Tab` / `Enter` / `Space`) from header and PDF pagination through the Tiptap toolbar and card actions (`Accept`, `Edit`, `Reject`, `Remove`), with no keyboard traps.
* **Production deployment (Vercel):** Verified `source-document.pdf` and `pdf.worker.min.mjs` load cleanly in production.

---

## 4. Known Limitations & Future Work

### Known Limitations (Accepted for 12–18h Scope)
1. **Document-specific index:** `DocumentIndex` is curated for `source-document.pdf` rather than dynamically parsing arbitrary PDF layouts.
2. **Local persistence (`localStorage`):** Single-user, single-browser scope without authentication or cross-device sync.
3. **Static mock suggestions & in-memory rejections:** No live LLM integration; rejected suggestions reappear after a full refresh (accepted/saved suggestions stay hidden).
4. **No canvas overlays:** Visual anchoring relies on the side panel and page-jump controls rather than highlights drawn over the PDF canvas.
5. **Production bundle size:** `pdfjs-dist` and Tiptap produce a single >500 kB JS chunk (expected Vite warning without manual code-splitting).

### Future Work (With More Time)
* **Automated PDF ingestion:** Coordinate-based parser (`pdfjs-dist` `getTextContent()`) with geometric header/footer filtering, multi-column table detection, and a UI step to flag protected legal clauses.
* **Backend & multi-user collaboration:** Replace `ChangeRepository` with a REST API + PostgreSQL, authentication, optimistic concurrency control, immutable audit logs, and an overlapping-edit merge/resolution flow.
* **Secure live LLM integration:** Server-side proxy with strict system/data role separation, token-budgeted context windows, rate limiting, CSP headers, and Zod validation of model responses.
* **UX & visual enhancements:** Lightweight status highlights directly on `textLayer` spans, PDF zoom controls, inline word-level diffs, and UI JSON export/import.
* **Performance & CI quality:** Vite code-splitting (`React.lazy` for `PdfViewer`), Playwright E2E tests in real browsers, and automated `axe-core` WCAG checks in CI/CD.