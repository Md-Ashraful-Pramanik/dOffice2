const pool = require('../db/pool');
const { createHash } = require('crypto');
const { verifyToken } = require('../utils/jwt');
const { unauthorized } = require('../utils/errors');

function extractBearerToken(headerValue) {
  if (!headerValue) return null;
  const parts = headerValue.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

async function authRequired(req, _res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw unauthorized();
    }

    const decoded = verifyToken(token);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      `
        SELECT s.id, s.user_id
        FROM doffice_user_sessions s
        INNER JOIN doffice_users u ON u.id = s.user_id
        WHERE s.id = $1
          AND s.user_id = $2
          AND s.token_jti = $3
          AND s.access_token_hash = $4
          AND s.revoked_at IS NULL
          AND s.is_revoked = FALSE
          AND s.expires_at > NOW()
          AND u.deleted_at IS NULL
          AND u.status = 'active'
      `,
      [decoded.sid, decoded.sub, decoded.jti, tokenHash]
    );

    const session = rows[0];
    if (!session) {
      throw unauthorized();
    }

    req.auth = {
      userId: decoded.sub,
      sessionId: decoded.sid,
      roles: decoded.roles || [],
      orgId: decoded.orgId || null
    };

    await pool.query('UPDATE doffice_user_sessions SET last_active_at = NOW(), updated_at = NOW() WHERE id = $1', [decoded.sid]);
    return next();
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError' || error?.name === 'NotBeforeError') {
      return next(unauthorized());
    }
    return next(error);
  }
}

module.exports = { authRequired };
