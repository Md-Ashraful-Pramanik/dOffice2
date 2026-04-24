const { writeAudit } = require('../services/auditService');

function auditMiddleware(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    const userId = req.auth?.userId || req.auditUserId || null;
    const action = `${req.method} ${req.route?.path || req.path}`;

    writeAudit({
      userId,
      action,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      resourceType: req.auditResourceType,
      resourceId: req.auditResourceId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: {
        durationMs: Date.now() - startedAt
      }
    }).catch(() => undefined);
  });

  next();
}

module.exports = { auditMiddleware };
