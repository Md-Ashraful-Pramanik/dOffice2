const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { auditMiddleware } = require('./middleware/audit');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use(auditMiddleware);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(routes);
app.use(errorHandler);

module.exports = app;
