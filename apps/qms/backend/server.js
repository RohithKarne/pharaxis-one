import { createAppServer } from './src/app.js';
import { env } from './src/config/env.js';

const app = createAppServer();

app.listen(env.PORT, () => {
  console.log(`[qms-backend] listening on port ${env.PORT}`);
});
