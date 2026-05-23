import { useState } from 'react'
import CaseCommentsTab from './CaseCommentsTab'
import CaseCorrespondenceTab from './CaseCorrespondenceTab'
import CaseAttachmentsPanel from './CaseAttachmentsPanel'

const PANES = [
  { key: 'threads', label: 'Threaded Comments' },
  { key: 'chat', label: 'Live Chat' },
  { key: 'correspondence', label: 'Correspondence' },
  { key: 'attachments', label: 'Attachments' },
]

export default function CaseCommunicationsWorkspace({
  id,
  headers,
  token,
  currentUserId,
  setSavedMsg,
  routePane = '',
  onCommentCount,
  onCorrespondenceCount,
}) {
  const [activePane, setActivePane] = useState(routePane || 'correspondence')

  return (
    <div className="cf-workspace-shell">
      <div className="cf-workspace-header">
        <div>
          <div className="cf-overview-kicker">Communications</div>
          <h3>Case Communication Workspace</h3>
          <p>Comments, live chat, email history, and attachments are grouped here instead of spread across top-level tabs.</p>
        </div>
      </div>

      <div className="cf-workspace-tabs">
        {PANES.map(pane => (
          <button
            key={pane.key}
            type="button"
            className={`cf-workspace-tab${activePane === pane.key ? ' active' : ''}`}
            onClick={() => setActivePane(pane.key)}
          >
            {pane.label}
          </button>
        ))}
      </div>

      <div className="cf-workspace-body">
        {activePane === 'threads' && (
          <CaseCommentsTab
            id={id}
            headers={headers}
            token={token}
            currentUserId={currentUserId}
            includeThreadedComments
            includeLiveChat={false}
          />
        )}
        {activePane === 'chat' && (
          <CaseCommentsTab
            id={id}
            headers={headers}
            token={token}
            currentUserId={currentUserId}
            includeThreadedComments={false}
            includeLiveChat
            onCountChange={onCommentCount}
          />
        )}
        {activePane === 'correspondence' && (
          <CaseCorrespondenceTab
            id={id}
            headers={headers}
            setSavedMsg={setSavedMsg}
            onCountChange={onCorrespondenceCount}
            showCaseAttachments={false}
          />
        )}
        {activePane === 'attachments' && <CaseAttachmentsPanel caseId={id} />}
      </div>
    </div>
  )
}
