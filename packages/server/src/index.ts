import { createUnoServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);
const corsOrigin = process.env.CORS_ORIGIN ?? '*';

const server = createUnoServer({ corsOrigin });

server.httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Multi-UNO server listening on http://0.0.0.0:${port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down Multi-UNO server...`);
  await server.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
