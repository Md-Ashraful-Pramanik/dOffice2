const pool = require('./pool');
const { schemaSql } = require('./schema');

async function initDb() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query(
      `
        INSERT INTO doffice_roles (id, name, description, type, org_id, is_system, inherits_from, permissions, updated_at)
        VALUES
          (
            'role_super_admin',
            'Super Admin',
            'Platform-wide super administrator',
            'system',
            NULL,
            TRUE,
            NULL,
            $1::jsonb,
            NOW()
          ),
          (
            'role_org_admin',
            'Org Admin',
            'Organization administrator',
            'system',
            NULL,
            TRUE,
            NULL,
            $2::jsonb,
            NOW()
          )
        ON CONFLICT (id) DO UPDATE
        SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          type = EXCLUDED.type,
          is_system = EXCLUDED.is_system,
          inherits_from = EXCLUDED.inherits_from,
          permissions = EXCLUDED.permissions,
          updated_at = NOW()
      `,
      [
        JSON.stringify([{ module: '*', action: '*', allow: true }]),
        JSON.stringify([
          { module: 'organizations', action: 'read', allow: true },
          { module: 'organizations', action: 'create', allow: true },
          { module: 'organizations', action: 'update', allow: true },
          { module: 'organizations', action: 'archive', allow: true },
          { module: 'organizations', action: 'clone', allow: true }
        ])
      ]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { initDb };
