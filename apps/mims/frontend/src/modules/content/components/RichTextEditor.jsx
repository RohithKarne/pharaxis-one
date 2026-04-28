import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'

export default function RichTextEditor({ value, onChange, placeholder }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'cm-editor-prosemirror' },
    },
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
  }, [value]) // eslint-disable-line

  if (!editor) return null

  return (
    <div className="cm-editor-wrapper">
      <div className="cm-editor-toolbar">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'active' : ''} title="Bold">B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'active' : ''} title="Italic"><em>I</em></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive('underline') ? 'active' : ''} title="Underline"><u>U</u></button>
        <span className="cm-toolbar-sep">|</span>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 1 }) ? 'active' : ''}>H1</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={editor.isActive('heading', { level: 3 }) ? 'active' : ''}>H3</button>
        <span className="cm-toolbar-sep">|</span>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'active' : ''}>• List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? 'active' : ''}>1. List</button>
      </div>
      <EditorContent editor={editor} className="cm-editor-content" />
    </div>
  )
}
