export default function AiSuggestionInline({ label = 'AI suggested this', value, onAccept, onReject }) {
  if (!value) return null
  return (
    <div className="ai-inline-suggestion">
      <strong>{label}</strong>
      <span>{typeof value === 'string' ? value : JSON.stringify(value)}</span>
      {onAccept && <button type="button" onClick={onAccept}>Accept</button>}
      {onReject && <button type="button" onClick={onReject}>Reject</button>}
    </div>
  )
}
