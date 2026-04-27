export default function PCTabPanel({ tabKey, data, onChange, locked, onSave, getPicklistOptions }) {
  const d = data || {}
  const set = (key, val) => onChange({ ...d, [key]: val })

  const fieldRow = (label, key, type = 'text') => (
    <div key={key} className="cf-form-field">
      <label>{label}</label>
      {type === 'textarea'
        ? <textarea rows={3} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />
        : <input type={type} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />}
    </div>
  )

  const boolField = (label, key) => (
    <label key={key} className="cf-bool-field">
      <input type="checkbox" checked={!!d[key]} disabled={locked} onChange={e => set(key, e.target.checked ? 1 : 0)} />
      {label}
    </label>
  )

  const selectRow = (label, key, sectionName, fieldName) => (
    <div key={key} className="cf-form-field">
      <label>{label}</label>
      <select value={d[key] ?? ''} disabled={locked} onChange={e => set(key, e.target.value)}>
        {getPicklistOptions(sectionName, fieldName).length > 0
          ? getPicklistOptions(sectionName, fieldName).map(o => <option key={o.value} value={o.value}>{o.label}</option>)
          : <option value=''>Loading...</option>}
      </select>
    </div>
  )

  return (
    <div className="cf-tab-panel">
      {tabKey === 'general' && (
        <div className="cf-form-grid">
          {fieldRow('Complaint Description', 'complaint_description', 'textarea')}
          {selectRow('PC Status',            'pc_status',          'PC — General', 'PC Status')}
          {selectRow('PC Category',          'pc_category',        'PC — General', 'PC Category')}
          {selectRow('PC Classification',    'pc_classification',  'PC — General', 'PC Classification')}
          {fieldRow('Date of Complaint',     'date_of_complaint', 'date')}
          {fieldRow('Date Received',         'date_received',     'date')}
          {fieldRow('Severity',              'severity')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Additional Info', 'additional_info', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'pc-flex-fields' && (
        <div>
          <h3 className="cf-subsection-title">PC Flex Fields</h3>
          <div className="cf-form-grid">
            {fieldRow('Additional Field 1', 'pc_flex_1')}
            {fieldRow('Additional Field 2', 'pc_flex_2')}
            {fieldRow('Additional Field 3', 'pc_flex_3')}
          </div>
        </div>
      )}

      {tabKey === 'patient-info' && (
        <div className="cf-form-grid">
          {fieldRow('Age',                'age',                 'number')}
          {fieldRow('Age Unit',           'age_unit')}
          {selectRow('Gender',            'sex',                 'PC — Patient Information', 'Gender')}
          {fieldRow('Weight (kg)',        'weight_kg',           'number')}
          {fieldRow('Therapy Start Date', 'therapy_start_date',  'date')}
          {fieldRow('Therapy End Date',   'therapy_end_date',    'date')}
          {fieldRow('Indication',         'indication')}
          {selectRow('Injury Experienced','injury_experienced',  'PC — Patient Information', 'Injury Experienced')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Additional Info', 'additional_info', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'product-info' && (
        <div className="cf-form-grid">
          {fieldRow('Product Name',    'product_name')}
          {fieldRow('Lot Number',      'lot_number')}
          {fieldRow('Expiry Date',     'expiry_date', 'date')}
          {boolField('Product Sample Available', 'quantity_available')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Storage Conditions', 'storage_conditions', 'textarea')}</div>
          <div className="cf-form-field cf-form-field--full">{fieldRow('Additional Info', 'additional_info', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'return-retrieval' && (
        <div className="cf-form-grid">
          {boolField('Return Requested',    'return_requested')}
          {fieldRow('Return Date',          'return_date',    'date')}
          {fieldRow('Return Method',        'return_method')}
          {boolField('Retrieval Requested', 'retrieval_requested')}
          {fieldRow('Retrieval Date',       'retrieval_date', 'date')}
          {selectRow('Retrieval Method',    'retrieval_method', 'PC — Return & Retrieval', 'Retrieval Method')}
          {fieldRow('Tracking Number',      'tracking_number')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Notes', 'notes', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'replacement' && (
        <div className="cf-form-grid">
          {boolField('Replacement Requested', 'replacement_requested')}
          {boolField('Replacement Approved',  'replacement_approved')}
          {fieldRow('Replacement Date',       'replacement_date',    'date')}
          {fieldRow('Replacement Product',    'replacement_product')}
          {fieldRow('Quantity',               'quantity',            'number')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Notes', 'notes', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'refund-credit' && (
        <div className="cf-form-grid">
          {boolField('Refund Requested',  'refund_requested')}
          {boolField('Refund Approved',   'refund_approved')}
          {fieldRow('Refund Amount',      'refund_amount',  'number')}
          {boolField('Credit Requested',  'credit_requested')}
          {boolField('Credit Approved',   'credit_approved')}
          {fieldRow('Credit Amount',      'credit_amount',  'number')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Notes', 'notes', 'textarea')}</div>
        </div>
      )}

      {!locked && (
        <div className="cf-form-actions">
          <button className="cf-save-btn" onClick={onSave}>Save</button>
        </div>
      )}
    </div>
  )
}
