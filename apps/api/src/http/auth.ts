import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { UnauthorizedError, ForbiddenError } from "../kernel";

export type Role = "owner" | "manager" | "staff";
export interface AuthContext {
  userId: string;
  tenantId: string;
  role: Role;
}

const COOKIE = "lovalte_session";

/** HMAC-signed stateless session token (no JWT dep — node:crypto only). */
export function signSession(ctx: AuthContext, secret: string): string {
  const body = Buffer.from(JSON.stringify(ctx)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySession(token: string, secret: string): AuthContext | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthContext;
  } catch {
    return null;
  }
}

export function setSessionCookie(reply: FastifyReply, ctx: AuthContext, secret: string): void {
  reply.setCookie(COOKIE, signSession(ctx, secret), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE, { path: "/" });
}

export function readAuth(req: FastifyRequest, secret: string): AuthContext | null {
  const raw = (req.cookies as Record<string, string | undefined>)?.[COOKIE];
  return raw ? verifySession(raw, secret) : null;
}

/** Fastify preHandler: require a valid session, optionally constrained to roles. */
export function requireAuth(secret: string, roles?: Role[]): preHandlerHookHandler {
  return async (req) => {
    const auth = readAuth(req, secret);
    if (!auth) throw new UnauthorizedError();
    if (roles && !roles.includes(auth.role)) throw new ForbiddenError();
    (req as FastifyRequest & { auth?: AuthContext }).auth = auth;
  };
}

/** Read the auth context attached by `requireAuth` (throws if missing). */
export function getAuth(req: FastifyRequest): AuthContext {
  const auth = (req as FastifyRequest & { auth?: AuthContext }).auth;
  if (!auth) throw new UnauthorizedError();
  return auth;
}
