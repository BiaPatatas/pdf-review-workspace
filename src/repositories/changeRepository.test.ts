import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHANGES_STORAGE_KEY,
  LocalStorageChangeRepository,
} from './changeRepository';
import type { TrackedChange } from '../domain/schemas';

const SAMPLE_CHANGE: TrackedChange = {
  id: 'chg-test-1',
  passageId: 'p1-purpose-1',
  page: 1,
  section: 'Purpose',
  originalText: "Each revision keeps it's original sentence.",
  proposedText: 'Each revision keeps its original sentence.',
  originalHtml: "<p>Each revision keeps it's original sentence.</p>",
  proposedHtml: '<p>Each revision keeps its original sentence.</p>',
  formattingOnly: false,
  status: 'Pending',
  author: 'Beatriz Reviewer',
  createdAt: '2026-11-22T15:00:00.000Z',
  updatedAt: '2026-11-22T15:00:00.000Z',
  comment: 'Fix pronoun spelling.',
  commentHtml: '<p>Fix pronoun spelling.</p>',
  source: 'manual',
};

describe('LocalStorageChangeRepository', () => {
  const repo = new LocalStorageChangeRepository();

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves a tracked change and reads it back after a simulated refresh', () => {
    repo.save(SAMPLE_CHANGE);

    // New repository instance simulates reading from localStorage after page reload
    const freshRepo = new LocalStorageChangeRepository();
    const stored = freshRepo.getAll();

    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('chg-test-1');
    expect(stored[0].author).toBe('Beatriz Reviewer');
    expect(stored[0].status).toBe('Pending');
  });

  it('updates change status and persists the new timestamp', () => {
    repo.save(SAMPLE_CHANGE);
    const updated = repo.updateStatus('chg-test-1', 'Accepted');

    expect(updated[0].status).toBe('Accepted');
    expect(repo.getAll()[0].status).toBe('Accepted');
  });

  it('returns an empty list safely if localStorage contains corrupted JSON', () => {
    window.localStorage.setItem(CHANGES_STORAGE_KEY, '{invalid-json');
    expect(repo.getAll()).toEqual([]);
  });
});