import AEMultiRowTab from './AEMultiRowTab'

export default function AETabPanel({ tabKey, data, onChange, locked, onSave, getPicklistOptions, getFieldConfig = () => null, versionId, headers }) {
  const d = data || {}
  const set = (key, val) => onChange({ ...d, [key]: val })

  const fieldRow = (label, key, type = 'text', sectionName = null) => {
    const displayLabel = (sectionName && getFieldConfig(sectionName, label)?.custom_label) || label
    return (
      <div key={key} className="cf-form-field">
        <label>{displayLabel}</label>
        {type === 'textarea'
          ? <textarea rows={3} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />
          : <input type={type} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />}
      </div>
    )
  }

  return (
    <div className="cf-tab-panel">
      {tabKey === 'general' && (
        <div className="cf-form-grid">
          {fieldRow('Report Type',               'report_type')}
          {fieldRow('Date of Onset',             'date_of_onset',           'date')}
          {fieldRow('Date of Report',            'date_of_report',          'date')}
          {fieldRow('Reporter Awareness Date',   'reporter_awareness_date', 'date')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Additional Info', 'additional_info', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'ae-flex-fields' && (
        <div>
          <h3 className="cf-subsection-title">AE Flex Fields</h3>
          <div className="cf-form-grid">
            {fieldRow('Additional Field 1', 'ae_flex_1')}
            {fieldRow('Additional Field 2', 'ae_flex_2')}
            {fieldRow('Additional Field 3', 'ae_flex_3')}
          </div>
        </div>
      )}

      {tabKey === 'events' && (
        <AEMultiRowTab
          tabKey="events"
          rows={Array.isArray(data) ? data : []}
          locked={locked}
          versionId={versionId}
          headers={headers}
          onRowsChange={onChange}
        />
      )}

      {tabKey === 'patient-info' && (
        <div className="cf-form-grid">
          {fieldRow('Age',                 'age',       'number')}
          {fieldRow('Age Unit',            'age_unit')}
          {fieldRow('Sex',                 'sex')}
          {fieldRow('Weight (kg)',         'weight_kg', 'number')}
          {fieldRow('Height (cm)',         'height_cm', 'number')}
          {fieldRow('Ethnicity',           'ethnicity')}
          {fieldRow('Last Menstrual Date', 'last_menstrual_date', 'date')}
          <div className="cf-form-field">
            <label>Pregnant</label>
            <select value={d.pregnant ?? ''} disabled={locked} onChange={e => set('pregnant', e.target.value === '' ? null : parseInt(e.target.value))}>
              {getPicklistOptions('AE — Patient Information', 'Pregnant').length > 0
                ? getPicklistOptions('AE — Patient Information', 'Pregnant').map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                : <option value=''>Loading...</option>}
            </select>
          </div>
          <div className="cf-form-field cf-form-field--full">{fieldRow('Additional Info', 'additional_info', 'textarea')}</div>
        </div>
      )}

      {(tabKey === 'lab-results' || tabKey === 'medical-history' || tabKey === 'product-info') && (
        <AEMultiRowTab
          tabKey={tabKey}
          rows={Array.isArray(data) ? data : []}
          locked={locked}
          versionId={versionId}
          headers={headers}
          onRowsChange={onChange}
        />
      )}

      {(tabKey === 'lab-notes' || tabKey === 'medical-notes') && (
        <div className="cf-form-field cf-form-field--full">
          <label>Notes</label>
          <textarea rows={8} value={d.notes || ''} disabled={locked} onChange={e => set('notes', e.target.value)} />
        </div>
      )}

      {!locked && !['events','lab-results','medical-history','product-info'].includes(tabKey) && (
        <div className="cf-form-actions">
          <button className="cf-save-btn" onClick={onSave}>Save</button>
        </div>
      )}
    </div>
  )
}
