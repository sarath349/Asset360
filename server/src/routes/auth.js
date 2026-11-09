import { Router } from 'express';
import { getDb, publicDoc } from '../db.js';
import { signToken, verifyPassword } from '../auth.js';
import { nowIso } from '../helpers.js';

const router = Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findActiveUser(username) {
  return getDb()
    .collection('users')
    .findOne({ username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') } });
}

async function issueLogin(user, res) {
  await getDb().collection('users').updateOne({ userId: user.userId }, { $set: { lastLogin: nowIso() } });
  const token = signToken(user);
  res.json({
    success: true,
    token,
    userId: user.userId,
    username: user.username,
    role: user.role,
    isMobileAppUser: Boolean(user.isMobileAppUser),
  });
}

router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

  const user = await findActiveUser(username);
  if (!user || user.isActive === false) return res.status(401).json({ message: 'Invalid username or password' });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid username or password' });

  return issueLogin(user, res);
});

/** Mobile app login — same credentials, but user must be flagged isMobileAppUser. */
router.post('/mobile-login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

  const user = await findActiveUser(username);
  if (!user || user.isActive === false) return res.status(401).json({ message: 'Invalid username or password' });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid username or password' });

  if (!user.isMobileAppUser) {
    return res.status(403).json({ message: 'This account is not enabled for the mobile app' });
  }

  return issueLogin(user, res);
});

router.get('/me', async (req, res) => {
  // Optional helper; frontend uses /users/:id instead.
  const user = await getDb().collection('users').findOne({ userId: req.userId });
  if (!user) return res.status(404).json({ message: 'Not found' });
  res.json(publicDoc(user));
});

export default router;
