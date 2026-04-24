const express = require('express');
const authRoutes = require('./authRoutes');
const organizationRoutes = require('./organizationRoutes');
const auditRoutes = require('./auditRoutes');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.use('/api/v1/auth', authRoutes);
router.use('/api/v1/organizations', authRequired, organizationRoutes);
router.use('/api/audits', authRequired, auditRoutes);

module.exports = router;
