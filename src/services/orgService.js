const pool = require('../db/pool');

const orgSelect = `
  o.id,
  o.name,
  o.code,
  o.type,
  o.status,
  o.logo,
  o.parent_id AS "parentId",
  o.depth,
  o.metadata,
  o.created_at AS "createdAt",
  o.updated_at AS "updatedAt",
  (
    SELECT COUNT(*)::int
    FROM doffice_organizations c
    WHERE c.parent_id = o.id AND c.deleted_at IS NULL
  ) AS "childrenCount",
  (
    SELECT COUNT(*)::int
    FROM doffice_users u
    WHERE u.org_id = o.id AND u.deleted_at IS NULL AND u.status = 'active'
  ) AS "userCount"
`;

async function fetchOrganizationById(orgId) {
  const { rows } = await pool.query(
    `SELECT ${orgSelect} FROM doffice_organizations o WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [orgId]
  );
  return rows[0] || null;
}

function buildTreeNode(org, childrenByParent, depthLeft) {
  const childNodes = depthLeft === 0
    ? []
    : (childrenByParent.get(org.id) || []).map((child) =>
        buildTreeNode(child, childrenByParent, depthLeft === null ? null : depthLeft - 1)
      );

  return {
    id: org.id,
    name: org.name,
    code: org.code,
    type: org.type,
    status: org.status,
    children: childNodes
  };
}

async function fetchTree(rootIds, depth) {
  let rows;
  if (rootIds.length === 0) {
    return [];
  }

  if (depth === null) {
    const result = await pool.query(
      `
        WITH RECURSIVE tree AS (
          SELECT id, name, code, type, status, parent_id
          FROM doffice_organizations
          WHERE id = ANY($1::text[]) AND deleted_at IS NULL
          UNION ALL
          SELECT o.id, o.name, o.code, o.type, o.status, o.parent_id
          FROM doffice_organizations o
          INNER JOIN tree t ON o.parent_id = t.id
          WHERE o.deleted_at IS NULL
        )
        SELECT * FROM tree
      `,
      [rootIds]
    );
    rows = result.rows;
  } else {
    const result = await pool.query(
      `
        WITH RECURSIVE tree AS (
          SELECT id, name, code, type, status, parent_id, 0 AS level
          FROM doffice_organizations
          WHERE id = ANY($1::text[]) AND deleted_at IS NULL
          UNION ALL
          SELECT o.id, o.name, o.code, o.type, o.status, o.parent_id, t.level + 1
          FROM doffice_organizations o
          INNER JOIN tree t ON o.parent_id = t.id
          WHERE o.deleted_at IS NULL AND t.level < $2
        )
        SELECT id, name, code, type, status, parent_id FROM tree
      `,
      [rootIds, depth]
    );
    rows = result.rows;
  }

  const byParent = new Map();
  rows.forEach((row) => {
    const key = row.parent_id || '__ROOT__';
    if (!byParent.has(key)) {
      byParent.set(key, []);
    }
    byParent.get(key).push(row);
  });

  return rootIds
    .map((id) => rows.find((row) => row.id === id))
    .filter(Boolean)
    .map((root) => buildTreeNode(root, byParent, depth));
}

module.exports = {
  orgSelect,
  fetchOrganizationById,
  fetchTree
};
