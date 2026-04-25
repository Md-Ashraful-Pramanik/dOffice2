const app = require('./app');
const env = require('./config/env');
const { initDb } = require('./db/init');
const pool = require('./db/pool');

async function start() {
  try {
    try {
      await initDb();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`Primary database unavailable, starting with in-memory storage: ${error.message}`);
      await pool.useInMemoryDb();
      await initDb();
    }

    app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running on port ${env.port} (${pool.getConnectionMode()})`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
