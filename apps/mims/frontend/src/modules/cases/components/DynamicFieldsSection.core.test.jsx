import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DynamicFieldsSection from './DynamicFieldsSection.jsx'

vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 1, role: 'admin' } }),
}))

/**
 * The case form rendered its platform fields twice: once from the wizard's own
 * JSX, once from field_setup through this component. Case 482695 stored the
 * value "test" against field_setup id 20 AND id 1702 — two rows both named
 * "Description", one user action.
 *
 * A field carrying `core_key` belongs to the wizard. This section must skip it.
 */
describe('DynamicFieldsSection core-field filtering', () => {
  const sections = [
    {
      section_name: 'Case Information',
      fields: [
        // Platform fields — the wizard already draws these.
        { id: 1701, field_name: 'Priority', field_type: 'text', core_key: 'priority' },
        { id: 1702, field_name: 'Description', field_type: 'textarea', core_key: 'description' },
        // Org-added fields — this section owns them.
        { id: 3524, field_name: 'Tags / Labels', field_type: 'text' },
        { id: 2047, field_name: 'Due Date', field_type: 'date' },
      ],
    },
  ]

  function renderSection() {
    return render(
      <DynamicFieldsSection
        sections={sections}
        values={{}}
        onChange={() => {}}
        onSave={() => {}}
        saving={false}
        rules={[]}
      />
    )
  }

  it('does not render a second copy of a core field', () => {
    renderSection()
    expect(screen.queryByLabelText('Priority')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument()
  })

  it('still renders the fields the org added', () => {
    renderSection()
    // The fix must suppress core fields only — swallowing org fields would trade
    // one bug for a worse one.
    expect(screen.getByLabelText('Tags / Labels')).toBeInTheDocument()
    expect(screen.getByLabelText('Due Date')).toBeInTheDocument()
  })

  it('renders a field whose core_key is absent or empty', () => {
    render(
      <DynamicFieldsSection
        sections={[{
          section_name: 'Case Information',
          fields: [
            { id: 9001, field_name: 'Untagged Field', field_type: 'text' },
            { id: 9002, field_name: 'Empty Tag Field', field_type: 'text', core_key: '' },
          ],
        }]}
        values={{}}
        onChange={() => {}}
        onSave={() => {}}
        saving={false}
        rules={[]}
      />
    )
    expect(screen.getByLabelText('Untagged Field')).toBeInTheDocument()
    expect(screen.getByLabelText('Empty Tag Field')).toBeInTheDocument()
  })
})
