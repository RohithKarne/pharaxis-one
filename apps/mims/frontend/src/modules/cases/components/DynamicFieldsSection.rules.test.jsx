import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import DynamicFieldsSection from './DynamicFieldsSection.jsx'

vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 1, role: 'admin' } }),
}))

function Harness() {
  const [values, setValues] = useState({ 1: '' })
  const sections = [
    {
      section_name: 'AE — Events & Seriousness',
      fields: [
        { id: 1, field_name: 'Outcome', field_type: 'dropdown', options: [{ value: 'Recovered', label: 'Recovered' }, { value: 'Fatal', label: 'Fatal' }] },
        { id: 2, field_name: 'Death Date', field_type: 'date' },
      ],
    },
  ]
  const rules = [
    {
      id: 1,
      field_name: 'Death Date',
      rule_type: 'visibility',
      condition_json: { field: 'Outcome', op: '=', value: 'Fatal' },
      action_json: { action: 'show' },
      is_active: true,
    },
  ]
  return <DynamicFieldsSection sections={sections} values={values} onChange={setValues} onSave={() => {}} saving={false} rules={rules} />
}

describe('DynamicFieldsSection rules runtime', () => {
  it('shows a hidden field when its visibility source changes', () => {
    render(<Harness />)
    expect(screen.queryByLabelText('Death Date')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'Fatal' } })
    expect(screen.getByLabelText('Death Date')).toBeInTheDocument()
  })

  it('filters cascading picklist values by the selected parent value', () => {
    function CascadeHarness() {
      const [values, setValues] = useState({ 10: '', 20: '' })
      const sections = [{
        section_name: 'Case Classification',
        fields: [
          {
            id: 10,
            field_name: 'Category',
            field_type: 'dropdown',
            options: [
              { id: 100, value: 'Product', label: 'Product' },
              { id: 200, value: 'Safety', label: 'Safety' },
            ],
          },
          {
            id: 20,
            field_name: 'Subcategory',
            field_type: 'dropdown',
            options: [
              { id: 201, value: 'Packaging', label: 'Packaging', parent_value_id: 100 },
              { id: 202, value: 'Adverse Event', label: 'Adverse Event', parent_value_id: 200 },
              { id: 203, value: 'General', label: 'General' },
            ],
          },
        ],
      }]
      const rules = [{
        id: 2,
        field_name: 'Subcategory',
        rule_type: 'cascade',
        condition_json: { field: 'Category', op: 'NOT_EMPTY' },
        action_json: { parent_field: 'Category', match: 'parent_value_id' },
        is_active: true,
      }]
      return <DynamicFieldsSection sections={sections} values={values} onChange={setValues} onSave={() => {}} saving={false} rules={rules} />
    }

    render(<CascadeHarness />)
    expect(screen.getByRole('option', { name: 'General' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Product' } })
    expect(screen.getByRole('option', { name: 'Packaging' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Adverse Event' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'General' })).not.toBeInTheDocument()
  })

  it('uses translated picklist labels for the current browser language', () => {
    const originalLanguage = navigator.language
    Object.defineProperty(navigator, 'language', { value: 'es-ES', configurable: true })
    const sections = [{
      section_name: 'Priority',
      fields: [{
        id: 1,
        field_name: 'Priority',
        field_type: 'dropdown',
        options: [{ value: 'Critical', label: 'Critical', translations: { es: 'Crítico' }, description: 'High risk' }],
      }],
    }]
    render(<DynamicFieldsSection sections={sections} values={{ 1: '' }} onChange={() => {}} onSave={() => {}} saving={false} rules={[]} />)
    expect(screen.getByRole('option', { name: 'Crítico' })).toBeInTheDocument()
    Object.defineProperty(navigator, 'language', { value: originalLanguage, configurable: true })
  })
})
