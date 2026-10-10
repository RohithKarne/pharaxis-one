import { lazy, Suspense, useState, startTransition } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import StandaloneModuleShell from '../../../shared/components/StandaloneModuleShell'
const AdminContentIntelligenceSection = lazy(() => import('../../admin/components/AdminContentIntelligenceSection'))
const AdminMICategoriesSection = lazy(() => import('../../admin/components/AdminMICategoriesSection'))
const AdminPolicyGraphSection = lazy(() => import('../../admin/components/AdminPolicyGraphSection'))
const FolderManager = lazy(() => import('../components/FolderManager'))
const DocumentsSection = lazy(() => import('../components/DocumentsSection'))
const ModulesSection = lazy(() => import('../components/ModulesSection'))
const FAQsSection = lazy(() => import('../components/FAQsSection'))
const MergeReportsSection = lazy(() => import('../components/MergeReportsSection'))
const TemplatesSection = lazy(() => import('../components/TemplatesSection'))
const BrowseSection = lazy(() => import('../components/BrowseSection'))
const CMSettingsSection = lazy(() => import('../components/CMSettingsSection'))
const ContentOperationsSection = lazy(() => import('../components/ContentOperationsSection'))

function ContentSectionLoader() {
  return (
    <div style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
      Loading content workspace...
    </div>
  )
}

export default function ContentPage() {
  const { user, token } = useAuth()
  const [searchParams] = useSearchParams()
  const standalone = searchParams.get('standalone') === '1'
  // ?view=reviews opens a reviewer's tasks — where a review notification lands (MIPM-176).
  const openReviews = searchParams.get('view') === 'reviews'
  const [activeTab, setActiveTab] = useState(openReviews ? 'documents' : (['agent', 'reviewer'].includes(user?.role) ? 'browse' : 'documents'))
  const [showFolders, setShowFolders] = useState(false)
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const flash = () => {}

  const tabGroups = [
    {
      key: 'authoring',
      label: 'Authoring',
      description: 'Create and maintain controlled content assets.',
      items: [
        { key: 'documents', label: 'Documents', description: 'Controlled source content and approval-ready assets.' },
        { key: 'modules', label: 'Modular Documents', description: 'Reusable modules for high-volume content assembly.' },
        { key: 'faqs', label: 'FAQs', description: 'Trusted answer sets for recurring medical information needs.' },
        { key: 'templates', label: 'Templates', description: 'Reusable starting points for structured content creation.' },
        { key: 'merge-reports', label: 'Merge Reports', description: 'Output packages and merge-driven reporting assets.' },
      ],
    },
    {
      key: 'delivery',
      label: 'Delivery & Governance',
      description: 'Publish, browse, and govern what users can trust.',
      items: [
        { key: 'operations', label: 'Operations Dashboard', description: 'Work queues, expiring content, and CM follow-up items.' },
        { key: 'browse', label: 'Browse Content', description: 'The consumer-facing approved content library.' },
        { key: 'settings', label: 'Settings', description: 'Module settings, review controls, and CM behaviors.' },
      ],
    },
    {
      key: 'intelligence',
      label: 'Taxonomy',
      description: 'MI category taxonomy and inquiry framing for content operations.',
      items: [
        { key: 'mi-categories', label: 'MI Categories', description: 'Taxonomy and inquiry framing for content operations.' },
        // CUT (rationalization): speculative "Intelligence" stubs removed — Policy Graph Engine,
        // Evidence Chain Compiler, Contradiction Radar, Digital Twin Release Simulator, Adaptive Risk Workflow.
      ],
    },
  ]
  const allTabs = tabGroups.flatMap((group) => group.items)
  const activeTabMeta = allTabs.find((tab) => tab.key === activeTab) || allTabs[0]
  const activeGroup = tabGroups.find((group) => group.items.some((tab) => tab.key === activeTab)) || tabGroups[0]
  // One content menu (Phase 3): the sections run across the top of the panel,
  // grouped, so the table below gets the full width. It replaces a 320px card
  // rail that sat between the app menu and the content.
  const content = (
    <div className="workspace-page workspace-page--content">
      <section className="workspace-panel workspace-panel--content">
        <nav className="cm-tabbar" aria-label="Content sections">
          {tabGroups.map((group) => (
            <div key={group.key} className="cm-tabbar-group" role="group" aria-label={group.label} title={group.description}>
              {group.items.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`cm-tabbar-tab ${activeTab === tab.key ? 'active' : ''}`}
                  aria-current={activeTab === tab.key ? 'page' : undefined}
                  title={tab.description}
                  onClick={() => startTransition(() => setActiveTab(tab.key))}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="cm-panel-head">
          <p><span className="cm-panel-kicker">{activeGroup.label}</span> {activeTabMeta.description}</p>
          <button className="btn btn-outline" onClick={() => setShowFolders(true)}>Folder Manager</button>
        </div>

        <div className="cm-content workspace-panel-body">
          <Suspense fallback={<ContentSectionLoader />}>
            {activeTab === 'documents' && <DocumentsSection token={token} user={user} initialSubTab={openReviews ? 'reviews' : 'all'} />}
            {activeTab === 'modules' && <ModulesSection token={token} />}
            {activeTab === 'faqs' && <FAQsSection token={token} user={user} />}
            {activeTab === 'merge-reports' && <MergeReportsSection token={token} />}
            {activeTab === 'templates' && <TemplatesSection token={token} />}
            {activeTab === 'operations' && <ContentOperationsSection token={token} onNavigate={(nextTab) => startTransition(() => setActiveTab(nextTab))} />}
            {activeTab === 'browse' && <BrowseSection token={token} />}
            {activeTab === 'settings' && <CMSettingsSection token={token} />}
            {activeTab === 'mi-categories' && <AdminMICategoriesSection H={H} />}
            {activeTab === 'policy-graph' && <AdminPolicyGraphSection H={H} flash={flash} />}
            {activeTab === 'evidence-chain-compiler' && <AdminContentIntelligenceSection contentSection="evidence-chain-compiler" H={H} flash={flash} />}
            {activeTab === 'contradiction-radar' && <AdminContentIntelligenceSection contentSection="contradiction-radar" H={H} flash={flash} />}
            {activeTab === 'digital-twin-release-simulator' && <AdminContentIntelligenceSection contentSection="digital-twin-release-simulator" H={H} flash={flash} />}
            {activeTab === 'adaptive-risk-workflow' && <AdminContentIntelligenceSection contentSection="adaptive-risk-workflow" H={H} flash={flash} />}
          </Suspense>
        </div>
      </section>

      {showFolders && (
        <Suspense fallback={null}>
          <FolderManager show={showFolders} onClose={() => setShowFolders(false)} token={token} />
        </Suspense>
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
    <MIMSLayout showStatStrip={false} bodyClassName="mims-ops-page-body" surfaceVariant="workspace" compact>
      {content}
    </MIMSLayout>
  )
}
