import { useState, useEffect } from 'react'
import AdminMirIntPanel from './AdminMirIntPanel'
import AdminCrmIntPanel from './AdminCrmIntPanel'
import AdminContentIntPanel from './AdminContentIntPanel'
import AdminEmirIntPanel from './AdminEmirIntPanel'
import AdminCaseImportPanel from './AdminCaseImportPanel'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const INTEGRATION_SECTIONS = ['mir-int', 'crm-int', 'content-int', 'emir-int', 'case-import']
const INTEGRATION_TYPES = ['mir', 'crm', 'content', 'emir', 'case_import']

export default function AdminIntegrationSection({ contentSection, H }) {
  const [integrationConfig, setIntegrationConfig] = useState({})
  const [integrationStatus, setIntegrationStatus] = useState({})

  useEffect(() => {
    if (!INTEGRATION_SECTIONS.includes(contentSection)) return
    let cancelled = false

    ;(async () => {
      try {
        const res = await httpFetch('/api/admin/integrations/config', { headers: H })
        if (res.ok) {
          const d = await res.json()
          if (!cancelled) setIntegrationConfig(d.config || d.configs || {})
        } else {
          throw new Error('fallback')
        }
      } catch {
        try {
          const entries = await Promise.all(INTEGRATION_TYPES.map(async (type) => {
            try {
              const res = await httpFetch(`/api/admin/integrations/${type}/config`, { headers: H })
              const d = await res.json()
              return [type, d.config || {}]
            } catch { return [type, {}] }
          }))
          if (!cancelled) setIntegrationConfig(Object.fromEntries(entries))
        } catch { /* silent */ }
      }

      try {
        const res = await httpFetch('/api/admin/integrations', { headers: H })
        const d = await res.json()
        const rows = Array.isArray(d.integrations) ? d.integrations : Array.isArray(d) ? d : []
        const nextStatus = rows.reduce((acc, row) => {
          const type = row?.integration_type || row?.type || row?.key
          if (type) acc[type] = row.enabled
          return acc
        }, {})
        if (!cancelled) setIntegrationStatus(nextStatus)
      } catch { /* silent */ }
    })()

    return () => { cancelled = true }
  }, [contentSection]) // eslint-disable-line react-hooks/exhaustive-deps

  function makeSetConfig(type) {
    return (cfg) => setIntegrationConfig(prev => ({ ...prev, [type]: cfg }))
  }

  switch (contentSection) {
    case 'mir-int':
      return <AdminMirIntPanel config={integrationConfig['mir'] || {}} setConfig={makeSetConfig('mir')} status={integrationStatus['mir']} H={H} />
    case 'crm-int':
      return <AdminCrmIntPanel config={integrationConfig['crm'] || {}} setConfig={makeSetConfig('crm')} status={integrationStatus['crm']} H={H} />
    case 'content-int':
      return <AdminContentIntPanel config={integrationConfig['content'] || {}} setConfig={makeSetConfig('content')} status={integrationStatus['content']} H={H} />
    case 'emir-int':
      return <AdminEmirIntPanel config={integrationConfig['emir'] || {}} setConfig={makeSetConfig('emir')} status={integrationStatus['emir']} H={H} />
    case 'case-import':
      return <AdminCaseImportPanel H={H} />
    default:
      return null
  }
}
