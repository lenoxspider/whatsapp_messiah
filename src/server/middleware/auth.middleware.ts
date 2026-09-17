import type { Request, Response, NextFunction } from 'express';
import { sessionManager } from '../auth/session.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!sessionManager.isAuthRequired()) {
    return next();
  }

  const path = req.path;

  // Allow login page, auth endpoints, and public assets
  if (
    path === '/login.html' ||
    path.startsWith('/api/auth/') ||
    path.startsWith('/css/') ||
    path.startsWith('/js/') ||
    path === '/favicon.ico'
  ) {
    return next();
  }

  // Extract session token from cookie, header, or query
  const cookieToken = req.headers.cookie
    ?.split(';')
    ?.find(c => c.trim().startsWith('messiah_token='))
    ?.split('=')[1];
  const headerToken = req.headers['authorization']?.replace('Bearer ', '') || (req.headers['x-messiah-token'] as string);
  const token = headerToken || cookieToken;

  if (sessionManager.isValidToken(token)) {
    return next();
  }

  // Handle unauthorized requests
  if (path.startsWith('/api/')) {
    res.status(401).json({ error: 'Unauthorized. Please login to access Messiah.' });
    return;
  }

  // Redirect browser page requests to login.html
  res.redirect('/login.html');
}
