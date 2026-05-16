/**
 * RichTextField — Theme 1 Rich Field (Wave 3).
 *
 * contentEditable-based light editor. Avoids heavy deps (no Draft.js, no Slate).
 * Buttons: bold, italic, underline, bullet, numbered, link.
 *
 * Server-side sanitization happens in richFieldsService._stripScriptTags();
 * for stronger client-side cleaning, swap in DOMPurify before onChange.
 *
 * Value shape: { html }
 */

import { useEffect, useRef } from 'react'

export default function RichTextField({ value = {}, onChange, label, readOnly, height = 140 }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    if ((value.html || '') !== ref.current.innerHTML) {
      ref.current.innerHTML = value.html || ''
    }
  }, [value.html])

  function cmd(c, arg) {
    if (readOnly) return
    document.execCommand(c, false, arg)
    onChange?.({ html: ref.current.innerHTML })
  }

  return (
    <div>
      {label && <div style={lbl}>{label}</div>}
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)' }}>
        {!readOnly && (
          <div style={{
            display: 'flex', gap: 2, padding: '4px 6px',
            borderBottom: '1px solid var(--border)', background: 'var(--surface-alt,#fafafa)',
            borderTopLeftRadius: 6, borderTopRightRadius: 6,
          }}>
            <Btn label="B" onClick={() => cmd('bold')} style={{ fontWeight: 700 }} />
            <Btn label="I" onClick={() => cmd('italic')} style={{ fontStyle: 'italic' }} />
            <Btn label="U" onClick={() => cmd('underline')} style={{ textDecoration: 'underline' }} />
            <Sep />
            <Btn label="• List" onClick={() => cmd('insertUnorderedList')} />
            <Btn label="1. List" onClick={() => cmd('insertOrderedList')} />
            <Sep />
            <Btn label="🔗" onClick={() => {
              const url = prompt('Link URL?')
              if (url) cmd('createLink', url)
            }} />
            <Btn label="✖ format" onClick={() => cmd('removeFormat')} />
          </div>
        )}
        <div
          ref={ref}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onInput={() => onChange?.({ html: ref.current.innerHTML })}
          style={{
            padding: '8px 10px', fontSize: 13, minHeight: height,
            outline: 'none', lineHeight: 1.5,
          }}
        />
      </div>
    </div>
  )
}

function Btn({ label, onClick, style = {} }) {
  return (
    <button onMouseDown={e => { e.preventDefault(); onClick?.() }}
      style={{
        padding: '3px 8px', fontSize: 12, cursor: 'pointer',
        background: 'transparent', border: '1px solid transparent', borderRadius: 3,
        color: 'var(--text-secondary)', ...style,
      }}>{label}</button>
  )
}
function Sep() { return <span style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} /> }

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }
