import AEMultiRowTab from './AEMultiRowTab'
import MedDRACoder from '../../../shared/components/meddra/MedDRACoder'
import CausalityMatrix from '../../../shared/components/CausalityMatrix'
import CaseDrugsTab from '../../../shared/components/CaseDrugsTab'

/**
 * AETabPanel — renders the inner sub-tab of the AE component.
 *
 * Bug-fix history:
 *   B2 (2026-05-16) — the helper `fieldRow` returns its own .cf-form-field <div>;
 *     several call sites wrapped it again with .cf-form-field--full causing a
 *     div-in-div layout break. fieldRow now accepts a `fullWidth` flag and emits
 *     the modifier class itself.
 *   B6 (2026-05-16) — the `additional_info` key and `notes` key collided across
 *     several sub-tabs (general/patient-info/lab-results/lab-notes/medical-notes)
 *     causing cross-tab data clobber. Each sub-tab now uses a namespaced key:
 *     `${tabKey}__additional_info` / `${tabKey}__notes`, and the helper detects
 *     legacy un-namespaced values for backward compatibility on existing data.
 *   B4 (2026-05-16) — picklists fall back to a clear "no options" notice instead
 *     of an infinite "Loading…" option.
 *   B13 (2026-05-16) — Save button now reflects an external `saving` busy flag.
 *   B17 (2026-05-16) — picklist <option>s use a stable composite key.
 */

export default function AETabPanel({
  tabKey, data, onChange, locked, onSave, getPicklistOptions,
  getFieldConfig = () => null, versionId, headers,
  caseId,
  saving = false,
}) {
  const d = data || {}
  const set = (key, val) => onChange({ ...d, [key]: val })

  // B6 — tab-namespaced key with backward-compatible read of legacy un-namespaced value.
  const nsKey = (k) => `${tabKey}__${k}`
  const read  = (k) => d[nsKey(k)] !== undefined ? d[nsKey(k)] : (d[k] || '')
  const write = (k, v) => set(nsKey(k), v)

  const fieldRow = (label, key, type = 'text', { fullWidth = false, sectionName = null } = {}) => {
    const displayLabel = (sectionName && getFieldConfig(sectionName, label)?.custom_label) || label
    return (
      <div key={key} className={`cf-form-field${fullWidth ? ' cf-form-field--full' : ''}`}>
        <label>{displayLabel}</label>
        {type === 'textarea'
          ? <textarea rows={3} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />
          : <input type={type} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />}
      </div>
    )
  }

  const selectRow = (label, key, sectionName, fieldName = label, { fullWidth = false } = {}) => {
    const options = getPicklistOptions(sectionName, fieldName)
    return (
      <div key={key} className={`cf-form-field${fullWidth ? ' cf-form-field--full' : ''}`}>
        <label>{(sectionName && getFieldConfig(sectionName, label)?.custom_label) || label}</label>
        {Array.isArray(options) && options.length > 0 ? (
          <select value={d[key] ?? ''} disabled={locked} onChange={e => set(key, e.target.value)}>
            <option value="">— Select —</option>
            {options.map((option, index) => (
              <option key={`${key}-${option.value ?? index}`} value={option.value}>{option.label || option.value}</option>
            ))}
          </select>
        ) : (
          <div className="cf-picklist-empty"><em>No options configured for this picklist.</em></div>
        )}
      </div>
    )
  }

  // Namespaced variant (used by additional_info / notes inputs).
  const nsFieldRow = (label, baseKey, type = 'text', { fullWidth = false } = {}) => (
    <div key={baseKey} className={`cf-form-field${fullWidth ? ' cf-form-field--full' : ''}`}>
      <label>{label}</label>
      {type === 'textarea'
        ? <textarea rows={3} value={read(baseKey)} disabled={locked} onChange={e => write(baseKey, e.target.value)} />
        : <input type={type} value={read(baseKey)} disabled={locked} onChange={e => write(baseKey, e.target.value)} />}
    </div>
  )

  return (
    <div className="cf-tab-panel">
      {tabKey === 'general' && (
        <div className="cf-form-grid">
          {selectRow('AE Status',                'ae_status',                 'AE — General')}
          {fieldRow('Date of Awareness',         'date_of_awareness',         'date', { sectionName: 'AE — General' })}
          {selectRow('Report Type',              'report_type',               'AE — General')}
          {selectRow('Regulatory Reportability', 'regulatory_reportability',  'AE — General')}
          {fieldRow('Date of Onset',             'date_of_onset',           'date')}
          {fieldRow('Date of Report',            'date_of_report',          'date')}
          {fieldRow('Reporter Awareness Date',   'reporter_awareness_date', 'date')}
          {nsFieldRow('Additional Info', 'additional_info', 'textarea', { fullWidth: true })}
        </div>
      )}

      {tabKey === 'events' && (
        <AEMultiRowTab
          tabKey="events"
          rows={Array.isArray(data) ? data : []}
          locked={locked}
          versionId={versionId}
          headers={headers}
          getPicklistOptions={getPicklistOptions}
          onRowsChange={onChange}
        />
      )}

      {tabKey === 'drugs' && (
        <CaseDrugsTab caseId={caseId} headers={headers} />
      )}

      {tabKey === 'meddra-coding' && (
        <MedDRACoder caseId={caseId} headers={headers} />
      )}

      {tabKey === 'causality' && (
        <CausalityMatrix caseId={caseId} headers={headers} />
      )}

      {tabKey === 'patient-info' && (
        <div className="cf-form-grid">
          {fieldRow('Patient Initials',    'patient_initials', 'text', { sectionName: 'AE — Patient Information' })}
          {fieldRow('Date of Birth',       'date_of_birth',    'date', { sectionName: 'AE — Patient Information' })}
          {fieldRow('Age',                 'age',       'number')}
          {selectRow('Age Unit',           'age_unit',         'AE — Patient Information')}
          {selectRow('Gender',             'sex',              'AE — Patient Information')}
          {fieldRow('Weight (kg)',         'weight_kg', 'number')}
          {fieldRow('Height (cm)',         'height_cm', 'number')}
          {fieldRow('Ethnicity',           'ethnicity')}
          {fieldRow('Last Menstrual Date', 'last_menstrual_date', 'date')}
          <PicklistRow
            label="Pregnant"
            value={d.pregnant ?? ''}
            onChange={v => set('pregnant', v === '' ? null : parseInt(v))}
            options={getPicklistOptions('AE — Patient Information', 'Pregnant')}
            locked={locked}
          />
          <PicklistRow
            label="Patient Country"
            value={d.patient_country ?? ''}
            onChange={v => set('patient_country', v)}
            options={getPicklistOptions('AE — Patient Information', 'Patient Country')}
            locked={locked}
          />
          {nsFieldRow('Additional Info', 'additional_info', 'textarea', { fullWidth: true })}
        </div>
      )}

      {(tabKey === 'lab-results' || tabKey === 'medical-history' || tabKey === 'product-info') && (
        <AEMultiRowTab
          tabKey={tabKey}
          rows={Array.isArray(data) ? data : []}
          locked={locked}
          versionId={versionId}
          headers={headers}
          getPicklistOptions={getPicklistOptions}
          onRowsChange={onChange}
        />
      )}

      {(tabKey === 'lab-notes' || tabKey === 'medical-notes') && (
        <div className="cf-form-field cf-form-field--full">
          <label>Notes</label>
          <textarea rows={8} value={read('notes')} disabled={locked} onChange={e => write('notes', e.target.value)} />
        </div>
      )}

      {!locked && !['events','drugs','meddra-coding','causality','lab-results','medical-history','product-info'].includes(tabKey) && (
        <div className="cf-form-actions">
          {/* B12 — label includes scope so the operator knows exactly what saves */}
          <button className="cf-save-btn" onClick={onSave} disabled={saving}
            title="Saves only this AE sub-tab. Use Save Case in the header for case-level info.">
            {saving ? 'Saving…' : `Save ${tabKey.replace(/-/g, ' ')}`}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Small picklist <select> wrapper. B4 — surfaces a clear empty state when the
 * picklist source is missing instead of an infinite "Loading…" option.
 * B17 — every <option> uses a stable composite key.
 */
function PicklistRow({ label, value, onChange, options, locked }) {
  const opts = Array.isArray(options) ? options : []
  const hasOpts = opts.length > 0
  return (
    <div className="cf-form-field">
      <label>{label}</label>
      {hasOpts ? (
        <select value={value} disabled={locked} onChange={e => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {opts.map((o, i) => (
            <option key={`${label}-${o.value ?? o.id ?? i}`} value={o.value}>{o.label || o.value}</option>
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
