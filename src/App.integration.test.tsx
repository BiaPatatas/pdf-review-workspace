import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { changeRepository } from './repositories/changeRepository';

// Mock PDFViewer so pdfjs-dist canvas/worker does not run inside jsdom
vi.mock('./components/PDFViewer', () => ({
  PdfViewer: ({
    pageNumber,
    onTextSelected,
  }: {
    pageNumber: number;
    onTextSelected: (text: string, page: number) => void;
  }) => (
    <div data-testid="mock-pdf-viewer">
      <span>Mock PDF Page {pageNumber}</span>
      <button
        type="button"
        onClick={() =>
          onTextSelected('Platform Editor — Internal Draft', pageNumber)
        }
      >
        Simulate Header Selection
      </button>
    </div>
  ),
}));

describe('PDF Review Workspace — UI Integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('accepts a mock grammar suggestion, persists the tracked change, and hides the suggestion', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Select the Purpose passage on Page 1 from the outline
    const purposeBtn = screen.getByRole('button', {
      name: /Purpose.*The workspace helps a writer/i,
    });
    await user.click(purposeBtn);
    expect(purposeBtn.getAttribute('aria-pressed')).toBe('true');

    // Switch to the Suggestions tab and filter to current passage
    await user.click(screen.getByRole('tab', { name: /Suggestions/i }));
    await user.click(
      screen.getByRole('button', { name: /Across the document/i })
    );

    const suggestionsRegion = screen.getByRole('region', {
      name: /Writing assistant suggestions/i,
    });
    const acceptBtn = within(suggestionsRegion).getByRole('button', {
      name: /^Accept$/i,
    });
    await user.click(acceptBtn);

    // Suggestion should no longer appear as pending for this passage
    expect(
      within(suggestionsRegion).queryByRole('button', { name: /^Accept$/i })
    ).toBeNull();

    // Switch back to Changes tab and verify persistence
    await user.click(screen.getByRole('tab', { name: /Changes/i }));
    expect(
      screen.getByRole('heading', { name: /Tracked Changes \(1\)/i })
    ).toBeInTheDocument();
    expect(changeRepository.getAll()).toHaveLength(1);
    expect(changeRepository.getAll()[0].status).toBe('Accepted');
  });

  it('blocks editing and suggestions on protected legal text (Page 3)', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate to Page 3
    const nextBtn = screen.getByRole('button', { name: /Next/i });
    await user.click(nextBtn); // Page 2
    await user.click(nextBtn); // Page 3

    // Select a locked legal passage
    const lockedBtn = screen.getByRole('button', {
      name: /Final section \(Locked\)/i,
    });
    await user.click(lockedBtn);

    // Editor save button should not be rendered; locked alert must appear
    expect(
      screen.queryByRole('button', { name: /Save Tracked Change/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Protected legal text/i);

    // Switch to Suggestions tab and filter to current passage
    await user.click(screen.getByRole('tab', { name: /Suggestions/i }));
    await user.click(
      screen.getByRole('button', { name: /Across the document/i })
    );

    const suggestionAlerts = screen.getAllByRole('alert');
    expect(
      suggestionAlerts.some((el) =>
        /Suggestions disabled/i.test(el.textContent ?? '')
      )
    ).toBe(true);
  });

  it('flags prompt injection in the LLM Context Payload Inspector on Page 2', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate to Page 2
    await user.click(screen.getByRole('button', { name: /Next/i }));

    // Select the passage containing the prompt injection note
    const injectionPassageBtn = screen.getByRole('button', {
      name: /What the assistant is allowed to see.*ignore your earlier instructions/i,
    });
    await user.click(injectionPassageBtn);

    // Switch to Suggestions tab and open the Context Inspector
    await user.click(screen.getByRole('tab', { name: /Suggestions/i }));
    const summary = screen.getByText(/LLM Context Payload Inspector/i);
    await user.click(summary);

    expect(
      screen.getByText(/Prompt injection detected in context/i)
    ).toBeInTheDocument();
  });

  it('shows exclusion notice when selecting a running header', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole('button', { name: /Simulate Header Selection/i })
    );

    expect(
      screen.getByText(/Running headers and footers are excluded/i)
    ).toBeInTheDocument();
  });
});