# Vault Feature 1: Workspace Navigation Simplification

> Status: Gate 1 approved on 2026-07-15. Implementation and engineering verification are complete; awaiting Gate 2 and final sign-off.
>
> Product owner: Saad Rahman, CPO
>
> Engineering owner: Bhavya Bobba, Engineering Manager
>
> Technical sign-off: Varun Karne, CTO
>
> QA owner: Kiranmai Avuluri, Director of QA

## 1. Problem

The current shared Vault header has seven top-level sections, a second navigation row, a module-filter field, an app-launcher button with no action, and a global search scope selector whose values all submit to the same document search route.

This makes the product look broader than the verified user journey and creates misleading controls. A user should be able to understand where to find documents, complete assigned work, check governance activity, and administer Vault without learning internal module names.

## 2. Product decision

Replace the current navigation with five task-oriented destinations while preserving every existing route:

| Primary destination | Default route | Secondary destinations |
|---|---|---|
| Home | `/vault` | Workspace Home, All Content |
| Library | `/vault/search` | Upload, Search, Content Slots, Dossiers, Bulk Operations (admin) |
| Tasks | `/vault/tasks` | My Tasks, Notifications, Read & Understood, Workflow Queue (admin) |
| Governance | `/vault/expiry` | Expiry Dashboard, Reports (admin), Workflow Analytics (admin), Audit Trail (admin) |
| Administration | `/admin` | Existing admin setup, users, taxonomy, lifecycle, security, channels, integrations |

The following controls are removed from the shared header because they do not yet offer a complete user-facing outcome:

- App launcher: it has no action or cross-application destination today.
- Search scope selector: all values currently send users to document search, so the selector promises unsupported scope-specific search.
- Module filter: it filters the small visible sub-navigation rather than helping users find content or work.
- Redundant Vault module pill: the application identity is already visible in the brand area.

Global search becomes explicit document search until dedicated workflow, training, and audit search behaviour exists.

## 3. User story

As a Vault user, I want clear navigation that reflects my daily work so that I can find documents, complete my tasks, and reach governed administration functions without encountering inactive or misleading controls.

## 4. Acceptance criteria

1. The shared workspace header shows only Home, Library, Tasks, Governance, and Administration; Administration is visible only to an administrator.
2. Each primary destination opens its documented default route and shows the matching secondary navigation.
3. Every existing route listed in the product decision remains reachable through the new navigation or its existing deep link; no route, API, database table, or permission rule is removed.
4. The app launcher, module filter, Vault module pill, and multi-scope search selector are no longer rendered.
5. The shared search input is labelled and behaves as document search only. A search with text opens `/vault/search?q=<encoded query>`; an empty search opens `/vault/search`.
6. The active primary destination is correct for direct routes and deep links. A content detail or viewer route is treated as Library, not Home.
7. Existing administrator-only navigation entries remain hidden for non-administrators. This feature does not grant access to any protected route.
8. The header is keyboard operable, has usable labels, and does not overflow or hide critical controls at desktop and mobile viewport widths.
9. Login, logout, content search, task navigation, and existing deep links continue to work.

## 5. Business rules and edge cases

| Scenario | Required behaviour |
|---|---|
| Viewer or content-detail deep link | Library is active; the user stays on the requested document route. |
| Non-admin user | Administration and admin-only secondary entries are not shown. Existing backend and route guards remain the authority. |
| Author or admin | Upload remains available through Library and the existing Create menu. |
| Empty document search | Navigate to the normal document-search page without a query parameter. |
| Small viewport | Navigation can wrap or scroll intentionally, but controls cannot overlap, disappear, or force horizontal page overflow. |
| Direct URL to an admin route | Existing route guard behaviour remains unchanged. |
| Search scope not implemented | The user cannot select a scope that produces a different-looking but identical result. |

## 6. Technical scope

### `apps/vault/frontend/src/modules/common/components/WorkspaceShell.jsx`

- Replace `PRIMARY_SECTIONS` and `MODULE_GROUPS` with the approved five-destination information architecture.
- Correct the active-path mapping so `/vault/content/*` routes are classified as Library.
- Remove `moduleSearch` and `searchScope` state and the controls that use them.
- Replace the current global search form with document-search-only wording and preserve its existing route behaviour.
- Remove the inactive app-launcher markup and redundant module pill.
- Keep the existing create menu, notification shortcut, task shortcut, user context, and logout behaviour.
- Do not change route definitions in `apps/vault/frontend/src/App.jsx`, API calls, session storage, backend code, or role-guard implementation.

### `apps/vault/frontend/src/styles/global.css`

- Adjust only selectors that belong to the shared workspace header and secondary navigation.
- Remove or retire styles used exclusively by removed header controls, while retaining shared `.workspace-module-search` styles used by other pages.
- Preserve the existing Vault visual tokens and responsive patterns; do not restyle unrelated screens.

### Browser verification

- Execute the authenticated workspace-shell checks using the repository's existing Playwright CLI setup.
- Cover the approved visible destinations, document search route, deep-link active state, non-admin administration visibility, and narrow-viewport layout.

## 7. Explicitly out of scope

- New workflow, training, audit, or cross-application search APIs.
- New routes or route-permission changes.
- Cross-application launcher or single-sign-on navigation.
- Content, workflow, document-detail, database, or integration behaviour changes.
- A visual rebrand or a redesign of individual page bodies.

## 8. QA test plan

| Test area | Scenarios |
|---|---|
| Navigation | Each primary destination opens its default route; each visible secondary link opens the expected route. |
| Roles | Admin sees Administration and admin-only secondary links; non-admin does not. |
| Search | Text search opens the matching document-search URL; empty search opens the document-search page. |
| Deep links | Open a content detail/viewer URL and confirm Library is active without changing the requested route. |
| Removed controls | No app launcher, scope selector, module filter, or module pill is rendered. |
| Accessibility | Tab through header actions; confirm visible focus and descriptive controls. |
| Responsive | Verify desktop and a 390px-wide mobile viewport for non-overlap, legible labels, and reachable navigation. |
| Regression | Login, logout, Home load, content search, task navigation, and an admin route still function. |

Evidence required: browser screenshots or Playwright output for each role, search, deep-link, and responsive scenario. One negative path must confirm a non-admin cannot see Administration.

## 9. Gate 1 readiness

| Requirement | Owner | Status |
|---|---|---|
| User story, acceptance criteria, business rules | Saad | Ready |
| Technical task scope | Bhavya, reviewed by Varun | Ready for review |
| QA test plan | Kiranmai, executed later by Krishnapriya | Ready for review |
| CEO Gate 1 decision | Rohith | Approved 2026-07-15 |

## 10. Gate 1 request

```text
APPROVAL REQUEST - Gate 1
Feature: Vault Workspace Navigation Simplification
Requested by: Bala + Varun
Summary: Simplify the shared workspace into five task-oriented destinations and remove inactive or misleading header controls. No backend, database, API, route, or permission changes are included.
Details: Product requirements, technical scope, business rules, edge cases, and QA browser test plan are documented in docs/VAULT_FEATURE_01_WORKSPACE_NAVIGATION_SCOPE.md.
Action needed: Rohith's approval to begin implementation and engineering verification.
```

## 11. Implementation and engineering verification

Implemented in:

- `apps/vault/frontend/src/modules/common/components/WorkspaceShell.jsx`
- `apps/vault/frontend/src/styles/global.css`

Verification completed on 2026-07-15:

| Check | Result |
|---|---|
| Production frontend build | Passed: `npm run build` from `apps/vault` |
| Static change validation | Passed: `workspace-app-launcher`, `workspace-search-scope`, `workspace-module-pill`, `moduleSearch`, and `searchScope` have no source references; `git diff --check` passed |
| Admin primary navigation | Passed: Home, Library, Tasks, Governance, and Administration opened `/vault`, `/vault/search`, `/vault/tasks`, `/vault/expiry`, and `/admin` respectively |
| Author negative path | Passed: Administration was not rendered for the author role |
| Global document search | Passed: `approved leaflet` opened `/vault/search?q=approved%20leaflet` |
| Content-detail deep link | Passed: `/vault/content/123` retained its URL and rendered Library navigation as active |
| Mobile shared shell | Passed at a 390px viewport: document scroll width was 375px and the header width was 375px, so no horizontal page overflow occurred |

Browser verification used an authenticated synthetic local session because no seeded test organization was available. Data panels therefore returned `Organization not found`; this does not affect the verified client-side navigation, role visibility, search URL, or responsive-shell behaviour. No backend, API, database, route, or permission implementation was changed.
