import { Router } from 'express';
import { sessionManager } from '../auth/session.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required.' });
  }

  if (sessionManager.verifyPassword(password)) {
    const token = sessionManager.createSessionToken();
    res.setHeader('Set-Cookie', `messiah_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`);
    return res.json({ success: true, token });
  }

  return res.status(401).json({ error: 'Invalid password. Access denied.' });
});

authRouter.post('/logout', (req, res) => {
  const cookieToken = req.headers.cookie
    ?.split(';')
    ?.find(c => c.trim().startsWith('messiah_token='))
    ?.split('=')[1];
  const headerToken = req.headers['authorization']?.replace('Bearer ', '') || (req.headers['x-messiah-token'] as string);

  const token = headerToken || cookieToken;
  if (token) {
    sessionManager.revokeToken(token);
  }

  res.setHeader('Set-Cookie', 'messiah_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  res.json({ success: true, message: 'Logged out successfully.' });
});

authRouter.get('/check', (req, res) => {
  const isRequired = sessionManager.isAuthRequired();
  if (!isRequired) {
    return res.json({ authenticated: true, authRequired: false });
  }

  const cookieToken = req.headers.cookie
    ?.split(';')
    ?.find(c => c.trim().startsWith('messiah_token='))
    ?.split('=')[1];
  const headerToken = req.headers['authorization']?.replace('Bearer ', '') || (req.headers['x-messiah-token'] as string);

  const token = headerToken || cookieToken;
  const valid = sessionManager.isValidToken(token);

  res.json({ authenticated: valid, authRequired: true });
});
