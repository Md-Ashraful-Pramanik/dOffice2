const app = require('./app');
const env = require('./config/env');
const { initDb } = require('./db/init');

async function start() {
  try {
    await initDb();
    app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running on port ${env.port}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
