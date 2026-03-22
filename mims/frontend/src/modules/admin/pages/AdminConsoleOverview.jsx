/**
 * AdminConsoleOverview.jsx — Admin Console landing page
 * Card grid layout matching the MIMS prototype.
 * Each item navigates to /admin-console/:section
 */

import { useNavigate } from 'react-router-dom'
import MIMSLayout from '../../../shared/components/MIMSLayout'

const LEFT_ITEMS = [
  { label: 'Picklists',                        slug: 'picklists' },
  { label: 'Email Accounts',                   slug: 'email-accounts',        built: true },
  { label: 'Sites Setup',                      slug: 'sites-setup',           built: true },
  { label: 'Workflow Setup',                   slug: 'workflow-setup',        built: true },
  { label: 'Case Numbering',                   slug: 'case-numbering' },
  { label: 'Data Protection & Privacy Rules',  slug: 'data-protection' },
  { label: 'Transmission Rules',               slug: 'transmission-rules' },
  { label: 'Other Configurations',             slug: 'other-configurations' },
  { label: 'Case Reporting',                   slug: 'case-reporting' },
  { label: 'Help System',                      slug: 'help-system' },
  { label: 'SSP Setup',                        slug: 'ssp-setup' },
]

const CARD_GROUPS = [
  {
    title: 'Product Setup',
    items: [
      { label: 'Product Groups',    slug: 'product-groups' },
      { label: 'Product Dictionary', slug: 'product-dictionary', built: true },
    ],
  },
  {
    title: 'Access Configurations',
    items: [
      { label: 'User Security Groups', slug: 'user-security-groups', built: true },
      { label: 'User Configuration',   slug: 'user-configuration',   built: true },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { label: 'Analytics URL',            slug: 'analytics-url' },
      { label: 'Analytics Master Reports', slug: 'analytics-reports' },
    ],
  },
  {
    title: 'Audit Trail',
    items: [
      { label: 'Admin Audit Trail', slug: 'admin-audit-trail', built: true },
      { label: 'Login Audit Trail', slug: 'login-audit-trail', built: true },
    ],
  },
  {
    title: 'Form Configurations',
    items: [
      { label: 'Field Setup',            slug: 'field-setup' },
      { label: 'Case Form Definition',   slug: 'case-form-definition' },
      { label: 'Custom Forms',           slug: 'custom-forms' },
    ],
  },
  {
    title: 'Contact Master',
    items: [
      { label: 'Case Contacts Repository',   slug: 'case-contacts' },
      { label: 'Company Representatives',    slug: 'company-representatives' },
      { label: 'Organization Address Book',  slug: 'org-address-book' },
    ],
  },
  {
    title: 'Integration Setup',
    items: [
      { label: 'Contacts Integration',         slug: 'contacts-integration' },
      { label: 'MIR Integration',              slug: 'mir-integration' },
      { label: 'CRM Integration Notification', slug: 'crm-integration' },
      { label: 'Content Integration',          slug: 'content-integration' },
      { label: 'Transmission Setup',           slug: 'transmission-setup' },
    ],
  },
  {
    title: 'Logs',
    items: [
      { label: 'Service Log',     slug: 'service-log',     built: true },
      { label: 'System Activity', slug: 'system-activity', built: true },
    ],
  },
]

export default function AdminConsoleOverview() {
  const navigate = useNavigate()

  function go(slug) { navigate(`/admin-console/${slug}`) }

  return (
    <MIMSLayout showStatStrip={false}>
      <div className="ac-overview-wrapper">

        {/* Page title */}
        <div className="ac-overview-title-bar">
          <h2 className="ac-overview-title">Admin Console</h2>
        </div>

        <div className="ac-overview-body">

          {/* ── Left column ─────────────────────────────────── */}
          <div className="ac-left-col">
            {LEFT_ITEMS.map(item => (
              <div
                key={item.slug}
                className="ac-left-item"
                onClick={() => go(item.slug)}
              >
                {item.label}
                {!item.built && <span className="ac-soon-tag">Soon</span>}
              </div>
            ))}
          </div>

          {/* ── Right card grid ──────────────────────────────── */}
          <div className="ac-card-grid">
            {CARD_GROUPS.map(group => (
              <div key={group.title} className="ac-card">
                <div className="ac-card-title">{group.title}</div>
                {group.items.map(item => (
                  <div
                    key={item.slug}
                    className="ac-card-item"
                    onClick={() => go(item.slug)}
                  >
                    {item.label}
                    {!item.built && <span className="ac-soon-tag">Soon</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>

        </div>
      </div>
    </MIMSLayout>
  )
}
