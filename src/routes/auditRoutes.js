const express = require('express');
const { getAudits } = require('../controllers/auditController');

const router = express.Router();

router.get('/', getAudits);

module.exports = router;
