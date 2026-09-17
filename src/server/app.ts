import express from 'express';
import path from 'node:path';
import { authRouter } from './routes/auth.route.js';
import { statusRouter } from './routes/status.route.js';
import { pairingRouter } from './routes/pairing.route.js';
import { configRouter } from './routes/config.route.js';
import { vaultRouter } from './routes/vault.route.js';
import { contactsRouter } from './routes/contacts.route.js';
import { messagesRouter } from './routes/messages.route.js';
import { authMiddleware } from './middleware/auth.middleware.js';

export function createDashboardServer(): express.Express {
  const app = express();

  app.use(express.json());

  const publicDir = path.resolve('public');

  // Mount Public authentication endpoints and assets
  app.use('/api/auth', authRouter);

  // Serve static assets for login
  app.use('/css', express.static(path.join(publicDir, 'css')));
  app.use('/js', express.static(path.join(publicDir, 'js')));
  app.get('/login.html', (req, res) => {
    res.sendFile(path.join(publicDir, 'login.html'));
  });

  // Apply Auth Guard on all remaining routes & pages
  app.use(authMiddleware);

  // Serve protected dashboard pages
  app.use(express.static(publicDir));

  // Mount protected API routers
  app.use('/api/status', statusRouter);
  app.use('/api/pair', pairingRouter);
  app.use('/api/config', configRouter);
  app.use('/api/vault', vaultRouter);
  app.use('/api/contacts', contactsRouter);
  app.use('/api/messages', messagesRouter);

  return app;
}

export function startDashboardServer(port: number = 3000): Promise<number> {
  return new Promise((resolve) => {
    const app = createDashboardServer();
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`🌐 [Web Dashboard] Control plane online at http://localhost:${port}`);
      resolve(port);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[Web Dashboard] Port ${port} is in use, trying ${port + 1}...`);
        startDashboardServer(port + 1).then(resolve);
      } else {
        console.error('[Web Dashboard] Server error:', err);
      }
    });
  });
}
