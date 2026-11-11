import { app, pool } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => console.log(`MerchantFlow API listening on ${port}`));

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
