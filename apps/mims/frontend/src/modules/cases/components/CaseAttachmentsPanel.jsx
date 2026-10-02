import { useState } from 'react'
import DropzoneUpload from '../../../shared/components/documents/DropzoneUpload'
import AttachmentGallery from '../../../shared/components/documents/AttachmentGallery'
import { useFeatureFlag } from '../../../shared/context/FeatureFlagsContext'

export default function CaseAttachmentsPanel({ caseId }) {
  const t6 = useFeatureFlag('cf.theme6_documents')
  const [reloadKey, setReloadKey] = useState(0)

  // Files already on the case — sent by a portal, or added before the workspace was
  // switched off — are evidence and are always listed. The switch only controls
  // uploading and editing here.
  if (!t6) {
    return (
      <div className="cf-attachments-workspace">
        <div className="cf-workspace-header">
          <div>
            <h3>Case Attachments</h3>
            <p>Files on this case. Uploading here is switched off for this organisation.</p>
          </div>
        </div>
        <div className="cf-overview-card">
          <AttachmentGallery entityType="case" entityId={caseId} readOnly />
        </div>
      </div>
    )
  }

  return (
    <div className="cf-attachments-workspace">
      <div className="cf-workspace-header">
        <div>
          <h3>Case Attachments</h3>
          <p>Upload and manage files separately from email thread history.</p>
        </div>
      </div>

      <div className="cf-overview-card">
        <DropzoneUpload entityType="case" entityId={caseId} onUploaded={() => setReloadKey(k => k + 1)} />
      </div>

      <div className="cf-overview-card">
        <AttachmentGallery entityType="case" entityId={caseId} reloadKey={reloadKey} />
      </div>
    </div>
  )
}
