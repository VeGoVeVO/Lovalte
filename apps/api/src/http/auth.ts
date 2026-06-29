import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { UnauthorizedError, ForbiddenError } from "../kernel";

export type Role = "owner" | "manager" | "staff";
export interface AuthContext {
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
  /** Platform super-admin (a single configured email). Cross-tenant support desk. */
  isAdmin: boolean;
}

const COOKIE = "lovalte_session";

/** HMAC-signed stateless session token (no JWT dep - node:crypto only). */
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
    const ctx = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<AuthContext>;
    // Require the full current session shape. Tokens issued before the email/isAdmin
    // fields existed are treated as invalid -> a single clean re-login refreshes them
    // (and guarantees ticket attribution never sees a missing email).
    if (
      typeof ctx.userId !== "string" ||
      typeof ctx.tenantId !== "string" ||
      typeof ctx.role !== "string" ||
      typeof ctx.email !== "string" ||
      typeof ctx.isAdmin !== "boolean"
    ) {
      return null;
    }
    // Defense in depth: reject any token carrying a role outside the known set,
    // even though a valid HMAC means it could only come from our own issuer.
    if (ctx.role !== "owner" && ctx.role !== "manager" && ctx.role !== "staff") {
      return null;
    }
    return ctx as AuthContext;
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

/** Fastify preHandler: require a valid session belonging to the platform admin. */
export function requireAdmin(secret: string): preHandlerHookHandler {
  return async (req) => {
    const auth = readAuth(req, secret);
    if (!auth) throw new UnauthorizedError();
    if (!auth.isAdmin) throw new ForbiddenError();
    (req as FastifyRequest & { auth?: AuthContext }).auth = auth;
  };
}

/** Read the auth context attached by `requireAuth` (throws if missing). */
export function getAuth(req: FastifyRequest): AuthContext {
  const auth = (req as FastifyRequest & { auth?: AuthContext }).auth;
  if (!auth) throw new UnauthorizedError();
  return auth;
}
