const pool = require('../db/pool');

async function getAudits(req, res, next) {
  try {
    const { rows } = await pool.query(
      `
        SELECT id,
               user_id AS "userId",
               action,
               method,
               path,
               status_code AS "statusCode",
               resource_type AS "resourceType",
               resource_id AS "resourceId",
               ip,
               user_agent AS "userAgent",
               metadata,
               created_at AS "createdAt"
        FROM audits
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [req.auth.userId]
    );

    req.auditResourceType = 'audit';
    return res.status(200).json({ audits: rows });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getAudits };
