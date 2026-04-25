const { Pool } = require('pg');
const env = require('../config/env');

let currentPool;

function createPostgresPool() {
  const pool = new Pool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  pool.on('error', (error) => {
    // eslint-disable-next-line no-console
    console.error('Unexpected PostgreSQL pool error:', error.message);
  });

  return pool;
}

function getPool() {
  if (!currentPool) {
    currentPool = createPostgresPool();
  }

  return currentPool;
}

async function replacePool(nextPool) {
  if (currentPool && currentPool !== nextPool) {
    await currentPool.end().catch(() => undefined);
  }

  currentPool = nextPool;
  return currentPool;
}

const pool = {
  query(...args) {
    return getPool().query(...args);
  },
  connect(...args) {
    return getPool().connect(...args);
  },
  end(...args) {
    return getPool().end(...args);
  },
  getConnectionMode() {
    return 'postgres';
  },
  async reset() {
    const nextPool = createPostgresPool();
    await replacePool(nextPool);
  }
};

module.exports = pool;
