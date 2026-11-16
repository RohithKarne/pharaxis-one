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
  panelField = null,
}) {
  const d = data || {}
  // Admin settings (Customize Forms) for this panel's own fields — label,
  // required, hidden — from formConfig.core; migration 109 links the rows.
  const TAB_SECTION = {
    general: 'PC — General', 'patient-info': 'PC — Patient Information', 'product-info': 'PC — Product Information',
    'return-retrieval': 'PC — Return & Retrieval', replacement: 'PC — Replacement', 'refund-credit': 'PC — Refund & Credit',
  }
  const FIELD_ALIASES = {
    'PC — Product Information::Lot Number': 'Batch / Lot Number',
    'PC — Return & Retrieval::Notes': 'Return Notes',
    'PC — Replacement::Replacement Date': 'Replacement Ship Date',
    'PC — Replacement::Quantity': 'Replacement Quantity',
    'PC — Replacement::Notes': 'Replacement Notes',
    'PC — Refund & Credit::Notes': 'Refund Notes',
  }
  const pf = (label, sectionName) => {
    const section = sectionName || TAB_SECTION[tabKey]
    if (!panelField || !section) return { label: (sectionName && getFieldConfig(sectionName, label)?.custom_label) || label, required: false, hidden: false }
    return panelField(section, FIELD_ALIASES[`${section}::${label}`] || label, label)
  }
  const labelText = (f) => (f.required ? `${f.label} *` : f.label)
  const set = (key, val) => onChange({ ...d, [key]: val })

  const fieldRow = (label, key, type = 'text', { fullWidth = false, sectionName = null } = {}) => {
    const f = pf(label, sectionName)
    if (f.hidden) return null
    return (
    <div key={key} className={`cf-form-field${fullWidth ? ' cf-form-field--full' : ''}`}>
      <label>{labelText(f)}</label>
      {type === 'textarea'
        ? <textarea rows={3} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />
        : <input type={type} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />}
    </div>
    )
  }

  // Tick-boxes follow the admin's label and hidden setting; never required.
  const boolField = (label, key) => {
    const f = pf(label)
    if (f.hidden) return null
    return (
    <label key={key} className="cf-bool-field">
      <input type="checkbox" checked={!!d[key]} disabled={locked} onChange={e => set(key, e.target.checked ? 1 : 0)} />
      {f.label}
    </label>
    )
  }

  const selectRow = (label, key, sectionName, fieldName) => {
    const f = pf(label, sectionName)
    if (f.hidden) return null
    const opts = getPicklistOptions(sectionName, fieldName)
    const hasOpts = Array.isArray(opts) && opts.length > 0
    return (
      <div key={key} className="cf-form-field">
        <label>{labelText(f)}</label>
        {hasOpts ? (
          <select value={d[key] ?? ''} disabled={locked} onChange={e => set(key, e.target.value)}>
            <option value="">— Select —</option>
            {opts.map((o, i) => (
              <option key={`${key}-${o.value ?? o.id ?? i}`} value={o.value}>{o.label || o.value}</option>
            ))}
            {/* A value an admin has since switched off stays on the record and
                must stay visible, or the box shows blank and the next save
                clears it. */}
            {d[key] && !opts.some(o => String(o.value) === String(d[key])) && (
              <option value={d[key]}>{d[key]} (no longer offered)</option>
            )}
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
          {/* MI and PC review (migration 177): the reply to the complainant
              (21 CFR 211.198(b)(1)), counterfeit or tampering, device part. */}
          {fieldRow('Reply Date',            'reply_date', 'date', { sectionName: 'PC — General' })}
          {fieldRow('Reply to Complainant',  'reply_summary', 'textarea', { fullWidth: true, sectionName: 'PC — General' })}
          {boolField('Suspected Counterfeit or Tampering', 'suspected_counterfeit')}
          {boolField('Device Part Involved', 'device_involved')}
          {/* CF-07: Patient Harm & 3-Day FDA FAR Regulatory Linkage */}
          {boolField('Potential or Actual Patient Harm Involved', 'is_patient_harm')}
          {(!!d.is_patient_harm || !!d.is_far_reportable) && (
            <div data-testid="pc-patient-harm-alert" style={{
              gridColumn: '1 / -1',
              background: '#fef2f2', border: '1px solid #ef4444', borderRadius: 8,
              padding: '12px 16px', margin: '8px 0', color: '#991b1b'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🚨</span>
                  <strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Patient Harm / 3-Day FDA Field Alert Report (FAR) Mandate
                  </strong>
                </div>
                <div data-testid="far-clock-badge" style={{
                  background: '#b91c1c', color: '#fff', padding: '4px 10px', borderRadius: 12,
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.3
                }}>
                  ⚡ 3-Day FAR Clock Active (72h SLA)
                </div>
              </div>
              <div style={{ fontSize: 12, marginTop: 6, color: '#7f1d1d', lineHeight: 1.5 }}>
                Under 21 CFR 314.81(b)(1), product defects involving actual or potential patient harm mandate notification to the FDA district office within 3 working days. Ensure a parallel Adverse Event case is split or linked.
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontSize: 12 }}>
                  <strong>FAR Due Date:</strong> {d.far_due_date ? String(d.far_due_date).slice(0, 10) : 'Calculated on Save (3 Working Days)'}
                </div>
                <div style={{ fontSize: 12 }}>
                  <strong>FAR Status:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{d.far_status || 'pending'}</span>
                </div>
              </div>
            </div>
          )}
          {boolField('FDA 3-Day Field Alert Report (FAR) Reportable', 'is_far_reportable')}
          {(!!d.is_patient_harm || !!d.is_far_reportable) && (
            <div key="far_status" className="cf-form-field">
              <label>FAR Submission Status</label>
              <select aria-label="FAR Submission Status" value={d.far_status || 'pending'} disabled={locked} onChange={e => set('far_status', e.target.value)}>
                <option value="pending">Pending QA / Regulatory Review</option>
                <option value="submitted">Submitted to FDA District Office</option>
                <option value="exempt">Exempt / Not Reportable Upon Review</option>
              </select>
            </div>
          )}
          {!!d.device_involved && (() => {
            const f = pf('Device Malfunction')
            if (f.hidden) return null
            return (
              <div key="device_malfunction" className="cf-form-field">
                <label>{labelText(f)}</label>
                <select aria-label="Device Malfunction" value={d.device_malfunction || ''} disabled={locked} onChange={e => set('device_malfunction', e.target.value)}>
                  <option value="">— Select —</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>
            )
          })()}
        </div>
      )}

      {tabKey === 'patient-info' && (
        <div className="cf-form-grid">
          {fieldRow('Patient Initials',    'patient_initials',     'text', { sectionName: 'PC — Patient Information' })}
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
          {fieldRow('Strength',        'strength', 'text', { sectionName: 'PC — Product Information' })}
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
