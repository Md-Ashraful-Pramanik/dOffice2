const pool = require('../db/pool');
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
    const { rows } = await pool.query(
      `
        SELECT s.id, s.user_id, s.revoked_at, s.expires_at,
               u.status, u.deleted_at
        FROM sessions s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.id = $1
      `,
      [decoded.sid]
    );

    const session = rows[0];
    if (!session) {
      throw unauthorized();
    }
    if (session.user_id !== decoded.sub) {
      throw unauthorized();
    }
    if (session.revoked_at || session.deleted_at || session.status !== 'active') {
      throw unauthorized();
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      throw unauthorized();
    }

    req.auth = {
      userId: decoded.sub,
      sessionId: decoded.sid,
      roles: decoded.roles || [],
      orgId: decoded.orgId || null
    };

    await pool.query('UPDATE sessions SET last_active_at = NOW() WHERE id = $1', [decoded.sid]);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { authRequired };
