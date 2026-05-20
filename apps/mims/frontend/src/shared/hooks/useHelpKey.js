/**
 * useHelpKey.js — Derives the contextual help feature_key from the current URL path.
 *
 * Returns: { featureKey, featureGroup }
 *
 * Mapping convention:
 *   /cases             → cases
 *   /cases/:id         → cases.detail
 *   /content           → cm.documents  (default tab)
 *   /content?tab=*     → cm.<tab>
 *   /browse            → browse
 *   /admin             → admin
 *   /admin?section=*   → admin.<section>
 *   /admin/platform        → admin (platform admin uses the same articles)
 *   /reports           → reports
 *   /inbox             → inbox
 *   /login             → general
 *   (catch-all)        → general
 */

import { useMemo } from 'react'

function deriveKey(pathname, search) {
  const params = new URLSearchParams(search)
  const tab     = params.get('tab')     || ''
  const section = params.get('section') || ''

  // Normalise: strip leading slash + Vite base path (/mims/, /cp-portal/, etc.),
  // then split. The first meaningful segment is the module name.
  const cleaned = pathname
    .replace(/^\//, '')
    .replace(/^(mims|cp-portal|vault|qms|safety|ai-agent)\//, '')
  const parts = cleaned.split('/').filter(Boolean)
  const base = parts[0] || ''
  const sub  = parts[1] || ''

  switch (base) {
    case 'cases':
      if (sub) return { featureKey: 'cases.detail', featureGroup: 'cases' }
      return { featureKey: 'cases', featureGroup: 'cases' }

    case 'case-query':
      return { featureKey: 'cases', featureGroup: 'cases' }

    case 'content': {
      // tab param maps to cm sub-keys
      const tabMap = {
        documents:    'cm.documents',
        modules:      'cm.modules',
        templates:    'cm.templates',
        'merge-reports': 'cm.merge_reports',
        faqs:         'cm.faqs',
        reviews:      'cm.reviews',
        folders:      'cm.folders',
      }
      const key = tabMap[tab] || 'cm.documents'
      return { featureKey: key, featureGroup: 'cm' }
    }

    case 'browse':
    case 'browse-content':
      return { featureKey: 'browse', featureGroup: 'browse' }

    case 'reports':
      return { featureKey: 'reports', featureGroup: 'reports' }

    case 'inbox':
      return { featureKey: 'inbox', featureGroup: 'inbox' }

    case 'transmissions':
      return { featureKey: 'cm.templates', featureGroup: 'cm' }

    case 'admin':
    case 'admin-console': {
      const sectionMap = {
        picklists:           'admin.picklists',
        'field-setup':       'admin.field_setup',
        workflow:            'admin.workflow',
        'product-dictionary':'admin.product_dictionary',
        'security-groups':   'admin.security_groups',
        'case-numbering':    'admin.case_numbering',
        organisations:       'admin.organisations',
        'content-intelligence': 'admin.content_intelligence',
        'policy-graph':      'admin.policy_graph',
      }
      const subSectionMap = {
        picklists:           'admin.picklists',
        'field-setup':       'admin.field_setup',
        workflow:            'admin.workflow',
        'product-dictionary':'admin.product_dictionary',
        'security-groups':   'admin.security_groups',
        'case-numbering':    'admin.case_numbering',
        organisations:       'admin.organisations',
        'content-intelligence': 'admin.content_intelligence',
        'policy-graph':      'admin.policy_graph',
      }
      // Section can come from either ?section= param or /admin-console/:section url segment
      const key = sectionMap[section] || subSectionMap[sub] || 'admin.picklists'
      return { featureKey: key, featureGroup: 'admin' }
    }

    case 'platform_admin':
    case 'mims-admin':
      return { featureKey: 'admin', featureGroup: 'admin' }

    case 'dashboard':
    case 'login':
    case '':
    default:
      return { featureKey: 'general', featureGroup: null }
  }
}

export default function useHelpKey() {
  // Read location from window — avoids needing react-router dependency here
  const pathname = window.location.pathname
  const search   = window.location.search

  return useMemo(() => deriveKey(pathname, search), [pathname, search])
}
