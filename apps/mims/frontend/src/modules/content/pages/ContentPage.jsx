import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import StandaloneModuleShell from '../../../shared/components/StandaloneModuleShell'
import AdminContentIntelligenceSection from '../../admin/components/AdminContentIntelligenceSection'
import AdminMICategoriesSection from '../../admin/components/AdminMICategoriesSection'
import AdminPolicyGraphSection from '../../admin/components/AdminPolicyGraphSection'
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
  const [searchParams] = useSearchParams()
  const standalone = searchParams.get('standalone') === '1'
  const [activeTab, setActiveTab] = useState(['agent', 'reviewer'].includes(user?.role) ? 'browse' : 'documents')
  const [showFolders, setShowFolders] = useState(false)
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const flash = () => {}

  const tabs = [
    { key: 'documents', label: 'Documents' },
    { key: 'modules', label: 'Modular Documents' },
    { key: 'faqs', label: 'FAQs' },
    { key: 'merge-reports', label: 'Merge Reports' },
    { key: 'templates', label: 'Templates' },
    { key: 'browse', label: 'Browse Content' },
    { key: 'settings', label: '⚙ Settings' },
    { key: 'mi-categories', label: 'MI Categories' },
    { key: 'policy-graph', label: 'Policy Graph Engine' },
    { key: 'evidence-chain-compiler', label: 'Evidence Chain Compiler' },
    { key: 'contradiction-radar', label: 'Contradiction Radar' },
    { key: 'digital-twin-release-simulator', label: 'Digital Twin Release Simulator' },
    { key: 'adaptive-risk-workflow', label: 'Adaptive Risk Workflow' },
  ]

  const content = (
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
          {activeTab === 'mi-categories' && <AdminMICategoriesSection H={H} />}
          {activeTab === 'policy-graph' && <AdminPolicyGraphSection H={H} flash={flash} />}
          {activeTab === 'evidence-chain-compiler' && <AdminContentIntelligenceSection contentSection="evidence-chain-compiler" H={H} flash={flash} />}
          {activeTab === 'contradiction-radar' && <AdminContentIntelligenceSection contentSection="contradiction-radar" H={H} flash={flash} />}
          {activeTab === 'digital-twin-release-simulator' && <AdminContentIntelligenceSection contentSection="digital-twin-release-simulator" H={H} flash={flash} />}
          {activeTab === 'adaptive-risk-workflow' && <AdminContentIntelligenceSection contentSection="adaptive-risk-workflow" H={H} flash={flash} />}
        </div>

        {/* Folder Manager */}
        {showFolders && (
          <FolderManager show={showFolders} onClose={() => setShowFolders(false)} token={token} />
        )}
      </div>
  )

  if (standalone) {
    return (
      <StandaloneModuleShell title="Content Management" subtitle="CM Console" logo="CM" loginPath="/content/login">
        {content}
      </StandaloneModuleShell>
    )
  }

  return (
    <MIMSLayout>
      {content}
    </MIMSLayout>
  )
}
