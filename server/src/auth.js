import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const secret = () => process.env.JWT_SECRET || 'asset360-local-dev-secret';
const expiresIn = () => process.env.JWT_EXPIRES_IN || '7d';

export async function hashPassword(plain) {
  return bcrypt.hash(String(plain), 10);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  // Support legacy/plain values accidentally stored as passwordHash from the UI.
  if (!String(hash).startsWith('$2')) return String(plain) === String(hash);
  return bcrypt.compare(String(plain), String(hash));
}

export function signToken(user) {
  // Match .NET-style claim name expected by the React AuthContext decoder.
  return jwt.sign(
    {
      UserId: user.userId,
      unique_name: user.username,
      role: user.role || '',
    },
    secret(),
    { expiresIn: expiresIn() }
  );
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, secret());
    req.userId = Number(payload.UserId || payload.userId || payload.sub);
    req.userRole = payload.role || null;
    next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

export async function normalizeUserPassword(body, existing) {
  const out = { ...body };
  const incoming = out.password || out.passwordHash;
  delete out.password;
  if (incoming && incoming !== existing?.passwordHash) {
    // Empty string from "leave blank" updates should not wipe the hash.
    if (String(incoming).trim()) out.passwordHash = await hashPassword(incoming);
    else if (existing) out.passwordHash = existing.passwordHash;
  } else if (existing) {
    out.passwordHash = existing.passwordHash;
  } else {
    delete out.passwordHash;
  }
  return out;
}
