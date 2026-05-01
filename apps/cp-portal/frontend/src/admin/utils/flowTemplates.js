/**
 * flowTemplates.js
 * Defines animated sequence diagram flows for every major action
 * in the CP Portal (admin + portal sides).
 *
 * Each step:
 *   from  — index into swimlanes[]
 *   to    — index into swimlanes[]  (same as from = self-loop)
 *   label — short arrow label
 *   type  — 'solid' (request) | 'dashed' (response)
 *   detail — full explanation shown in step detail panel
 */

// ─── Swimlane actor colour map ────────────────────────────────────────────────
export const LANE_COLORS = {
  'User':          '#6B3FA0',
  'Admin':         '#6B3FA0',
  'Frontend':      '#2563EB',
  'Backend':       '#D97706',
  'Auth':          '#DC2626',
  'Database':      '#16A34A',
  'Notifications': '#0D9488',
  'Email':         '#0D9488',
  'Scheduler':     '#7C3AED',
  'External':      '#6B7280',
}

// ─── Route → template key matcher (used by live feed) ─────────────────────────
export function matchTemplate(method, path) {
  const m = method.toUpperCase()
  const p = path

  // ── Admin ──────────────────────────────────────────────────
  if (m === 'POST' && p.includes('/admin/auth'))                           return 'admin_login'
  if (m === 'POST' && p.includes('/admin/') && p.includes('/bulk'))        return 'admin_bulk_action'
  if (p.includes('/admin/news')) {
    if (m === 'POST')   return 'admin_create_news'
    if (m === 'PUT')    return 'admin_update_news'
    if (m === 'DELETE') return 'admin_delete_news'
  }
  if (p.includes('/admin/documents')) {
    if (m === 'POST')   return 'admin_upload_doc'
    if (m === 'PUT')    return 'admin_update_doc'
    if (m === 'DELETE') return 'admin_delete_doc'
  }
  if (p.includes('/admin/safety')) {
    if (m === 'POST')   return 'admin_create_safety'
    if (m === 'PUT')    return 'admin_publish_safety'
  }
  if (p.includes('/admin/users')) {
    if (m === 'POST')   return 'admin_create_user'
    if (m === 'PUT')    return 'admin_update_user'
    if (m === 'DELETE') return 'admin_delete_user'
  }
  if (p.includes('/compliance') && p.includes('reconsent'))                return 'admin_trigger_reconsent'
  if (p.includes('/admin/clients') && m === 'POST')                        return 'admin_create_client'
  if (p.includes('/admin/branding') && m === 'PUT')                        return 'admin_update_branding'
  if (p.includes('/admin/features') && m === 'PUT')                        return 'admin_update_features'
  if (p.includes('/bookings') && p.includes('/admin/'))                    return 'admin_update_booking'
  if (p.includes('/admin/faq') && m === 'POST')                            return 'admin_create_faq'
  if (p.includes('/admin/audit'))                                          return 'admin_audit_view'
  if (p.includes('/admin/msls') && m === 'POST')                           return 'admin_create_msl'
  if (p.includes('/admin/') && p.includes('/expiry-alerts'))               return 'admin_expiry_alert'

  // ── Portal ─────────────────────────────────────────────────
  if (m === 'POST' && p.includes('/portal/auth') && p.includes('/login'))    return 'portal_login'
  if (m === 'POST' && p.includes('/portal/auth') && p.includes('/register')) return 'portal_register'
  if (m === 'POST' && p.includes('/portal/auth') && p.includes('/logout'))   return 'portal_logout'
  if (p.includes('/verify-email'))                                            return 'portal_verify_email'
  if (m === 'GET'  && p.includes('/portal/documents'))                        return 'portal_fetch_docs'
  if (m === 'GET'  && p.includes('/portal/news') && !p.match(/news\/\d+/))   return 'portal_fetch_news'
  if (m === 'GET'  && p.match(/\/portal\/news\/\d+/))                        return 'portal_fetch_news_detail'
  if (m === 'POST' && p.includes('/portal/submit'))                           return 'portal_submit_inquiry'
  if (m === 'POST' && p.includes('/portal/bookings'))                         return 'portal_request_meeting'
  if (m === 'POST' && p.includes('/portal/feedback'))                         return 'portal_submit_feedback'
  if (p.includes('/portal/saved'))                                            return 'portal_save_item'
  if (m === 'GET'  && p.includes('/portal/config'))                           return 'portal_fetch_config'
  if (p.includes('/portal/consent'))                                          return 'portal_consent_accept'
  if (p.includes('/portal/notifications'))                                    return 'portal_notifications'
  if (m === 'GET'  && p.includes('/portal/faq'))                             return 'portal_fetch_faq'
  if (m === 'GET'  && p.includes('/portal/safety'))                          return 'portal_safety'
  if (p.includes('/portal/submit') && p.includes('/submissions'))            return 'portal_my_submissions'
  if (p.includes('/portal/preferences'))                                     return 'portal_preferences'
  if (p.includes('/admin/submissions'))                                      return 'admin_view_submissions'
  if (p.includes('/admin/review-queue') && (m === 'GET' || m === 'PUT'))    return 'admin_review_queue'

  return p.includes('/portal/') ? 'generic_portal' : 'generic_admin'
}

// ─── Flow template definitions ────────────────────────────────────────────────
export const FLOW_TEMPLATES = {

  // ── ADMIN: Login ───────────────────────────────────────────────────────────
  admin_login: {
    title: 'Admin Login',
    description: 'Admin enters credentials → backend validates → HTTP-only session cookie set → dashboard loads.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    files: [
      { path: 'cp-portal/frontend/src/admin/pages/LoginPage.jsx',  role: 'Login form UI' },
      { path: 'cp-portal/frontend/src/admin/context/AdminAuthContext.jsx', role: 'Auth state' },
      { path: 'cp-portal/backend/routes/admin/auth.js',            role: 'Login handler',   lines: '16-37' },
      { path: 'cp-portal/backend/middleware/auth.js',              role: 'Session verify',  lines: '21-31' },
      { path: 'cp-portal/backend/database/db.js',                  role: 'cp_admin_users',  lines: '20-46' },
    ],
    steps: [
      { from: 0, to: 1, label: 'Enter email + password, click Sign In', type: 'solid',
        file: 'cp-portal/frontend/src/admin/pages/LoginPage.jsx',
        concept: '🖥 UI Action',
        detail: 'React form captures credentials. The onClick fires, sets loading=true, and calls POST /api/admin/auth/login with JSON body.',
        whyItExists: 'The browser needs to collect your identity before sending anything to the server. The form holds the data locally until you click submit.',
        beginnerTip: 'The password field hides characters visually, but the value is still plain text in memory until it is sent over HTTPS.',
        beforeAfter: { before: 'Admin is on the login page, unauthenticated', after: 'Credentials captured in form state, request is about to be sent' },
      },
      { from: 1, to: 2, label: 'POST credentials to backend', type: 'solid',
        file: 'cp-portal/backend/routes/admin/auth.js', line: 16,
        concept: '🔐 Authentication',
        apiRoute: 'POST /api/admin/auth/login',
        requestBody: '{ email: "admin@cp.com", password: "***" }',
        detail: 'fetch() sends credentials as JSON. Rate limiter applied: max 100 req/15 min per IP to block brute-force attacks.',
        whyItExists: 'The frontend never checks passwords itself — it always delegates to the backend. This is because frontend code is visible to anyone, so it cannot be trusted to make security decisions.',
        whatCouldGoWrong: 'Network offline → fetch fails. Rate limit exceeded → 429 Too Many Requests. Server down → 500.',
        securityNote: 'Credentials travel over HTTPS only. The connection is encrypted — no one on the network can read the password.',
        beforeAfter: { before: 'No request in flight, user on login form', after: 'HTTP request sent, waiting for server response' },
        beginnerTip: 'The browser automatically adds the Content-Type: application/json header when you use JSON.stringify() in the fetch body.',
        commonMistake: 'Developers sometimes forget credentials: "include" in fetch options, which means the session cookie will not be sent on subsequent requests.',
      },
      { from: 2, to: 3, label: 'Look up admin by email in database', type: 'solid',
        file: 'cp-portal/backend/routes/admin/auth.js', line: 20,
        concept: '💾 DB Read',
        dbQuery: 'SELECT * FROM cp_admin_users WHERE email = ?',
        detail: 'Backend queries SQLite for the admin record by email. If no row found → 401 returned immediately without checking the password.',
        whyItExists: 'Before comparing passwords, we need to find the user record that stores the hashed password. No record means no user — fail fast.',
        whatCouldGoWrong: 'Email not in DB → 401. DB file locked → 500. Query returns inactive account → 401.',
        securityNote: 'The error message is always generic ("Invalid credentials") whether the email or password is wrong — this prevents attackers from knowing which one failed.',
        beforeAfter: { before: 'No DB query has run yet', after: 'Admin row found (or 401 returned if not found)' },
        beginnerTip: 'better-sqlite3 runs synchronously — unlike most Node.js DB libraries. The .get() call returns the row directly without a callback or Promise.',
      },
      { from: 3, to: 2, label: 'Admin row returned (hashed password + role)', type: 'dashed',
        concept: '💾 DB Read',
        dbQuery: 'Returns: { id, email, password (bcrypt hash), role, is_active }',
        responseBody: '{ id: 1, email: "admin@cp.com", password: "$2b$10$...", role: "superadmin", is_active: 1 }',
        detail: 'SQLite returns the admin row with bcrypt hash, role (superadmin/admin), and is_active flag. The raw hash is never sent to the frontend.',
        beginnerTip: 'The hashed password looks like "$2b$10$randomsalt...hash" — it is a one-way transformation. You cannot reverse it to get the original password.',
      },
      { from: 2, to: 2, label: 'Compare submitted password vs stored hash', type: 'solid',
        file: 'cp-portal/backend/routes/admin/auth.js', line: 23,
        concept: '⚡ Processing',
        detail: 'bcrypt.compare(plaintext, hash) is intentionally slow (10 rounds ≈ 100ms) to make brute-force attacks impractical.',
        whyItExists: 'Passwords must never be stored or compared in plain text. bcrypt hashes are one-way — you can only verify, never reverse. This protects users even if the database is stolen.',
        whatCouldGoWrong: 'Wrong password → bcrypt returns false → 401. bcrypt itself never throws on bad input.',
        securityNote: 'The "10 salt rounds" means bcrypt runs 2^10 = 1024 iterations of hashing. This makes each comparison take ~100ms, so an attacker trying 1 million passwords would need ~28 hours.',
        beginnerTip: 'bcrypt.compare() always takes the same time whether the password is right or wrong — preventing timing attacks where an attacker could guess by measuring response time.',
        commonMistake: 'Never use bcrypt.compareSync() in a high-traffic route — it blocks the entire Node.js event loop for 100ms per call.',
      },
      { from: 2, to: 1, label: 'Set session cookie + return admin info', type: 'dashed',
        file: 'cp-portal/backend/routes/admin/auth.js', line: 34,
        concept: '🔐 Authentication',
        responseBody: '{ ok: true, admin: { id, name, role } }',
        statusMeaning: '200 OK — credentials matched, session cookie set',
        detail: 'Session cookie (cp_admin_token) is set with HttpOnly and Secure flags. JS on the page cannot read it — preventing XSS token theft.',
        whyItExists: 'The session cookie is how the backend knows who you are on every future request. Without it, every API call would require re-entering your password.',
        securityNote: 'HttpOnly means JavaScript cannot access document.cookie to steal the token. Secure means the cookie is only sent over HTTPS, never plain HTTP.',
        beforeAfter: { before: 'No session exists, user is anonymous', after: 'cp_admin_token cookie set in browser, valid for the session lifetime' },
        beginnerTip: 'The browser stores and sends HTTP-only cookies automatically — your React code never needs to touch them. This is intentional for security.',
        commonMistake: 'Storing JWT tokens in localStorage instead of HTTP-only cookies exposes them to XSS attacks — any injected script can read localStorage.',
      },
      { from: 1, to: 0, label: 'Redirect to dashboard — admin signed in', type: 'dashed',
        file: 'cp-portal/frontend/src/admin/context/AdminAuthContext.jsx',
        concept: '🖥 UI Action',
        detail: 'AdminAuthContext updates admin state. React Router navigates to /admin. Dashboard loads and fetches the client list.',
        whyItExists: 'React needs to know the admin is logged in so it can show protected pages. AdminAuthContext shares this state across the entire app.',
        beforeAfter: { before: 'Admin state is null, user sees login form', after: 'Admin state has { id, name, role }, user sees the dashboard' },
        beginnerTip: 'React Context is like a global variable for your component tree. Any component can read the admin state without passing props down manually.',
      },
    ],
  },

  // ── ADMIN: Create News Post ─────────────────────────────────────────────────
  admin_create_news: {
    title: 'Create News Post',
    description: 'Admin fills the news form → Backend auth → DB insert → Audit trail written.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    files: [
      { path: 'cp-portal/frontend/src/admin/pages/NewsPage.jsx',        role: 'Create form UI' },
      { path: 'cp-portal/backend/routes/admin/news.js',                 role: 'POST handler',    lines: '62-110' },
      { path: 'cp-portal/backend/middleware/auth.js',                   role: 'authenticateAdmin', lines: '21-31' },
      { path: 'cp-portal/backend/utils/audit.js',                      role: 'Audit trail write' },
      { path: 'cp-portal/backend/utils/notify.js',                     role: 'Portal notifications' },
    ],
    steps: [
      { from: 0, to: 1, label: 'Fill title, body, category — click Save', type: 'solid',
        file: 'cp-portal/frontend/src/admin/pages/NewsPage.jsx',
        concept: '🖥 UI Action',
        detail: 'React form state builds the request body. onClick sets saving=true, then calls fetch().',
        whyItExists: 'The form keeps all your edits in React state locally. Nothing is sent to the server until you click Save — so you can type freely without triggering API calls.',
        beginnerTip: 'React controlled inputs update state on every keystroke. The actual API call only fires when the form is submitted.',
        beforeAfter: { before: 'Form fields filled, data only in browser memory', after: 'Submit triggered, request is being built' },
      },
      { from: 1, to: 2, label: 'Send new post to backend server', type: 'solid',
        file: 'cp-portal/backend/routes/admin/news.js', line: 62,
        concept: '🔄 Middleware',
        apiRoute: 'POST /api/admin/news/:clientId',
        requestBody: '{ title, body, category, tags: [], status: "draft" }',
        detail: 'Browser automatically attaches the session cookie. Body contains title, body, category, tags as JSON.',
        whyItExists: 'The frontend sends data to the backend because only the backend can safely write to the database. The frontend never writes directly to the DB.',
        whatCouldGoWrong: 'Session expired → 401. Missing required fields → 422. DB write fails → 500.',
        beginnerTip: 'fetch() with credentials: "include" tells the browser to attach cookies. Without this, the session cookie is not sent and the server rejects the request.',
        commonMistake: 'Forgetting credentials: "include" in fetch options is a very common bug — the request goes through but returns 401 because the cookie was not attached.',
      },
      { from: 2, to: 3, label: 'Check admin identity (auth middleware)', type: 'solid',
        file: 'cp-portal/backend/middleware/auth.js', line: 21,
        concept: '🔐 Authentication',
        detail: 'authenticateAdmin reads the cp_admin_token cookie, verifies the JWT signature and expiry, then sets req.admin.',
        whyItExists: 'Every write operation must be authenticated. The backend never trusts that a request is legitimate — it always verifies identity first, before touching the database.',
        whatCouldGoWrong: 'Cookie missing → 401. Token expired → 401. Token tampered → 401.',
        securityNote: 'JWT verification checks both the cryptographic signature (was it issued by us?) and the expiry time (is it still valid?). Both must pass.',
        beginnerTip: 'Middleware in Express is just a function that runs before your route handler. It can read the request, modify it, or stop it entirely by calling res.json() directly.',
      },
      { from: 3, to: 2, label: 'Identity confirmed — admin object attached', type: 'dashed',
        concept: '🔐 Authentication',
        responseBody: 'req.admin = { id: 1, name: "CP Superadmin", role: "superadmin" }',
        detail: 'If the cookie is valid, req.admin is populated. The route handler can now safely use req.admin.id for audit trail and access control.',
        beforeAfter: { before: 'req.admin is undefined', after: 'req.admin = { id, name, role } — route handler can proceed' },
      },
      { from: 2, to: 4, label: 'Save the new post to the database', type: 'solid',
        file: 'cp-portal/backend/routes/admin/news.js', line: 92,
        concept: '💾 DB Write',
        dbQuery: 'INSERT INTO cp_news_posts (client_id, title, body, category, tags_json, status, created_by) VALUES (?, ?, ?, ?, ?, "draft", ?)',
        detail: 'Inserts title, body, category, tags, status=draft, client_id, and the admin ID as created_by. Returns the new row ID.',
        whyItExists: 'The database is the single source of truth. Writing here makes the post permanent — it will survive server restarts, and all other users will see it.',
        whatCouldGoWrong: 'UNIQUE constraint violation → 500. DB file locked → 500. Missing NOT NULL field → 500.',
        securityNote: 'better-sqlite3 uses parameterised queries (?). This means user input is never concatenated into SQL strings — SQL injection is not possible.',
        beforeAfter: { before: 'No news post exists yet', after: 'New row in cp_news_posts with status="draft", id assigned' },
        beginnerTip: 'Parameterised queries (the ? placeholders) are the single most important protection against SQL injection attacks.',
        commonMistake: 'Building SQL by string concatenation like `"WHERE id = " + userId` is dangerous — a user could inject malicious SQL. Always use parameterised queries.',
      },
      { from: 4, to: 2, label: 'Database confirms insert — returns new ID', type: 'dashed',
        concept: '💾 DB Write',
        responseBody: '{ lastInsertRowid: 42 }',
        detail: 'better-sqlite3 returns the inserted row ID synchronously. Backend fetches the full new row immediately to return to the client.',
        beginnerTip: 'better-sqlite3 is synchronous — unlike most Node.js database libraries. No callbacks or Promises needed. This keeps the code simple and easier to follow.',
      },
      { from: 2, to: 4, label: 'Write audit trail entry', type: 'solid',
        file: 'cp-portal/backend/routes/admin/news.js', line: 106,
        concept: '💾 DB Write',
        dbQuery: 'INSERT INTO cp_audit_trail (admin_id, action, entity_type, entity_id, client_id, created_at) VALUES (...)',
        detail: 'audit() helper writes: who did it (admin.id), what action (CREATE_NEWS), on what entity (post ID), when (now).',
        whyItExists: 'Audit trails are a compliance requirement in pharma. Every data change must be traceable — who did it, what they changed, and when. This is required by regulations like FDA 21 CFR Part 11.',
        beginnerTip: 'Audit trails are written AFTER the main insert succeeds. If the main insert fails, the audit is never written — keeping the two in sync.',
      },
      { from: 2, to: 1, label: 'Success — return the new post', type: 'dashed',
        concept: '🖥 UI Action',
        responseBody: '{ post: { id, title, body, status: "draft", created_at } }',
        statusMeaning: '201 Created — post saved successfully, ID assigned',
        detail: 'Response includes the full new post object. Frontend appends it to the local list without re-fetching all posts.',
        beginnerTip: '201 Created is more specific than 200 OK. It signals that a new resource was created, which helps API clients know exactly what happened.',
      },
      { from: 1, to: 0, label: 'New post appears in table — draft badge', type: 'dashed',
        file: 'cp-portal/frontend/src/admin/pages/NewsPage.jsx',
        concept: '🖥 UI Action',
        detail: 'React state updates by prepending the new post. Status badge shows "draft" (grey). Admin can now click Publish to make it live.',
        whyItExists: 'Updating local state instead of re-fetching keeps the UI fast. The server already confirmed the insert, so we trust the returned object is correct.',
        beforeAfter: { before: 'News list does not include the new post', after: 'New post visible at top of table with draft status badge' },
      },
    ],
  },

  // ── ADMIN: Publish News Post ────────────────────────────────────────────────
  admin_update_news: {
    title: 'Publish / Update News Post',
    description: 'Admin changes post status → Role check → DB update → Portal users notified.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database', 'Notifications'],
    files: [
      { path: 'cp-portal/frontend/src/admin/pages/NewsPage.jsx',   role: 'Publish button + modal' },
      { path: 'cp-portal/backend/routes/admin/news.js',            role: 'PUT handler',  lines: '129-188' },
      { path: 'cp-portal/backend/middleware/auth.js',              role: 'requireClientAccess', lines: '75-103' },
      { path: 'cp-portal/backend/utils/notify.js',                 role: 'Portal notifications' },
      { path: 'cp-portal/backend/utils/audit.js',                  role: 'Audit trail write' },
    ],
    steps: [
      { from: 0, to: 1, label: 'Click Publish (status → published)', type: 'solid',
        file: 'cp-portal/frontend/src/admin/pages/NewsPage.jsx',
        concept: '🖥 UI Action',
        apiRoute: 'PUT /api/admin/news/:clientId/:postId',
        requestBody: '{ status: "published" }',
        responseBody: 'N/A — UI prepares the update request',
        statusMeaning: 'The editor is preparing to publish a post',
        dbQuery: 'N/A',
        detail: 'Status transition button triggers PUT with the new status value. Only valid transitions are allowed.',
        whyItExists: 'The frontend collects the new status and confirms the action before sending it to the server.',
        whatCouldGoWrong: 'Wrong post selected or invalid transition → 400',
        securityNote: 'Publish actions still require an authenticated admin session and client scope.',
        beforeAfter: { before: 'News post is still in draft or review', after: 'Publish request is ready from the UI' },
        beginnerTip: 'This is like clicking a submit button after choosing the final status.',
        commonMistake: 'Skipping the confirmation step can make the wrong post look published.' },
      { from: 1, to: 2, label: 'PUT /api/admin/news/:clientId/:postId', type: 'solid',
        file: 'cp-portal/backend/routes/admin/news.js', line: 129,
        concept: '🔄 Middleware',
        apiRoute: 'PUT /api/admin/news/:clientId/:postId',
        requestBody: '{ status: "published" }',
        responseBody: '{ ok: true, post: updatedPost }',
        statusMeaning: 'Request accepted and validation begins',
        dbQuery: 'SELECT status FROM cp_news_posts WHERE id=? AND client_id=?',
        detail: 'Body: { status: "published" }. The current status is read from the DB to validate the transition.',
        whyItExists: 'The backend needs the post ID and target status so it can validate the change safely.',
        whatCouldGoWrong: 'Missing cookie → 401, bad body → 422, wrong client → 403',
        securityNote: 'The session cookie and client scope are checked before the route handler writes anything.',
        beforeAfter: { before: 'Browser sent the update request', after: 'Backend is validating the post update' },
        beginnerTip: 'The browser sends the form data to the server, and the server decides what is allowed.',
        commonMistake: 'Forgetting credentials: "include" makes the request look valid but unauthenticated.' },
      { from: 2, to: 3, label: 'Check role + valid transition (NEWS_TRANSITIONS)', type: 'solid',
        file: 'cp-portal/backend/routes/admin/news.js', line: 151,
        concept: '⚡ Processing',
        apiRoute: 'PUT /api/admin/news/:clientId/:postId',
        requestBody: '{ current_status, next_status, admin_role }',
        responseBody: 'Validation result: allowed / blocked',
        statusMeaning: 'Role and state machine are checked before writing',
        dbQuery: 'SELECT status FROM cp_news_posts WHERE id=?',
        detail: 'NEWS_TRANSITIONS map checks: is "published" a valid next state? Is admin role in PUBLISH_ROLES?',
        whyItExists: 'The server must confirm that the transition is valid before it updates the record.',
        whatCouldGoWrong: 'Invalid transition → 400, wrong role → 403',
        securityNote: 'The route uses role-based access control, not just authentication.',
        beforeAfter: { before: 'Change is requested but not yet allowed', after: 'Server knows whether publish can proceed' },
        beginnerTip: 'This is like a rules checker that says whether the next move is allowed.',
        commonMistake: 'Checking only login state and forgetting to verify the role or status flow.' },
      { from: 3, to: 2, label: 'Transition allowed', type: 'dashed',
        concept: '⚡ Processing',
        apiRoute: 'PUT /api/admin/news/:clientId/:postId',
        requestBody: 'Transition rules passed',
        responseBody: '{ allowed: true }',
        statusMeaning: '400/403 only if the transition is invalid',
        dbQuery: 'N/A',
        detail: 'If invalid transition (e.g. archived → published) → 400. If wrong role → 403 Forbidden.',
        whyItExists: 'The backend returns the validation outcome so the write step can continue safely.',
        whatCouldGoWrong: 'If this step fails, the update must stop immediately.',
        securityNote: 'The route never reaches the database write if access or rules fail.',
        beforeAfter: { before: 'Server is checking business rules', after: 'Publish is allowed to continue' },
        beginnerTip: 'Think of this as the server saying “yes, you may continue.”',
        commonMistake: 'Allowing the write before the rules are checked.' },
      { from: 2, to: 4, label: 'UPDATE cp_news_posts SET status=published', type: 'solid',
        file: 'cp-portal/backend/routes/admin/news.js', line: 182,
        concept: '💾 DB Write',
        apiRoute: 'PUT /api/admin/news/:clientId/:postId',
        requestBody: '{ status: "published" }',
        responseBody: '{ changes: 1, status: "published" }',
        statusMeaning: '200 OK after the database update is committed',
        dbQuery: 'UPDATE cp_news_posts SET status=?, updated_at=? WHERE id=? AND client_id=?',
        detail: 'SQLite UPDATE sets status and updated_at. Better-sqlite3 is synchronous so no callback needed.',
        whyItExists: 'This is the actual step that changes the saved news record in the database.',
        whatCouldGoWrong: 'Locked DB, missing record, or SQL constraint issue → 500',
        securityNote: 'Parameterized queries prevent SQL injection.',
        beforeAfter: { before: 'Post exists in draft or review', after: 'Post is stored as published' },
        beginnerTip: 'This is where the database “saves the final answer.”',
        commonMistake: 'Updating the status in the UI without writing it to the database.' },
      { from: 2, to: 5, label: 'notifyPortalUsers(clientId, "news", title, id)', type: 'solid',
        file: 'cp-portal/backend/routes/admin/news.js', line: 184,
        concept: '📧 Email/Notification',
        apiRoute: 'PUT /api/admin/news/:clientId/:postId',
        requestBody: '{ client_id, title, post_id }',
        responseBody: '{ notificationsQueued: true }',
        statusMeaning: 'Portal users receive a notification entry for the published news',
        dbQuery: 'INSERT INTO cp_notifications (...) VALUES (...)',
        detail: 'notify.js queries all portal users for this client with news notifications enabled, inserts cp_notifications rows.',
        whyItExists: 'Users who subscribed to news need to be told that something new was published.',
        whatCouldGoWrong: 'No subscribers found or notification insert fails → 500',
        securityNote: 'Only opted-in users receive alerts based on stored preferences.',
        beforeAfter: { before: 'News is published but nobody has been alerted yet', after: 'Notification records are created for subscribers' },
        beginnerTip: 'It is like sending a broadcast message to the right audience.',
        commonMistake: 'Not checking notification preferences before sending alerts.' },
      { from: 2, to: 4, label: 'INSERT INTO cp_audit_trail', type: 'solid',
        file: 'cp-portal/backend/routes/admin/news.js', line: 183,
        concept: '💾 DB Write',
        apiRoute: 'PUT /api/admin/news/:clientId/:postId',
        requestBody: '{ admin_id, action: "UPDATE_NEWS", entity_id }',
        responseBody: '{ auditId: N }',
        statusMeaning: 'Audit record stored for traceability',
        dbQuery: 'INSERT INTO cp_audit_trail (...) VALUES (...)',
        detail: 'Audit entry records: admin ID, action=UPDATE, entity=news, old status → new status.',
        whyItExists: 'Compliance requires a permanent record of who changed what and when.',
        whatCouldGoWrong: 'Audit write failure → 500',
        securityNote: 'Audit logs preserve accountability even after the news row changes.',
        beforeAfter: { before: 'No audit row for this action', after: 'Audit trail records the publish event' },
        beginnerTip: 'This is the “who did it” notebook for the system.',
        commonMistake: 'Writing the audit entry before the main update succeeds.' },
      { from: 2, to: 1, label: '200 OK + updated post', type: 'dashed',
        concept: '🖥 UI Action',
        apiRoute: 'PUT /api/admin/news/:clientId/:postId',
        requestBody: 'Update completed',
        responseBody: '{ post: updatedPost }',
        statusMeaning: '200 OK — the news post was updated successfully',
        dbQuery: 'N/A',
        detail: 'Frontend receives the updated post. Status badge flips from "draft" to "published" (green).',
        whyItExists: 'The UI needs the saved post back so it can show the latest state immediately.',
        whatCouldGoWrong: 'If the response is missing, the UI may need a re-fetch.',
        securityNote: 'The response should not include sensitive internal fields.',
        beforeAfter: { before: 'Post was still showing its old badge', after: 'Published badge appears in the list' },
        beginnerTip: 'The screen changes after the server confirms the save.',
        commonMistake: 'Forcing a full page reload instead of updating the local state.' },
    ],
  },

  // ── ADMIN: Delete News Post ─────────────────────────────────────────────────
  admin_delete_news: {
    title: 'Delete News Post',
    description: 'Admin deletes a post → Backend auth → Soft-delete or hard-delete → Audit.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Click Delete → confirm dialog', type: 'solid',
        concept: '🖥 UI Action',
        apiRoute: 'DELETE /api/admin/news/:clientId/:postId',
        requestBody: 'Delete confirmation only',
        responseBody: 'N/A — UI waiting for confirmation',
        statusMeaning: 'The user has not deleted anything yet; the UI is just asking for confirmation',
        dbQuery: 'N/A',
        detail: 'A window.confirm() or modal asks "Are you sure?". Only on confirm does the DELETE fire.',
        whyItExists: 'A delete action needs a confirmation step so users do not remove data by accident.',
        whatCouldGoWrong: 'User cancels or deletes the wrong row',
        securityNote: 'The confirm dialog is only a UI safety check; actual permission checks still happen on the server.',
        beforeAfter: { before: 'Post is visible in the list', after: 'Delete confirmation is open' },
        beginnerTip: 'This is like asking “Are you sure?” before throwing something away.',
        commonMistake: 'Treating a confirmation popup as security instead of just safety.' },
      { from: 1, to: 2, label: 'DELETE /api/admin/news/:clientId/:postId', type: 'solid',
        concept: '🔄 Middleware',
        apiRoute: 'DELETE /api/admin/news/:clientId/:postId',
        requestBody: '{ postId }',
        responseBody: 'N/A — request is being processed',
        statusMeaning: 'The delete request is now on the server',
        dbQuery: 'SELECT id FROM cp_news_posts WHERE id=? AND client_id=?',
        detail: 'HTTP DELETE method. The post ID is taken from the row being deleted in the frontend table.',
        whyItExists: 'The server must receive the exact post ID to know which row should be removed.',
        whatCouldGoWrong: 'Missing session or wrong URL id → 401/404',
        securityNote: 'The backend still checks session and client scope before deleting anything.',
        beforeAfter: { before: 'UI confirmed delete', after: 'Server is handling the delete request' },
        beginnerTip: 'The browser sends the “remove this item” request to the server.',
        commonMistake: 'Assuming the selected row is enough and forgetting the server must validate it again.' },
      { from: 2, to: 3, label: 'authenticateAdmin + requireClientAccess', type: 'solid',
        concept: '🔐 Authentication',
        apiRoute: 'DELETE /api/admin/news/:clientId/:postId',
        requestBody: '{ session cookie, clientId }',
        responseBody: 'Authenticated admin context',
        statusMeaning: 'The admin is logged in and authorized for this client',
        dbQuery: 'N/A',
        detail: 'Both middleware run: cookie auth first, then verifies this admin has access to this specific clientId.',
        whyItExists: 'Deletion must be protected so only the right admin can remove client data.',
        whatCouldGoWrong: 'Expired cookie → 401, wrong client scope → 403',
        securityNote: 'Authentication happens before the route handler touches the database.',
        beforeAfter: { before: 'Request is pending server checks', after: 'Admin identity and access are confirmed' },
        beginnerTip: 'First the server checks “who are you?” then “are you allowed?”',
        commonMistake: 'Skipping the client scope check and trusting the UI.' },
      { from: 3, to: 2, label: 'Authorised', type: 'dashed',
        concept: '🔐 Authentication',
        apiRoute: 'DELETE /api/admin/news/:clientId/:postId',
        requestBody: 'Authorization check passed',
        responseBody: '{ allowed: true }',
        statusMeaning: 'Access granted for this client and action',
        dbQuery: 'N/A',
        detail: 'superadmin can access any client. Regular admins are scoped to their assigned client_id only.',
        whyItExists: 'The server returns an explicit pass/fail result before running the delete query.',
        whatCouldGoWrong: 'If scope fails, the request must stop immediately.',
        securityNote: 'Authorization is separate from login so scoped admins cannot cross client boundaries.',
        beforeAfter: { before: 'Server is checking permissions', after: 'Delete is allowed to continue' },
        beginnerTip: 'This is the server saying “you may continue.”',
        commonMistake: 'Only checking login and forgetting role or client ownership.' },
      { from: 2, to: 4, label: 'DELETE FROM cp_news_posts WHERE id=?', type: 'solid',
        concept: '💾 DB Write',
        apiRoute: 'DELETE /api/admin/news/:clientId/:postId',
        requestBody: '{ postId, clientId }',
        responseBody: '{ changes: 1 }',
        statusMeaning: 'The post row is removed from the database',
        dbQuery: 'DELETE FROM cp_news_posts WHERE id=? AND client_id=?',
        detail: 'Hard delete — row is removed. Cascades in DB will also remove related notifications.',
        whyItExists: 'This is the actual database operation that removes the news post.',
        whatCouldGoWrong: 'No matching row or DB error → 404/500',
        securityNote: 'The SQL uses parameters, not string concatenation.',
        beforeAfter: { before: 'The post still exists in the table', after: 'The post row is deleted' },
        beginnerTip: 'This is like removing the item from the storage shelf.',
        commonMistake: 'Deleting the UI row before the database confirms success.' },
      { from: 2, to: 4, label: 'INSERT INTO cp_audit_trail', type: 'solid',
        concept: '💾 DB Write',
        apiRoute: 'DELETE /api/admin/news/:clientId/:postId',
        requestBody: '{ admin_id, action: "DELETE_NEWS", entity_id }',
        responseBody: '{ auditId: N }',
        statusMeaning: 'Delete action recorded for audit purposes',
        dbQuery: 'INSERT INTO cp_audit_trail (...) VALUES (...)',
        detail: 'Audit entry preserves who deleted what even after the row is gone.',
        whyItExists: 'An audit log is needed so deleted records can still be traced later.',
        whatCouldGoWrong: 'Audit insert failure → 500',
        securityNote: 'Audit entries help with compliance and incident review.',
        beforeAfter: { before: 'No audit row for the deletion', after: 'Delete action is traceable in audit logs' },
        beginnerTip: 'Think of it as a receipt for the delete action.',
        commonMistake: 'Removing the row without keeping an audit record.' },
      { from: 2, to: 1, label: '200 OK + { ok: true }', type: 'dashed',
        concept: '🖥 UI Action',
        apiRoute: 'DELETE /api/admin/news/:clientId/:postId',
        requestBody: 'Delete succeeded',
        responseBody: '{ ok: true }',
        statusMeaning: '200 OK — the post was deleted successfully',
        dbQuery: 'N/A',
        detail: 'Frontend removes the row from local state (filter by ID). No full re-fetch needed.',
        whyItExists: 'The UI must reflect the deleted state immediately after server confirmation.',
        whatCouldGoWrong: 'If the UI ignores the response, the deleted row may still appear.',
        securityNote: 'A successful delete response should not reveal internal database details.',
        beforeAfter: { before: 'Post still appears in the table', after: 'Row disappears from the list' },
        beginnerTip: 'The screen removes the item only after the server says it is gone.',
        commonMistake: 'Assuming the delete worked without checking the response.' },
    ],
  },

  // ── ADMIN: Bulk Action ──────────────────────────────────────────────────────
  admin_bulk_action: {
    title: 'Bulk Action (Publish / Archive / Delete)',
    description: 'Admin selects multiple items → single bulk API call → DB updates in transaction → UI refreshes.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Tick checkboxes, choose action, click Apply', type: 'solid',
        concept: '🖥 UI Action',
        apiRoute: 'POST /api/admin/news/:clientId/bulk',
        requestBody: '{ ids: [1,2,3], action: "publish" }',
        responseBody: 'N/A — bulk action is being prepared in the UI',
        statusMeaning: 'The user is preparing a multi-item action',
        dbQuery: 'N/A',
        detail: 'Frontend collects selectedIds[] array from checkbox state. Bulk action bar appears when >0 selected.',
        whyItExists: 'The UI needs to gather all selected items before one bulk request can be sent.',
        whatCouldGoWrong: 'No rows selected or wrong action chosen',
        securityNote: 'The server still validates the admin session and allowed action list.',
        beforeAfter: { before: 'Items are selected in the table', after: 'Bulk action bar is ready' },
        beginnerTip: 'This is like putting several items in one basket before checkout.',
        commonMistake: 'Sending one request per item instead of one bulk request.' },
      { from: 1, to: 2, label: 'POST /api/admin/news/:clientId/bulk\n{ ids:[1,2,3], action:"publish" }', type: 'solid',
        concept: '🔄 Middleware',
        apiRoute: 'POST /api/admin/news/:clientId/bulk',
        requestBody: '{ ids: [1,2,3], action: "publish" }',
        responseBody: '{ updated: 3 }',
        statusMeaning: 'The bulk request is now on the server',
        dbQuery: 'SELECT id FROM cp_news_posts WHERE id IN (...) AND client_id=?',
        detail: 'Single request carries all IDs. More efficient than N individual requests — fewer round trips, one transaction.',
        whyItExists: 'A single bulk endpoint keeps the operation efficient and consistent.',
        whatCouldGoWrong: 'Invalid action or empty list → 400',
        securityNote: 'The backend validates the action before touching any records.',
        beforeAfter: { before: 'Selected items exist only in the UI', after: 'Server received one bulk request' },
        beginnerTip: 'One packet is better than many when the same action applies to all rows.',
        commonMistake: 'Forgetting to validate that ids[] is not empty.' },
      { from: 2, to: 3, label: 'Authenticate + validate action', type: 'solid',
        concept: '🔐 Authentication',
        apiRoute: 'POST /api/admin/news/:clientId/bulk',
        requestBody: '{ action, ids, session cookie }',
        responseBody: 'Validated bulk request',
        statusMeaning: 'The admin is authorized and the action is allowed',
        dbQuery: 'N/A',
        detail: 'Only "publish", "archive", "delete" are valid action values. Invalid action → 400 Bad Request.',
        whyItExists: 'Bulk operations must still obey the same security and business rules.',
        whatCouldGoWrong: 'Unauthorized admin or invalid action value → 401/400',
        securityNote: 'Authentication and authorization happen before the transaction starts.',
        beforeAfter: { before: 'Server has the bulk request', after: 'Bulk action rules are approved' },
        beginnerTip: 'The server is checking both your identity and the kind of action you want to do.',
        commonMistake: 'Trusting the UI to limit the action list without server validation.' },
      { from: 3, to: 2, label: 'Authorised + action valid', type: 'dashed',
        concept: '🔐 Authentication',
        apiRoute: 'POST /api/admin/news/:clientId/bulk',
        requestBody: 'Validation passed',
        responseBody: '{ allowed: true }',
        statusMeaning: 'The bulk update is allowed to proceed',
        dbQuery: 'N/A',
        detail: 'req.admin populated. Action is in the allowed list. IDs array is non-empty.',
        whyItExists: 'The route needs a clear pass signal before it can update multiple rows.',
        whatCouldGoWrong: 'If validation fails, the transaction must not start.',
        securityNote: 'Validating early prevents unnecessary database work.',
        beforeAfter: { before: 'Rules are being checked', after: 'The bulk write is allowed' },
        beginnerTip: 'This is the system saying “yes, proceed with the batch.”',
        commonMistake: 'Running updates before checking the action list.' },
      { from: 2, to: 4, label: 'UPDATE ... WHERE id IN (1,2,3)', type: 'solid',
        concept: '💾 DB Write',
        apiRoute: 'POST /api/admin/news/:clientId/bulk',
        requestBody: '{ ids: [1,2,3], action: "publish" }',
        responseBody: '{ updated: 3 }',
        statusMeaning: 'Multiple rows updated in one transaction',
        dbQuery: 'UPDATE cp_news_posts SET status=? WHERE id IN (...) AND client_id=?',
        detail: 'SQLite IN clause updates all rows at once. Better-sqlite3 runs this as a single atomic operation.',
        whyItExists: 'The database must apply the same action to every selected record.',
        whatCouldGoWrong: 'One bad row or locked DB can fail the whole batch',
        securityNote: 'Using one transaction keeps the result consistent.',
        beforeAfter: { before: 'Several rows are selected', after: 'All selected rows share the new status' },
        beginnerTip: 'It is like changing the label on many boxes at once.',
        commonMistake: 'Doing row-by-row updates and leaving the table half-changed.' },
      { from: 2, to: 4, label: 'INSERT audit rows for each affected ID', type: 'solid',
        concept: '💾 DB Write',
        apiRoute: 'POST /api/admin/news/:clientId/bulk',
        requestBody: '{ ids: [1,2,3], action: "publish" }',
        responseBody: '{ auditRows: 3 }',
        statusMeaning: 'Every affected row gets its own audit entry',
        dbQuery: 'INSERT INTO cp_audit_trail (...) VALUES (...)',
        detail: 'Loop inserts one audit trail row per affected item — full traceability of bulk operations.',
        whyItExists: 'Bulk actions still need item-by-item traceability for compliance.',
        whatCouldGoWrong: 'Audit insert fails for one item → 500',
        securityNote: 'Each item keeps its own trace record for review later.',
        beforeAfter: { before: 'No audit rows exist yet', after: 'Each changed item has a trace record' },
        beginnerTip: 'It is like writing one receipt line per item in the basket.',
        commonMistake: 'Writing only one audit row for the whole batch.' },
      { from: 2, to: 1, label: '200 OK + { updated: 3 }', type: 'dashed',
        concept: '🖥 UI Action',
        apiRoute: 'POST /api/admin/news/:clientId/bulk',
        requestBody: 'Bulk update complete',
        responseBody: '{ updated: 3 }',
        statusMeaning: '200 OK — the selected rows were updated successfully',
        dbQuery: 'N/A',
        detail: 'Response includes count of affected rows. Frontend re-fetches the full list to reflect new statuses.',
        whyItExists: 'The UI needs the final count so it can show a success message.',
        whatCouldGoWrong: 'If the count is wrong, the UI may show stale state.',
        securityNote: 'The response should only expose safe summary data.',
        beforeAfter: { before: 'Rows still show old statuses', after: 'The table refreshes with new statuses' },
        beginnerTip: 'The app tells you how many items changed, then redraws the table.',
        commonMistake: 'Refreshing too early before the server finishes the batch.' },
    ],
  },

  // ── ADMIN: Upload Document ──────────────────────────────────────────────────
  admin_upload_doc: {
    title: 'Upload Document',
    description: 'Admin uploads a file → Multer stores it → DB record created → Audit written.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Choose file + fill metadata, click Upload', type: 'solid',
        concept: '🖥 UI Action',
        apiRoute: 'POST /api/admin/documents/:clientId',
        requestBody: 'FormData(file + metadata)',
        responseBody: 'N/A — upload form is being built',
        statusMeaning: 'The admin is preparing a document upload',
        dbQuery: 'N/A',
        detail: 'Frontend builds FormData: appends the file binary + metadata fields (title, category, tags, expires_at).',
        whyItExists: 'The browser needs to package the file and its metadata together before uploading.',
        whatCouldGoWrong: 'Wrong file type or missing metadata',
        securityNote: 'File selection happens in the browser before the server validates the upload.',
        beforeAfter: { before: 'File has not been selected yet', after: 'File and metadata are ready to upload' },
        beginnerTip: 'It is like filling a parcel before sending it.',
        commonMistake: 'Trying to send file data as plain JSON instead of FormData.' },
      { from: 1, to: 2, label: 'POST /api/admin/documents/:clientId (multipart/form-data)', type: 'solid',
        concept: '🔄 Middleware',
        apiRoute: 'POST /api/admin/documents/:clientId',
        requestBody: 'multipart/form-data with file + metadata',
        responseBody: '{ id, file_url, status }',
        statusMeaning: 'The upload request has reached the server',
        dbQuery: 'SELECT client_id FROM cp_clients WHERE id=?',
        detail: 'Content-Type is multipart/form-data. The file is streamed in the request body alongside JSON metadata.',
        whyItExists: 'Multipart uploads let the browser send binary files and form fields in one request.',
        whatCouldGoWrong: 'Upload too large or malformed form body → 400/413',
        securityNote: 'The route still requires authentication before any file is stored.',
        beforeAfter: { before: 'Upload is only in the browser', after: 'Server is receiving the multipart request' },
        beginnerTip: 'This is the delivery truck that carries both the file and the form fields.',
        commonMistake: 'Forgetting multipart/form-data and breaking file parsing.' },
      { from: 2, to: 3, label: 'authenticateAdmin + requireClientAccess', type: 'solid',
        concept: '🔐 Authentication',
        apiRoute: 'POST /api/admin/documents/:clientId',
        requestBody: '{ session cookie, clientId }',
        responseBody: 'Authenticated admin context',
        statusMeaning: 'The admin is allowed to upload to this client',
        dbQuery: 'N/A',
        detail: 'Session cookie validated. Client access checked. If either fails, Multer never writes the file.',
        whyItExists: 'Upload actions must be authorized before files are stored on disk.',
        whatCouldGoWrong: 'Expired cookie → 401, wrong client scope → 403',
        securityNote: 'Authorization stops unsafe file writes early.',
        beforeAfter: { before: 'Upload request is pending checks', after: 'Admin and client scope are approved' },
        beginnerTip: 'The server first checks who you are and whether you may upload here.',
        commonMistake: 'Saving files before the permission check completes.' },
      { from: 3, to: 2, label: 'Authorised', type: 'dashed',
        concept: '🔐 Authentication',
        apiRoute: 'POST /api/admin/documents/:clientId',
        requestBody: 'Permission check passed',
        responseBody: '{ allowed: true }',
        statusMeaning: 'The upload can continue',
        dbQuery: 'N/A',
        detail: 'req.admin set. clientId access confirmed.',
        whyItExists: 'The route needs a positive access result before writing the file.',
        whatCouldGoWrong: 'If authorization fails, no file should be saved.',
        securityNote: 'This is the server gate that protects document storage.',
        beforeAfter: { before: 'Permission is under review', after: 'Upload is allowed to continue' },
        beginnerTip: 'The gate opens only after the right key is shown.',
        commonMistake: 'Assuming a valid login is enough without checking client access.' },
      { from: 2, to: 2, label: 'Multer writes file to /uploads/private/', type: 'solid',
        concept: '⚡ Processing',
        apiRoute: 'POST /api/admin/documents/:clientId',
        requestBody: 'Binary file stream',
        responseBody: 'Temporary file path created',
        statusMeaning: 'The file is being written to private storage',
        dbQuery: 'N/A',
        detail: 'Multer middleware stores the file under uploads/private/{clientId}/. File is NOT publicly accessible — only through authenticated API.',
        whyItExists: 'The server must save the uploaded file somewhere private before the record can point to it.',
        whatCouldGoWrong: 'Disk full, invalid file, or storage permission error',
        securityNote: 'The upload folder is private so the file cannot be downloaded directly by URL.',
        beforeAfter: { before: 'File is only in request memory', after: 'File exists in private upload storage' },
        beginnerTip: 'It is like placing the file in a locked cabinet.',
        commonMistake: 'Saving uploads in a public folder by default.' },
      { from: 2, to: 4, label: 'INSERT INTO cp_documents (title, file_url, status=draft)', type: 'solid',
        concept: '💾 DB Write',
        apiRoute: 'POST /api/admin/documents/:clientId',
        requestBody: '{ title, category, tags, expires_at, file_url }',
        responseBody: '{ id, title, file_url, status: "draft" }',
        statusMeaning: 'Document metadata saved as draft',
        dbQuery: 'INSERT INTO cp_documents (client_id, title, file_url, status, expires_at) VALUES (?, ?, ?, ?, ?)',
        detail: 'file_url stores the relative path. status defaults to "draft". Expiry date stored if provided.',
        whyItExists: 'The database keeps the document metadata and file reference together.',
        whatCouldGoWrong: 'Duplicate title, missing required field, or DB error → 500',
        securityNote: 'The file path is stored as a reference, not served directly.',
        beforeAfter: { before: 'No document row exists yet', after: 'A draft document row is saved' },
        beginnerTip: 'This is the catalogue card that points to the stored file.',
        commonMistake: 'Saving the file but forgetting to create the database row.' },
      { from: 2, to: 4, label: 'INSERT INTO cp_audit_trail', type: 'solid',
        concept: '💾 DB Write',
        apiRoute: 'POST /api/admin/documents/:clientId',
        requestBody: '{ admin_id, action: "UPLOAD_DOCUMENT", entity_id }',
        responseBody: '{ auditId: N }',
        statusMeaning: 'Upload action stored in audit history',
        dbQuery: 'INSERT INTO cp_audit_trail (...) VALUES (...)',
        detail: 'Audit: UPLOAD action, document ID, admin ID, timestamp.',
        whyItExists: 'Uploads must be traceable for compliance and operational review.',
        whatCouldGoWrong: 'Audit write fails → 500',
        securityNote: 'Audit logs preserve who uploaded the file even if the file later changes.',
        beforeAfter: { before: 'No audit row for the upload', after: 'Upload is traceable in history' },
        beginnerTip: 'This is the system’s paper trail for document uploads.',
        commonMistake: 'Skipping the audit write after the upload succeeds.' },
      { from: 2, to: 1, label: '201 Created + document record', type: 'dashed',
        concept: '🖥 UI Action',
        apiRoute: 'POST /api/admin/documents/:clientId',
        requestBody: 'Upload complete',
        responseBody: '{ document: savedDoc }',
        statusMeaning: '201 Created — the document was uploaded successfully',
        dbQuery: 'N/A',
        detail: 'Frontend adds the new document to the table. Download link will be gated behind the admin auth cookie.',
        whyItExists: 'The UI needs the saved record so it can show the new document immediately.',
        whatCouldGoWrong: 'If the table does not refresh, the new document may not appear right away.',
        securityNote: 'Download links should remain protected behind auth.',
        beforeAfter: { before: 'Document list does not include the new upload', after: 'New document appears in the table' },
        beginnerTip: 'The screen updates after the server confirms the upload.',
        commonMistake: 'Showing the file before the upload actually succeeds.' },
    ],
  },

  // ── ADMIN: Update Document ──────────────────────────────────────────────────
  admin_update_doc: {
    title: 'Update / Publish Document',
    description: 'Admin edits metadata or changes status → Role + transition check → DB update → Audit.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Edit metadata or click Publish', type: 'solid',
        concept: '🖥 UI Action',
        apiRoute: 'PUT /api/admin/documents/:clientId/:docId',
        requestBody: '{ title, category, tags, status }',
        responseBody: 'N/A — edit form is being prepared',
        statusMeaning: 'The admin is preparing a document update or publish action',
        dbQuery: 'N/A',
        detail: 'Admin opens edit modal or clicks a status-transition button. React state captures changes.',
        whyItExists: 'The UI must gather the updated metadata before it sends the document change.',
        whatCouldGoWrong: 'Wrong document selected or invalid form fields',
        securityNote: 'The later PUT request still requires admin auth and client scope.',
        beforeAfter: { before: 'Document is unchanged', after: 'Edited values are ready to submit' },
        beginnerTip: 'This is like changing details on a paper form before submitting it.',
        commonMistake: 'Assuming a local edit has saved the document already.' },
      { from: 1, to: 2, label: 'PUT /api/admin/documents/:clientId/:docId', type: 'solid',
        concept: '🔄 Middleware',
        apiRoute: 'PUT /api/admin/documents/:clientId/:docId',
        requestBody: '{ changed fields, status }',
        responseBody: 'N/A — server is validating the update',
        statusMeaning: 'The update request reached the server',
        dbQuery: 'SELECT status FROM cp_documents WHERE id=? AND client_id=?',
        detail: 'Body includes changed fields. Status field triggers the role + transition validation.',
        whyItExists: 'The backend needs the document ID and changed fields so it can validate and save them.',
        whatCouldGoWrong: 'Missing cookie, bad request body, or wrong client → 401/422/403',
        securityNote: 'The server checks access before any database write.',
        beforeAfter: { before: 'Edit is only in the browser', after: 'Server is validating the document update' },
        beginnerTip: 'The browser sends the edited values to the server for approval.',
        commonMistake: 'Sending the wrong status without checking the current document state.' },
      { from: 2, to: 3, label: 'Check DOC_TRANSITIONS + DOC_STATUS_ROLES', type: 'solid',
        concept: '⚡ Processing',
        apiRoute: 'PUT /api/admin/documents/:clientId/:docId',
        requestBody: '{ current_status, next_status, admin_role }',
        responseBody: 'Validation result: allowed / blocked',
        statusMeaning: 'The document state change is checked against business rules',
        dbQuery: 'SELECT status FROM cp_documents WHERE id=?',
        detail: 'DOC_TRANSITIONS map: draft→approved→published/scheduled/archived. DOC_STATUS_ROLES: only PUBLISH_ROLES can publish.',
        whyItExists: 'Document status changes must follow the allowed workflow.',
        whatCouldGoWrong: 'Invalid status jump → 400, insufficient role → 403',
        securityNote: 'This protects the publishing workflow from unauthorized changes.',
        beforeAfter: { before: 'Update is pending rule checks', after: 'Server knows whether the change is allowed' },
        beginnerTip: 'This is the rulebook that tells the system what status changes are allowed.',
        commonMistake: 'Allowing a direct publish without checking the transition path.' },
      { from: 3, to: 2, label: 'Transition allowed + role valid', type: 'dashed',
        concept: '⚡ Processing',
        apiRoute: 'PUT /api/admin/documents/:clientId/:docId',
        requestBody: 'Document transition approved',
        responseBody: '{ allowed: true }',
        statusMeaning: 'The document can be updated or published',
        dbQuery: 'N/A',
        detail: 'If admin tries to skip a step (draft→published) or lacks the role → 400/403.',
        whyItExists: 'The route needs a clear pass result before the database update.',
        whatCouldGoWrong: 'If this fails, the change must stop now.',
        securityNote: 'Permissions are enforced before the write step.',
        beforeAfter: { before: 'Server is checking document rules', after: 'Update is allowed to proceed' },
        beginnerTip: 'It is the system saying “yes, that status change is valid.”',
        commonMistake: 'Updating the row before validating the workflow.' },
      { from: 2, to: 4, label: 'UPDATE cp_documents SET ...', type: 'solid',
        concept: '💾 DB Write',
        apiRoute: 'PUT /api/admin/documents/:clientId/:docId',
        requestBody: '{ updated fields, status }',
        responseBody: '{ changes: 1, document: updatedDoc }',
        statusMeaning: '200 OK after the document row is updated',
        dbQuery: 'UPDATE cp_documents SET title=?, category=?, tags_json=?, status=?, updated_at=? WHERE id=? AND client_id=?',
        detail: 'All changed fields written. updated_at set to now(). If status=scheduled, publish_at must be in future.',
        whyItExists: 'This is the actual database write that saves the document changes.',
        whatCouldGoWrong: 'Locked DB, invalid data, or constraint failure → 500',
        securityNote: 'The update uses parameters to keep the SQL safe.',
        beforeAfter: { before: 'Old document values are still stored', after: 'The edited document is saved' },
        beginnerTip: 'This is the storage shelf getting the new label and details.',
        commonMistake: 'Updating the UI badge before the save is confirmed.' },
      { from: 2, to: 4, label: 'INSERT INTO cp_audit_trail', type: 'solid',
        concept: '💾 DB Write',
        apiRoute: 'PUT /api/admin/documents/:clientId/:docId',
        requestBody: '{ admin_id, action: "UPDATE_DOCUMENT", entity_id }',
        responseBody: '{ auditId: N }',
        statusMeaning: 'Audit entry stored for the document change',
        dbQuery: 'INSERT INTO cp_audit_trail (...) VALUES (...)',
        detail: 'Captures old_status → new_status transition with timestamp.',
        whyItExists: 'Document edits must remain traceable for compliance.',
        whatCouldGoWrong: 'Audit insert fails → 500',
        securityNote: 'The audit log acts as a permanent change record.',
        beforeAfter: { before: 'No audit row for this edit', after: 'The update is recorded in history' },
        beginnerTip: 'This is the receipt that records the document change.',
        commonMistake: 'Saving the document without keeping a history entry.' },
      { from: 2, to: 1, label: '200 OK + updated doc', type: 'dashed',
        concept: '🖥 UI Action',
        apiRoute: 'PUT /api/admin/documents/:clientId/:docId',
        requestBody: 'Update complete',
        responseBody: '{ document: updatedDoc }',
        statusMeaning: '200 OK — the document was updated successfully',
        dbQuery: 'N/A',
        detail: 'Frontend updates the row in the table. Status badge and action buttons re-render based on new status.',
        whyItExists: 'The UI should show the saved document state immediately.',
        whatCouldGoWrong: 'If the UI does not re-render, the old status may remain visible.',
        securityNote: 'The response should only contain safe document fields.',
        beforeAfter: { before: 'Document shows the old version', after: 'The row updates to the latest saved version' },
        beginnerTip: 'The screen redraws after the server confirms the save.',
        commonMistake: 'Forgetting to refresh the local row after a successful save.' },
    ],
  },

  // ── ADMIN: Create Portal User ───────────────────────────────────────────────
  admin_create_user: {
    title: 'Create Portal User',
    description: 'Admin invites a new HCP/user → Password hashed → DB insert → Welcome email sent.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database', 'Email'],
    steps: [
      { from: 0, to: 1, label: 'Fill user form (name, email, role), click Create', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'Admin fills out the new user form in PortalUsersPage. Temporary password may be auto-generated.' },
      { from: 1, to: 2, label: 'POST /api/admin/users/:clientId', type: 'solid',
        concept: '🔄 Middleware',
        detail: 'Body: { name, email, password, user_type }. Sent with admin session cookie for auth.' },
      { from: 2, to: 3, label: 'Authenticate + check email uniqueness', type: 'solid',
        concept: '🔐 Authentication',
        detail: 'Admin auth validated. Then checks cp_portal_users for duplicate email under same client.' },
      { from: 3, to: 2, label: 'Email is unique', type: 'dashed',
        concept: '💾 DB Read',
        detail: 'If email already exists for this client → 409 Conflict. The existing user is not overwritten.' },
      { from: 2, to: 2, label: 'bcrypt.hash(password, 10)', type: 'solid',
        concept: '⚡ Processing',
        detail: 'Plain-text password hashed before storage. The original password is never stored or logged anywhere.' },
      { from: 2, to: 4, label: 'INSERT INTO cp_portal_users', type: 'solid',
        concept: '💾 DB Write',
        detail: 'Stores hashed password, email_verified=1 (admin-created users skip verification), user_type, client_id.' },
      { from: 2, to: 5, label: 'Send welcome email (if SMTP configured)', type: 'solid',
        concept: '📧 Email/Notification',
        detail: 'nodemailer sends the welcome email using the client\'s configured SMTP settings from cp_email_config.' },
      { from: 2, to: 1, label: '201 Created + user record', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'Password field is stripped from the response. Frontend appends user to the table.' },
    ],
  },

  // ── ADMIN: Delete Portal User ───────────────────────────────────────────────
  admin_delete_user: {
    title: 'Delete Portal User',
    description: 'Admin removes a user → Auth check → DB cascade delete → All their data removed.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Click Delete user → confirm', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'Confirmation dialog shown. User ID taken from the table row.' },
      { from: 1, to: 2, label: 'DELETE /api/admin/users/:clientId/:userId', type: 'solid',
        concept: '🔄 Middleware',
        detail: 'HTTP DELETE with userId in path.' },
      { from: 2, to: 3, label: 'Authenticate + verify client scope', type: 'solid',
        concept: '🔐 Authentication',
        detail: 'Admin must have access to this client. superadmin can delete any user. Regular admin only their client.' },
      { from: 3, to: 2, label: 'Authorised', type: 'dashed',
        concept: '🔐 Authentication',
        detail: 'req.admin.client_id checked against the target clientId.' },
      { from: 2, to: 4, label: 'DELETE FROM cp_portal_users WHERE id=?', type: 'solid',
        concept: '💾 DB Write',
        detail: 'FK ON DELETE CASCADE: submissions, consent records, notifications, bookings, saved items all auto-deleted.' },
      { from: 2, to: 1, label: '200 OK + { ok: true }', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'Frontend removes user from local state. All their portal data is gone.' },
    ],
  },

  // ── ADMIN: Trigger Re-consent ────────────────────────────────────────────────
  admin_trigger_reconsent: {
    title: 'Trigger Re-consent',
    description: 'Admin bumps consent version → All portal users hit the consent gate on next visit.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Click "Trigger Re-consent" on Compliance page', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'Admin has updated privacy policy or terms. This forces all users to re-accept before continuing.' },
      { from: 1, to: 2, label: 'POST /api/admin/compliance/:clientId/trigger-reconsent', type: 'solid',
        concept: '🔄 Middleware',
        detail: 'No body needed. The backend handles version bumping logic internally.' },
      { from: 2, to: 3, label: 'SELECT version FROM cp_compliance_config WHERE client_id=?', type: 'solid',
        concept: '💾 DB Read',
        detail: 'Backend reads the current version string (e.g. "1.0") to calculate the new bumped version.' },
      { from: 3, to: 2, label: 'Current version = "1.0"', type: 'dashed',
        concept: '💾 DB Read',
        detail: 'Version format: "MAJOR.MINOR". Trigger bumps MINOR: 1.0 → 1.1 → 1.2 etc.' },
      { from: 2, to: 3, label: 'UPDATE SET version="1.1", require_reconsent=1', type: 'solid',
        concept: '💾 DB Write',
        detail: 'require_reconsent=1 is the gate flag. ConsentBanner checks this on every portal load.' },
      { from: 2, to: 1, label: '200 OK + { version: "1.1" }', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'Admin sees confirmation. Next time any portal user opens the portal, the consent banner intercepts navigation.' },
    ],
  },

  // ── ADMIN: Update Branding ───────────────────────────────────────────────────
  admin_update_branding: {
    title: 'Update Portal Branding',
    description: 'Admin uploads new logo or changes colours → Stored in DB → Portal immediately reflects changes.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Change logo URL / primary colour, click Save', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'BrandingPage holds a form with logo_url, primary_color, portal_name, favicon_url etc.' },
      { from: 1, to: 2, label: 'PUT /api/admin/branding/:clientId', type: 'solid',
        concept: '🔄 Middleware',
        detail: 'Body: all branding fields. Backend does an upsert — creates or updates the row for this client.' },
      { from: 2, to: 3, label: 'UPSERT INTO cp_branding', type: 'solid',
        concept: '💾 DB Write',
        detail: 'SQLite INSERT OR REPLACE ensures there is exactly one branding row per client.' },
      { from: 3, to: 2, label: 'Branding saved', type: 'dashed',
        concept: '💾 DB Write',
        detail: 'Row written with all colour/logo/text values.' },
      { from: 2, to: 1, label: '200 OK + { branding: {...} }', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'Admin console sidebar immediately shows the new client logo. Portal config endpoint will serve new values on next load.' },
    ],
  },

  // ── ADMIN: Update Features ───────────────────────────────────────────────────
  admin_update_features: {
    title: 'Toggle Portal Feature',
    description: 'Admin enables/disables a portal section → DB flag updated → Feature guard activates immediately.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Toggle switch on Features page', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'FeaturesPage renders one toggle per feature key. Toggle fires PUT with { is_enabled: true/false }.' },
      { from: 1, to: 2, label: 'PUT /api/admin/features/:clientId', type: 'solid',
        concept: '🔄 Middleware',
        detail: 'Body: { feature_key, is_enabled }. Feature key must match a known value (news_announcements, find_msl etc.).' },
      { from: 2, to: 3, label: 'UPSERT INTO cp_features', type: 'solid',
        concept: '💾 DB Write',
        detail: 'INSERT OR REPLACE ensures unique (client_id, feature_key). Sets is_enabled value.' },
      { from: 3, to: 2, label: 'Feature updated', type: 'dashed',
        concept: '💾 DB Write',
        detail: 'Row written. The feature state is now persisted in the database.' },
      { from: 2, to: 1, label: '200 OK', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'Portal config endpoint (/api/portal/config) returns features map. FeatureGuard reads it and blocks the route if disabled.' },
    ],
  },

  // ── ADMIN: Create Client ─────────────────────────────────────────────────────
  admin_create_client: {
    title: 'Create New Client',
    description: 'Admin creates a new pharma client → DB insert → Default features + branding seeded.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Fill client name, code, contact — click Create', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'ClientsPage form. The "code" field is the URL slug (e.g. "pfizer") used in portal URLs: /portal/pfizer.' },
      { from: 1, to: 2, label: 'POST /api/admin/clients', type: 'solid',
        concept: '🔄 Middleware',
        detail: 'Body: { name, code, description, contact_name, contact_email }. Code must be unique.' },
      { from: 2, to: 3, label: 'INSERT INTO cp_clients', type: 'solid',
        concept: '💾 DB Write',
        detail: 'Inserts the client row. UNIQUE constraint on code — duplicate codes return 409 Conflict.' },
      { from: 3, to: 2, label: 'New client id returned', type: 'dashed',
        concept: '💾 DB Write',
        detail: 'lastInsertRowid is used to seed default data.' },
      { from: 2, to: 3, label: 'Seed default branding, features, gate config', type: 'solid',
        concept: '💾 DB Write',
        detail: 'Backend inserts default rows: cp_branding (blank), cp_features (all enabled by default), cp_gate (open). Client is ready to configure.' },
      { from: 2, to: 1, label: '201 Created + client record', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'Frontend navigates to the new client detail page. Admin can start configuring branding, content, users.' },
    ],
  },

  // ── ADMIN: Create MSL ───────────────────────────────────────────────────────
  admin_create_msl: {
    title: 'Add MSL to Directory',
    description: 'Admin adds a new Medical Science Liaison → DB insert → Appears on portal Find MSL page.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Fill MSL form (name, title, territory, email, photo)', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'MSLPage modal form. Photo URL is optional — defaults to initials avatar if not provided.' },
      { from: 1, to: 2, label: 'POST /api/admin/msls/:clientId', type: 'solid',
        concept: '🔄 Middleware',
        detail: 'Body: MSL data fields. Sent with admin session cookie.' },
      { from: 2, to: 3, label: 'INSERT INTO cp_msls', type: 'solid',
        concept: '💾 DB Write',
        detail: 'Stores MSL record linked to client_id. is_active=1 by default — MSL is immediately visible on portal.' },
      { from: 3, to: 2, label: 'New MSL row + id', type: 'dashed',
        concept: '💾 DB Write',
        detail: 'Returns inserted row ID.' },
      { from: 2, to: 1, label: '201 Created + msl record', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'Frontend appends MSL to the directory table. Portal Find MSL page will show them on next visit.' },
    ],
  },

  // ── ADMIN: Update MSL Booking ───────────────────────────────────────────────
  admin_update_booking: {
    title: 'Update Meeting Request (Booking)',
    description: 'Admin accepts/declines/completes an MSL meeting request → Status updated → Notes saved.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Open booking row → change status + add notes', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'MSLPage "Meeting Requests" tab. Update modal shows status dropdown + notes textarea.' },
      { from: 1, to: 2, label: 'PUT /api/admin/msls/:clientId/bookings/:bookingId', type: 'solid',
        concept: '🔄 Middleware',
        detail: 'Body: { status, admin_notes }. Valid statuses: pending, confirmed, completed, cancelled.' },
      { from: 2, to: 3, label: 'UPDATE cp_msl_bookings SET status=?, admin_notes=?', type: 'solid',
        concept: '💾 DB Write',
        detail: 'updated_at set to now(). Status badge and notes will be visible if portal user checks their bookings.' },
      { from: 3, to: 2, label: 'Updated', type: 'dashed',
        concept: '💾 DB Write',
        detail: 'SQLite confirms the update.' },
      { from: 2, to: 1, label: '200 OK + updated booking', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'Frontend updates the booking row in the table. Status badge re-renders.' },
    ],
  },

  // ── ADMIN: Create Safety Alert ──────────────────────────────────────────────
  admin_create_safety: {
    title: 'Create Safety Alert',
    description: 'Admin publishes a safety alert → Stored in DB → Shown on portal Safety page.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Fill alert title, severity, body — click Save', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'SafetyPage form. Severity is one of: critical, warning, info. Body is rich text.' },
      { from: 1, to: 2, label: 'POST /api/admin/safety/:clientId', type: 'solid',
        concept: '🔄 Middleware',
        detail: 'Body: { title, severity, body, is_published }. is_published=true makes it immediately visible.' },
      { from: 2, to: 3, label: 'INSERT INTO cp_safety_alerts', type: 'solid',
        concept: '💾 DB Write',
        detail: 'Stores alert with severity, client_id, is_published flag, created_at.' },
      { from: 3, to: 2, label: 'New alert row', type: 'dashed',
        concept: '💾 DB Write',
        detail: 'Returns inserted row.' },
      { from: 2, to: 1, label: '201 Created + alert record', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'Portal Safety page queries cp_safety_alerts WHERE is_published=1. Alert is live immediately.' },
    ],
  },

  // ── ADMIN: Create FAQ ────────────────────────────────────────────────────────
  admin_create_faq: {
    title: 'Create FAQ Item',
    description: 'Admin adds a Q&A item → DB insert → Appears in portal FAQ accordion.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Fill question, answer, category — click Save', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'FAQPage admin modal. Category groups items in the accordion. Sort order controls display order.' },
      { from: 1, to: 2, label: 'POST /api/admin/faq/:clientId', type: 'solid',
        concept: '🔄 Middleware',
        detail: 'Body: { question, answer, category, sort_order, is_published }.' },
      { from: 2, to: 3, label: 'INSERT INTO cp_faq_items', type: 'solid',
        concept: '💾 DB Write',
        detail: 'Stored with client_id. is_published=1 shows it on portal immediately.' },
      { from: 3, to: 2, label: 'New FAQ item', type: 'dashed',
        concept: '💾 DB Write',
        detail: 'Returns inserted row.' },
      { from: 2, to: 1, label: '201 Created + faq item', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'Frontend adds item to admin list. Portal FAQ page will group it under its category.' },
    ],
  },

  // ── ADMIN: View Audit Trail ──────────────────────────────────────────────────
  admin_audit_view: {
    title: 'View Audit Trail',
    description: 'Admin opens Audit Trail page → Backend queries log → Paginated activity returned.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Navigate to Audit Trail, apply filters', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'AuditTrailPage renders with optional filters: entity type, date range, admin name.' },
      { from: 1, to: 2, label: 'GET /api/admin/audit/:clientId?limit=50&offset=0', type: 'solid',
        concept: '🔄 Middleware',
        detail: 'Query params include filters. Backend builds a WHERE clause dynamically.' },
      { from: 2, to: 3, label: 'SELECT from cp_audit_trail JOIN cp_admin_users', type: 'solid',
        concept: '💾 DB Read',
        detail: 'JOINs the admin table to get names. Orders by created_at DESC. Applies LIMIT/OFFSET for pagination.' },
      { from: 3, to: 2, label: 'Paginated audit rows', type: 'dashed',
        concept: '💾 DB Read',
        detail: 'Returns array of audit entries with: admin name, action, entity, entity_id, timestamp, diff_json.' },
      { from: 2, to: 1, label: '200 OK + { logs: [...], total }', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'Frontend renders paginated table. Each row shows: who, what action, which entity, when.' },
    ],
  },

  // ── ADMIN: Document Expiry Alert ────────────────────────────────────────────
  admin_expiry_alert: {
    title: 'Send Document Expiry Alerts',
    description: 'Admin triggers expiry email → Backend finds expiring docs → Email sent to client admins.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database', 'Email'],
    steps: [
      { from: 0, to: 1, label: 'Click "Send Expiry Alerts"', type: 'solid',
        detail: 'Documents page shows docs expiring within 30 days. Admin clicks to email all client admins.' },
      { from: 1, to: 2, label: 'POST /api/admin/documents/:clientId/expiry-alerts/send', type: 'solid',
        detail: 'Backend will query expiring docs and find admin email addresses for this client.' },
      { from: 2, to: 3, label: 'SELECT docs WHERE expires_at <= DATE(now, +30 days)', type: 'solid',
        detail: 'Finds all documents expiring within 30 days for this client.' },
      { from: 3, to: 2, label: 'Expiring document list', type: 'dashed',
        detail: 'Returns title, expires_at, category for each expiring document.' },
      { from: 2, to: 3, label: 'SELECT admin emails for this client', type: 'solid',
        detail: 'Finds all admin users scoped to this client (or superadmins).' },
      { from: 2, to: 4, label: 'Send HTML email table via nodemailer', type: 'solid',
        detail: 'Email body contains an HTML table of expiring documents. Uses client SMTP config.' },
      { from: 2, to: 1, label: '200 OK + { sent: true, count: N }', type: 'dashed',
        detail: 'Frontend shows confirmation: "Alert sent for N documents."' },
    ],
  },

  // ── PORTAL: Login ────────────────────────────────────────────────────────────
  portal_login: {
    title: 'Portal User Login',
    description: 'HCP enters credentials → Verified against DB → Email verification check → Session set.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    files: [
      { path: 'cp-portal/frontend/src/portal/pages/LoginPage.jsx',       role: 'Login form UI' },
      { path: 'cp-portal/frontend/src/portal/context/PortalContext.jsx', role: 'Auth state' },
      { path: 'cp-portal/backend/routes/portal/auth.js',                 role: 'Login handler', lines: '90-113' },
      { path: 'cp-portal/backend/middleware/auth.js',                    role: 'authenticatePortal', lines: '32-49' },
    ],
    steps: [
      { from: 0, to: 1, label: 'Enter email + password, click Sign In', type: 'solid',
        file: 'cp-portal/frontend/src/portal/pages/LoginPage.jsx',
        detail: 'PortalLoginPage captures credentials. clientCode is known from the URL (/portal/pfizer/login).' },
      { from: 1, to: 2, label: 'POST /api/portal/auth/:clientCode/login', type: 'solid',
        file: 'cp-portal/backend/routes/portal/auth.js', line: 90,
        detail: 'Body: { email, password }. Rate limiter: 100 req/15 min.' },
      { from: 2, to: 3, label: 'SELECT user WHERE email=? AND client_id=?', type: 'solid',
        file: 'cp-portal/backend/routes/portal/auth.js', line: 101,
        detail: 'Looks up user scoped to this specific client. Same email can exist on multiple portals.' },
      { from: 3, to: 2, label: 'User row (hashed password, email_verified)', type: 'dashed',
        detail: 'Returns the user record. If not found → 401 "Invalid credentials" (generic message prevents enumeration).' },
      { from: 2, to: 2, label: 'bcrypt.compare() + check email_verified', type: 'solid',
        file: 'cp-portal/backend/routes/portal/auth.js', line: 102,
        detail: 'Password compared. If email_verified=0 → 403 "Please verify your email first." Verification link can be resent.' },
      { from: 2, to: 1, label: 'Set-Cookie: cp_portal_token (HttpOnly)', type: 'dashed',
        file: 'cp-portal/backend/routes/portal/auth.js', line: 109,
        detail: 'Session cookie scoped to this client. User object returned (id, name, email, user_type) — no password.' },
      { from: 1, to: 0, label: 'Redirect to portal home', type: 'dashed',
        file: 'cp-portal/frontend/src/portal/context/PortalContext.jsx',
        detail: 'PortalContext.user updated. If "from" location was saved → redirected back to original page.' },
    ],
  },

  // ── PORTAL: Self-Registration ────────────────────────────────────────────────
  portal_register: {
    title: 'Portal User Self-Registration',
    description: 'New HCP registers → Password hashed → Verification email sent → Login blocked until verified.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database', 'Email'],
    files: [
      { path: 'cp-portal/frontend/src/portal/pages/LoginPage.jsx',   role: 'Register form UI' },
      { path: 'cp-portal/backend/routes/portal/auth.js',             role: 'Register handler', lines: '34-89' },
      { path: 'cp-portal/backend/database/db.js',                    role: 'cp_portal_users table' },
    ],
    steps: [
      { from: 0, to: 1, label: 'Fill registration form, click Create Account', type: 'solid',
        file: 'cp-portal/frontend/src/portal/pages/LoginPage.jsx',
        detail: 'Captures: name, email, password, user_type (HCP/Patient/Other). Client is inferred from clientCode in URL.' },
      { from: 1, to: 2, label: 'POST /api/portal/auth/:clientCode/register', type: 'solid',
        file: 'cp-portal/backend/routes/portal/auth.js', line: 34,
        detail: 'Body: { name, email, password, user_type }. Rate limited.' },
      { from: 2, to: 3, label: 'Check email not already registered', type: 'solid',
        file: 'cp-portal/backend/routes/portal/auth.js', line: 64,
        detail: 'SELECT from cp_portal_users WHERE email=? AND client_id=?. Duplicate → 409 Conflict.' },
      { from: 3, to: 2, label: 'Email is unique', type: 'dashed',
        detail: 'Confirmed no duplicate. Proceeding with registration.' },
      { from: 2, to: 2, label: 'bcrypt.hash(password) + crypto.randomBytes(32) token', type: 'solid',
        file: 'cp-portal/backend/routes/portal/auth.js', line: 67,
        detail: 'Password hashed (10 rounds). Verification token generated (32 random bytes → hex string). Token expires in 24h.' },
      { from: 2, to: 3, label: 'INSERT user (email_verified=0, token, expires_at)', type: 'solid',
        file: 'cp-portal/backend/routes/portal/auth.js', line: 72,
        detail: 'User inserted with email_verified=0 and the verification token + expiry. Login will be blocked until verified.' },
      { from: 2, to: 4, label: 'Send verification email (link with token)', type: 'solid',
        detail: 'Email contains: /portal/:clientCode/verify-email#token=xxx. Uses client SMTP config.' },
      { from: 2, to: 1, label: '201 + { pending: true }', type: 'dashed',
        detail: 'Frontend shows "Check your email" screen. Login attempts return 403 until email is verified.' },
    ],
  },

  // ── PORTAL: Email Verification ────────────────────────────────────────────────
  portal_verify_email: {
    title: 'Email Verification',
    description: 'User clicks link in email → Token validated → email_verified=1 → Auto-logged in.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Click verification link in email', type: 'solid',
        detail: 'Link: /portal/:clientCode/verify-email#token=xxx. Browser opens the portal.' },
      { from: 1, to: 2, label: 'POST /api/portal/auth/verify-email', type: 'solid',
        detail: 'VerifyEmailPage calls this on mount. Token is passed in the POST body.' },
      { from: 2, to: 3, label: 'SELECT user WHERE verification_token=? AND expires_at > now()', type: 'solid',
        detail: 'Token is looked up. If not found or expired → 400 "Invalid or expired link". User must request a new one.' },
      { from: 3, to: 2, label: 'User row found', type: 'dashed',
        detail: 'Token is valid and not expired.' },
      { from: 2, to: 3, label: 'UPDATE email_verified=1, clear token + expires_at', type: 'solid',
        detail: 'Token is consumed and cleared so it cannot be reused. email_verified set to 1.' },
      { from: 2, to: 1, label: 'Set-Cookie: portal session + { user }', type: 'dashed',
        detail: 'User is automatically logged in on successful verification. No need to log in separately.' },
      { from: 1, to: 0, label: 'Redirect to portal home (verified)', type: 'dashed',
        detail: 'VerifyEmailPage shows success message then navigates to home.' },
    ],
  },

  // ── PORTAL: Logout ────────────────────────────────────────────────────────────
  portal_logout: {
    title: 'Portal User Logout',
    description: 'User clicks Sign Out → Session destroyed → Cookie cleared → Redirected to login.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Click Sign Out', type: 'solid',
        detail: 'PortalLayout header Sign Out button. PortalContext.logout() is called.' },
      { from: 1, to: 2, label: 'POST /api/portal/auth/:clientCode/logout', type: 'solid',
        detail: 'Fires even with no body. The session cookie identifies who is logging out.' },
      { from: 2, to: 3, label: 'DELETE session from cp_portal_sessions', type: 'solid',
        detail: 'Server-side session record is deleted. Cookie becomes worthless.' },
      { from: 2, to: 1, label: 'Clear-Cookie: cp_portal_session', type: 'dashed',
        detail: 'Set-Cookie with Max-Age=0 removes the cookie from the browser.' },
      { from: 1, to: 0, label: 'Redirect to /portal/:clientCode/login', type: 'dashed',
        detail: 'PortalContext.user set to null. React Router redirects to login page.' },
    ],
  },

  // ── PORTAL: Fetch Documents ──────────────────────────────────────────────────
  portal_fetch_docs: {
    title: 'Fetch Document Library',
    description: 'Portal user opens Documents → Backend queries published + non-expired docs → List rendered.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Navigate to Documents page', type: 'solid',
        detail: 'FeatureGuard checks document_library feature flag. If disabled → redirected to home.' },
      { from: 1, to: 2, label: 'GET /api/portal/documents/:clientCode?category=&search=', type: 'solid',
        detail: 'Query params include optional filters. clientCode identifies which client\'s documents to fetch.' },
      { from: 2, to: 3, label: 'SELECT docs WHERE (published OR scheduled-past-publish_at) AND not expired', type: 'solid',
        detail: 'WHERE status=published OR (status=scheduled AND publish_at<=now). AND (expires_at IS NULL OR expires_at>now). Documents in review/draft are invisible.' },
      { from: 3, to: 2, label: 'Filtered document list', type: 'dashed',
        detail: 'Returns: id, title, category, tags, file_url (signed), created_at. Actual file is served via separate authenticated endpoint.' },
      { from: 2, to: 1, label: '200 OK + { documents: [...] }', type: 'dashed',
        detail: 'Frontend groups documents by category. Shows download button per doc. Download hits a separate authenticated file endpoint.' },
    ],
  },

  // ── PORTAL: Fetch News ───────────────────────────────────────────────────────
  portal_fetch_news: {
    title: 'Fetch News Feed',
    description: 'Portal loads News page → Backend queries published posts → Cards rendered with pagination.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Navigate to News page', type: 'solid',
        detail: 'FeatureGuard checks news_announcements feature. Portal renders NewsPortalPage.' },
      { from: 1, to: 2, label: 'GET /api/portal/news/:clientCode?page=1&limit=10', type: 'solid',
        detail: 'Paginated request. No auth required — news is public to all portal visitors.' },
      { from: 2, to: 3, label: 'SELECT posts WHERE status=published AND client_id=?', type: 'solid',
        detail: 'Only published posts are returned. Ordered by publish_at DESC (newest first). LIMIT/OFFSET applied.' },
      { from: 3, to: 2, label: 'Post list + total count', type: 'dashed',
        detail: 'Returns: id, title, excerpt, category, tags, thumbnail_url, publish_at. Total for pagination.' },
      { from: 2, to: 1, label: '200 OK + { posts: [...], total }', type: 'dashed',
        detail: 'Frontend renders news cards. Click → NewsDetailPage fetches the full post body.' },
    ],
  },

  // ── PORTAL: Fetch News Detail ────────────────────────────────────────────────
  portal_fetch_news_detail: {
    title: 'Fetch News Post Detail',
    description: 'User clicks a news card → Full post body fetched → Read-time + view count incremented.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Click news card', type: 'solid',
        detail: 'NewsPortalPage card onClick navigates to /portal/:clientCode/news/:postId.' },
      { from: 1, to: 2, label: 'GET /api/portal/news/:clientCode/:postId', type: 'solid',
        detail: 'postId in path. Backend verifies it belongs to this clientCode.' },
      { from: 2, to: 3, label: 'SELECT post WHERE id=? AND client_id=? AND status=published', type: 'solid',
        detail: 'Verifies the post is published and belongs to the correct client. Returns 404 if not found/published.' },
      { from: 3, to: 2, label: 'Full post with body HTML', type: 'dashed',
        detail: 'Returns all fields including the full body field. title, body, category, tags, author, publish_at.' },
      { from: 2, to: 1, label: '200 OK + { post: {...} }', type: 'dashed',
        detail: 'NewsDetailPage renders the full post. Read-time estimate calculated client-side from word count.' },
    ],
  },

  // ── PORTAL: Submit Medical Inquiry ──────────────────────────────────────────
  portal_submit_inquiry: {
    title: 'Submit Medical Inquiry',
    description: 'HCP submits a question → Form validated → Stored in DB → Admin notified.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database', 'Notifications'],
    steps: [
      { from: 0, to: 1, label: 'Fill inquiry form, click Submit', type: 'solid',
        detail: 'SubmitPage renders form fields from cp_form_fields for this client\'s medical_inquiry form type.' },
      { from: 1, to: 2, label: 'POST /api/portal/submit/:clientCode/medical_inquiry', type: 'solid',
        detail: 'Rate limited: 30 submissions per hour. Body: dynamic key-value form field responses.' },
      { from: 2, to: 2, label: 'Validate required fields', type: 'solid',
        detail: 'Backend checks all required fields have values. Returns 400 with field errors if any are missing.' },
      { from: 2, to: 3, label: 'INSERT INTO cp_submissions', type: 'solid',
        detail: 'Stores: client_id, user_id (null if anonymous), form_type, form_data_json, status=new, submitted_at.' },
      { from: 3, to: 2, label: 'Submission saved', type: 'dashed',
        detail: 'Returns the new submission ID.' },
      { from: 2, to: 4, label: 'Notify admins (if configured)', type: 'solid',
        detail: 'If SMTP is configured for this client, admin notification email is sent with inquiry summary.' },
      { from: 2, to: 1, label: '201 Created + { submissionId }', type: 'dashed',
        detail: 'Frontend shows success screen. If user is logged in, submission appears in My Submissions.' },
    ],
  },

  // ── PORTAL: Request MSL Meeting ──────────────────────────────────────────────
  portal_request_meeting: {
    title: 'Request MSL Meeting',
    description: 'HCP requests a meeting with an MSL → Dedup check → Booking stored → Admin sees it.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Click "Request Meeting" on MSL card', type: 'solid',
        detail: 'FindMSLPage shows the booking modal. Pre-fills name/email from logged-in user if authenticated.' },
      { from: 1, to: 2, label: 'POST /api/portal/bookings/:clientCode/:mslId', type: 'solid',
        detail: 'Body: { requester_name, requester_email, preferred_date, topic, message }.' },
      { from: 2, to: 3, label: 'Dedup: same email + MSL within today?', type: 'solid',
        detail: 'SELECT from cp_msl_bookings WHERE requester_email=? AND msl_id=? AND date(created_at)=date(now). If exists → 409.' },
      { from: 3, to: 2, label: 'No duplicate found', type: 'dashed',
        detail: 'This email has not requested this MSL today. Proceeding.' },
      { from: 2, to: 3, label: 'INSERT INTO cp_msl_bookings (status=pending)', type: 'solid',
        detail: 'Booking stored with status=pending. Admin will see it in MSLPage "Meeting Requests" tab.' },
      { from: 2, to: 1, label: '201 Created — show success screen', type: 'dashed',
        detail: 'Modal switches to success state. Admin pending count badge increments on next poll.' },
    ],
  },

  // ── PORTAL: Submit Feedback ───────────────────────────────────────────────────
  portal_submit_feedback: {
    title: 'Submit Portal Feedback',
    description: 'User rates the portal + adds comment → DB insert → Admin feedback inbox updated.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Click 💬 feedback button, rate + write message', type: 'solid',
        detail: 'FeedbackWidget.jsx floating button bottom-right. Star rating (1-5) + optional comment.' },
      { from: 1, to: 2, label: 'POST /api/portal/feedback/:clientCode', type: 'solid',
        detail: 'Body: { rating, message, page_url }. Fire-and-forget — user does not wait for response.' },
      { from: 2, to: 3, label: 'INSERT INTO cp_feedback', type: 'solid',
        detail: 'Stores: client_id, user_id (if logged in), rating, message, page_url, submitted_at.' },
      { from: 3, to: 2, label: 'Saved', type: 'dashed',
        detail: 'Returns { ok: true }.' },
      { from: 2, to: 1, label: '201 Created', type: 'dashed',
        detail: 'FeedbackWidget resets to closed state. Admin FeedbackPage shows updated avg rating + new entry.' },
    ],
  },

  // ── PORTAL: Save / Bookmark Item ─────────────────────────────────────────────
  portal_save_item: {
    title: 'Save / Bookmark an Item',
    description: 'Logged-in user saves a news post or document → Upserted in DB → Appears on Saved page.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Click bookmark icon on news/document', type: 'solid',
        detail: 'Heart/bookmark icon. Only visible when user is logged in (PortalAuthGuard).' },
      { from: 1, to: 2, label: 'POST /api/portal/saved/:clientCode', type: 'solid',
        detail: 'Body: { item_type: "news"|"document", item_id }. Session cookie required.' },
      { from: 2, to: 3, label: 'INSERT OR IGNORE INTO cp_saved_items', type: 'solid',
        detail: 'UNIQUE (user_id, item_type, item_id). Saving the same item twice is a no-op.' },
      { from: 3, to: 2, label: 'Saved', type: 'dashed',
        detail: 'Returns { ok: true }.' },
      { from: 2, to: 1, label: '201 Created', type: 'dashed',
        detail: 'Bookmark icon turns filled/active. Item appears on /portal/:clientCode/saved.' },
    ],
  },

  // ── PORTAL: Accept Consent ────────────────────────────────────────────────────
  portal_consent_accept: {
    title: 'Accept Consent / Cookie Banner',
    description: 'User accepts consent → Choices stored → require_reconsent cleared → Portal unlocked.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Click Accept on consent banner', type: 'solid',
        detail: 'ConsentBanner.jsx intercepts all navigation when require_reconsent=1 or no prior consent record.' },
      { from: 1, to: 2, label: 'POST /api/portal/consent/:clientCode/record', type: 'solid',
        detail: 'Body: { choices: { necessary, functional, analytics, marketing }, version }.' },
      { from: 2, to: 3, label: 'INSERT INTO cp_consent_records', type: 'solid',
        detail: 'Stores: user_id (or ip_hash if anonymous), version accepted, choices_json, consented_at.' },
      { from: 2, to: 3, label: 'Clear require_reconsent=0 for this user', type: 'solid',
        detail: 'Updates cp_compliance_config or user-level flag so the gate does not re-appear.' },
      { from: 2, to: 1, label: '201 Created', type: 'dashed',
        detail: 'Banner closes. ConsentBanner unblocks navigation. User can access all portal features.' },
    ],
  },

  // ── PORTAL: Load Config ───────────────────────────────────────────────────────
  portal_fetch_config: {
    title: 'Load Portal Configuration',
    description: 'Every portal page load fetches the client config: branding, features, compliance, language.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Open portal URL (/portal/pfizer)', type: 'solid',
        detail: 'PortalProvider mounts. First thing: fetch the config for this clientCode.' },
      { from: 1, to: 2, label: 'GET /api/portal/config/:clientCode', type: 'solid',
        detail: 'Public endpoint — no auth needed. clientCode is the slug from the URL (e.g. "pfizer").' },
      { from: 2, to: 3, label: 'SELECT client + branding + features + compliance + language', type: 'solid',
        detail: 'Multiple SELECT queries: cp_clients, cp_branding, cp_features, cp_compliance_config, language_config_json.' },
      { from: 3, to: 2, label: 'All config rows', type: 'dashed',
        detail: 'Returns the full configuration bundle. If clientCode not found → 404, portal shows "not found" page.' },
      { from: 2, to: 1, label: '200 OK + { branding, features, compliance, language }', type: 'dashed',
        detail: 'PortalContext stores the config. Branding applied to CSS vars. Features map controls FeatureGuard. Language switcher renders if 2+ langs enabled.' },
    ],
  },

  // ── PORTAL: Notifications ─────────────────────────────────────────────────────
  portal_notifications: {
    title: 'Fetch Notifications',
    description: 'Portal user opens notifications → Unread items fetched → Marked as read on dismiss.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Click notification bell (or auto-poll)', type: 'solid',
        detail: 'PortalLayout polls /notifications every 60s for logged-in users.' },
      { from: 1, to: 2, label: 'GET /api/portal/notifications/:clientCode', type: 'solid',
        detail: 'Auth cookie required. Backend extracts portal user ID from session.' },
      { from: 2, to: 3, label: 'SELECT FROM cp_notifications WHERE user_id=? AND is_read=0', type: 'solid',
        detail: 'Returns only unread notifications ordered by created_at DESC. Includes type (news/document/safety) and item_id.' },
      { from: 3, to: 2, label: 'Unread notifications list', type: 'dashed',
        detail: 'Returns array of { id, type, title, item_id, created_at }.' },
      { from: 2, to: 1, label: '200 OK + { notifications: [...] }', type: 'dashed',
        detail: 'Bell badge shows unread count. Clicking an item navigates to that news post / document and marks it as read.' },
    ],
  },

  // ── PORTAL: FAQ ───────────────────────────────────────────────────────────────
  portal_fetch_faq: {
    title: 'Fetch FAQ',
    description: 'User opens FAQ page → Published items fetched → Grouped accordion rendered.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Navigate to FAQ page', type: 'solid',
        detail: 'FAQPortalPage mounts. fetch() called immediately.' },
      { from: 1, to: 2, label: 'GET /api/portal/faq/:clientCode', type: 'solid',
        detail: 'Public endpoint — no auth needed.' },
      { from: 2, to: 3, label: 'SELECT FROM cp_faq_items WHERE client_id=? AND is_published=1', type: 'solid',
        detail: 'Returns published items ordered by category, sort_order, id.' },
      { from: 3, to: 2, label: 'FAQ items array', type: 'dashed',
        detail: 'Returns all published Q&A items with category grouping.' },
      { from: 2, to: 1, label: '200 OK + { faqs: [...] }', type: 'dashed',
        detail: 'Frontend groups items by category. Renders accordion — click question to expand answer.' },
    ],
  },

  // ── CONTENT SCHEDULER (background) ───────────────────────────────────────────
  content_scheduler: {
    title: 'Content Scheduler (Background)',
    description: 'Every 60 seconds, server auto-promotes scheduled content whose publish_at has passed.',
    source: 'admin',
    swimlanes: ['Scheduler', 'Backend', 'Database', 'Notifications'],
    steps: [
      { from: 0, to: 1, label: 'setInterval tick (every 60s) + startup', type: 'solid',
        detail: 'IIFE startContentScheduler() runs at server startup and every 60 seconds via setInterval.' },
      { from: 1, to: 2, label: 'SELECT news WHERE status=scheduled AND publish_at<=now', type: 'solid',
        detail: 'Finds all news posts that are scheduled and whose publish_at time has arrived.' },
      { from: 2, to: 1, label: 'Promoted posts list', type: 'dashed',
        detail: 'Returns array of { id, client_id, title } for logging/notification.' },
      { from: 1, to: 2, label: 'UPDATE news SET status=published (batch)', type: 'solid',
        detail: 'Single UPDATE for all matching rows. More efficient than row-by-row updates.' },
      { from: 1, to: 3, label: 'notifyPortalUsers() for each promoted post', type: 'solid',
        detail: 'Inserts notification rows for each portal user subscribed to news for that client.' },
      { from: 1, to: 2, label: 'UPDATE docs SET status=published WHERE scheduled + past publish_at', type: 'solid',
        detail: 'Same logic for documents. No notifications for documents (only news triggers them).' },
    ],
  },

  // ── GENERIC FALLBACKS ─────────────────────────────────────────────────────────
  generic_admin: {
    title: 'Generic Admin Action',
    description: 'A general admin API call: authenticate → process → DB read/write → respond.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'User interaction triggers API call', type: 'solid',
        detail: 'A button click, form submit, or page load triggers a fetch() call from a React component.' },
      { from: 1, to: 2, label: 'HTTP request with session cookie', type: 'solid',
        detail: 'credentials: "include" sends the cp_admin_session cookie automatically on every fetch().' },
      { from: 2, to: 3, label: 'Authenticate + authorise', type: 'solid',
        detail: 'authenticateAdmin middleware validates the session. requireClientAccess checks client scope.' },
      { from: 3, to: 2, label: 'Identity confirmed', type: 'dashed',
        detail: 'req.admin populated with { id, name, role, client_id }.' },
      { from: 2, to: 4, label: 'Read or write database', type: 'solid',
        detail: 'better-sqlite3 runs the query synchronously. No callbacks or promises needed for DB operations.' },
      { from: 4, to: 2, label: 'Query result', type: 'dashed',
        detail: 'Data returned or changes confirmed.' },
      { from: 2, to: 1, label: 'JSON response', type: 'dashed',
        detail: 'Response sent with appropriate status code (200/201/400/401/403/404/409/500).' },
    ],
  },

  generic_portal: {
    title: 'Generic Portal Action',
    description: 'A general portal API call: optional auth check → DB query → filtered response.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'Navigation or interaction triggers fetch', type: 'solid',
        detail: 'Could be page load (useEffect), button click, or form submit.' },
      { from: 1, to: 2, label: 'HTTP request (with or without session)', type: 'solid',
        detail: 'Public endpoints need no cookie. Protected endpoints check the cp_portal_session cookie.' },
      { from: 2, to: 3, label: 'Query database (client-scoped)', type: 'solid',
        detail: 'Every query is scoped to client_id — data from one client is never visible to another.' },
      { from: 3, to: 2, label: 'Query result', type: 'dashed',
        detail: 'SQLite returns data. Backend filters, shapes, and strips any sensitive fields before returning.' },
      { from: 2, to: 1, label: 'JSON response', type: 'dashed',
        detail: 'Frontend updates React state. Component re-renders with new data.' },
    ],
  },

  // ── PORTAL: View Safety Alerts ────────────────────────────────────────────────
  portal_safety: {
    title: 'View Safety Alerts',
    description: 'Portal user opens Safety page → Published alerts fetched → Colour-coded by severity.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    files: [
      { path: 'cp-portal/frontend/src/portal/pages/SafetyPage.jsx',  role: 'Safety page UI' },
      { path: 'cp-portal/backend/routes/portal/safety.js',           role: 'GET alerts handler', lines: '14-43' },
    ],
    steps: [
      { from: 0, to: 1, label: 'Navigate to Safety page', type: 'solid',
        file: 'cp-portal/frontend/src/portal/pages/SafetyPage.jsx',
        detail: 'SafetyPortalPage mounts. Fetches alerts on mount via useEffect.' },
      { from: 1, to: 2, label: 'GET /api/portal/safety/:clientCode', type: 'solid',
        file: 'cp-portal/backend/routes/portal/safety.js', line: 14,
        detail: 'Public endpoint — no auth required. clientCode maps to client_id.' },
      { from: 2, to: 3, label: 'SELECT WHERE is_published=1 AND client_id=? ORDER BY severity', type: 'solid',
        file: 'cp-portal/backend/routes/portal/safety.js', line: 24,
        detail: 'Returns published alerts sorted by severity (critical first). view_count incremented separately.' },
      { from: 3, to: 2, label: 'Alert list with severity + product info', type: 'dashed',
        detail: 'Returns: id, title, alert_type, severity, product_name, ref_number, body_html.' },
      { from: 2, to: 1, label: '200 OK + { alerts: [...] }', type: 'dashed',
        detail: 'Frontend renders cards colour-coded by severity: critical=red, warning=orange, info=blue.' },
    ],
  },

  // ── PORTAL: My Submissions ─────────────────────────────────────────────────────
  portal_my_submissions: {
    title: 'View My Submissions',
    description: 'Logged-in portal user views their past inquiry submissions with status + sync info.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    files: [
      { path: 'cp-portal/frontend/src/portal/pages/MySubmissionsPage.jsx', role: 'Submissions list UI' },
      { path: 'cp-portal/backend/routes/portal/submit.js',                role: 'GET submissions', lines: '75-90' },
      { path: 'cp-portal/backend/middleware/auth.js',                     role: 'authenticatePortal', lines: '32-49' },
    ],
    steps: [
      { from: 0, to: 1, label: 'Navigate to My Submissions', type: 'solid',
        file: 'cp-portal/frontend/src/portal/pages/MySubmissionsPage.jsx',
        detail: 'PortalAuthGuard wraps this route — user must be logged in. MySubmissionsPage mounts and fetches.' },
      { from: 1, to: 2, label: 'GET /api/portal/submit/:clientCode/submissions', type: 'solid',
        file: 'cp-portal/backend/routes/portal/submit.js', line: 75,
        detail: 'Session cookie required. Backend extracts portal_user_id to scope query.' },
      { from: 2, to: 3, label: 'authenticatePortal — verify session token', type: 'solid',
        file: 'cp-portal/backend/middleware/auth.js', line: 32,
        detail: 'Verifies cp_portal_token cookie. Sets req.portalUser. If invalid → 401.' },
      { from: 2, to: 3, label: 'SELECT submissions WHERE user_id=?', type: 'solid',
        file: 'cp-portal/backend/routes/portal/submit.js', line: 80,
        detail: 'Returns id, submission_type, status, external_ref, submitted_at, updated_at. Ordered by submitted_at DESC.' },
      { from: 3, to: 2, label: 'Submission list', type: 'dashed',
        detail: 'Each row shows: form type, submission status (new/pending_sync/synced/failed_sync), and MIMS reference if synced.' },
      { from: 2, to: 1, label: '200 OK + { submissions: [...] }', type: 'dashed',
        detail: 'MySubmissionsPage renders a table of submissions with status badges.' },
    ],
  },

  // ── PORTAL: Update Preferences ────────────────────────────────────────────────
  portal_preferences: {
    title: 'Update Notification Preferences',
    description: 'Portal user toggles notification types → Preferences saved to DB → Applied on next notification.',
    source: 'portal',
    swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
    files: [
      { path: 'cp-portal/frontend/src/portal/pages/PreferencesPage.jsx', role: 'Preferences form UI' },
      { path: 'cp-portal/backend/routes/portal/preferences.js',          role: 'PATCH handler' },
      { path: 'cp-portal/backend/middleware/auth.js',                    role: 'authenticatePortal', lines: '32-49' },
    ],
    steps: [
      { from: 0, to: 1, label: 'Toggle notification types, click Save', type: 'solid',
        file: 'cp-portal/frontend/src/portal/pages/PreferencesPage.jsx',
        detail: 'PreferencesPage renders toggles for: news, documents, safety. User adjusts and submits.' },
      { from: 1, to: 2, label: 'PATCH /api/portal/preferences/:clientCode', type: 'solid',
        detail: 'Body: { notif_prefs: { news: true, documents: false, safety: true } }. Session cookie required.' },
      { from: 2, to: 3, label: 'authenticatePortal — verify session', type: 'solid',
        file: 'cp-portal/backend/middleware/auth.js', line: 32,
        detail: 'Cookie validated. req.portalUser set with userId.' },
      { from: 2, to: 3, label: 'UPDATE cp_portal_users SET notif_prefs_json=?', type: 'solid',
        detail: 'notif_prefs_json column updated. JSON string. notify.js reads this before inserting notifications.' },
      { from: 2, to: 1, label: '200 OK + updated preferences', type: 'dashed',
        detail: 'Frontend confirms save. Next notification check respects the new preferences.' },
    ],
  },

  // ── ADMIN: View Submissions ────────────────────────────────────────────────────
  admin_view_submissions: {
    title: 'View / Manage Submissions (Admin)',
    description: 'Admin opens Submissions page → Lists all client submissions → Can sync to MIMS.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    files: [
      { path: 'cp-portal/frontend/src/admin/pages/SubmissionsPage.jsx', role: 'Submissions table UI' },
      { path: 'cp-portal/backend/routes/admin/submissions.js',          role: 'GET + sync handler' },
      { path: 'cp-portal/backend/middleware/auth.js',                   role: 'authenticateAdmin', lines: '21-31' },
    ],
    steps: [
      { from: 0, to: 1, label: 'Navigate to Submissions page', type: 'solid',
        file: 'cp-portal/frontend/src/admin/pages/SubmissionsPage.jsx',
        detail: 'SubmissionsPage fetches on mount. Renders paginated table of all portal submissions for this client.' },
      { from: 1, to: 2, label: 'GET /api/admin/submissions/:clientId', type: 'solid',
        detail: 'Query params: limit, offset, status filter. Session cookie required.' },
      { from: 2, to: 3, label: 'authenticateAdmin + requireClientAccess', type: 'solid',
        file: 'cp-portal/backend/middleware/auth.js', line: 21,
        detail: 'Admin identity and client scope verified.' },
      { from: 2, to: 3, label: 'SELECT FROM cp_submissions WHERE client_id=?', type: 'solid',
        detail: 'Returns all submissions with form_data_json, status, submitter_name, submitted_at, external_ref.' },
      { from: 3, to: 2, label: 'Paginated submissions', type: 'dashed',
        detail: 'Ordered by submitted_at DESC. External MIMS ref shown for synced submissions.' },
      { from: 2, to: 1, label: '200 OK + { submissions: [...], total }', type: 'dashed',
        detail: 'Table shows all submissions. Admin can click a row to see form data or trigger MIMS sync.' },
    ],
  },

  // ── ADMIN: Review Queue ────────────────────────────────────────────────────────
  admin_review_queue: {
    title: 'Review Queue — Approve / Reject',
    description: 'Admin reviews pending content → Approves or rejects → Status transition recorded in audit.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    files: [
      { path: 'cp-portal/frontend/src/admin/pages/ReviewQueuePage.jsx', role: 'Review queue UI' },
      { path: 'cp-portal/backend/routes/admin/reviewQueue.js',          role: 'GET + PUT handler' },
      { path: 'cp-portal/backend/middleware/auth.js',                   role: 'requireRole check', lines: '104-115' },
    ],
    steps: [
      { from: 0, to: 1, label: 'Open Review Queue (badge shows pending count)', type: 'solid',
        file: 'cp-portal/frontend/src/admin/pages/ReviewQueuePage.jsx',
        detail: 'ReviewQueuePage lists all content in "review" status. Badge in sidebar shows count from /review-queue/:clientId/count.' },
      { from: 1, to: 2, label: 'GET /api/admin/review-queue/:clientId', type: 'solid',
        detail: 'Returns news + documents + safety alerts with status=review for this client.' },
      { from: 2, to: 3, label: 'authenticateAdmin + requireClientAccess', type: 'solid',
        file: 'cp-portal/backend/middleware/auth.js', line: 21,
        detail: 'Admin identity and client scope verified.' },
      { from: 2, to: 4, label: 'SELECT from news+docs WHERE status=review', type: 'solid',
        detail: 'UNIONs news and documents queries to get all pending review items.' },
      { from: 0, to: 1, label: 'Click Approve or Reject', type: 'solid',
        file: 'cp-portal/frontend/src/admin/pages/ReviewQueuePage.jsx',
        detail: 'Approve → transitions to "approved". Reject → transitions to "draft" with rejection note.' },
      { from: 1, to: 2, label: 'PUT /api/admin/review-queue/:clientId/:itemId', type: 'solid',
        detail: 'Body: { decision: "approve"|"reject", note }.' },
      { from: 2, to: 4, label: 'UPDATE status + INSERT audit trail', type: 'solid',
        detail: 'Status updated. Audit trail entry written with decision + note.' },
      { from: 2, to: 1, label: '200 OK — item removed from queue', type: 'dashed',
        detail: 'Frontend removes the item from the review list. Badge count decrements.' },
    ],
  },

  // ── ERROR FLOWS ─────────────────────────────────────────────────────────────

  error_401_unauthorized: {
    title: 'Error — 401 Unauthorized',
    description: 'Request was made without a valid session. Auth middleware rejected the call before it reached the route handler.',
    source: 'admin',
    swimlanes: [
      'Admin',
      'Frontend',
      'API Gateway / Router',
      'Middleware',
      'Backend',
      'Auth',
      'Cache (Redis)',
      'Database',
      'Queue / Jobs',
      'External Services',
      'File Storage',
    ],
    files: [
      { path: 'cp-portal/backend/middleware/auth.js', role: 'authenticateAdmin', lines: '6-31' },
    ],
    steps: [
      { from: 0, to: 1, label: 'User clicks something that needs login', type: 'solid',
        concept: '🖥 UI Action',
        detail: 'You clicked a button or navigated to a page that triggers an authenticated API call.',
        whyItExists: 'Every user action that reads or writes server data requires an API call. The frontend cannot access the database directly — it always goes through the backend.',
        beginnerTip: 'Not every click triggers an API call. Static pages and local state changes stay in the browser. Only when you need to read or write server data does a request go out.',
      },
      { from: 1, to: 2, label: 'API request sent — but session is missing', type: 'solid',
        concept: '🔐 Authentication',
        apiRoute: 'ANY /api/admin/... (protected route)',
        detail: 'The HTTP-only cookie cp_admin_token is missing, expired, or invalid. The browser still sends the request — it does not know the session is bad.',
        whyItExists: 'The browser always sends the request regardless of session state. Only the server can validate whether a session is still valid — the frontend has no way to check.',
        whatCouldGoWrong: 'Session expired after inactivity. Browser cookies cleared. Server restarted and JWT secret changed.',
        beginnerTip: 'HTTP-only cookies are invisible to JavaScript. The browser sends them automatically, but your React code cannot read or check them.',
      },
      { from: 2, to: 3, label: 'Auth middleware intercepts the request', type: 'solid',
        file: 'cp-portal/backend/middleware/auth.js', line: 6,
        concept: '🔄 Middleware',
        detail: 'Every protected route passes through authenticateAdmin first. It reads the cp_admin_token cookie from req.cookies.',
        whyItExists: 'Middleware runs before the route handler. This is the checkpoint — if you do not have a valid session, you never reach the actual business logic. It keeps security concerns separate from the route code.',
        beginnerTip: 'Think of middleware as a security guard at the door. The route handler is the room inside. The guard checks your ID before letting you in.',
      },
      { from: 3, to: 5, label: 'jwt.verify() fails — invalid or expired token', type: 'solid',
        file: 'cp-portal/backend/middleware/auth.js', line: 21,
        concept: '🔐 Authentication',
        detail: 'jsonwebtoken checks two things: (1) cryptographic signature — was this token issued by us? (2) expiry time — is it still valid? If either fails, an exception is thrown.',
        whyItExists: 'JWT verification is how the server trusts a token without storing sessions in the database. The signature proves the token was created by this server, and the expiry prevents old tokens from working forever.',
        whatCouldGoWrong: 'Token tampered with → signature check fails. Token expired → expiry check fails. JWT_SECRET changed on server → all existing tokens invalid.',
        securityNote: 'JWTs are signed with a secret key (JWT_SECRET). If someone edits the token payload, the signature becomes invalid. The server detects this immediately.',
        beginnerTip: 'A JWT has three parts: header.payload.signature. You can decode the header and payload with base64 — they are not encrypted! Only the signature proves authenticity.',
        commonMistake: 'Developers sometimes think JWTs are encrypted and safe to put sensitive data in. They are NOT encrypted — anyone can decode them. Only put non-sensitive identifiers inside.',
      },
      { from: 5, to: 4, label: '401 Unauthorized — request stopped here', type: 'dashed',
        file: 'cp-portal/backend/middleware/auth.js', line: 27,
        concept: '🔐 Authentication',
        responseBody: '{ error: "Unauthorized" }',
        statusMeaning: '401 Unauthorized — no valid session, must log in again',
        detail: 'The middleware calls res.json({ error: "Unauthorized" }) and returns. The actual route handler code is NEVER executed.',
        whyItExists: 'Failing fast is important for security. Once we know a request is unauthorised, we stop immediately rather than letting any code run. This prevents information leaks.',
        securityNote: 'The error message is deliberately vague. We never say "token expired" vs "token missing" — this prevents attackers from learning the exact reason for rejection.',
        beforeAfter: { before: 'Request in flight, route handler not yet called', after: '401 response sent, route handler never ran, DB never queried' },
      },
      { from: 4, to: 1, label: 'Frontend detects 401 — redirects to login', type: 'dashed',
        concept: '🖥 UI Action',
        detail: 'AdminAuthContext detects the 401 response and clears the admin state, then redirects to /admin/login.',
        whyItExists: 'The frontend needs to handle auth errors gracefully. Instead of showing a broken page, it redirects the user to login so they can re-authenticate.',
        beginnerTip: 'This is why you check res.ok or the status code after every fetch call. A 401 means you need to re-authenticate before retrying.',
        beforeAfter: { before: 'Admin appears logged in on frontend, but session is invalid', after: 'Admin state cleared, user redirected to login page' },
      },
    ],
  },

  error_403_forbidden: {
    title: 'Error — 403 Forbidden',
    description: 'Admin is authenticated but lacks permission to access this client\'s data. requireClientAccess middleware blocked the request.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    files: [
      { path: 'cp-portal/backend/middleware/auth.js', role: 'requireClientAccess', lines: '63-90' },
    ],
    steps: [
      { from: 0, to: 1, label: 'Admin accesses a client page (wrong client)', type: 'solid',
        detail: 'An admin scoped to Client A tries to access Client B\'s data by changing the clientId in the URL.' },
      { from: 1, to: 2, label: 'API request with different clientId', type: 'solid',
        detail: 'The request reaches the backend with the mismatched clientId in the URL path.' },
      { from: 2, to: 3, label: 'authenticateAdmin passes — session is valid', type: 'solid',
        file: 'cp-portal/backend/middleware/auth.js', line: 21,
        detail: 'The admin session itself is valid. Authentication passes. Now authorization is checked.' },
      { from: 3, to: 3, label: 'requireClientAccess: admin.clientId !== requestedClientId', type: 'solid',
        file: 'cp-portal/backend/middleware/auth.js', line: 76,
        detail: 'If the admin has a non-null clientId (scoped admin), it must match the requested clientId. Superadmins (null clientId) bypass this check.' },
      { from: 3, to: 2, label: '403 Forbidden — access denied', type: 'dashed',
        file: 'cp-portal/backend/middleware/auth.js', line: 80,
        detail: 'Responds with { error: "Access denied" }. No data is returned. The route handler is not invoked.' },
      { from: 2, to: 1, label: 'Frontend shows access denied error', type: 'dashed',
        detail: 'The UI shows an error state. The admin cannot see this client\'s data.' },
    ],
  },

  error_404_not_found: {
    title: 'Error — 404 Not Found',
    description: 'The requested resource (client, news item, document, user) does not exist in the database.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'User requests a specific resource by ID', type: 'solid',
        detail: 'Could be opening an old link, a deleted item, or an incorrect ID in the URL.' },
      { from: 1, to: 2, label: 'GET /api/admin/.../[id]', type: 'solid',
        detail: 'Request sent with the resource ID embedded in the URL path.' },
      { from: 2, to: 3, label: 'Authentication passes', type: 'solid',
        detail: 'Session and permissions are valid. The route handler executes.' },
      { from: 3, to: 4, label: 'SELECT * FROM table WHERE id = ?', type: 'solid',
        detail: 'Database query runs with the requested ID. No matching row is found.' },
      { from: 4, to: 3, label: 'Query returns null / undefined', type: 'dashed',
        detail: 'better-sqlite3 .get() returns undefined when no row matches. The route checks for this explicitly.' },
      { from: 3, to: 2, label: '404 Not Found — resource does not exist', type: 'dashed',
        detail: 'Route handler checks the DB result and returns { error: "Not found" } with status 404.' },
      { from: 2, to: 1, label: 'Frontend shows empty state or error message', type: 'dashed',
        detail: 'The component handles the 404 gracefully — shows a "not found" message instead of crashing.' },
    ],
  },

  error_500_server: {
    title: 'Error — 500 Internal Server Error',
    description: 'An unexpected error occurred on the backend — database write failed, missing column, or unhandled exception.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'User submits a form or triggers a write operation', type: 'solid',
        detail: 'Could be creating a news item, updating branding, or any POST/PUT/DELETE action.' },
      { from: 1, to: 2, label: 'POST/PUT/DELETE API request', type: 'solid',
        detail: 'Request with body payload reaches the backend server.' },
      { from: 2, to: 3, label: 'Auth passes', type: 'solid',
        detail: 'Authentication and authorization succeed. The route handler begins executing.' },
      { from: 3, to: 4, label: 'Database operation throws an error', type: 'solid',
        detail: 'Could be a constraint violation (UNIQUE, NOT NULL), a missing table column, a locked DB, or an unexpected JS exception in the route handler.' },
      { from: 4, to: 3, label: 'Exception thrown — caught by try/catch', type: 'dashed',
        detail: 'Route handlers use try/catch. The catch block logs the error and returns a 500 response.' },
      { from: 3, to: 2, label: '500 Internal Server Error', type: 'dashed',
        detail: 'Response: { error: "Internal server error" }. The actual error is logged on the server console (not exposed to client for security).' },
      { from: 2, to: 1, label: 'Frontend shows generic error', type: 'dashed',
        detail: 'UI shows a toast or error message. The operation did not complete. Check server logs for the root cause.' },
    ],
  },

  error_422_validation: {
    title: 'Error — 422 Validation Failed',
    description: 'Request body is missing required fields or contains invalid values. Caught before the database is touched.',
    source: 'admin',
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Database'],
    steps: [
      { from: 0, to: 1, label: 'User submits form with missing/invalid fields', type: 'solid',
        detail: 'Frontend may have missed a validation check, or the API was called directly with bad data.' },
      { from: 1, to: 2, label: 'POST/PUT with incomplete body', type: 'solid',
        detail: 'Body is missing a required field (e.g. title, email) or has an invalid value (e.g. wrong date format).' },
      { from: 2, to: 2, label: 'Route handler validates body fields', type: 'solid',
        detail: 'Each route destructures the body and checks required fields. If any are missing or empty, it returns early with 422.' },
      { from: 2, to: 1, label: '422 Unprocessable Entity', type: 'dashed',
        detail: 'Response includes { error: "field_name is required" } or similar message. The database is never touched.' },
      { from: 1, to: 0, label: 'Form shows field-level error', type: 'dashed',
        detail: 'Frontend displays the error message under the relevant field so the user knows what to fix.' },
    ],
  },
}

// ─── Auto-generate a basic flow diagram for any route not in FLOW_TEMPLATES ───
// Called by ProcessExplorerPage when matchTemplate returns a generic fallback.
// Creates a labelled sequence diagram based on the HTTP method + path pattern.
export function generateFlow(method, path) {
  const m        = method.toUpperCase()
  const isPortal = path.includes('/portal/')
  const source   = isPortal ? 'portal' : 'admin'

  // Derive a human-readable action label from the last 2 path segments
  const segments = path.replace(/\/\d+/g, '').split('/').filter(Boolean)
  const resource = segments[segments.length - 1] || 'resource'
  const section  = segments[segments.length - 2] || ''
  const actionLabel = {
    GET:    `Fetch ${resource}`,
    POST:   `Create ${resource}`,
    PUT:    `Update ${resource}`,
    PATCH:  `Update ${resource}`,
    DELETE: `Delete ${resource}`,
  }[m] || `${m} ${resource}`

  const isRead   = m === 'GET'
  const isDelete = m === 'DELETE'

  const actor = isPortal ? 'User' : 'Admin'

  if (isPortal) {
    return {
      title: actionLabel,
      description: `Auto-generated flow for ${m} ${path}`,
      source,
      swimlanes: ['User', 'Frontend', 'Backend', 'Database'],
      isAutoGenerated: true,
      steps: [
        { from: 0, to: 1, label: `${actor} triggers ${resource} action`, type: 'solid',
          detail: `User interaction on the portal page fires a fetch() call.` },
        { from: 1, to: 2, label: `${m} ${path}`, type: 'solid',
          detail: `Frontend sends ${m} request. Session cookie included if user is logged in (credentials: include).` },
        { from: 2, to: 3, label: isRead
            ? `SELECT ${resource} WHERE client_id=? ...`
            : `${isDelete ? 'DELETE' : 'INSERT/UPDATE'} ${resource}`,
          type: 'solid',
          file: `cp-portal/backend/routes/portal/${section}.js`,
          detail: `better-sqlite3 runs the ${isRead ? 'read' : 'write'} query synchronously, scoped to this client.` },
        { from: 3, to: 2, label: isRead ? `${resource} data` : 'Changes confirmed', type: 'dashed',
          detail: 'SQLite returns result. Backend shapes and returns the data.' },
        { from: 2, to: 1, label: isRead ? '200 OK + data' : isDelete ? '200 OK' : m === 'POST' ? '201 Created' : '200 OK', type: 'dashed',
          detail: 'Response sent. Frontend updates React state. Component re-renders.' },
      ],
    }
  }

  // Admin flow
  return {
    title: actionLabel,
    description: `Auto-generated flow for ${m} ${path}`,
    source,
    swimlanes: ['Admin', 'Frontend', 'Backend', 'Auth', 'Database'],
    isAutoGenerated: true,
    steps: [
      { from: 0, to: 1, label: `Admin triggers ${resource} action`, type: 'solid',
        detail: `Admin console action fires a fetch() call from a React component.` },
      { from: 1, to: 2, label: `${m} ${path}`, type: 'solid',
        detail: `Frontend sends ${m} request with session cookie (credentials: include).` },
      { from: 2, to: 3, label: 'authenticateAdmin + requireClientAccess', type: 'solid',
        file: 'cp-portal/backend/middleware/auth.js', line: 21,
        detail: 'authenticateAdmin (line 21) validates the cp_admin_token cookie. requireClientAccess (line 75) verifies client scope. Sets req.admin.' },
      { from: 3, to: 2, label: 'Identity confirmed', type: 'dashed',
        detail: 'req.admin populated. Admin authorised for this clientId.' },
      { from: 2, to: 4, label: isRead
          ? `SELECT ${resource} WHERE client_id=?`
          : `${isDelete ? 'DELETE' : 'INSERT/UPDATE'} ${resource}`,
        type: 'solid',
        file: `cp-portal/backend/routes/admin/${section}.js`,
        detail: `better-sqlite3 runs the ${isRead ? 'read' : 'write'} query synchronously. All writes include an audit trail entry.` },
      { from: 4, to: 2, label: isRead ? `${resource} data` : 'Changes confirmed', type: 'dashed',
        detail: 'SQLite returns result or confirms the write.' },
      { from: 2, to: 1, label: isRead ? '200 OK + data' : isDelete ? '200 OK' : m === 'POST' ? '201 Created' : '200 OK', type: 'dashed',
        detail: 'Response sent. Frontend updates React state and re-renders the relevant component.' },
    ],
  }
}

// ─── Enrichment helpers for sparse flow templates ────────────────────────────
const CONCEPT_RULES = [
  { re: /(login|logout|register|verify|token|cookie|session|auth|permission|role)/i, concept: '🔐 Authentication' },
  { re: /(middleware|rate limit|cors|guard|validate|check access)/i, concept: '🔄 Middleware' },
  { re: /(select|fetch|query|read|count|list|lookup|get\b|load|retrieve)/i, concept: '💾 DB Read' },
  { re: /(insert|update|delete|save|publish|upload|create|archive|toggle|remove|accept|reject|approve|sync|book|send)/i, concept: '💾 DB Write' },
  { re: /(email|mail|notify|notification|alert|smtp|welcome|verification email)/i, concept: '📧 Email' },
  { re: /(gmail|mims|third[- ]party|external api|external service|third party)/i, concept: '🌐 External API' },
  { re: /(click|open|navigate|render|show|modal|page|button|ui|frontend|screen)/i, concept: '🖥 UI Action' },
]

function inferConcept(step, flow) {
  if (step.concept) return step.concept
  const blob = [flow.title, flow.description, step.label, step.detail, step.apiRoute, step.dbQuery].filter(Boolean).join(' ')
  const hit = CONCEPT_RULES.find(rule => rule.re.test(blob))
  return hit ? hit.concept : '⚡ Processing'
}

function inferApiRoute(step, flow) {
  if (step.apiRoute) return step.apiRoute
  const text = [step.label, step.detail].filter(Boolean).join(' ')
  const m = text.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[^\s'"`]+)/i)
  if (m) return `${m[1].toUpperCase()} ${m[2]}`
  const title = flow.title.toLowerCase()
  if (/portal user login|portal login/.test(title) || /login/.test(text)) return flow.source === 'portal' ? 'POST /api/portal/auth/:clientCode/login' : 'POST /api/admin/auth/login'
  if (/self-registration|register/.test(title) || /register/.test(text)) return 'POST /api/portal/auth/:clientCode/register'
  if (/email verification|verify email|verify-email/.test(title) || /verify/.test(text)) return 'POST /api/portal/auth/verify-email'
  if (/logout/.test(title) || /sign out|logout/.test(text)) return flow.source === 'portal' ? 'POST /api/portal/auth/:clientCode/logout' : 'POST /api/admin/auth/logout'
  if (/feedback/.test(title)) return 'POST /api/portal/feedback/:clientCode'
  if (/faq/.test(title)) return flow.source === 'portal' ? 'GET /api/portal/faq/:clientCode' : 'POST /api/admin/faq/:clientId'
  if (/notification|alerts/.test(title)) return flow.source === 'portal' ? 'GET /api/portal/notifications/:clientCode' : 'POST /api/admin/documents/:clientId/expiry-alerts/send'
  if (/consent/.test(title)) return 'POST /api/portal/consent/:clientCode/record'
  if (/preferences/.test(title)) return 'PATCH /api/portal/preferences/:clientCode'
  if (/booking|meeting/.test(title)) return flow.source === 'portal' ? 'POST /api/portal/bookings/:clientCode/:mslId' : 'PUT /api/admin/msls/:clientId/bookings/:bookingId'
  if (/documents?/.test(title) && /fetch|load|view|list/.test(text)) return 'GET /api/portal/documents/:clientCode'
  if (/news/.test(title) && /fetch|load|view|list/.test(text)) return 'GET /api/portal/news/:clientCode'
  if (/msl/.test(title) && /fetch|load|view|list/.test(text)) return 'GET /api/admin/msls/:clientId'
  if (/review queue/.test(title)) return 'GET /api/admin/review-queue/:clientId'
  if (/fetch|load|navigate|click|open/i.test(text)) {
    const base = flow.source === 'portal' ? '/api/portal' : '/api/admin'
    const slug = flow.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    return `Derived ${base}/${slug}`
  }
  return 'Derived request'
}

const ADMIN_ROUTE_FILES = {
  auth: 'cp-portal/backend/routes/admin/auth.js',
  news: 'cp-portal/backend/routes/admin/news.js',
  documents: 'cp-portal/backend/routes/admin/documents.js',
  safety: 'cp-portal/backend/routes/admin/safety.js',
  faq: 'cp-portal/backend/routes/admin/faq.js',
  users: 'cp-portal/backend/routes/admin/portalUsers.js',
  'portal-users': 'cp-portal/backend/routes/admin/portalUsers.js',
  'admin-users': 'cp-portal/backend/routes/admin/adminUsers.js',
  'review-queue': 'cp-portal/backend/routes/admin/reviewQueue.js',
  submissions: 'cp-portal/backend/routes/admin/submissions.js',
  audit: 'cp-portal/backend/routes/admin/audit.js',
  analytics: 'cp-portal/backend/routes/admin/analytics.js',
  branding: 'cp-portal/backend/routes/admin/branding.js',
  features: 'cp-portal/backend/routes/admin/features.js',
  clients: 'cp-portal/backend/routes/admin/clients.js',
  msls: 'cp-portal/backend/routes/admin/msls.js',
  feedback: 'cp-portal/backend/routes/admin/feedback.js',
  compliance: 'cp-portal/backend/routes/admin/compliance.js',
  forms: 'cp-portal/backend/routes/admin/forms.js',
  gate: 'cp-portal/backend/routes/admin/gate.js',
  integration: 'cp-portal/backend/routes/admin/integration.js',
  language: 'cp-portal/backend/routes/admin/language.js',
  templates: 'cp-portal/backend/routes/admin/templates.js',
  reports: 'cp-portal/backend/routes/admin/reports.js',
  chatbox: 'cp-portal/backend/routes/admin/chatbox.js',
  content: 'cp-portal/backend/routes/admin/content.js',
  'email-config': 'cp-portal/backend/routes/admin/emailConfig.js',
  'email-settings': 'cp-portal/backend/routes/admin/emailConfig.js',
  'process-logs': 'cp-portal/backend/routes/admin/processExplorer.js',
  'process-explorer': 'cp-portal/backend/routes/admin/processExplorer.js',
}

const PORTAL_ROUTE_FILES = {
  auth: 'cp-portal/backend/routes/portal/auth.js',
  news: 'cp-portal/backend/routes/portal/news.js',
  documents: 'cp-portal/backend/routes/portal/documents.js',
  safety: 'cp-portal/backend/routes/portal/safety.js',
  faq: 'cp-portal/backend/routes/portal/faq.js',
  feedback: 'cp-portal/backend/routes/portal/feedback.js',
  submit: 'cp-portal/backend/routes/portal/submit.js',
  bookings: 'cp-portal/backend/routes/portal/bookings.js',
  notifications: 'cp-portal/backend/routes/portal/notifications.js',
  preferences: 'cp-portal/backend/routes/portal/preferences.js',
  consent: 'cp-portal/backend/routes/portal/consent.js',
  config: 'cp-portal/backend/routes/portal/config.js',
  chatbox: 'cp-portal/backend/routes/portal/chatbox.js',
  content: 'cp-portal/backend/routes/portal/content.js',
  saved: 'cp-portal/backend/routes/portal/saved.js',
}

const ADMIN_PAGE_FILES = {
  auth: 'cp-portal/frontend/src/admin/pages/LoginPage.jsx',
  news: 'cp-portal/frontend/src/admin/pages/NewsPage.jsx',
  documents: 'cp-portal/frontend/src/admin/pages/DocumentsPage.jsx',
  safety: 'cp-portal/frontend/src/admin/pages/SafetyPage.jsx',
  faq: 'cp-portal/frontend/src/admin/pages/FAQPage.jsx',
  users: 'cp-portal/frontend/src/admin/pages/PortalUsersPage.jsx',
  'portal-users': 'cp-portal/frontend/src/admin/pages/PortalUsersPage.jsx',
  'admin-users': 'cp-portal/frontend/src/admin/pages/AdminUsersPage.jsx',
  'review-queue': 'cp-portal/frontend/src/admin/pages/ReviewQueuePage.jsx',
  submissions: 'cp-portal/frontend/src/admin/pages/SubmissionsPage.jsx',
  audit: 'cp-portal/frontend/src/admin/pages/AuditTrailPage.jsx',
  analytics: 'cp-portal/frontend/src/admin/pages/AnalyticsPage.jsx',
  branding: 'cp-portal/frontend/src/admin/pages/BrandingPage.jsx',
  features: 'cp-portal/frontend/src/admin/pages/FeaturesPage.jsx',
  clients: 'cp-portal/frontend/src/admin/pages/ClientsPage.jsx',
  msls: 'cp-portal/frontend/src/admin/pages/MSLPage.jsx',
  feedback: 'cp-portal/frontend/src/admin/pages/FeedbackPage.jsx',
  compliance: 'cp-portal/frontend/src/admin/pages/CompliancePage.jsx',
  forms: 'cp-portal/frontend/src/admin/pages/FormsPage.jsx',
  gate: 'cp-portal/frontend/src/admin/pages/GatePage.jsx',
  integration: 'cp-portal/frontend/src/admin/pages/IntegrationPage.jsx',
  language: 'cp-portal/frontend/src/admin/pages/LanguagePage.jsx',
  templates: 'cp-portal/frontend/src/admin/pages/ContentPage.jsx',
  reports: 'cp-portal/frontend/src/admin/pages/CustomReportsPage.jsx',
  chatbox: 'cp-portal/frontend/src/admin/pages/ChatboxConfigPage.jsx',
  content: 'cp-portal/frontend/src/admin/pages/ContentPage.jsx',
  'email-config': 'cp-portal/frontend/src/admin/pages/EmailSettingsPage.jsx',
  'email-settings': 'cp-portal/frontend/src/admin/pages/EmailSettingsPage.jsx',
  'process-logs': 'cp-portal/frontend/src/admin/pages/ProcessExplorerPage.jsx',
  'process-explorer': 'cp-portal/frontend/src/admin/pages/ProcessExplorerPage.jsx',
}

const PORTAL_PAGE_FILES = {
  auth: 'cp-portal/frontend/src/portal/pages/LoginPage.jsx',
  news: 'cp-portal/frontend/src/portal/pages/NewsPage.jsx',
  documents: 'cp-portal/frontend/src/portal/pages/DocumentsPage.jsx',
  safety: 'cp-portal/frontend/src/portal/pages/SafetyPage.jsx',
  faq: 'cp-portal/frontend/src/portal/pages/FAQPage.jsx',
  feedback: 'cp-portal/frontend/src/portal/pages/ContactPage.jsx',
  submit: 'cp-portal/frontend/src/portal/pages/SubmitPage.jsx',
  bookings: 'cp-portal/frontend/src/portal/pages/FindMSLPage.jsx',
  notifications: 'cp-portal/frontend/src/portal/pages/PortalHomePage.jsx',
  preferences: 'cp-portal/frontend/src/portal/pages/PreferencesPage.jsx',
  consent: 'cp-portal/frontend/src/portal/pages/PortalHomePage.jsx',
  config: 'cp-portal/frontend/src/portal/pages/PortalHomePage.jsx',
  chatbox: 'cp-portal/frontend/src/portal/pages/PortalHomePage.jsx',
  content: 'cp-portal/frontend/src/portal/pages/ResourcesPage.jsx',
  saved: 'cp-portal/frontend/src/portal/pages/SavedItemsPage.jsx',
}

const ADMIN_TITLE_PAGE_RULES = [
  { re: /login|sign in/i, file: 'cp-portal/frontend/src/admin/pages/LoginPage.jsx' },
  { re: /news/i, file: 'cp-portal/frontend/src/admin/pages/NewsPage.jsx' },
  { re: /document/i, file: 'cp-portal/frontend/src/admin/pages/DocumentsPage.jsx' },
  { re: /safety/i, file: 'cp-portal/frontend/src/admin/pages/SafetyPage.jsx' },
  { re: /faq/i, file: 'cp-portal/frontend/src/admin/pages/FAQPage.jsx' },
  { re: /portal user|user management/i, file: 'cp-portal/frontend/src/admin/pages/PortalUsersPage.jsx' },
  { re: /admin user/i, file: 'cp-portal/frontend/src/admin/pages/AdminUsersPage.jsx' },
  { re: /review queue/i, file: 'cp-portal/frontend/src/admin/pages/ReviewQueuePage.jsx' },
  { re: /submission/i, file: 'cp-portal/frontend/src/admin/pages/SubmissionsPage.jsx' },
  { re: /audit/i, file: 'cp-portal/frontend/src/admin/pages/AuditTrailPage.jsx' },
  { re: /analytics/i, file: 'cp-portal/frontend/src/admin/pages/AnalyticsPage.jsx' },
  { re: /branding/i, file: 'cp-portal/frontend/src/admin/pages/BrandingPage.jsx' },
  { re: /feature/i, file: 'cp-portal/frontend/src/admin/pages/FeaturesPage.jsx' },
  { re: /client/i, file: 'cp-portal/frontend/src/admin/pages/ClientsPage.jsx' },
  { re: /msl/i, file: 'cp-portal/frontend/src/admin/pages/MSLPage.jsx' },
  { re: /feedback/i, file: 'cp-portal/frontend/src/admin/pages/FeedbackPage.jsx' },
  { re: /compliance/i, file: 'cp-portal/frontend/src/admin/pages/CompliancePage.jsx' },
  { re: /form/i, file: 'cp-portal/frontend/src/admin/pages/FormsPage.jsx' },
  { re: /gate/i, file: 'cp-portal/frontend/src/admin/pages/GatePage.jsx' },
  { re: /integration/i, file: 'cp-portal/frontend/src/admin/pages/IntegrationPage.jsx' },
  { re: /language/i, file: 'cp-portal/frontend/src/admin/pages/LanguagePage.jsx' },
  { re: /content/i, file: 'cp-portal/frontend/src/admin/pages/ContentPage.jsx' },
  { re: /report/i, file: 'cp-portal/frontend/src/admin/pages/CustomReportsPage.jsx' },
  { re: /chatbox/i, file: 'cp-portal/frontend/src/admin/pages/ChatboxConfigPage.jsx' },
  { re: /email/i, file: 'cp-portal/frontend/src/admin/pages/EmailSettingsPage.jsx' },
  { re: /process explorer/i, file: 'cp-portal/frontend/src/admin/pages/ProcessExplorerPage.jsx' },
]

const PORTAL_TITLE_PAGE_RULES = [
  { re: /verify email/i, file: 'cp-portal/frontend/src/portal/pages/VerifyEmailPage.jsx' },
  { re: /login|register|sign in|logout/i, file: 'cp-portal/frontend/src/portal/pages/LoginPage.jsx' },
  { re: /news detail|single news|post detail/i, file: 'cp-portal/frontend/src/portal/pages/NewsDetailPage.jsx' },
  { re: /news/i, file: 'cp-portal/frontend/src/portal/pages/NewsPage.jsx' },
  { re: /document/i, file: 'cp-portal/frontend/src/portal/pages/DocumentsPage.jsx' },
  { re: /safety/i, file: 'cp-portal/frontend/src/portal/pages/SafetyPage.jsx' },
  { re: /faq/i, file: 'cp-portal/frontend/src/portal/pages/FAQPage.jsx' },
  { re: /submit|inquiry/i, file: 'cp-portal/frontend/src/portal/pages/SubmitPage.jsx' },
  { re: /submission/i, file: 'cp-portal/frontend/src/portal/pages/MySubmissionsPage.jsx' },
  { re: /booking|meeting|msl/i, file: 'cp-portal/frontend/src/portal/pages/FindMSLPage.jsx' },
  { re: /saved/i, file: 'cp-portal/frontend/src/portal/pages/SavedItemsPage.jsx' },
  { re: /preference/i, file: 'cp-portal/frontend/src/portal/pages/PreferencesPage.jsx' },
  { re: /home|dashboard|portal home/i, file: 'cp-portal/frontend/src/portal/pages/PortalHomePage.jsx' },
  { re: /resource/i, file: 'cp-portal/frontend/src/portal/pages/ResourcesPage.jsx' },
  { re: /therapeutic/i, file: 'cp-portal/frontend/src/portal/pages/TherapeuticAreasPage.jsx' },
  { re: /event/i, file: 'cp-portal/frontend/src/portal/pages/EventsPage.jsx' },
  { re: /drug/i, file: 'cp-portal/frontend/src/portal/pages/DrugInfoPage.jsx' },
  { re: /contact|feedback/i, file: 'cp-portal/frontend/src/portal/pages/ContactPage.jsx' },
]

function extractRouteSegment(apiRoute) {
  if (!apiRoute) return null
  const m = apiRoute.match(/\/api\/(admin|portal)\/([^?\s]+)/i)
  if (!m) return null
  const path = m[2].replace(/^\//, '')
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'clients' && parts[1]) return parts[1]
  return parts[0] || null
}

function inferBackendFileFromRoute(apiRoute) {
  const seg = extractRouteSegment(apiRoute)
  if (!seg) return null
  if (/\/api\/admin\//i.test(apiRoute)) return ADMIN_ROUTE_FILES[seg] || null
  if (/\/api\/portal\//i.test(apiRoute)) return PORTAL_ROUTE_FILES[seg] || null
  return null
}

function inferFrontendFile(flow, apiRoute, stepText) {
  const seg = extractRouteSegment(apiRoute)
  if (flow?.source === 'admin') {
    if (seg && ADMIN_PAGE_FILES[seg]) return ADMIN_PAGE_FILES[seg]
    for (const rule of ADMIN_TITLE_PAGE_RULES) {
      if (rule.re.test(stepText)) return rule.file
    }
  }
  if (flow?.source === 'portal') {
    if (seg && PORTAL_PAGE_FILES[seg]) return PORTAL_PAGE_FILES[seg]
    for (const rule of PORTAL_TITLE_PAGE_RULES) {
      if (rule.re.test(stepText)) return rule.file
    }
  }
  return null
}

function inferFileRef(step, flow, apiRoute) {
  if (step.file) return { file: step.file, line: step.line }
  const routeFile = inferBackendFileFromRoute(apiRoute)
  const text = [step.label, step.detail, flow?.title].filter(Boolean).join(' ').toLowerCase()
  const isUi = step.concept?.startsWith('🖥') || /click|open|render|page|form|ui|screen|tab|modal|select|navigate|load/i.test(text)
  const frontendFile = inferFrontendFile(flow, apiRoute, text)
  if (isUi && frontendFile) return { file: frontendFile }
  if (routeFile) return { file: routeFile }
  if (frontendFile) return { file: frontendFile }
  if (/authenticate|requireclientaccess|requireportalauth|requireadmin|requirerole/i.test(text)) {
    return { file: 'cp-portal/backend/middleware/auth.js' }
  }
  if (/audit/.test(text)) return { file: 'cp-portal/backend/utils/audit.js' }
  if (/notify|notification/.test(text)) return { file: 'cp-portal/backend/utils/notify.js' }
  return null
}

function inferRequestBody(step, flow) {
  if (step.requestBody) return step.requestBody
  const text = [step.label, step.detail, flow.title].join(' ').toLowerCase()
  if (/login/.test(text)) return '{ email, password }'
  if (/self-registration|register/.test(text)) return '{ name, email, password, user_type }'
  if (/create account/.test(text)) return '{ name, email, password }'
  if (/verify/.test(text)) return '{ token }'
  if (/upload/.test(text)) return 'FormData(file + metadata)'
  if (/publish/.test(text)) return '{ status: "published" }'
  if (/delete/.test(text)) return '{ id }'
  if (/feedback/.test(text)) return '{ rating, message, page_url }'
  if (/booking|meeting/.test(text)) return '{ requester_name, requester_email, preferred_date, topic }'
  if (/consent/.test(text)) return '{ choices, version }'
  if (/preferences|notif/.test(text)) return '{ notif_prefs }'
  if (/bulk/.test(text)) return '{ ids: [...], action: "publish" }'
  if (/faq/.test(text)) return '{ question, answer }'
  if (/news|document|safety|msl/.test(text)) return '{ title, body, status }'
  return 'N/A'
}

function inferResponseBody(step, flow) {
  if (step.responseBody) return step.responseBody
  const text = [step.label, step.detail, flow.title].join(' ').toLowerCase()
  if (/delete/.test(text)) return '{ ok: true }'
  if (/create|upload|register|save|publish|update|approve|reject|sync/.test(text)) return '{ id, ok: true }'
  if (/login|verify/.test(text)) return '{ user, token }'
  if (/fetch|load|list|detail|view|search/.test(text)) return '{ items: [...] }'
  return '{ ok: true }'
}

function inferStatusMeaning(step, flow) {
  if (step.statusMeaning) return step.statusMeaning
  const text = [step.label, step.detail, flow.title].join(' ').toLowerCase()
  if (/unauthorized|session|token/.test(text)) return '401 Unauthorized — the session is missing or invalid'
  if (/forbidden|role|permission|access/.test(text)) return '403 Forbidden — the user is authenticated but not allowed'
  if (/not found|missing/.test(text)) return '404 Not Found — the requested item does not exist'
  if (/validate|invalid|required|empty/.test(text)) return '422 Validation Failed — the request body is incomplete or invalid'
  if (/create|upload|register|publish|save/.test(text)) return '201 Created — the new record was saved successfully'
  if (/delete/.test(text)) return '200 OK — the item was removed successfully'
  if (/fetch|load|read|list|view|detail|search/.test(text)) return '200 OK — the data was returned successfully'
  return '200 OK — the step completed successfully'
}

function inferDbQuery(step, flow) {
  if (step.dbQuery) return step.dbQuery
  const text = [step.label, step.detail, flow.title].join(' ').toLowerCase()
  if (/select|fetch|read|list|count|view|detail/.test(text)) return 'SELECT ...'
  if (/insert|create|upload|register|save|publish|approve|reject|send/.test(text)) return 'INSERT INTO ...'
  if (/update|toggle|sync|accept|consent/.test(text)) return 'UPDATE ...'
  if (/delete|remove|archive/.test(text)) return 'DELETE FROM ...'
  return 'N/A'
}

function inferWhy(step, flow) {
  if (step.whyItExists) return step.whyItExists
  const text = [step.label, flow.title].join(' ').toLowerCase()
  if (/login/.test(text)) return 'The app needs to identify the user before it can allow access.'
  if (/register|registration/.test(text)) return 'The app needs to create a new account before the user can sign in.'
  if (/email verification|verify/.test(text)) return 'The app needs to prove that the email address really belongs to the user.'
  if (/publish|update|create|save|upload/.test(text)) return 'The server must persist the change so the data is not lost on refresh.'
  if (/delete/.test(text)) return 'The app needs a safe way to remove data from the system.'
  if (/fetch|load|view|list/.test(text)) return 'The UI needs fresh data from the backend to render the page.'
  if (/notify|email|alert/.test(text)) return 'Users need to be informed when important events happen.'
  return 'This step exists so the workflow can continue in a controlled way.'
}

function inferWrong(step, flow) {
  if (step.whatCouldGoWrong) return step.whatCouldGoWrong
  const text = [step.label, flow.title].join(' ').toLowerCase()
  if (/login|auth|session|token/.test(text)) return 'Token expired or missing → 401'
  if (/role|permission|access/.test(text)) return 'Insufficient permission → 403'
  if (/validate|required|body/.test(text)) return 'Missing field or invalid input → 422'
  if (/delete/.test(text)) return 'Wrong item selected or row not found → 404'
  if (/upload/.test(text)) return 'File too large or invalid format → 400/413'
  if (/notify|email/.test(text)) return 'Notification service unavailable → 500'
  return 'Unexpected backend or network error → 500'
}

function inferSecurity(step, flow) {
  if (step.securityNote) return step.securityNote
  const text = [step.label, flow.title].join(' ').toLowerCase()
  if (/login|auth|session|token/.test(text)) return 'The backend validates the session before any protected action runs.'
  if (/upload/.test(text)) return 'Uploaded files are stored behind auth-protected paths.'
  if (/delete|publish|save|update/.test(text)) return 'The server checks access and uses parameterized queries before writing.'
  if (/email|notify/.test(text)) return 'Only the intended users receive notifications.'
  return 'The backend still validates input and permissions before completing the action.'
}

function inferBeforeAfter(step, flow) {
  if (step.beforeAfter) return step.beforeAfter
  const text = [step.label, flow.title].join(' ').toLowerCase()
  if (/login|register/.test(text)) return { before: 'User is not authenticated', after: 'User is signed in or account is created' }
  if (/publish|update|save/.test(text)) return { before: 'Old data is shown', after: 'The new data is stored and displayed' }
  if (/delete/.test(text)) return { before: 'Item exists in the list', after: 'Item is removed from the system' }
  if (/fetch|load|view|list/.test(text)) return { before: 'No data shown yet', after: 'Fresh data appears on the screen' }
  if (/email|notify|alert/.test(text)) return { before: 'No alert sent yet', after: 'A notification is delivered or queued' }
  return { before: 'Step has not completed yet', after: 'The workflow moves to the next stage' }
}

function inferBeginnerTip(step, flow) {
  if (step.beginnerTip) return step.beginnerTip
  const text = [step.label, flow.title].join(' ').toLowerCase()
  if (/login|register/.test(text)) return 'Think of it like showing your ID before entering a building.'
  if (/publish|save|update|create/.test(text)) return 'This is like clicking Save after editing a form.'
  if (/delete/.test(text)) return 'This is like removing something only after confirming it.'
  if (/fetch|load|list|view/.test(text)) return 'The frontend asks the server for fresh data, then redraws the page.'
  if (/notify|email|alert/.test(text)) return 'The system is broadcasting an update to the right people.'
  return 'The browser sends a request, the server processes it, and the UI updates with the result.'
}

function inferMistake(step, flow) {
  if (step.commonMistake) return step.commonMistake
  const text = [step.label, flow.title].join(' ').toLowerCase()
  if (/login|auth|session|token/.test(text)) return 'Forgetting credentials: "include" or trusting the frontend to enforce auth.'
  if (/publish|save|update|create/.test(text)) return 'Updating the UI before the database confirms success.'
  if (/delete/.test(text)) return 'Removing the row locally before the server confirms the delete.'
  if (/upload/.test(text)) return 'Sending file data as JSON instead of multipart/form-data.'
  if (/notify|email/.test(text)) return 'Ignoring user notification preferences before sending alerts.'
  return 'Skipping server validation and assuming the UI state is enough.'
}

export function normalizeFlowTemplate(flow) {
  if (!flow || !Array.isArray(flow.steps)) return flow
  return {
    ...flow,
    steps: flow.steps.map((step, idx) => {
      const concept = inferConcept(step, flow)
      const apiRoute = inferApiRoute(step, flow)
      const inferredFile = inferFileRef({ ...step, concept }, flow, apiRoute)
      return {
        ...step,
        concept,
        apiRoute,
        file: step.file || inferredFile?.file,
        line: step.line || inferredFile?.line,
        requestBody: inferRequestBody(step, flow),
        responseBody: inferResponseBody(step, flow),
        statusMeaning: inferStatusMeaning(step, flow),
        dbQuery: inferDbQuery(step, flow),
        whyItExists: inferWhy(step, flow),
        whatCouldGoWrong: inferWrong(step, flow),
        securityNote: inferSecurity(step, flow),
        beforeAfter: inferBeforeAfter(step, flow),
        beginnerTip: inferBeginnerTip(step, flow),
        commonMistake: inferMistake(step, flow),
        stepIndex: idx + 1,
      }
    }),
  }
}
