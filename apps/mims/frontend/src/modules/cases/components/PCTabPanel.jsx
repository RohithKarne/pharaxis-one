/**
 * PCTabPanel — inner sub-tab of the PC component.
 *
 * Bug-fix history:
 *   B3 (2026-05-16) — retired hardcoded PC Flex Fields ("Additional Field 1/2/3").
 *     Admin-configurable now via Customize Forms; the PC Component tab renders
 *     them via DynamicFieldsSection (display_tab='pc').
 *   B4 (2026-05-16) — picklists fall back to a clear "no options" notice instead
 *     of an infinite "Loading…" option.
 *   B6 (2026-05-16) — `additional_info` / `notes` collided across sub-tabs.
 *     Each PC sub-tab now uses a per-tab key (additional_info_general /
 *     _patient / _product, notes_return / _replacement / _refund).
 *   B13 (2026-05-16) — Save button now reflects external `saving` busy flag.
 *   B17 (2026-05-16) — picklist <option>s use stable composite keys.
 */

export default function PCTabPanel({
  tabKey, data, onChange, locked, onSave, getFieldConfig = () => null, getPicklistOptions, saving = false,
}) {
  const d = data || {}
  const set = (key, val) => onChange({ ...d, [key]: val })

  const fieldRow = (label, key, type = 'text', { fullWidth = false, sectionName = null } = {}) => (
    <div key={key} className={`cf-form-field${fullWidth ? ' cf-form-field--full' : ''}`}>
      <label>{(sectionName && getFieldConfig(sectionName, label)?.custom_label) || label}</label>
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

  const selectRow = (label, key, sectionName, fieldName) => {
    const opts = getPicklistOptions(sectionName, fieldName)
    const hasOpts = Array.isArray(opts) && opts.length > 0
    return (
      <div key={key} className="cf-form-field">
        <label>{getFieldConfig(sectionName, label)?.custom_label || label}</label>
        {hasOpts ? (
          <select value={d[key] ?? ''} disabled={locked} onChange={e => set(key, e.target.value)}>
            <option value="">— Select —</option>
            {opts.map((o, i) => (
              <option key={`${key}-${o.value ?? o.id ?? i}`} value={o.value}>{o.label || o.value}</option>
            ))}
          </select>
        ) : (
          <div className="cf-picklist-empty" title="Picklist source missing — define it in Picklists Table.">
            <em>No options configured for this picklist.</em>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="cf-tab-panel">
      {tabKey === 'general' && (
        <div className="cf-form-grid">
          {fieldRow('Complaint Description', 'complaint_description', 'textarea', { fullWidth: true })}
          {selectRow('PC Status',            'pc_status',          'PC — General', 'PC Status')}
          {selectRow('PC Category',          'pc_category',        'PC — General', 'PC Category')}
          {selectRow('PC Classification',    'pc_classification',  'PC — General', 'PC Classification')}
          {fieldRow('Date of Complaint',     'date_of_complaint', 'date')}
          {fieldRow('Date Received',         'date_received',     'date')}
          {selectRow('Severity',             'severity',           'PC — General', 'Severity')}
          {fieldRow('Root Cause',            'root_cause',        'textarea', { fullWidth: true, sectionName: 'PC — General' })}
          {fieldRow('Additional Info',       'additional_info_general', 'textarea', { fullWidth: true })}
        </div>
      )}

      {tabKey === 'patient-info' && (
        <div className="cf-form-grid">
          {fieldRow('Patient Name',        'patient_name',         'text', { sectionName: 'PC — Patient Information' })}
          {fieldRow('Date of Birth',       'date_of_birth',        'date', { sectionName: 'PC — Patient Information' })}
          {fieldRow('Age',                'age',                 'number')}
          {selectRow('Age Unit',          'age_unit',            'PC — Patient Information', 'Age Unit')}
          {selectRow('Gender',            'sex',                 'PC — Patient Information', 'Gender')}
          {fieldRow('Weight (kg)',        'weight_kg',           'number')}
          {fieldRow('Therapy Start Date', 'therapy_start_date',  'date')}
          {fieldRow('Therapy End Date',   'therapy_end_date',    'date')}
          {fieldRow('Indication',         'indication')}
          {selectRow('Injury Experienced','injury_experienced',  'PC — Patient Information', 'Injury Experienced')}
          {fieldRow('Additional Info',    'additional_info_patient', 'textarea', { fullWidth: true })}
        </div>
      )}

      {tabKey === 'product-info' && (
        <div className="cf-form-grid">
          {fieldRow('Product Name',    'product_name')}
          {selectRow('Product Type',   'product_type',          'PC — Product Information', 'Product Type')}
          {selectRow('Product Category', 'product_category',    'PC — Product Information', 'Product Category')}
          {fieldRow('Lot Number',      'lot_number')}
          {fieldRow('Expiry Date',     'expiry_date', 'date')}
          {fieldRow('Manufacturing Date', 'manufacturing_date', 'date', { sectionName: 'PC — Product Information' })}
          {fieldRow('Pack Size',       'pack_size', 'text', { sectionName: 'PC — Product Information' })}
          {boolField('Product Sample Available', 'quantity_available')}
          {fieldRow('Storage Conditions', 'storage_conditions', 'textarea', { fullWidth: true })}
          {fieldRow('Additional Info',    'additional_info_product', 'textarea', { fullWidth: true })}
        </div>
      )}

      {tabKey === 'return-retrieval' && (
        <div className="cf-form-grid">
          {boolField('Return Requested',    'return_requested')}
          {fieldRow('Return Date',          'return_date',    'date')}
          {fieldRow('Return Address',       'return_address', 'textarea', { fullWidth: true, sectionName: 'PC — Return & Retrieval' })}
          {fieldRow('Return Method',        'return_method')}
          {boolField('Retrieval Requested', 'retrieval_requested')}
          {fieldRow('Retrieval Date',       'retrieval_date', 'date')}
          {selectRow('Retrieval Method',    'retrieval_method', 'PC — Return & Retrieval', 'Retrieval Method')}
          {fieldRow('Tracking Number',      'tracking_number')}
          {fieldRow('Notes',                'notes_return', 'textarea', { fullWidth: true })}
        </div>
      )}

      {tabKey === 'replacement' && (
        <div className="cf-form-grid">
          {boolField('Replacement Requested', 'replacement_requested')}
          {boolField('Replacement Approved',  'replacement_approved')}
          {fieldRow('Replacement Date',       'replacement_date',    'date')}
          {fieldRow('Replacement Product',    'replacement_product')}
          {fieldRow('Quantity',               'quantity',            'number')}
          {fieldRow('Notes',                  'notes_replacement', 'textarea', { fullWidth: true })}
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
          {fieldRow('Credit Note Number', 'credit_note_number', 'text', { sectionName: 'PC — Refund & Credit' })}
          {fieldRow('Notes',              'notes_refund', 'textarea', { fullWidth: true })}
        </div>
      )}

      {!locked && (
        <div className="cf-form-actions">
          {/* B12 — label includes scope so the operator knows exactly what saves */}
          <button className="cf-save-btn" onClick={onSave} disabled={saving}
            title="Saves only this PC sub-tab. Use Save Case in the header for case-level info.">
            {saving ? 'Saving…' : `Save ${tabKey.replace(/-/g, ' ')}`}
          </button>
        </div>
      )}
    </div>
  )
}
