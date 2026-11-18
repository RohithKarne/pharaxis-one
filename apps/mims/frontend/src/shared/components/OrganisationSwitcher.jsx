import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { confirm } from '../utils/confirm'
import toast from '../utils/toast'

export default function OrganisationSwitcher() {
  const { allOrgs, orgName, orgId, switchingOrg, switchOrg } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const container = useRef(null)
  const pending = useRef(false)
  const canSwitch = allOrgs.some(org => Number(org.orgId) !== Number(orgId))

  useEffect(() => {
    function closeOutside(event) {
      if (!container.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [])

  async function select(org) {
    setOpen(false)
    if (pending.current || Number(org.orgId) === Number(orgId)) return
    pending.current = true
    try {
      if (pathname === '/mims-admin' || pathname === '/mims-admin/') {
        const discard = await confirm(
          `Switch to ${org.orgName}? Switching discards unsaved Admin edits. Cancel to stay and save first.`,
          'Switch organisation',
        )
        if (!discard) return
      }
      await switchOrg(org.orgId)
    } catch (error) {
      toast.error(error.message || 'Could not switch organisation.')
    } finally {
      pending.current = false
    }
  }

  return (
    <div className="mims-header-meta" ref={container} style={{ position: 'relative' }}
      onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
      {canSwitch ? (
        <button className="mims-org-switch-button" type="button" aria-expanded={open}
          aria-label={`Organisation: ${orgName || 'None selected'}`}
          disabled={switchingOrg} onClick={() => setOpen(value => !value)}>
          <span className="mims-meta-label">Organisation <span aria-hidden="true">▾</span></span>
          <span className="mims-meta-value">{switchingOrg ? 'Switching…' : orgName || 'Select organisation'}</span>
        </button>
      ) : (
        <>
          <span className="mims-meta-label">Organisation</span>
          <span className="mims-meta-value">{orgName || 'MIMS'}</span>
        </>
      )}
      {open && canSwitch && (
        <div className="mims-dropdown" style={{ minWidth: 180, top: '100%', right: 0 }}>
          {allOrgs.map(org => {
            const current = Number(org.orgId) === Number(orgId)
            return (
              <button type="button" key={org.orgId} className="mims-dropdown-item mims-org-option"
                aria-current={current ? 'true' : undefined} onClick={() => select(org)}>
                {current && <span aria-hidden="true">✓ </span>}{org.orgName}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
