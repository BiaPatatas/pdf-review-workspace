import { z } from 'zod';

export const ChangeStatusSchema = z.enum(['Pending', 'Accepted', 'Rejected']);
export type ChangeStatus = z.infer<typeof ChangeStatusSchema>;

export const SuggestionCategorySchema = z.enum(['grammar', 'syntax', 'style']);
export type SuggestionCategory = z.infer<typeof SuggestionCategorySchema>;

export const BlockTypeSchema = z.enum([
  'heading',
  'paragraph',
  'list_item',
  'table_cell',
  'protected_legal',
]);
export type BlockType = z.infer<typeof BlockTypeSchema>;

export const TableMetaSchema = z.object({
  tableId: z.string().min(1),
  row: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  columnHeader: z.string().optional(),
});
export type TableMeta = z.infer<typeof TableMetaSchema>;

export const IndexedPassageSchema = z.object({
  id: z.string().min(1),
  page: z.number().int().positive(),
  section: z.string().min(1),
  blockType: BlockTypeSchema,
  text: z.string().min(1),
  editable: z.boolean(),
  lockReason: z.string().optional(),
  prevPassageId: z.string().nullable(),
  nextPassageId: z.string().nullable(),
  tableMeta: TableMetaSchema.optional(),
  tableRow: z.number().int().positive().optional(),
  tableColumn: z.number().int().positive().optional(),
});
export type IndexedPassage = z.infer<typeof IndexedPassageSchema>;

export const DocumentIndexSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1),
  sourceFile: z.string().min(1),
  pageCount: z.number().int().positive(),
  excludedRegions: z.array(z.string()),
  passages: z.array(IndexedPassageSchema).min(1),
});
export type DocumentIndex = z.infer<typeof DocumentIndexSchema>;

export const TrackedChangeSchema = z.object({
  id: z.string().min(1),
  passageId: z.string().min(1),
  page: z.number().int().positive(),
  section: z.string().min(1),
  originalText: z.string().min(1),
  proposedText: z.string(), // Permite "" para propostas de eliminação de passagem
  originalHtml: z.string().min(1),
  proposedHtml: z.string(), // Permite "" para propostas de eliminação de passagem
  formattingOnly: z.boolean(),
  status: ChangeStatusSchema,
  author: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  comment: z.string().optional(),
  commentHtml: z.string().optional(),
  source: z.enum(['manual', 'suggestion']),
  suggestionId: z.string().optional(),
  tableRow: z.number().int().positive().optional(),
  tableColumn: z.number().int().positive().optional(),
  selectedExcerpt: z.string().optional(),
});
export type TrackedChange = z.infer<typeof TrackedChangeSchema>;

export const TrackedChangeListSchema = z.array(TrackedChangeSchema);

export const SuggestionSchema = z.object({
  id: z.string().min(1),
  passageId: z.string().min(1),
  page: z.number().int().positive(),
  section: z.string().min(1),
  category: SuggestionCategorySchema,
  origin: z.enum(['mock_sample', 'live_model']),
  originalText: z.string().min(1),
  proposedText: z.string(),
  proposedHtml: z.string(),
  rationale: z.string().min(1),
  requiresHumanApproval: z.literal(true),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;