import {
  TrackedChangeListSchema,
  TrackedChangeSchema,
  type ChangeStatus,
  type TrackedChange,
} from '../domain/schemas';

export const CHANGES_STORAGE_KEY = 'pdf_review_workspace_changes_v1';
export const SESSION_AUTHOR_STORAGE_KEY = 'pdf_review_workspace_author_v1';

export interface ChangeRepository {
  getAll(): TrackedChange[];
  save(change: TrackedChange): TrackedChange[];
  updateStatus(changeId: string, status: ChangeStatus): TrackedChange[];
  remove(changeId: string): TrackedChange[];
  clear(): void;
}

export class LocalStorageChangeRepository implements ChangeRepository {
  private readonly storageKey: string;

  constructor(storageKey = CHANGES_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  getAll(): TrackedChange[] {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return [];

      const parsedJson: unknown = JSON.parse(raw);
      const validated = TrackedChangeListSchema.safeParse(parsedJson);
      if (!validated.success) {
        return [];
      }
      return validated.data;
    } catch {
      return [];
    }
  }

  save(change: TrackedChange): TrackedChange[] {
    const validChange = TrackedChangeSchema.parse(change);
    const current = this.getAll();
    const updated = [validChange, ...current];
    this.persist(updated);
    return updated;
  }

  updateStatus(changeId: string, status: ChangeStatus): TrackedChange[] {
    const now = new Date().toISOString();
    const updated = this.getAll().map((item) =>
      item.id === changeId ? { ...item, status, updatedAt: now } : item
    );
    this.persist(updated);
    return updated;
  }

  remove(changeId: string): TrackedChange[] {
    const updated = this.getAll().filter((item) => item.id !== changeId);
    this.persist(updated);
    return updated;
  }

  clear(): void {
    window.localStorage.removeItem(this.storageKey);
  }

  private persist(changes: TrackedChange[]): void {
    const validated = TrackedChangeListSchema.parse(changes);
    window.localStorage.setItem(this.storageKey, JSON.stringify(validated));
  }
}

export const changeRepository: ChangeRepository =
  new LocalStorageChangeRepository();

export function loadSessionAuthor(): string {
  try {
    const saved = window.localStorage.getItem(SESSION_AUTHOR_STORAGE_KEY);
    return saved && saved.trim().length > 0 ? saved : 'Reviewer Session';
  } catch {
    return 'Reviewer Session';
  }
}

export function saveSessionAuthor(author: string): void {
  try {
    const trimmed = author.trim();
    window.localStorage.setItem(
      SESSION_AUTHOR_STORAGE_KEY,
      trimmed.length > 0 ? trimmed : 'Reviewer Session'
    );
  } catch {
    // Ignore storage quota/privacy mode errors
  }
}