import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The split components fetch on mount with relative URLs, which jsdom cannot
// resolve ("Failed to parse URL from /api/..."). These are render/navigation
// tests, so the network is stubbed rather than exercised.
beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  }))
})

vi.mock('../shared/context/AuthContext', () => ({
  useAuth: () => ({
    token: 'mock-token',
    user: { id: 7, name: 'QA User' },
    // CaseOverviewTab destructures hasCapability from useAuth and calls it while
    // building its section summaries. Without it the tab throws on render, which
    // is what this mock was missing.
    hasCapability: () => true,
  }),
}))

vi.mock('../shared/components/MIMSLayout', () => ({
  default: ({ children }) => <div data-testid="mims-layout">{children}</div>,
}))

vi.mock('../modules/cases/hooks/useCaseForm', () => ({
  default: () => ({
    caseData: { case_number: 'CASE-001', case_type: 'MI', org_name: 'Org A', site_name: 'Site A' },
    loading: false,
    saving: false,
    savedMsg: '',
    setSavedMsg: vi.fn(),
    statuses: [],
    users: [],
    formConfig: {},
    infoForm: {},
    setInfoForm: vi.fn(),
    reassignForm: {},
    setReassignForm: vi.fn(),
    reassignSaving: false,
    dynFieldValues: {},
    setDynFieldValues: vi.fn(),
    dynFieldSaving: false,
    saveInfo: vi.fn(),
    scheduleAutoSave: vi.fn(),
    reassignCase: vi.fn(),
    saveDynFields: vi.fn(),
    getFieldConfig: vi.fn(() => ({})),
    getPicklistOptions: vi.fn(() => []),
    headers: { Authorization: 'Bearer mock-token' },
  }),
}))

vi.mock('../modules/cases/components/CaseInfoTab', () => ({ default: () => <div data-testid="case-info-tab">info</div> }))
vi.mock('../modules/cases/components/CaseCommentsTab', () => ({ default: () => <div data-testid="case-comments-tab">comments</div> }))
// The Sprint 21 split replaced the standalone comments tab with a combined
// workspace; the Communications tab mounts this component now.
vi.mock('../modules/cases/components/CaseCommunicationsWorkspace', () => ({ default: () => <div data-testid="case-communications-workspace">communications</div> }))
vi.mock('../modules/cases/components/CaseContactsTab', () => ({ default: () => <div data-testid="case-contacts-tab">contacts</div> }))
vi.mock('../modules/cases/components/CaseCorrespondenceTab', () => ({ default: () => <div data-testid="case-correspondence-tab">correspondence</div> }))
vi.mock('../modules/cases/components/CaseMITab', () => ({ default: () => <div data-testid="case-mi-tab">mi</div> }))
vi.mock('../modules/cases/components/CaseAETab', () => ({ default: () => <div data-testid="case-ae-tab">ae</div> }))
vi.mock('../modules/cases/components/CasePCTab', () => ({ default: () => <div data-testid="case-pc-tab">pc</div> }))
vi.mock('../modules/cases/components/CaseDPPRTab', () => ({ default: () => <div data-testid="case-dppr-tab">dppr</div> }))

vi.mock('../modules/content/components/FolderManager', () => ({ default: ({ show }) => show ? <div data-testid="folder-manager">folders</div> : null }))
vi.mock('../modules/content/components/DocumentsSection', () => ({ default: () => <div data-testid="documents-section">documents</div> }))
vi.mock('../modules/content/components/ModulesSection', () => ({ default: () => <div data-testid="modules-section">modules</div> }))
vi.mock('../modules/content/components/FAQsSection', () => ({ default: () => <div data-testid="faqs-section">faqs</div> }))
vi.mock('../modules/content/components/MergeReportsSection', () => ({ default: () => <div data-testid="merge-reports-section">merge</div> }))
vi.mock('../modules/content/components/TemplatesSection', () => ({ default: () => <div data-testid="templates-section">templates</div> }))
vi.mock('../modules/content/components/BrowseSection', () => ({ default: () => <div data-testid="browse-section">browse</div> }))
vi.mock('../modules/content/components/CMSettingsSection', () => ({ default: () => <div data-testid="settings-section">settings</div> }))

import CaseFormPage from '../modules/cases/pages/CaseFormPage'
import ContentPage from '../modules/content/pages/ContentPage'

function renderCaseForm(initial = '/cases/42') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/cases/:id" element={<CaseFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Sprint 21 split regression: CaseFormPage', () => {
  // CaseFormPage moved its tabs to React.lazy + Suspense, so every tab
  // assertion has to await resolution — a synchronous query runs while the
  // fallback is still showing and finds nothing.
  it('honors section deep-link and shows MI tab content', async () => {
    renderCaseForm('/cases/42?section=mi')
    expect(await screen.findByTestId('case-mi-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('case-info-tab')).not.toBeInTheDocument()
  })

  it('switches tabs and renders split components', async () => {
    renderCaseForm('/cases/42')
    expect(await screen.findByTestId('case-info-tab')).toBeInTheDocument()

    // Tab labels were renamed in the Sprint 21 split: "Comments / Notes" became
    // "Communications" and "Contacts" became "People". Scope to the tab bar —
    // the panels also render "Open Communications Workspace" buttons.
    const tab = (name) =>
      screen.getAllByRole('button', { name })
        .find(el => el.classList.contains('cf-tabbar-btn'))

    fireEvent.click(tab('Communications'))
    expect(await screen.findByTestId('case-communications-workspace')).toBeInTheDocument()

    fireEvent.click(tab('People'))
    expect(await screen.findByTestId('case-contacts-tab')).toBeInTheDocument()
  })
})

describe('Sprint 21 split regression: ContentPage', () => {
  // ContentPage loads its sections with React.lazy + Suspense, so every section
  // assertion has to await resolution. The original synchronous getByTestId
  // calls could never pass after that refactor.
  it('renders top tabs and switches section components', async () => {
    render(
      <MemoryRouter>
        <ContentPage />
      </MemoryRouter>
    )

    expect(await screen.findByTestId('documents-section')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Browse Content/ }))
    expect(await screen.findByTestId('browse-section')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Settings/ }))
    expect(await screen.findByTestId('settings-section')).toBeInTheDocument()
  })

  it('opens folder manager modal from header action', async () => {
    render(
      <MemoryRouter>
        <ContentPage />
      </MemoryRouter>
    )

    // Header action is labelled "Folder Manager" — it was renamed from
    // "📁 Manage Folders" and the test was never updated.
    fireEvent.click(screen.getByRole('button', { name: 'Folder Manager' }))
    expect(await screen.findByTestId('folder-manager')).toBeInTheDocument()
  })
})
