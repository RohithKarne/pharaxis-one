import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../shared/context/AuthContext', () => ({
  useAuth: () => ({
    token: 'mock-token',
    user: { id: 7, name: 'QA User' },
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
  it('honors section deep-link and shows MI tab content', () => {
    renderCaseForm('/cases/42?section=mi')
    expect(screen.getByTestId('case-mi-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('case-info-tab')).not.toBeInTheDocument()
  })

  it('switches tabs and renders split components', () => {
    renderCaseForm('/cases/42')
    expect(screen.getByTestId('case-info-tab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Comments / Notes' }))
    expect(screen.getByTestId('case-comments-tab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Contacts' }))
    expect(screen.getByTestId('case-contacts-tab')).toBeInTheDocument()
  })
})

describe('Sprint 21 split regression: ContentPage', () => {
  it('renders top tabs and switches section components', () => {
    render(
      <MemoryRouter>
        <ContentPage />
      </MemoryRouter>
    )

    expect(screen.getByTestId('documents-section')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Browse Content' }))
    expect(screen.getByTestId('browse-section')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '⚙ Settings' }))
    expect(screen.getByTestId('settings-section')).toBeInTheDocument()
  })

  it('opens folder manager modal from header action', () => {
    render(
      <MemoryRouter>
        <ContentPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '📁 Manage Folders' }))
    expect(screen.getByTestId('folder-manager')).toBeInTheDocument()
  })
})
