import crypto from "node:crypto";
import jwt from "jsonwebtoken";

/** Hash password dengan scrypt + salt acak. Format: salt:hash (hex). */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export const signToken = (user, secret) => jwt.sign({ sub: user.id, name: user.name }, secret, { expiresIn: "7d" });

/** Middleware: wajib header `Authorization: Bearer <token>`. */
export function requireAuth(secret) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    try {
      req.user = jwt.verify(header.startsWith("Bearer ") ? header.slice(7) : "", secret);
      next();
    } catch {
      res.status(401).json({ success: false, message: "Silakan login terlebih dahulu" });
    }
  };
}
