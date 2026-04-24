const dotenv = require('dotenv');

dotenv.config();

function optionalString(value, fallback = undefined) {
  if (typeof value === 'string') {
    return value;
  }
  return fallback;
}

const env = {
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: optionalString(process.env.DB_PASSWORD, 'postgres'),
    database: process.env.DB_NAME || 'postgres'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  }
};

module.exports = env;
