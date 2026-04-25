const { Pool } = require('pg');
const env = require('../config/env');

let currentPool;
let connectionMode = 'postgres';

function createPostgresPool() {
  return new Pool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database
  });
}

function getPool() {
  if (!currentPool) {
    currentPool = createPostgresPool();
  }

  return currentPool;
}

async function replacePool(nextPool, nextMode) {
  if (currentPool && currentPool !== nextPool) {
    await currentPool.end().catch(() => undefined);
  }

  currentPool = nextPool;
  connectionMode = nextMode;
  return currentPool;
}

async function useInMemoryDb() {
  const { newDb } = require('pg-mem');
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const pgMem = db.adapters.createPg();
  const inMemoryPool = new pgMem.Pool();

  await replacePool(inMemoryPool, 'in-memory');
  return currentPool;
}

function isUsingInMemoryDb() {
  return connectionMode === 'in-memory';
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
  useInMemoryDb,
  isUsingInMemoryDb,
  getConnectionMode() {
    return connectionMode;
  }
};

module.exports = pool;
