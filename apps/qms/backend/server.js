import { createAppServer } from './src/app.js';
import { env } from './src/config/env.js';

const app = createAppServer();
let server = null;

server = app.listen(env.PORT, () => {
  console.log(`[qms-backend] listening on port ${env.PORT}`);
});

function shutdown(signal) {
  console.log(`[qms-backend] shutdown signal received: ${signal}`);
  if (!server) process.exit(0);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 1500).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
