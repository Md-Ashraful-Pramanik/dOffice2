const pool = require('../db/pool');
const { forbidden } = require('../utils/errors');

function isSuperAdmin(auth) {
  return Array.isArray(auth?.roles) && auth.roles.includes('role_super_admin');
}

function isOrgAdmin(auth) {
  return Array.isArray(auth?.roles) && auth.roles.includes('role_org_admin');
}

async function getDescendantOrgIds(orgId) {
  const { rows } = await pool.query(
    `
      WITH RECURSIVE tree AS (
        SELECT id, parent_id
        FROM organizations
        WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT o.id, o.parent_id
        FROM organizations o
        INNER JOIN tree t ON o.parent_id = t.id
        WHERE o.deleted_at IS NULL
      )
      SELECT id FROM tree
    `,
    [orgId]
  );

  return rows.map((row) => row.id);
}

async function getAccessibleOrgIds(auth) {
  if (isSuperAdmin(auth)) {
    const { rows } = await pool.query('SELECT id FROM organizations WHERE deleted_at IS NULL');
    return rows.map((row) => row.id);
  }

  if (!auth?.orgId || !isOrgAdmin(auth)) {
    return [];
  }

  return getDescendantOrgIds(auth.orgId);
}

async function assertCanAccessOrg(auth, orgId) {
  if (isSuperAdmin(auth)) {
    return;
  }
  const accessible = await getAccessibleOrgIds(auth);
  if (!accessible.includes(orgId)) {
    throw forbidden();
  }
}

module.exports = {
  isSuperAdmin,
  isOrgAdmin,
  getAccessibleOrgIds,
  assertCanAccessOrg
};
