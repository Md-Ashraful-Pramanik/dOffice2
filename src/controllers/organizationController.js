const pool = require('../db/pool');
const { prefixedId } = require('../utils/ids');
const { validationError, notFound, forbidden } = require('../utils/errors');
const {
  isSuperAdmin,
  isOrgAdmin,
  getAccessibleOrgIds,
  assertCanAccessOrg
} = require('../services/accessService');
const { fetchOrganizationById, fetchTree, orgSelect } = require('../services/orgService');

async function recalculateOrganizationDepths(client = pool) {
  await client.query(
    `
      WITH RECURSIVE rebuilt AS (
        SELECT id, parent_id, 0::int AS depth
        FROM doffice_organizations
        WHERE parent_id IS NULL AND deleted_at IS NULL
        UNION ALL
        SELECT o.id, o.parent_id, r.depth + 1
        FROM doffice_organizations o
        INNER JOIN rebuilt r ON o.parent_id = r.id
        WHERE o.deleted_at IS NULL
      )
      UPDATE doffice_organizations o
      SET depth = r.depth,
          updated_at = NOW()
      FROM rebuilt r
      WHERE o.id = r.id
        AND o.depth <> r.depth
    `
  );
}

function ensureActiveOrganization(org, fieldName) {
  if (org.status !== 'active') {
    throw validationError({ [fieldName]: ['must reference an active organization'] });
  }
}

function makeCloneSuffix(id) {
  return String(id).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toLowerCase();
}

function buildClonedUsername(username, newOrgId) {
  return `${username}.${makeCloneSuffix(newOrgId)}`;
}

function buildClonedEmail(email, newOrgId) {
  const [localPart, domain = 'example.local'] = String(email).split('@');
  return `${localPart}+${makeCloneSuffix(newOrgId)}@${domain}`.toLowerCase();
}

function ensureFields(required, payload) {
  const errors = {};
  required.forEach((field) => {
    if (!payload[field]) {
      errors[field] = ["can't be blank"];
    }
  });
  if (Object.keys(errors).length > 0) {
    throw validationError(errors);
  }
}

function parsePagination(query) {
  const limit = Number(query.limit || 20);
  const offset = Number(query.offset || 0);
  return {
    limit: Number.isNaN(limit) ? 20 : Math.max(Math.min(limit, 100), 1),
    offset: Number.isNaN(offset) ? 0 : Math.max(offset, 0)
  };
}

async function listOrganizations(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const filters = ['o.deleted_at IS NULL'];
    const values = [];
    const allowedStatuses = ['active', 'archived', 'deactivated'];

    if (req.query.search) {
      values.push(`%${req.query.search}%`);
      filters.push(`o.name ILIKE $${values.length}`);
    }

    if (req.query.status) {
      if (!allowedStatuses.includes(req.query.status)) {
        throw validationError({ status: ['is invalid'] });
      }
      values.push(req.query.status);
      filters.push(`o.status = $${values.length}`);
    }

    if (req.query.parentId) {
      values.push(req.query.parentId);
      filters.push(`o.parent_id = $${values.length}`);
    }

    if (!isSuperAdmin(req.auth)) {
      const accessible = await getAccessibleOrgIds(req.auth);
      if (accessible.length === 0) {
        return res.status(200).json({ organizations: [], totalCount: 0, limit, offset });
      }
      values.push(accessible);
      filters.push(`o.id = ANY($${values.length}::text[])`);
    }

    values.push(limit, offset);
    const whereSql = filters.join(' AND ');

    const listResult = await pool.query(
      `
        SELECT ${orgSelect}
        FROM doffice_organizations o
        WHERE ${whereSql}
        ORDER BY o.created_at DESC
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    );

    const countValues = values.slice(0, -2);
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM doffice_organizations o WHERE ${whereSql}`,
      countValues
    );

    req.auditResourceType = 'organization';

    return res.status(200).json({
      organizations: listResult.rows,
      totalCount: countResult.rows[0].count,
      limit,
      offset
    });
  } catch (error) {
    return next(error);
  }
}

async function getOrganizationTree(req, res, next) {
  try {
    const depth = req.query.depth ? Number(req.query.depth) : null;
    if (req.query.depth && (Number.isNaN(depth) || depth < 0)) {
      throw validationError({ depth: ['must be a non-negative number'] });
    }
    const depthValue = Number.isNaN(depth) ? null : depth;
    let rootIds = [];

    if (req.query.rootId) {
      await assertCanAccessOrg(req.auth, req.query.rootId);
      rootIds = [req.query.rootId];
    } else if (isSuperAdmin(req.auth)) {
      const { rows } = await pool.query(
        'SELECT id FROM doffice_organizations WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY created_at ASC'
      );
      rootIds = rows.map((row) => row.id);
    } else {
      const accessible = await getAccessibleOrgIds(req.auth);
      if (accessible.length > 0) {
        const { rows } = await pool.query(
          `
            SELECT id
            FROM doffice_organizations
            WHERE id = ANY($1::text[])
              AND deleted_at IS NULL
              AND (parent_id IS NULL OR parent_id <> ALL($1::text[]))
            ORDER BY created_at ASC
          `,
          [accessible]
        );
        rootIds = rows.map((row) => row.id);
      }
    }

    const tree = await fetchTree(rootIds, depthValue);
    req.auditResourceType = 'organization';
    return res.status(200).json({ tree });
  } catch (error) {
    return next(error);
  }
}

async function getOrganization(req, res, next) {
  try {
    const orgId = req.params.orgId;
    await assertCanAccessOrg(req.auth, orgId);
    const org = await fetchOrganizationById(orgId);
    if (!org) {
      throw notFound();
    }

    req.auditResourceType = 'organization';
    req.auditResourceId = orgId;

    return res.status(200).json({ organization: org });
  } catch (error) {
    return next(error);
  }
}

async function createOrganization(req, res, next) {
  try {
    if (!isSuperAdmin(req.auth)) {
      throw forbidden();
    }

    const payload = req.body?.organization || {};
    ensureFields(['name', 'code'], payload);

    const parentId = payload.parentId || null;
    let depth = 0;
    if (parentId) {
      const parent = await fetchOrganizationById(parentId);
      if (!parent) {
        throw notFound('Parent organization not found.');
      }
      ensureActiveOrganization(parent, 'parentId');
      depth = parent.depth + 1;
    }

    const orgId = prefixedId('org');
    await pool.query(
      `
        INSERT INTO doffice_organizations (id, name, code, type, logo, metadata, parent_id, depth, created_by, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      `,
      [
        orgId,
        payload.name,
        payload.code,
        payload.type || (parentId ? 'division' : 'root'),
        payload.logo || null,
        JSON.stringify(payload.metadata || {}),
        parentId,
        depth,
        req.auth.userId
      ]
    );

    const org = await fetchOrganizationById(orgId);
    req.auditResourceType = 'organization';
    req.auditResourceId = orgId;

    return res.status(201).json({ organization: org });
  } catch (error) {
    if (error.code === '23505') {
      return next(validationError({ code: ['has already been taken'] }));
    }
    return next(error);
  }
}

async function createSubOrganization(req, res, next) {
  try {
    if (!isSuperAdmin(req.auth) && !isOrgAdmin(req.auth)) {
      throw forbidden();
    }

    const parentId = req.params.orgId;
    await assertCanAccessOrg(req.auth, parentId);

    const parent = await fetchOrganizationById(parentId);
    if (!parent) {
      throw notFound();
    }
    ensureActiveOrganization(parent, 'orgId');

    const payload = req.body?.organization || {};
    ensureFields(['name', 'code'], payload);

    const orgId = prefixedId('org');
    await pool.query(
      `
        INSERT INTO doffice_organizations (id, name, code, type, logo, metadata, parent_id, depth, created_by, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      `,
      [
        orgId,
        payload.name,
        payload.code,
        payload.type || 'division',
        payload.logo || null,
        JSON.stringify(payload.metadata || {}),
        parentId,
        parent.depth + 1,
        req.auth.userId
      ]
    );

    const org = await fetchOrganizationById(orgId);
    req.auditResourceType = 'organization';
    req.auditResourceId = orgId;

    return res.status(201).json({ organization: org });
  } catch (error) {
    if (error.code === '23505') {
      return next(validationError({ code: ['has already been taken'] }));
    }
    return next(error);
  }
}

async function updateOrganization(req, res, next) {
  try {
    if (!isSuperAdmin(req.auth) && !isOrgAdmin(req.auth)) {
      throw forbidden();
    }

    const orgId = req.params.orgId;
    await assertCanAccessOrg(req.auth, orgId);
    const current = await fetchOrganizationById(orgId);
    if (!current) {
      throw notFound();
    }

    const payload = req.body?.organization || {};
    await pool.query(
      `
        UPDATE doffice_organizations
        SET
          name = COALESCE($2, name),
          code = COALESCE($3, code),
          logo = COALESCE($4, logo),
          type = COALESCE($5, type),
          metadata = COALESCE($6::jsonb, metadata),
          updated_by = $7,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        orgId,
        payload.name || null,
        payload.code || null,
        payload.logo || null,
        payload.type || null,
        payload.metadata ? JSON.stringify(payload.metadata) : null,
        req.auth.userId
      ]
    );

    const updated = await fetchOrganizationById(orgId);
    req.auditResourceType = 'organization';
    req.auditResourceId = orgId;

    return res.status(200).json({ organization: updated });
  } catch (error) {
    if (error.code === '23505') {
      return next(validationError({ code: ['has already been taken'] }));
    }
    return next(error);
  }
}

async function moveOrganization(req, res, next) {
  const client = await pool.connect();
  try {
    const orgId = req.params.orgId;
    const newParentId = req.body?.newParentId;
    if (!newParentId) {
      throw validationError({ newParentId: ["can't be blank"] });
    }
    if (orgId === newParentId) {
      throw validationError({ newParentId: ['cannot be same as organization id'] });
    }

    const source = await fetchOrganizationById(orgId);
    const target = await fetchOrganizationById(newParentId);
    if (!source || !target) {
      throw notFound();
    }
    ensureActiveOrganization(source, 'orgId');
    ensureActiveOrganization(target, 'newParentId');

    const { rows: cycleRows } = await pool.query(
      `
        WITH RECURSIVE tree AS (
          SELECT id
          FROM doffice_organizations
          WHERE id = $1 AND deleted_at IS NULL
          UNION ALL
          SELECT o.id
          FROM doffice_organizations o
          INNER JOIN tree t ON o.parent_id = t.id
          WHERE o.deleted_at IS NULL
        )
        SELECT id FROM tree WHERE id = $2
      `,
      [orgId, newParentId]
    );
    if (cycleRows.length > 0) {
      throw validationError({ newParentId: ['cannot be a descendant of the source organization'] });
    }

    if (!isSuperAdmin(req.auth)) {
      if (!isOrgAdmin(req.auth)) {
        throw forbidden();
      }
      const accessible = await getAccessibleOrgIds(req.auth);
      if (!accessible.includes(source.id) || !accessible.includes(target.id)) {
        throw forbidden();
      }
    }

    const newDepth = target.depth + 1;
    const depthDelta = newDepth - source.depth;

    await client.query('BEGIN');
    await client.query(
      `
        UPDATE doffice_organizations
        SET parent_id = $2,
            depth = $3,
            updated_at = NOW(),
            updated_by = $4
        WHERE id = $1
      `,
      [orgId, newParentId, newDepth, req.auth.userId]
    );

    if (depthDelta !== 0) {
      await client.query(
        `
          WITH RECURSIVE descendants AS (
            SELECT id
            FROM doffice_organizations
            WHERE parent_id = $1 AND deleted_at IS NULL
            UNION ALL
            SELECT o.id
            FROM doffice_organizations o
            INNER JOIN descendants d ON o.parent_id = d.id
            WHERE o.deleted_at IS NULL
          )
          UPDATE doffice_organizations o
          SET depth = o.depth + $2,
              updated_at = NOW(),
              updated_by = $3
          WHERE o.id IN (SELECT id FROM descendants)
        `,
        [orgId, depthDelta, req.auth.userId]
      );
    }

    await client.query('COMMIT');

    const moved = await fetchOrganizationById(orgId);
    req.auditResourceType = 'organization';
    req.auditResourceId = orgId;
    return res.status(200).json({ organization: moved });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    return next(error);
  } finally {
    client.release();
  }
}

async function mergeOrganizations(req, res, next) {
  const client = await pool.connect();
  try {
    if (!isSuperAdmin(req.auth)) {
      throw forbidden();
    }

    const sourceOrgId = req.body?.sourceOrgId;
    const targetOrgId = req.body?.targetOrgId;
    ensureFields(['sourceOrgId', 'targetOrgId'], { sourceOrgId, targetOrgId });
    if (sourceOrgId === targetOrgId) {
      throw validationError({ targetOrgId: ['must be different from sourceOrgId'] });
    }

    const source = await fetchOrganizationById(sourceOrgId);
    const target = await fetchOrganizationById(targetOrgId);
    if (!source || !target) {
      throw notFound();
    }
    ensureActiveOrganization(source, 'sourceOrgId');
    ensureActiveOrganization(target, 'targetOrgId');

    await client.query('BEGIN');
    await client.query(
      'UPDATE doffice_organizations SET parent_id = $2, updated_at = NOW(), updated_by = $3 WHERE parent_id = $1 AND deleted_at IS NULL',
      [sourceOrgId, targetOrgId, req.auth.userId]
    );
    await client.query('UPDATE doffice_users SET org_id = $2, updated_at = NOW() WHERE org_id = $1 AND deleted_at IS NULL', [sourceOrgId, targetOrgId]);
    await client.query(
      'UPDATE doffice_roles SET org_id = $2, updated_at = NOW() WHERE org_id = $1 AND deleted_at IS NULL',
      [sourceOrgId, targetOrgId]
    );

    const sourceNavConfigResult = await client.query(
      `
        SELECT config
        FROM doffice_organization_nav_configs
        WHERE org_id = $1
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [sourceOrgId]
    );
    const targetNavConfigResult = await client.query(
      `
        SELECT id
        FROM doffice_organization_nav_configs
        WHERE org_id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [targetOrgId]
    );

    if (sourceNavConfigResult.rows[0] && targetNavConfigResult.rowCount === 0) {
      await client.query(
        `
          INSERT INTO doffice_organization_nav_configs (id, org_id, config, created_at, updated_at)
          VALUES ($1, $2, $3, NOW(), NOW())
        `,
        [prefixedId('nav'), targetOrgId, JSON.stringify(sourceNavConfigResult.rows[0].config || {})]
      );
    }

    await client.query(
      `
        UPDATE doffice_organization_nav_configs
        SET deleted_at = NOW(),
            updated_at = NOW()
        WHERE org_id = $1
          AND deleted_at IS NULL
      `,
      [sourceOrgId]
    );

    await client.query(
      `UPDATE doffice_organizations SET status = 'archived', updated_at = NOW(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [sourceOrgId, req.auth.userId]
    );
    await recalculateOrganizationDepths(client);
    await client.query('COMMIT');

    const merged = await fetchOrganizationById(targetOrgId);
    req.auditResourceType = 'organization';
    req.auditResourceId = targetOrgId;
    return res.status(200).json({ organization: merged });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    return next(error);
  } finally {
    client.release();
  }
}

async function cloneOrganization(req, res, next) {
  const client = await pool.connect();
  try {
    const sourceOrgId = req.params.orgId;
    const source = await fetchOrganizationById(sourceOrgId);
    if (!source) {
      throw notFound();
    }
    ensureActiveOrganization(source, 'orgId');

    if (!isSuperAdmin(req.auth)) {
      if (!isOrgAdmin(req.auth)) {
        throw forbidden();
      }
      await assertCanAccessOrg(req.auth, sourceOrgId);
    }

    const payload = req.body || {};
    ensureFields(['newName', 'newCode'], payload);

    const includeRoles = payload.includeRoles === true;
    const includeNavConfig = payload.includeNavConfig === true;
    const includeUsers = payload.includeUsers === true;

    const newOrgId = prefixedId('org');
    const clonedRoleIds = new Map();

    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO doffice_organizations (id, name, code, type, status, logo, parent_id, depth, metadata, created_by, updated_by)
        VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $9)
      `,
      [
        newOrgId,
        payload.newName,
        payload.newCode,
        source.type,
        source.logo,
        source.parentId,
        source.depth,
        JSON.stringify(source.metadata || {}),
        req.auth.userId
      ]
    );

    if (includeRoles) {
      const { rows: roles } = await client.query(
        `
          SELECT id, name, description, type, inherits_from, permissions, is_system
          FROM doffice_roles
          WHERE org_id = $1
            AND deleted_at IS NULL
          ORDER BY created_at ASC
        `,
        [sourceOrgId]
      );

      roles.forEach((role) => {
        clonedRoleIds.set(role.id, prefixedId('role'));
      });

      for (const role of roles) {
        await client.query(
          `
            INSERT INTO doffice_roles
              (id, name, description, type, inherits_from, permissions, org_id, is_system, created_at, updated_at)
            VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          `,
          [
            clonedRoleIds.get(role.id),
            role.name,
            role.description,
            role.type,
            clonedRoleIds.get(role.inherits_from) || role.inherits_from || null,
            JSON.stringify(role.permissions || []),
            newOrgId,
            role.is_system
          ]
        );
      }
    }

    if (includeNavConfig) {
      const { rows: navConfigs } = await client.query(
        `
          SELECT config
          FROM doffice_organization_nav_configs
          WHERE org_id = $1
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [sourceOrgId]
      );

      if (navConfigs[0]) {
        await client.query(
          `
            INSERT INTO doffice_organization_nav_configs (id, org_id, config, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
          `,
          [prefixedId('nav'), newOrgId, JSON.stringify(navConfigs[0].config || {})]
        );
      }
    }

    if (includeUsers) {
      const { rows: users } = await client.query(
        `
          SELECT *
          FROM doffice_users
          WHERE org_id = $1
            AND deleted_at IS NULL
          ORDER BY created_at ASC
        `,
        [sourceOrgId]
      );

      for (const user of users) {
        const newUserId = prefixedId('user');
        await client.query(
          `
            INSERT INTO doffice_users
              (id, username, email, password_hash, name, employee_id, designation, department, bio, avatar, status, contact_info, org_id, created_at, updated_at)
            VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
          `,
          [
            newUserId,
            buildClonedUsername(user.username, newOrgId),
            buildClonedEmail(user.email, newOrgId),
            user.password_hash,
            user.name,
            user.employee_id,
            user.designation,
            user.department,
            user.bio,
            user.avatar,
            user.status,
            JSON.stringify(user.contact_info || {}),
            newOrgId
          ]
        );

        const { rows: userRoles } = await client.query(
          `
            SELECT ur.role_id, r.org_id
            FROM doffice_user_roles ur
            INNER JOIN doffice_roles r ON r.id = ur.role_id
            WHERE ur.user_id = $1
              AND r.deleted_at IS NULL
          `,
          [user.id]
        );

        for (const userRole of userRoles) {
          const nextRoleId = clonedRoleIds.get(userRole.role_id) || (userRole.org_id ? null : userRole.role_id);
          if (!nextRoleId || nextRoleId === 'role_super_admin') {
            continue;
          }

          await client.query(
            `INSERT INTO doffice_user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [newUserId, nextRoleId]
          );
        }
      }
    }

    await client.query('COMMIT');

    const cloned = await fetchOrganizationById(newOrgId);
    req.auditResourceType = 'organization';
    req.auditResourceId = newOrgId;

    return res.status(201).json({ organization: cloned });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error.code === '23505') {
      return next(validationError({ newCode: ['has already been taken'] }));
    }
    return next(error);
  } finally {
    client.release();
  }
}

async function archiveOrganization(req, res, next) {
  try {
    const orgId = req.params.orgId;
    if (!isSuperAdmin(req.auth) && !isOrgAdmin(req.auth)) {
      throw forbidden();
    }
    await assertCanAccessOrg(req.auth, orgId);

    await pool.query(
      `UPDATE doffice_organizations SET status = 'archived', updated_at = NOW(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [orgId, req.auth.userId]
    );

    const org = await fetchOrganizationById(orgId);
    if (!org) {
      throw notFound();
    }
    req.auditResourceType = 'organization';
    req.auditResourceId = orgId;
    return res.status(200).json({ organization: org });
  } catch (error) {
    return next(error);
  }
}

async function restoreOrganization(req, res, next) {
  try {
    const orgId = req.params.orgId;
    if (!isSuperAdmin(req.auth) && !isOrgAdmin(req.auth)) {
      throw forbidden();
    }
    await assertCanAccessOrg(req.auth, orgId);

    await pool.query(
      `UPDATE doffice_organizations SET status = 'active', updated_at = NOW(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [orgId, req.auth.userId]
    );

    const org = await fetchOrganizationById(orgId);
    if (!org) {
      throw notFound();
    }
    req.auditResourceType = 'organization';
    req.auditResourceId = orgId;
    return res.status(200).json({ organization: org });
  } catch (error) {
    return next(error);
  }
}

async function deleteOrganization(req, res, next) {
  try {
    if (!isSuperAdmin(req.auth)) {
      throw forbidden();
    }

    const orgId = req.params.orgId;
    const org = await fetchOrganizationById(orgId);
    if (!org) {
      throw notFound();
    }

    const childCount = await pool.query(
      `SELECT COUNT(*)::int AS count FROM doffice_organizations WHERE parent_id = $1 AND deleted_at IS NULL AND status = 'active'`,
      [orgId]
    );
    if (childCount.rows[0].count > 0) {
      throw forbidden('Cannot delete organization with active child organizations.');
    }

    const userCount = await pool.query(
      `SELECT COUNT(*)::int AS count FROM doffice_users WHERE org_id = $1 AND deleted_at IS NULL AND status = 'active'`,
      [orgId]
    );
    if (userCount.rows[0].count > 0) {
      throw forbidden('Cannot delete organization with active users.');
    }

    await pool.query(
      `
        UPDATE doffice_organizations
        SET deleted_at = NOW(),
            status = 'deactivated',
            updated_at = NOW(),
            updated_by = $2
        WHERE id = $1
      `,
      [orgId, req.auth.userId]
    );

    await pool.query(
      `
        UPDATE doffice_organization_relationships
        SET deleted_at = NOW()
        WHERE deleted_at IS NULL
          AND (source_org_id = $1 OR target_org_id = $1)
      `,
      [orgId]
    );

    req.auditResourceType = 'organization';
    req.auditResourceId = orgId;

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

async function listRelationships(req, res, next) {
  try {
    const orgId = req.params.orgId;
    await assertCanAccessOrg(req.auth, orgId);

    const { rows } = await pool.query(
      `
        SELECT id,
               source_org_id AS "sourceOrgId",
               target_org_id AS "targetOrgId",
               type,
               description,
               shared_modules AS "sharedModules",
               created_at AS "createdAt"
        FROM doffice_organization_relationships
        WHERE deleted_at IS NULL
          AND (source_org_id = $1 OR target_org_id = $1)
        ORDER BY created_at DESC
      `,
      [orgId]
    );

    req.auditResourceType = 'relationship';
    return res.status(200).json({
      relationships: rows,
      totalCount: rows.length
    });
  } catch (error) {
    return next(error);
  }
}

async function createRelationship(req, res, next) {
  try {
    const sourceOrgId = req.params.orgId;
    const payload = req.body?.relationship || {};
    ensureFields(['targetOrgId', 'type'], payload);

    const source = await fetchOrganizationById(sourceOrgId);
    const target = await fetchOrganizationById(payload.targetOrgId);
    if (!source || !target) {
      throw notFound();
    }
    ensureActiveOrganization(source, 'orgId');
    ensureActiveOrganization(target, 'targetOrgId');
    if (sourceOrgId === payload.targetOrgId) {
      throw validationError({ targetOrgId: ['must be different from source organization'] });
    }

    if (!isSuperAdmin(req.auth)) {
      if (!isOrgAdmin(req.auth)) {
        throw forbidden();
      }
      const accessible = await getAccessibleOrgIds(req.auth);
      if (!accessible.includes(sourceOrgId) || !accessible.includes(payload.targetOrgId)) {
        throw forbidden('Org Admin must have access to both organizations.');
      }
    }

    const relationshipId = prefixedId('rel');
    await pool.query(
      `
        INSERT INTO doffice_organization_relationships
          (id, source_org_id, target_org_id, type, description, shared_modules, created_by)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        relationshipId,
        sourceOrgId,
        payload.targetOrgId,
        payload.type,
        payload.description || null,
        JSON.stringify(payload.sharedModules || []),
        req.auth.userId
      ]
    );

    const { rows } = await pool.query(
      `
        SELECT id,
               source_org_id AS "sourceOrgId",
               target_org_id AS "targetOrgId",
               type,
               description,
               shared_modules AS "sharedModules",
               created_at AS "createdAt"
        FROM doffice_organization_relationships
        WHERE id = $1
      `,
      [relationshipId]
    );

    req.auditResourceType = 'relationship';
    req.auditResourceId = relationshipId;
    return res.status(201).json({ relationship: rows[0] });
  } catch (error) {
    if (
      error.code === '23505'
      && (error.constraint === 'uniq_org_relationship_active' || error.constraint === 'doffice_uniq_org_relationship_active')
    ) {
      return next(validationError({ relationship: ['already exists'] }));
    }
    if (
      error.code === '23514'
      && (error.constraint === 'organization_relationships_not_self' || error.constraint === 'doffice_organization_relationships_not_self')
    ) {
      return next(validationError({ targetOrgId: ['must be different from source organization'] }));
    }
    return next(error);
  }
}

async function deleteRelationship(req, res, next) {
  try {
    const orgId = req.params.orgId;
    const relationshipId = req.params.relationshipId;

    const { rows } = await pool.query(
      `
        SELECT id, source_org_id, target_org_id
        FROM doffice_organization_relationships
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [relationshipId]
    );
    const relationship = rows[0];
    if (!relationship) {
      throw notFound();
    }
    if (relationship.source_org_id !== orgId && relationship.target_org_id !== orgId) {
      throw notFound();
    }

    if (!isSuperAdmin(req.auth)) {
      if (!isOrgAdmin(req.auth)) {
        throw forbidden();
      }
      const accessible = await getAccessibleOrgIds(req.auth);
      if (!accessible.includes(relationship.source_org_id) && !accessible.includes(relationship.target_org_id)) {
        throw forbidden('Org Admin of either organization is required.');
      }
    }

    await pool.query(
      'UPDATE doffice_organization_relationships SET deleted_at = NOW() WHERE id = $1',
      [relationshipId]
    );

    req.auditResourceType = 'relationship';
    req.auditResourceId = relationshipId;

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listOrganizations,
  getOrganizationTree,
  getOrganization,
  createOrganization,
  createSubOrganization,
  updateOrganization,
  moveOrganization,
  mergeOrganizations,
  cloneOrganization,
  archiveOrganization,
  restoreOrganization,
  deleteOrganization,
  listRelationships,
  createRelationship,
  deleteRelationship
};
