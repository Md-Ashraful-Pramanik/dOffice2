const pool = require('../db/pool');
const { prefixedId } = require('../utils/ids');

async function writeAudit({
  userId,
  action,
  method,
  path,
  statusCode,
  resourceType,
  resourceId,
  ip,
  userAgent,
  metadata = {}
}) {
  await pool.query(
    `
      INSERT INTO doffice_api_audits
        (id, user_id, action, method, path, status_code, resource_type, resource_id, ip, user_agent, metadata)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      prefixedId('aud'),
      userId || null,
      action,
      method,
      path,
      statusCode,
      resourceType || null,
      resourceId || null,
      ip || null,
      userAgent || null,
      JSON.stringify(metadata)
    ]
  );
}

module.exports = { writeAudit };
