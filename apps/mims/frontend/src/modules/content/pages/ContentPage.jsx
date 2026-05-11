import { useState } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import FolderManager from '../components/FolderManager'
import DocumentsSection from '../components/DocumentsSection'
import ModulesSection from '../components/ModulesSection'
import FAQsSection from '../components/FAQsSection'
import MergeReportsSection from '../components/MergeReportsSection'
import TemplatesSection from '../components/TemplatesSection'
import BrowseSection from '../components/BrowseSection'
import CMSettingsSection from '../components/CMSettingsSection'

export default function ContentPage() {
  const { user, token } = useAuth()
  const [activeTab, setActiveTab] = useState(['agent', 'reviewer'].includes(user?.role) ? 'browse' : 'documents')
  const [showFolders, setShowFolders] = useState(false)

  const tabs = [
    { key: 'documents', label: 'Documents' },
    { key: 'modules', label: 'Modular Documents' },
    { key: 'faqs', label: 'FAQs' },
    { key: 'merge-reports', label: 'Merge Reports' },
    { key: 'templates', label: 'Templates' },
    { key: 'browse', label: 'Browse Content' },
    { key: 'settings', label: '⚙ Settings' },
  ]

  return (
    <MIMSLayout>
      <div className="cm-page">
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Content Management</h2>
          <button className="cm-folder-btn" onClick={() => setShowFolders(true)}>📁 Manage Folders</button>
        </div>

        {/* Top Tabs */}
        <div className="cm-top-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`cm-top-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Section Content */}
        <div className="cm-content">
          {activeTab === 'documents' && <DocumentsSection token={token} user={user} />}
          {activeTab === 'modules' && <ModulesSection token={token} />}
          {activeTab === 'faqs' && <FAQsSection token={token} user={user} />}
          {activeTab === 'merge-reports' && <MergeReportsSection token={token} />}
          {activeTab === 'templates' && <TemplatesSection token={token} />}
          {activeTab === 'browse' && <BrowseSection token={token} />}
          {activeTab === 'settings' && <CMSettingsSection token={token} />}
        </div>

        {/* Folder Manager */}
        {showFolders && (
          <FolderManager show={showFolders} onClose={() => setShowFolders(false)} token={token} />
        )}
      </div>
    </MIMSLayout>
  )
}
