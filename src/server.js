const app = require('./app');
const env = require('./config/env');
const { initDb } = require('./db/init');
const pool = require('./db/pool');

async function start() {
  try {
    await pool.reset();
    await initDb();

    const server = app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running on port ${env.port} (${pool.getConnectionMode()})`);
    });

    return server;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { start };
