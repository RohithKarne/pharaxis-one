const ITEMS = [
  ['is_death', 'Death', 'Results in death.'],
  ['is_life_threatening', 'Life-threatening', 'Patient was at immediate risk of death.'],
  ['is_hospitalization', 'Hospitalization', 'Required or prolonged inpatient hospitalization.'],
  ['is_disability', 'Disability', 'Persistent or significant incapacity.'],
  ['is_congenital_anomaly', 'Congenital anomaly', 'Congenital anomaly or birth defect.'],
  ['is_required_intervention', 'Required intervention', 'Required intervention to prevent permanent impairment/damage.'],
  ['is_other_medically_important', 'Other medically important', 'Important medical event requiring judgement.'],
  ['is_lab_abnormality', 'Lab abnormality', 'Clinically significant laboratory abnormality.'],
]

export default function SeriousnessChecklist({ value = {}, onChange, disabled }) {
  const serious = ITEMS.some(([key]) => !!value[key]) || !!value.is_serious
  const set = (key, checked) => onChange?.({ ...value, [key]: checked, is_serious: checked ? true : ITEMS.some(([k]) => k !== key && !!value[k]) })
  return <div className="cf-seriousness-box">
    <div className="cf-seriousness-head"><strong>ICH E2B Seriousness Criteria</strong>{serious && <span>SERIOUS</span>}</div>
    <div className="cf-seriousness-grid">
      {ITEMS.map(([key, label, title]) => <label key={key} title={title}>
        <input type="checkbox" disabled={disabled} checked={!!value[key]} onChange={e => set(key, e.target.checked)} /> {label}
      </label>)}
    </div>
  </div>
}
