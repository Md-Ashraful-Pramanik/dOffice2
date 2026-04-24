const pool = require('../db/pool');
const { prefixedId } = require('../utils/ids');
const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken, signRefreshToken } = require('../utils/jwt');
const { validationError, unauthorized, forbidden } = require('../utils/errors');

function toUserResponse(user, tokens) {
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      employeeId: user.employee_id,
      designation: user.designation,
      department: user.department,
      bio: user.bio,
      avatar: user.avatar,
      status: user.status,
      contactInfo: user.contact_info || {},
      orgId: user.org_id,
      roleIds: user.role_ids || [],
      token: tokens?.token,
      refreshToken: tokens?.refreshToken,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }
  };
}

function getValidationErrors(requiredFields, payload) {
  const errors = {};
  requiredFields.forEach((field) => {
    if (!payload[field]) {
      errors[field] = ["can't be blank"];
    }
  });
  return errors;
}

async function issueSessionTokens(user, req) {
  const sessionId = prefixedId('sess');
  const tokenJti = prefixedId('tok');
  const refreshJti = prefixedId('rtok');

  const accessPayload = {
    sub: user.id,
    sid: sessionId,
    jti: tokenJti,
    roles: user.role_ids || [],
    orgId: user.org_id || null
  };
  const refreshPayload = {
    sub: user.id,
    sid: sessionId,
    jti: refreshJti
  };

  const token = signAccessToken(accessPayload);
  const refreshToken = signRefreshToken(refreshPayload);

  await pool.query(
    `
      INSERT INTO sessions
        (id, user_id, token_jti, refresh_jti, expires_at, refresh_expires_at, ip, user_agent, device_info)
      VALUES
        ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes', NOW() + INTERVAL '30 days', $5, $6, $7)
    `,
    [
      sessionId,
      user.id,
      tokenJti,
      refreshJti,
      req.ip,
      req.headers['user-agent'] || null,
      JSON.stringify({ platform: 'web' })
    ]
  );

  return { token, refreshToken };
}

async function register(req, res, next) {
  try {
    const payload = req.body?.user || {};
    const errors = getValidationErrors(['username', 'email', 'password'], payload);
    if (Object.keys(errors).length) {
      throw validationError(errors);
    }

    const roleCheck = await pool.query(
      `
        SELECT ur.user_id
        FROM user_roles ur
        WHERE ur.role_id = 'role_super_admin'
        LIMIT 1
      `
    );

    if (roleCheck.rowCount > 0) {
      throw forbidden('Initial super admin is already created. Use organization user APIs for additional users.');
    }

    const userId = prefixedId('user');
    const passwordHash = await hashPassword(payload.password);

    const created = await pool.query(
      `
        INSERT INTO users (id, username, email, password_hash)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [userId, payload.username, payload.email.toLowerCase(), passwordHash]
    );

    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'role_super_admin')`,
      [userId]
    );

    const user = created.rows[0];
    user.role_ids = ['role_super_admin'];
    const tokens = await issueSessionTokens(user, req);

    req.auditUserId = user.id;
    req.auditResourceType = 'user';
    req.auditResourceId = user.id;

    return res.status(201).json(toUserResponse(user, tokens));
  } catch (error) {
    if (error.code === '23505') {
      if (error.constraint === 'users_email_unique_active') {
        return next(validationError({ email: ['has already been taken'] }));
      }
      if (error.constraint === 'users_username_unique_active') {
        return next(validationError({ username: ['has already been taken'] }));
      }
      return next(validationError({ email: ['has already been taken'] }));
    }
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const payload = req.body?.user || {};
    const errors = getValidationErrors(['email', 'password'], payload);
    if (Object.keys(errors).length) {
      throw validationError(errors);
    }

    const { rows } = await pool.query(
      `
        SELECT u.*, COALESCE(array_agg(ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL), '{}') AS role_ids
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        WHERE LOWER(u.email) = LOWER($1)
          AND u.deleted_at IS NULL
        GROUP BY u.id
      `,
      [payload.email]
    );

    const user = rows[0];
    if (!user) {
      throw unauthorized('Invalid credentials.');
    }

    const passwordOk = await comparePassword(payload.password, user.password_hash);
    if (!passwordOk) {
      throw unauthorized('Invalid credentials.');
    }

    if (user.status !== 'active') {
      throw unauthorized('User account is not active.');
    }

    const tokens = await issueSessionTokens(user, req);

    req.auditUserId = user.id;
    req.auditResourceType = 'session';

    return res.status(200).json(toUserResponse(user, tokens));
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    const result = await pool.query(
      'UPDATE sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2',
      [req.auth.sessionId, req.auth.userId]
    );

    if (result.rowCount === 0) {
      throw unauthorized();
    }

    req.auditResourceType = 'session';
    req.auditResourceId = req.auth.sessionId;

    return res.status(200).json({ message: 'Logged out successfully.' });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  logout
};
