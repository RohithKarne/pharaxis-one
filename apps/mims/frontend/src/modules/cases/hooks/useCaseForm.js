import { useState, useEffect, useRef, useCallback } from 'react'
import toast from '../../../shared/utils/toast'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

export default function useCaseForm(id, token) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [caseData,       setCaseData]       = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [savedMsg,       setSavedMsg]       = useState('')
  const [statuses,       setStatuses]       = useState([])
  const [users,          setUsers]          = useState([])
  const [formConfig,     setFormConfig]     = useState(null)
  const [infoForm,       setInfoForm]       = useState({
    status_id: '', case_owner_id: '', priority: 'normal',
    date_received: '', description: '', internal_notes: '', intake_channel: 'manual',
    awareness_date: '', learn_of_validity_date: '', follow_up_received_date: '',
  })
  const [reassignForm,   setReassignForm]   = useState({ new_owner_id: '', reason: '' })
  const [reassignSaving, setReassignSaving] = useState(false)
  const [escalateForm,   setEscalateForm]   = useState({ reason: '' })
  const [escalateSaving, setEscalateSaving] = useState(false)
  const [dynFieldValues, setDynFieldValues] = useState({})
  const [dynFieldSaving, setDynFieldSaving] = useState(false)
  const [dynFieldErrors, setDynFieldErrors] = useState({})
  const [draftStatus, setDraftStatus] = useState('')

  const autoSaveTimer = useRef(null)
  const draftRef = useRef({ infoForm, dynFieldValues, caseType: '' })

  // WP6: clear the pending autosave timer on unmount — otherwise the 15s timer can fire
  // after the component is gone, calling saveDraft()/setState on an unmounted hook and
  // issuing a PUT for a draft the user already navigated away from.
  useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }, [])

  useEffect(() => {
    draftRef.current = { infoForm, dynFieldValues, caseType: caseData?.case_type || 'MI' }
  }, [infoForm, dynFieldValues, caseData?.case_type])

  const loadCase = useCallback(async () => {
    try {
      const [cRes, sRes, uRes] = await Promise.all([
        httpFetch(`${API}/cases/${id}`, { headers }),
        httpFetch(`${API}/admin/workflow-states`, { headers }),
        httpFetch(`${API}/users`, { headers }),
      ])
      const [c, s, u] = await Promise.all([cRes.json(), sRes.json(), uRes.json()])
      setCaseData(c)
      setInfoForm({
        status_id:      c.status_id      ? String(c.status_id)      : '',
        case_owner_id:  c.case_owner_id  ? String(c.case_owner_id)  : '',
        priority:       c.priority       || 'normal',
        date_received:  c.date_received  ? c.date_received.slice(0, 10) : '',
        awareness_date: c.awareness_date ? c.awareness_date.slice(0, 10) : '',
        learn_of_validity_date: c.learn_of_validity_date ? c.learn_of_validity_date.slice(0, 10) : '',
        follow_up_received_date: c.follow_up_received_date ? c.follow_up_received_date.slice(0, 10) : '',
        description:    c.description    || '',
        internal_notes: c.internal_notes || '',
        intake_channel: c.intake_channel || 'manual',
      })
      setStatuses(Array.isArray(s) ? s : [])
      setUsers(Array.isArray(u) ? u.filter(x => x.is_active) : [])
      setReassignForm(prev => ({ ...prev, new_owner_id: c.case_owner_id ? String(c.case_owner_id) : '' }))
      restoreDraftIfNewer(c)
    } catch (err) {
      console.error('loadCase error:', err)
    } finally {
      setLoading(false)
    }
  }, [id, token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadCase() }, [loadCase])

  useEffect(() => {
    if (!caseData?.case_type) return
    let cancelled = false
    async function loadFormConfig() {
      try {
        const res  = await httpFetch(`${API}/cases/form-config?case_type=${caseData.case_type}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!cancelled) setFormConfig(data)
      } catch (err) {
        console.error('loadFormConfig error:', err)
      }
    }
    loadFormConfig()
    return () => { cancelled = true }
  }, [caseData?.case_type, token])

  useEffect(() => {
    if (!id) return
    loadDynFields()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function restoreDraftIfNewer(loadedCase) {
    try {
      const res = await httpFetch(`${API}/cases/drafts/${id}`, { headers })
      const data = await res.json()
      if (!res.ok || !data.draft?.payload) return
      const draftTime = data.draft.updated_at ? new Date(data.draft.updated_at).getTime() : 0
      const caseTime = loadedCase.updated_at ? new Date(loadedCase.updated_at).getTime() : 0
      if (draftTime <= caseTime) return
      const payload = data.draft.payload || {}
      if (payload.infoForm) setInfoForm(prev => ({ ...prev, ...payload.infoForm }))
      if (payload.dynFieldValues) setDynFieldValues(payload.dynFieldValues)
      setDraftStatus('Draft restored')
      setTimeout(() => setDraftStatus(''), 4000)
    } catch { /* draft restore is best-effort */ }
  }

  function scheduleAutoSave() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    setDraftStatus('Draft pending')
    autoSaveTimer.current = setTimeout(() => saveDraft(), 15 * 1000)
  }

  async function saveDraft() {
    try {
      const current = draftRef.current
      const res = await httpFetch(`${API}/cases/drafts/${id || 'new'}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          case_type: current.caseType || 'MI',
          payload: {
            infoForm: current.infoForm,
            dynFieldValues: current.dynFieldValues,
          },
        }),
      })
      if (!res.ok) throw new Error('Draft save failed')
      setDraftStatus('Draft saved just now')
    } catch {
      setDraftStatus('Draft save failed')
    }
  }

  async function saveInfo(isAutoSave = false) {
    setSaving(true)
    try {
      const payload = {
        ...infoForm,
        status_id:     infoForm.status_id     ? Number(infoForm.status_id)     : null,
        case_owner_id: infoForm.case_owner_id ? Number(infoForm.case_owner_id) : null,
        expected_version_stamp: caseData?.version_stamp ?? undefined,
      }
      const res  = await httpFetch(`${API}/cases/${id}`, { method: 'PUT', headers, body: JSON.stringify(payload) })
      const data = await res.json()
      if (res.status === 409) {
        setSavedMsg('Version conflict - reload to merge latest changes')
        const conflictErr = new Error(data.error || 'Version conflict')
        conflictErr.isConflict = true  // WP6: so the catch keeps this actionable message
        throw conflictErr
      }
      if (!res.ok) {
        // The server returns field-level validation detail, but this used to be
        // collapsed into a bare "Save failed". With the wizard split across
        // steps the offending field is often on a step the user is not looking
        // at, so the field name has to reach them or the message is useless.
        const detail = Array.isArray(data.details) && data.details.length
          ? data.details.map(d => `${d.field}: ${String(d.message).replace(/"/g, '')}`).join('; ')
          : null
        const saveErr = new Error(detail || data.error || 'Save failed')
        saveErr.isValidation = !!detail
        throw saveErr
      }
      setCaseData(prev => ({ ...prev, ...data }))
      setInfoForm(prev => ({
        ...prev,
        status_id:     data.status_id     ? String(data.status_id)     : '',
        case_owner_id: data.case_owner_id ? String(data.case_owner_id) : '',
      }))
      setReassignForm(prev => ({ ...prev, new_owner_id: data.case_owner_id ? String(data.case_owner_id) : '' }))
      if (!isAutoSave && !data.case_number) {
        const nRes  = await httpFetch(`${API}/cases/${id}/assign-number`, { method: 'POST', headers })
        const nData = await nRes.json()
        if (nData.case_number) setCaseData(prev => ({ ...prev, case_number: nData.case_number }))
      }
      setSavedMsg(isAutoSave ? 'Auto-saved' : 'Saved')
      setDraftStatus('')
      httpFetch(`${API}/cases/drafts/${id}`, { method: 'DELETE', headers }).catch(() => {})
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) {
      // WP6: preserve the 409 "reload to merge" guidance instead of clobbering it with
      // the generic "Save failed" — the user needs the actionable instruction on a conflict.
      if (err?.isConflict) {
        setTimeout(() => setSavedMsg(''), 6000)
      } else if (err?.isValidation) {
        setSavedMsg(`Save failed — ${err.message}`)
        toast.error(`Save failed — ${err.message}`)
        setTimeout(() => setSavedMsg(''), 8000)
      } else {
        setSavedMsg('Save failed')
        setTimeout(() => setSavedMsg(''), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  async function reassignCase() {
    if (reassignSaving) return
    if (!reassignForm.new_owner_id) { toast.warn('Select a new owner first.'); return }
    setReassignSaving(true)
    try {
      const payload = {
        new_owner_id: Number(reassignForm.new_owner_id),
        reason: reassignForm.reason.trim() || undefined,
      }
      const res  = await httpFetch(`${API}/cases/${id}/reassign`, { method: 'POST', headers, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reassign case.')
      setCaseData(prev => ({ ...prev, ...data }))
      setInfoForm(prev => ({ ...prev, case_owner_id: data.case_owner_id ? String(data.case_owner_id) : '' }))
      setReassignForm(prev => ({ ...prev, reason: '' }))
      setSavedMsg('Case reassigned')
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) {
      toast.error(err.message || 'Failed to reassign case.')
    } finally {
      setReassignSaving(false)
    }
  }

  async function escalateCase() {
    if (escalateSaving) return
    setEscalateSaving(true)
    try {
      const payload = { reason: escalateForm.reason.trim() || undefined }
      const res  = await httpFetch(`${API}/cases/${id}/escalate`, { method: 'POST', headers, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to escalate case.')
      setEscalateForm({ reason: '' })
      setSavedMsg('Case escalated')
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) {
      toast.error(err.message || 'Failed to escalate case.')
    } finally {
      setEscalateSaving(false)
    }
  }

  async function loadDynFields() {
    try {
      const res  = await httpFetch(`${API}/cases/${id}/dynamic-fields`, { headers })
      const data = await res.json()
      if (!res.ok) return
      const map = {}
      ;(Array.isArray(data) ? data : []).forEach(f => { map[f.field_definition_id] = f.value })
      setDynFieldValues(map)
    } catch { /* no-op */ }
  }

  async function saveDynFields() {
    if (dynFieldSaving || !formConfig) return
    setDynFieldSaving(true)
    try {
      const validateRes = await httpFetch(`${API}/cases/${id}/validate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ payload: buildDynamicPayload() }),
      })
      const validateData = await validateRes.json()
      if (validateRes.ok && Array.isArray(validateData.errors) && validateData.errors.length) {
        const nextErrors = {}
        validateData.errors.forEach(err => { nextErrors[err.field] = err.message })
        setDynFieldErrors(nextErrors)
        throw new Error('Please fix validation errors before saving.')
      }
      setDynFieldErrors({})
      const fields = Object.entries(dynFieldValues).map(([field_definition_id, value]) => ({
        field_definition_id: Number(field_definition_id),
        value: String(value ?? ''),
      }))
      const res  = await httpFetch(`${API}/cases/${id}/dynamic-fields`, {
        method: 'POST', headers, body: JSON.stringify({ fields }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSavedMsg('Additional fields saved')
      setTimeout(() => setSavedMsg(''), 2200)
    } catch (err) { toast.error(err.message) }
    finally { setDynFieldSaving(false) }
  }

  function buildDynamicPayload() {
    const payload = {}
    for (const section of formConfig?.sections || []) {
      for (const field of section.fields || []) {
        payload[field.field_name] = dynFieldValues[field.id] ?? ''
      }
    }
    return payload
  }

  function getFieldConfig(sectionName, fieldName) {
    if (!formConfig || !Array.isArray(formConfig.sections)) return null
    const section = formConfig.sections.find(s => s.section_name === sectionName)
    if (!section || !Array.isArray(section.fields)) return null
    return section.fields.find(f => f.field_name === fieldName) || null
  }

  function getSectionVisible(sectionName) {
    if (!formConfig || !Array.isArray(formConfig.sections)) return true
    const section = formConfig.sections.find(s => s.section_name === sectionName)
    if (!section) return true
    return section.is_visible === 1
  }

  function getPicklistOptions(sectionName, fieldName) {
    if (!formConfig) return []
    const field = getFieldConfig(sectionName, fieldName)
    return Array.isArray(field?.options) ? field.options : []
  }

  return {
    caseData, setCaseData, loading, saving, savedMsg, setSavedMsg,
    statuses, users, formConfig,
    infoForm, setInfoForm,
    reassignForm, setReassignForm, reassignSaving,
    escalateForm, setEscalateForm, escalateSaving,
    dynFieldValues, setDynFieldValues, dynFieldSaving, dynFieldErrors,
    draftStatus,
    autoSaveTimer, loadCase, saveInfo, scheduleAutoSave, reassignCase, escalateCase,
    loadDynFields, saveDynFields,
    getFieldConfig, getSectionVisible, getPicklistOptions,
    headers,
  }
}
