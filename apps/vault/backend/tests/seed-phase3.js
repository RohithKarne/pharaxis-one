/* eslint-disable no-console */
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const mysql = require('mysql2/promise')

const config = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'devuser',
  password: process.env.MYSQL_PASSWORD || 'devpass',
  database: process.env.MYSQL_DATABASE || 'pharaxis_vault_dev'
}

const ORG_SLUG = process.env.PHASE3_ORG_SLUG || 'novartis'
const ORG_NAME = process.env.PHASE3_ORG_NAME || 'Novartis'
const DOC_PREFIX = process.env.PHASE3_DOC_PREFIX || 'NVS'
const CONTENT_TYPE_CODE = process.env.PHASE3_CONTENT_TYPE_CODE || 'SOP'

const USERS = {
  admin: { name: 'Vault Admin', email: process.env.PHASE3_ADMIN_EMAIL || 'admin@novartis.local', password: process.env.PHASE3_ADMIN_PASSWORD || 'Admin@123' },
  author: { name: 'Vault Author', email: process.env.PHASE3_AUTHOR_EMAIL || 'author@novartis.local', password: process.env.PHASE3_AUTHOR_PASSWORD || 'Author@123' },
  reviewer: { name: 'Vault Reviewer', email: process.env.PHASE3_REVIEWER_EMAIL || 'reviewer@novartis.local', password: process.env.PHASE3_REVIEWER_PASSWORD || 'Reviewer@123' },
  approver: { name: 'Vault Approver', email: process.env.PHASE3_APPROVER_EMAIL || 'approver@novartis.local', password: process.env.PHASE3_APPROVER_PASSWORD || 'Approver@123' },
  viewer: { name: 'Vault Viewer', email: process.env.PHASE3_VIEWER_EMAIL || 'viewer@novartis.local', password: process.env.PHASE3_VIEWER_PASSWORD || 'Viewer@123' }
}

function daysFromNow(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function hoursFromNow(hours) {
  const date = new Date()
  date.setHours(date.getHours() + hours)
  return date
}

function snapshotHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

async function ensureOrg(connection) {
  const [[existing]] = await connection.execute(
    `SELECT id, name, slug, doc_number_prefix
     FROM orgs
     WHERE slug = ?
     LIMIT 1`,
    [ORG_SLUG]
  )
  if (existing) return existing

  const [result] = await connection.execute(
    `INSERT INTO orgs (name, slug, status, doc_number_prefix, storage_quota_mb, created_by)
     VALUES (?, ?, 'active', ?, 10240, NULL)`,
    [ORG_NAME, ORG_SLUG, DOC_PREFIX]
  )
  return { id: result.insertId, name: ORG_NAME, slug: ORG_SLUG, doc_number_prefix: DOC_PREFIX }
}

async function ensureUser(connection, orgId, role, userSeed) {
  const passwordHash = await bcrypt.hash(userSeed.password, 10)
  const [[existing]] = await connection.execute(
    `SELECT id, role
     FROM users
     WHERE org_id = ? AND email = ?
     LIMIT 1`,
    [orgId, userSeed.email]
  )

  if (!existing) {
    const [insert] = await connection.execute(
      `INSERT INTO users (org_id, name, email, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [orgId, userSeed.name, userSeed.email, passwordHash, role]
    )
    return { id: insert.insertId, role }
  }

  await connection.execute(
    `UPDATE users
     SET name = ?, password_hash = ?, role = ?, is_active = 1
     WHERE id = ? AND org_id = ?`,
    [userSeed.name, passwordHash, role, existing.id, orgId]
  )

  return { id: existing.id, role }
}

async function ensureContentType(connection, orgId, createdBy) {
  const [[existing]] = await connection.execute(
    `SELECT id
     FROM content_types
     WHERE org_id = ? AND code = ?
     LIMIT 1`,
    [orgId, CONTENT_TYPE_CODE]
  )
  if (existing) return existing.id

  const [insert] = await connection.execute(
    `INSERT INTO content_types (org_id, name, code, is_active)
     VALUES (?, ?, ?, 1)`,
    [orgId, `${CONTENT_TYPE_CODE} Documents`, CONTENT_TYPE_CODE]
  )
  const contentTypeId = insert.insertId

  const defaultStates = [
    { name: 'Draft', code: 'draft', initial: 1, terminal: 0 },
    { name: 'In Review', code: 'in_review', initial: 0, terminal: 0 },
    { name: 'Approved', code: 'approved', initial: 0, terminal: 0 },
    { name: 'Published', code: 'published', initial: 0, terminal: 0 },
    { name: 'Archived', code: 'archived', initial: 0, terminal: 1 }
  ]
  for (const state of defaultStates) {
    await connection.execute(
      `INSERT INTO lifecycle_states (org_id, content_type_id, state_name, state_code, is_initial, is_terminal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orgId, contentTypeId, state.name, state.code, state.initial, state.terminal]
    )
  }

  await connection.execute(
    `INSERT INTO vault_audit_log (org_id, user_id, user_type, action, entity_type, entity_id, notes)
     VALUES (?, ?, 'org_user', 'seed_content_type_created', 'content_type', ?, ?)`,
    [orgId, createdBy, contentTypeId, 'Phase 3 seed content type created']
  )

  return contentTypeId
}

async function ensureFolder(connection, orgId, createdBy) {
  const folderName = 'Phase 3 UAT'
  const folderPath = '/Phase 3 UAT'
  const [[existing]] = await connection.execute(
    `SELECT id, name, path
     FROM vault_folders
     WHERE org_id = ? AND path = ?
     LIMIT 1`,
    [orgId, folderPath]
  )
  if (existing) return existing.id

  const [insert] = await connection.execute(
    `INSERT INTO vault_folders (org_id, parent_id, name, path, created_by)
     VALUES (?, NULL, ?, ?, ?)`,
    [orgId, folderName, folderPath, createdBy]
  )
  return insert.insertId
}

async function ensureContent(connection, {
  orgId,
  contentTypeId,
  folderId,
  createdBy,
  title,
  lifecycleState,
  effectiveDate,
  expiryDate
}) {
  const [[existing]] = await connection.execute(
    `SELECT id, doc_number, current_version_id
     FROM vault_content
     WHERE org_id = ? AND title = ?
     LIMIT 1`,
    [orgId, title]
  )

  if (existing) return existing.id

  const docNumber = `${DOC_PREFIX}-P3-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`
  const [contentInsert] = await connection.execute(
    `INSERT INTO vault_content
       (org_id, doc_number, title, folder_id, content_type_id, lifecycle_state, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orgId, docNumber, title, folderId, contentTypeId, lifecycleState, createdBy]
  )
  const contentId = contentInsert.insertId

  const [versionInsert] = await connection.execute(
    `INSERT INTO vault_versions
       (org_id, content_id, version_number, file_name, file_path, s3_key, file_size_kb, mime_type, checksum, uploaded_by)
     VALUES (?, ?, '1.0', ?, ?, ?, 120, 'application/pdf', ?, ?)`,
    [
      orgId,
      contentId,
      `${title.replace(/\s+/g, '_')}.pdf`,
      `/seed/phase3/${contentId}.pdf`,
      `seed/phase3/${contentId}.pdf`,
      snapshotHash({ contentId, title, version: '1.0' }),
      createdBy
    ]
  )

  await connection.execute(
    `UPDATE vault_content
     SET current_version_id = ?
     WHERE id = ? AND org_id = ?`,
    [versionInsert.insertId, contentId, orgId]
  )

  await connection.execute(
    `INSERT INTO vault_metadata
       (org_id, content_id, description, language, country_region, audience, confidentiality, regulated, therapeutic_area, product_brand, department, keywords, effective_date, expiry_date, review_cycle_months)
     VALUES (?, ?, ?, 'English', 'US', 'internal', 'confidential', 1, 'Oncology', 'Phase3Brand', 'Medical Affairs', ?, ?, ?, 12)`,
    [
      orgId,
      contentId,
      `${title} seeded for phase 3 UAT`,
      'phase3,uat,vault',
      effectiveDate,
      expiryDate
    ]
  )

  return contentId
}

async function ensureTemplate(connection, orgId, createdBy) {
  const templateName = 'Phase 3 Quality Workflow'
  const [[existing]] = await connection.execute(
    `SELECT id
     FROM workflow_templates
     WHERE org_id = ? AND name = ?
     LIMIT 1`,
    [orgId, templateName]
  )

  let templateId = existing?.id
  if (!templateId) {
    const [insert] = await connection.execute(
      `INSERT INTO workflow_templates (org_id, name, description, is_active, created_by)
       VALUES (?, ?, ?, 1, ?)`,
      [orgId, templateName, 'Review -> Approval -> Signature with escalation test coverage', createdBy]
    )
    templateId = insert.insertId
  }

  await connection.execute(
    `UPDATE workflow_templates
     SET description = ?, is_active = 1
     WHERE id = ? AND org_id = ?`,
    ['Review -> Approval -> Signature with escalation test coverage', templateId, orgId]
  )

  await connection.execute(
    `DELETE FROM workflow_template_steps
     WHERE template_id = ? AND org_id = ?`,
    [templateId, orgId]
  )

  const steps = [
    { step_order: 1, task_type: 'review', assignee_role: 'reviewer', due_in_hours: 6 },
    { step_order: 2, task_type: 'approval', assignee_role: 'approver', due_in_hours: 24 },
    { step_order: 3, task_type: 'signature', assignee_role: 'admin', due_in_hours: 48 }
  ]
  for (const step of steps) {
    await connection.execute(
      `INSERT INTO workflow_template_steps
         (template_id, org_id, step_order, task_type, assignee_role, due_in_hours, require_signature)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [templateId, orgId, step.step_order, step.task_type, step.assignee_role, step.due_in_hours]
    )
  }

  return templateId
}

async function ensureActiveWorkflowScenario(connection, {
  orgId,
  contentId,
  adminId,
  reviewerId,
  approverId
}) {
  const [[existingInstance]] = await connection.execute(
    `SELECT id
     FROM workflow_instances
     WHERE org_id = ? AND content_id = ? AND status = 'active'
     ORDER BY started_at DESC
     LIMIT 1`,
    [orgId, contentId]
  )

  let workflowInstanceId = existingInstance?.id
  if (!workflowInstanceId) {
    const [insert] = await connection.execute(
      `INSERT INTO workflow_instances (org_id, content_id, status, started_by)
       VALUES (?, ?, 'active', ?)`,
      [orgId, contentId, adminId]
    )
    workflowInstanceId = insert.insertId
  }

  const [existingTasks] = await connection.execute(
    `SELECT id, step_order
     FROM workflow_tasks
     WHERE org_id = ? AND workflow_instance_id = ?
     ORDER BY step_order ASC`,
    [orgId, workflowInstanceId]
  )
  const existingByStep = new Map(existingTasks.map(task => [Number(task.step_order), task]))

  const taskSpecs = [
    {
      step_order: 1,
      assignee_user_id: reviewerId,
      assigned_by: adminId,
      task_type: 'review',
      status: 'pending',
      activation_status: 'ready',
      due_at: hoursFromNow(-2)
    },
    {
      step_order: 2,
      assignee_user_id: approverId,
      assigned_by: adminId,
      task_type: 'approval',
      status: 'pending',
      activation_status: 'waiting',
      due_at: hoursFromNow(20)
    },
    {
      step_order: 3,
      assignee_user_id: adminId,
      assigned_by: adminId,
      task_type: 'signature',
      status: 'pending',
      activation_status: 'waiting',
      due_at: hoursFromNow(44)
    }
  ]

  for (const spec of taskSpecs) {
    const existingTask = existingByStep.get(spec.step_order)
    if (!existingTask) {
      await connection.execute(
        `INSERT INTO workflow_tasks
           (workflow_instance_id, step_order, org_id, content_id, assignee_user_id, assigned_by, task_type, status, activation_status, due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          workflowInstanceId,
          spec.step_order,
          orgId,
          contentId,
          spec.assignee_user_id,
          spec.assigned_by,
          spec.task_type,
          spec.status,
          spec.activation_status,
          spec.due_at
        ]
      )
      continue
    }

    await connection.execute(
      `UPDATE workflow_tasks
       SET assignee_user_id = ?, assigned_by = ?, task_type = ?, status = ?, activation_status = ?, due_at = ?,
           completed_at = NULL, signature_id = NULL
       WHERE id = ? AND org_id = ?`,
      [
        spec.assignee_user_id,
        spec.assigned_by,
        spec.task_type,
        spec.status,
        spec.activation_status,
        spec.due_at,
        existingTask.id,
        orgId
      ]
    )
  }

  const [[taskOne]] = await connection.execute(
    `SELECT id
     FROM workflow_tasks
     WHERE org_id = ? AND workflow_instance_id = ? AND step_order = 1
     LIMIT 1`,
    [orgId, workflowInstanceId]
  )
  const [[commentExists]] = await connection.execute(
    `SELECT id
     FROM workflow_task_comments
     WHERE org_id = ? AND workflow_task_id = ? AND comment_text = ?
     LIMIT 1`,
    [orgId, taskOne.id, 'Phase 3 seeded comment: awaiting reviewer action.']
  )
  if (!commentExists) {
    await connection.execute(
      `INSERT INTO workflow_task_comments
         (org_id, workflow_task_id, content_id, user_id, comment_text)
       VALUES (?, ?, ?, ?, ?)`,
      [orgId, taskOne.id, contentId, adminId, 'Phase 3 seeded comment: awaiting reviewer action.']
    )
  }
}

async function ensureCompletedWorkflowScenario(connection, {
  orgId,
  contentId,
  adminId,
  approverId
}) {
  const [[existingInstance]] = await connection.execute(
    `SELECT id
     FROM workflow_instances
     WHERE org_id = ? AND content_id = ? AND status = 'completed'
     ORDER BY completed_at DESC, id DESC
     LIMIT 1`,
    [orgId, contentId]
  )
  if (existingInstance) return

  const [instanceInsert] = await connection.execute(
    `INSERT INTO workflow_instances
       (org_id, content_id, status, started_by, started_at, completed_at)
     VALUES (?, ?, 'completed', ?, NOW(), NOW())`,
    [orgId, contentId, adminId]
  )
  const workflowInstanceId = instanceInsert.insertId

  const [taskInsert] = await connection.execute(
    `INSERT INTO workflow_tasks
       (workflow_instance_id, step_order, org_id, content_id, assignee_user_id, assigned_by, task_type, status, activation_status, due_at, completed_at)
     VALUES (?, 1, ?, ?, ?, ?, 'approval', 'completed', 'ready', ?, NOW())`,
    [workflowInstanceId, orgId, contentId, approverId, adminId, hoursFromNow(-12)]
  )
  const taskId = taskInsert.insertId

  const hash = snapshotHash({
    org_id: orgId,
    content_id: contentId,
    workflow_task_id: taskId,
    signer_user_id: approverId,
    signature_meaning: 'approved',
    signed_at: new Date().toISOString()
  })

  const [signatureInsert] = await connection.execute(
    `INSERT INTO vault_signatures
       (org_id, content_id, workflow_task_id, signer_user_id, signature_meaning, signature_comment, password_reverified, hash_snapshot, ip_address)
     VALUES (?, ?, ?, ?, 'approved', ?, 1, ?, '127.0.0.1')`,
    [orgId, contentId, taskId, approverId, 'Phase 3 seeded approval signature', hash]
  )

  await connection.execute(
    `UPDATE workflow_tasks
     SET signature_id = ?
     WHERE id = ? AND org_id = ?`,
    [signatureInsert.insertId, taskId, orgId]
  )
}

async function run() {
  const connection = await mysql.createConnection(config)
  try {
    const org = await ensureOrg(connection)

    const roleUsers = {}
    for (const [role, userSeed] of Object.entries(USERS)) {
      roleUsers[role] = await ensureUser(connection, org.id, role, userSeed)
    }

    const contentTypeId = await ensureContentType(connection, org.id, roleUsers.admin.id)
    const folderId = await ensureFolder(connection, org.id, roleUsers.admin.id)

    const contentActiveId = await ensureContent(connection, {
      orgId: org.id,
      contentTypeId,
      folderId,
      createdBy: roleUsers.author.id,
      title: 'PHASE3-UAT: Investigator Brochure Amendment',
      lifecycleState: 'in_review',
      effectiveDate: daysFromNow(-2),
      expiryDate: daysFromNow(45)
    })

    const contentCompletedId = await ensureContent(connection, {
      orgId: org.id,
      contentTypeId,
      folderId,
      createdBy: roleUsers.author.id,
      title: 'PHASE3-UAT: Medical Information Response Card',
      lifecycleState: 'approved',
      effectiveDate: daysFromNow(-7),
      expiryDate: daysFromNow(120)
    })

    await ensureTemplate(connection, org.id, roleUsers.admin.id)
    await ensureActiveWorkflowScenario(connection, {
      orgId: org.id,
      contentId: contentActiveId,
      adminId: roleUsers.admin.id,
      reviewerId: roleUsers.reviewer.id,
      approverId: roleUsers.approver.id
    })
    await ensureCompletedWorkflowScenario(connection, {
      orgId: org.id,
      contentId: contentCompletedId,
      adminId: roleUsers.admin.id,
      approverId: roleUsers.approver.id
    })

    console.log('Phase 3 seed complete')
    console.log(`Org: ${org.slug} (#${org.id})`)
    console.log('Users:')
    for (const [role, userSeed] of Object.entries(USERS)) {
      console.log(`  - ${role}: ${userSeed.email}`)
    }
    console.log('Content seeded:')
    console.log('  - PHASE3-UAT: Investigator Brochure Amendment (active workflow)')
    console.log('  - PHASE3-UAT: Medical Information Response Card (completed workflow with signature)')
  } finally {
    await connection.end()
  }
}

run().catch(error => {
  console.error('Phase 3 seed failed:', error.message)
  process.exit(1)
})
