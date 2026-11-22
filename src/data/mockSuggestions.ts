import { z } from 'zod';
import { SuggestionSchema, type Suggestion } from '../domain/schemas';

const SuggestionListSchema = z.array(SuggestionSchema);

export interface SuggestionProvider {
  getSuggestionsForPassage(passageId: string): Suggestion[];
  getAllSuggestions(): Suggestion[];
}

export const MOCK_SUGGESTIONS: Suggestion[] = SuggestionListSchema.parse([
  {
    id: 'sug-p1-grammar-1',
    passageId: 'p1-purpose-1',
    page: 1,
    section: 'Purpose',
    category: 'grammar',
    origin: 'mock_sample',
    originalText:
      "The workspace helps a writer improve a job description without losing the wording that was already approved. The editor track changes and store each revision. Each revision keeps it's original sentence beside the new sentence so a reviewer can see what shifted. Reviewers look their for the reason a change was made, even when the reason is only a short comment.",
    proposedText:
      'The workspace helps a writer improve a job description without losing the wording that was already approved. The editor tracks changes and stores each revision. Each revision keeps its original sentence beside the new sentence so a reviewer can see what shifted. Reviewers look there for the reason a change was made, even when the reason is only a short comment.',
    proposedHtml:
      '<p>The workspace helps a writer improve a job description without losing the wording that was already approved. The editor tracks changes and stores each revision. Each revision keeps its original sentence beside the new sentence so a reviewer can see what shifted. Reviewers look there for the reason a change was made, even when the reason is only a short comment.</p>',
    rationale:
      'Fixes subject-verb agreement ("tracks", "stores"), possessive pronoun ("its"), and word choice ("there").',
    requiresHumanApproval: true,
  },
  {
    id: 'sug-p1-syntax-1',
    passageId: 'p1-purpose-2',
    page: 1,
    section: 'Purpose',
    category: 'syntax',
    origin: 'mock_sample',
    originalText:
      'A change can start from a suggestion or from the writer, the system still stores both the same way. The writer may also attach a note about tone. That note is optional. The page number is not optional, because a later reader has to find the passage in the file that was reviewed.',
    proposedText:
      'A change can start from a suggestion or from the writer; the system still stores both the same way. The writer may also attach a note about tone. That note is optional. The page number is not optional, because a later reader has to find the passage in the file that was reviewed.',
    proposedHtml:
      '<p>A change can start from a suggestion or from the writer; the system still stores both the same way. The writer may also attach a note about tone. That note is optional. The page number is not optional, because a later reader has to find the passage in the file that was reviewed.</p>',
    rationale:
      'Repairs a comma splice in the opening sentence by joining the two independent clauses with a semicolon.',
    requiresHumanApproval: true,
  },
  {
    id: 'sug-p1-style-1',
    passageId: 'p1-recorded-2',
    page: 1,
    section: 'How an edit is recorded',
    category: 'style',
    origin: 'mock_sample',
    originalText:
      'When a reviewer wants a suggestion about grammar, syntax, or style, the system gathers the sentence, the nearby paragraph, and the accepted edits that already touch that part of the job description, then it sends that package to a writing assistant that returns a short note the reviewer can accept, reject, or rewrite before it becomes a stored change.',
    proposedText:
      'When a reviewer requests a grammar, syntax, or style suggestion, the system gathers the sentence, nearby paragraph, and related accepted edits. It then sends that package to a writing assistant, which returns a short note the reviewer can accept, reject, or rewrite before saving it.',
    proposedHtml:
      '<p>When a reviewer requests a grammar, syntax, or style suggestion, the system gathers the sentence, nearby paragraph, and related accepted edits. It then sends that package to a writing assistant, which returns a short note the reviewer can accept, reject, or rewrite before saving it.</p>',
    rationale:
      'Splits a long run-on sentence into two shorter, clearer sentences while preserving the original document terminology.',
    requiresHumanApproval: true,
  },
  {
    id: 'sug-p3-grammar-1',
    passageId: 'p3-table-r2-c0',
    page: 3,
    section: 'Review states',
    category: 'grammar',
    origin: 'mock_sample',
    originalText: 'Acepted',
    proposedText: 'Accepted',
    proposedHtml: '<p>Accepted</p>',
    rationale:
      'Corrects the misspelled status label in the Review states table without introducing a fourth status.',
    requiresHumanApproval: true,
  },
  {
    id: 'sug-p3-syntax-1',
    passageId: 'p3-expect-3',
    page: 3,
    section: 'What reviewers expect',
    category: 'syntax',
    origin: 'mock_sample',
    originalText: 'Because the status names are not final.',
    proposedText:
      'Confirm the status labels before release, because the status names are not final.',
    proposedHtml:
      '<p>Confirm the status labels before release, because the status names are not final.</p>',
    rationale:
      'Completes a sentence fragment by adding a main clause (subject and verb). You may also edit this to remove the item if preferred.',
    requiresHumanApproval: true,
  },
]);

export const mockSuggestionProvider: SuggestionProvider = {
  getSuggestionsForPassage(passageId: string): Suggestion[] {
    return MOCK_SUGGESTIONS.filter((s) => s.passageId === passageId);
  },
  getAllSuggestions(): Suggestion[] {
    return MOCK_SUGGESTIONS;
  },
};