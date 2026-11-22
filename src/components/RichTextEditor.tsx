import { useId } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { sanitizeRichText } from '../security/sanitize';

interface RichTextEditorProps {
  label: string;
  initialHtml: string;
  onChange: (sanitizedHtml: string) => void;
  disabled?: boolean;
  compact?: boolean;
  helperText?: string;
}

export function RichTextEditor({
  label,
  initialHtml,
  onChange,
  disabled = false,
  compact = false,
  helperText,
}: RichTextEditorProps) {
  const labelId = useId();
  const helperId = useId();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        code: false,
      }),
      Underline,
    ],
    content: initialHtml,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: `tiptap-editor-surface ${compact ? 'compact' : ''}`,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelId,
        ...(helperText ? { 'aria-describedby': helperId } : {}),
      },
    },
    onUpdate({ editor: currentEditor }) {
      onChange(sanitizeRichText(currentEditor.getHTML()));
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className="rich-editor-wrapper">
      <div className="rich-editor-label-row">
        <span id={labelId} className="rich-editor-label">
          {label}
        </span>
        {helperText && (
          <span id={helperId} className="rich-editor-helper">
            {helperText}
          </span>
        )}
      </div>

      <div
        className="rich-editor-toolbar"
        role="toolbar"
        aria-label={`${label} formatting toolbar`}
      >
        <button
          type="button"
          className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
          aria-pressed={editor.isActive('bold')}
          aria-label="Bold (Ctrl+B)"
          title="Bold (Ctrl+B)"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </button>

        <button
          type="button"
          className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
          aria-pressed={editor.isActive('italic')}
          aria-label="Italic (Ctrl+I)"
          title="Italic (Ctrl+I)"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </button>

        <button
          type="button"
          className={`toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`}
          aria-pressed={editor.isActive('underline')}
          aria-label="Underline (Ctrl+U)"
          title="Underline (Ctrl+U)"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <u>U</u>
        </button>

        <button
          type="button"
          className={`toolbar-btn ${editor.isActive('strike') ? 'active' : ''}`}
          aria-pressed={editor.isActive('strike')}
          aria-label="Strikethrough (Ctrl+Shift+S)"
          title="Strikethrough (Ctrl+Shift+S)"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </button>

        {!compact && (
          <>
            <span className="toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              className={`toolbar-btn ${
                editor.isActive('heading', { level: 2 }) ? 'active' : ''
              }`}
              aria-pressed={editor.isActive('heading', { level: 2 })}
              aria-label="Heading 2 (Ctrl+Alt+2)"
              title="Heading 2 (Ctrl+Alt+2)"
              disabled={disabled}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
            >
              H2
            </button>

            <button
              type="button"
              className={`toolbar-btn ${
                editor.isActive('heading', { level: 3 }) ? 'active' : ''
              }`}
              aria-pressed={editor.isActive('heading', { level: 3 })}
              aria-label="Heading 3 (Ctrl+Alt+3)"
              title="Heading 3 (Ctrl+Alt+3)"
              disabled={disabled}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
            >
              H3
            </button>
          </>
        )}

        <span className="toolbar-divider" aria-hidden="true" />

        <button
          type="button"
          className={`toolbar-btn ${
            editor.isActive('bulletList') ? 'active' : ''
          }`}
          aria-pressed={editor.isActive('bulletList')}
          aria-label="Bullet list (Ctrl+Shift+8)"
          title="Bullet list (Ctrl+Shift+8)"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          &bull; List
        </button>

        <button
          type="button"
          className={`toolbar-btn ${
            editor.isActive('orderedList') ? 'active' : ''
          }`}
          aria-pressed={editor.isActive('orderedList')}
          aria-label="Numbered list (Ctrl+Shift+7)"
          title="Numbered list (Ctrl+Shift+7)"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </button>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}