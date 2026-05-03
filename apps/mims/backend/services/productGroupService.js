'use strict';

const pool = require('../database/db');

const GROUP_TYPES = Object.freeze({
  transmissions: 'Transmissions Product Group',
  cdr: 'CDR Product Group',
  analytics: 'Analytics Product Group',
  custom_form: 'Custom Form Product Group',
  dccr_cdor: 'DCCR & CDOR Product Group',
  response: 'Response Product Group',
});

const MEMBER_TYPES = new Set(['product_family', 'product', 'country_authorization']);
const TARGET_TYPES = new Set(['transmission_rule', 'report_definition', 'case_form_definition', 'cm_template', 'site_response_template']);

function requireGroupType(groupType) {
  const normalized = String(groupType || '').trim();
  if (!GROUP_TYPES[normalized]) throw new Error(`Unsupported product group type: ${groupType}`);
  return normalized;
}

function requireMemberType(memberType) {
  const normalized = String(memberType || '').trim();
  if (!MEMBER_TYPES.has(normalized)) throw new Error(`Unsupported product group member type: ${memberType}`);
  return normalized;
}

function requireTargetType(targetType) {
  const normalized = String(targetType || '').trim();
  if (!TARGET_TYPES.has(normalized)) throw new Error(`Unsupported product group assignment target type: ${targetType}`);
  return normalized;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function normalizeGroup(row) {
  if (!row) return null;
  return {
    ...row,
    group_type_label: GROUP_TYPES[row.group_type] || row.group_type,
    member_count: Number(row.member_count || 0),
    assignment_count: Number(row.assignment_count || 0),
  };
}

function normalizeMember(row) {
  if (!row) return null;
  return {
    ...row,
    member_label: row.member_label || `${row.member_type} #${row.member_id}`,
  };
}

function normalizeAssignment(row) {
  if (!row) return null;
  return {
    ...row,
    metadata: parseJson(row.metadata, {}),
    target_label: row.target_label || `${row.target_type}${row.target_id ? ` #${row.target_id}` : ''}`,
  };
}

function scopedClause(alias, orgId) {
  return `(${alias}.org_id IS NULL OR ${alias}.org_id = ?)`;
}

async function listProductGroups(orgId, filters = {}) {
  const params = [orgId];
  let where = `WHERE ${scopedClause('pg', orgId)}`;
  if (filters.group_type) {
    where += ' AND pg.group_type = ?';
    params.push(requireGroupType(filters.group_type));
  }
  if (filters.is_active !== undefined) {
    where += ' AND pg.is_active = ?';
    params.push(filters.is_active === true || filters.is_active === 'true' || filters.is_active === '1' ? 1 : 0);
  }
  if (filters.search) {
    where += ' AND (pg.name LIKE ? OR pg.description LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const [rows] = await pool.execute(
    `SELECT pg.*,
            COUNT(DISTINCT pgm.id) AS member_count,
            COUNT(DISTINCT pga.id) AS assignment_count
       FROM product_groups pg
       LEFT JOIN product_group_members pgm ON pgm.group_id = pg.id
       LEFT JOIN product_group_assignments pga ON pga.group_id = pg.id
       ${where}
       GROUP BY pg.id
       ORDER BY pg.group_type ASC, pg.name ASC`,
    params
  );
  return rows.map(normalizeGroup);
}

async function getProductGroup(orgId, groupId) {
  const [rows] = await pool.execute(
    `SELECT pg.*,
            COUNT(DISTINCT pgm.id) AS member_count,
            COUNT(DISTINCT pga.id) AS assignment_count
       FROM product_groups pg
       LEFT JOIN product_group_members pgm ON pgm.group_id = pg.id
       LEFT JOIN product_group_assignments pga ON pga.group_id = pg.id
      WHERE pg.id = ? AND ${scopedClause('pg', orgId)}
      GROUP BY pg.id`,
    [groupId, orgId]
  );
  return normalizeGroup(rows[0]);
}

async function listMembers(orgId, groupId) {
  const group = await getProductGroup(orgId, groupId);
  if (!group) return null;
  const [rows] = await pool.execute(
    `SELECT pgm.*,
            CASE
              WHEN pgm.member_type = 'product_family' THEN pf.name
              WHEN pgm.member_type = 'product' THEN p.trade_name
              WHEN pgm.member_type = 'country_authorization' THEN CONCAT(pca.country, ' - ', COALESCE(pca.auth_number, 'Authorization'))
              ELSE NULL
            END AS member_label
       FROM product_group_members pgm
       LEFT JOIN product_families pf ON pgm.member_type = 'product_family' AND pf.id = pgm.member_id
       LEFT JOIN products p ON pgm.member_type = 'product' AND p.id = pgm.member_id
       LEFT JOIN product_country_authorizations pca ON pgm.member_type = 'country_authorization' AND pca.id = pgm.member_id
      WHERE pgm.group_id = ?
      ORDER BY pgm.member_type ASC, member_label ASC`,
    [groupId]
  );
  return rows.map(normalizeMember);
}

async function listAssignments(orgId, groupId) {
  const group = await getProductGroup(orgId, groupId);
  if (!group) return null;
  const [rows] = await pool.execute(
    `SELECT pga.*,
            CASE
              WHEN pga.target_type = 'report_definition' THEN rd.name
              WHEN pga.target_type = 'case_form_definition' THEN CONCAT(cfd.case_type, ' - ', cfd.section_name)
              WHEN pga.target_type = 'cm_template' THEN ct.name
              WHEN pga.target_type = 'site_response_template' THEN CONCAT('Site response template #', pga.target_id)
              WHEN pga.target_type = 'transmission_rule' THEN COALESCE(JSON_UNQUOTE(JSON_EXTRACT(pga.metadata, '$.label')), CONCAT('Transmission rule #', pga.target_id))
              ELSE NULL
            END AS target_label
       FROM product_group_assignments pga
       LEFT JOIN report_definitions rd ON pga.target_type = 'report_definition' AND rd.id = pga.target_id
       LEFT JOIN case_form_definition cfd ON pga.target_type = 'case_form_definition' AND cfd.id = pga.target_id
       LEFT JOIN cm_templates ct ON pga.target_type = 'cm_template' AND ct.id = pga.target_id
      WHERE pga.group_id = ?
      ORDER BY pga.target_type ASC, target_label ASC`,
    [groupId]
  );
  return rows.map(normalizeAssignment);
}

async function resolveProductGroups({ orgId, groupType, targetType = null, productId = null, country = null }) {
  const normalizedGroupType = requireGroupType(groupType);
  const normalizedTargetType = targetType ? requireTargetType(targetType) : null;
  const joinParams = [];
  const whereParams = [orgId];
  let targetJoin = '';
  if (normalizedTargetType) {
    targetJoin = 'INNER JOIN product_group_assignments pga_filter ON pga_filter.group_id = pg.id AND pga_filter.target_type = ?';
    joinParams.push(normalizedTargetType);
  }

  let productJoin = '';
  let productWhere = '';
  if (productId) {
    productJoin = `
      LEFT JOIN products rp ON rp.id = ?
      LEFT JOIN product_country_authorizations rca ON rca.product_id = rp.id
    `;
    joinParams.push(Number(productId));
    productWhere = `AND (
      (pgm.member_type = 'product' AND pgm.member_id = rp.id)
      OR (pgm.member_type = 'product_family' AND pgm.member_id = rp.family_id)
      OR (pgm.member_type = 'country_authorization' AND pgm.member_id = rca.id ${country ? 'AND rca.country = ?' : ''})
    )`;
  } else if (country) {
    productWhere = `AND pgm.member_type = 'country_authorization'
      AND EXISTS (SELECT 1 FROM product_country_authorizations rca2 WHERE rca2.id = pgm.member_id AND rca2.country = ?)`;
  }
  whereParams.push(normalizedGroupType);
  if (country) whereParams.push(country);

  const [rows] = await pool.execute(
    `SELECT DISTINCT pg.*,
            0 AS member_count,
            0 AS assignment_count
       FROM product_groups pg
       JOIN product_group_members pgm ON pgm.group_id = pg.id
       ${targetJoin}
       ${productJoin}
      WHERE ${scopedClause('pg', orgId)}
        AND pg.group_type = ?
        AND pg.is_active = 1
        ${productWhere}
      ORDER BY CASE WHEN pg.org_id = ? THEN 0 ELSE 1 END, pg.name ASC`,
    [...joinParams, ...whereParams, orgId]
  );
  return rows.map(normalizeGroup);
}

async function summarizeResolvedProductGroups({ orgId, productId, country = null }) {
  if (!productId) return {};
  const entries = await Promise.all(Object.keys(GROUP_TYPES).map(async (groupType) => {
    const groups = await resolveProductGroups({ orgId, groupType, productId, country });
    return [groupType, groups];
  }));
  return Object.fromEntries(entries);
}

module.exports = {
  GROUP_TYPES,
  MEMBER_TYPES,
  TARGET_TYPES,
  getProductGroup,
  listAssignments,
  listMembers,
  listProductGroups,
  normalizeAssignment,
  normalizeGroup,
  normalizeMember,
  requireGroupType,
  requireMemberType,
  requireTargetType,
  resolveProductGroups,
  summarizeResolvedProductGroups,
};
