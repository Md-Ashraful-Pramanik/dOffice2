const express = require('express');
const { login, register, logout } = require('../controllers/authController');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.post('/logout', authRequired, logout);

module.exports = router;
