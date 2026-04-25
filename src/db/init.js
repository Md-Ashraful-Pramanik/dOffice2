const pool = require('./pool');
const { schemaSql } = require('./schema');

function getBootstrapSchemaSql() {
  if (!pool.isUsingInMemoryDb()) {
    return schemaSql;
  }

  return schemaSql.replace(/DO \$\$[\s\S]*?END \$\$;/g, '').trim();
}

async function initDb() {
  await pool.query(getBootstrapSchemaSql());

  await pool.query(
    `
      INSERT INTO doffice_roles (id, name, description, type, org_id, is_system)
      VALUES
        ('role_super_admin', 'Super Admin', 'Platform-wide super administrator', 'system', NULL, TRUE),
        ('role_org_admin', 'Org Admin', 'Organization administrator', 'system', NULL, TRUE)
      ON CONFLICT (id) DO NOTHING
    `
  );
}

module.exports = { initDb };
