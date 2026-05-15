import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import DynamicFieldsSection from './DynamicFieldsSection.jsx'

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
})
