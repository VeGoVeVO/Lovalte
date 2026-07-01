import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../../../shared/deps";
import { parse } from "../../../http/validation";
import {
  requireAuth,
  getAuth,
  setSessionCookie,
  clearSessionCookie,
  signSession,
  type AuthContext,
} from "../../../http/auth";
import type { SignUpTenantHandler } from "../application/SignUpTenantHandler";
import type { LoginHandler } from "../application/LoginHandler";
import type { LoginWithAppleHandler } from "../application/LoginWithAppleHandler";
import type { SignUpTenantWithAppleHandler } from "../application/SignUpTenantWithAppleHandler";
import type { InviteUserHandler } from "../application/InviteUserHandler";
import type { AcceptInvitationHandler } from "../application/AcceptInvitationHandler";
import type { ListUsersHandler } from "../application/ListUsersHandler";
import type { DeleteAccountHandler } from "../application/DeleteAccountHandler";
import type { AppleIdentityTokenVerifier } from "../infrastructure/AppleIdentityTokenVerifier";

export interface IdentityHandlers {
  signUp: SignUpTenantHandler;
  login: LoginHandler;
  appleLogin: LoginWithAppleHandler;
  appleSignUp: SignUpTenantWithAppleHandler;
  appleVerifier: AppleIdentityTokenVerifier;
  invite: InviteUserHandler;
  acceptInvitation: AcceptInvitationHandler;
  listUsers: ListUsersHandler;
  deleteAccount: DeleteAccountHandler;
}

const signUpSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(12).max(128),
    businessName: z.string().min(1).max(100),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().max(128),
    slug: z.string().min(1).max(63).optional(),
  })
  .strict();

const appleLoginSchema = z
  .object({
    identityToken: z.string().min(20),
    nonce: z.string().min(8).max(128).optional(),
    slug: z.string().min(1).max(63).optional(),
  })
  .strict();

const appleSignUpSchema = z
  .object({
    identityToken: z.string().min(20),
    nonce: z.string().min(8).max(128).optional(),
    businessName: z.string().min(1).max(100),
  })
  .strict();

const inviteSchema = z
  .object({
    email: z.string().email().max(254),
    role: z.enum(["manager", "staff"]),
  })
  .strict();

const acceptInvitationSchema = z
  .object({
    token: z.string().min(64).max(128),
    password: z.string().min(12).max(128),
  })
  .strict();

/**
 * Registers all identity routes on the Fastify instance.
 * Routes: /api/v1/auth/* and /api/v1/users/*
 */
export function registerIdentityRoutes(
  app: FastifyInstance,
  deps: Deps,
  handlers: IdentityHandlers,
): void {
  const secret = deps.config.SESSION_SECRET;
  const adminEmail = deps.config.ADMIN_EMAIL.toLowerCase();
  const isAdminEmail = (email: string): boolean =>
    email.toLowerCase().trim() === adminEmail;

  // POST /api/v1/auth/signup - create a new tenant + owner account
  app.post("/api/v1/auth/signup", async (req, reply) => {
    const input = parse(signUpSchema, req.body);
    const r = await handlers.signUp.execute(input);
    if (!r.ok) throw r.error;
    const ctx: AuthContext = {
      userId: r.value.userId,
      tenantId: r.value.tenantId,
      role: "owner",
      email: input.email,
      isAdmin: isAdminEmail(input.email),
    };
    setSessionCookie(reply, ctx, secret);
    return reply.status(201).send({ data: { ...r.value, token: signSession(ctx, secret) } });
  });

  // POST /api/v1/auth/login - authenticate and issue session cookie
  app.post("/api/v1/auth/login", async (req, reply) => {
    const input = parse(loginSchema, req.body);
    const r = await handlers.login.execute(input);
    if (!r.ok) throw r.error;
    const ctx: AuthContext = {
      userId: r.value.userId,
      tenantId: r.value.tenantId,
      role: r.value.role,
      email: r.value.email,
      isAdmin: isAdminEmail(r.value.email),
    };
    setSessionCookie(reply, ctx, secret);
    return reply.status(200).send({
      data: {
        userId: r.value.userId,
        tenantId: r.value.tenantId,
        email: r.value.email,
        role: r.value.role,
        isAdmin: isAdminEmail(r.value.email),
        token: signSession(ctx, secret),
      },
    });
  });

  // POST /api/v1/auth/apple/login - authenticate an existing user with Apple ID
  app.post("/api/v1/auth/apple/login", async (req, reply) => {
    const input = parse(appleLoginSchema, req.body);
    const apple = await handlers.appleVerifier.verify(input.identityToken, input.nonce);
    const r = await handlers.appleLogin.execute({ email: apple.email, slug: input.slug });
    if (!r.ok) throw r.error;
    const ctx: AuthContext = {
      userId: r.value.userId,
      tenantId: r.value.tenantId,
      role: r.value.role,
      email: r.value.email,
      isAdmin: isAdminEmail(r.value.email),
    };
    setSessionCookie(reply, ctx, secret);
    return reply.status(200).send({
      data: {
        userId: r.value.userId,
        tenantId: r.value.tenantId,
        email: r.value.email,
        role: r.value.role,
        isAdmin: isAdminEmail(r.value.email),
        token: signSession(ctx, secret),
      },
    });
  });

  // POST /api/v1/auth/apple/signup - create tenant owner with Apple ID
  app.post("/api/v1/auth/apple/signup", async (req, reply) => {
    const input = parse(appleSignUpSchema, req.body);
    const apple = await handlers.appleVerifier.verify(input.identityToken, input.nonce);
    const r = await handlers.appleSignUp.execute({
      email: apple.email,
      businessName: input.businessName,
    });
    if (!r.ok) throw r.error;
    const ctx: AuthContext = {
      userId: r.value.userId,
      tenantId: r.value.tenantId,
      role: "owner",
      email: r.value.email,
      isAdmin: isAdminEmail(r.value.email),
    };
    setSessionCookie(reply, ctx, secret);
    return reply.status(201).send({ data: { ...r.value, token: signSession(ctx, secret) } });
  });

  // POST /api/v1/auth/logout - clear session cookie
  app.post("/api/v1/auth/logout", { preHandler: requireAuth(secret) }, async (_req, reply) => {
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  // POST /api/v1/auth/accept-invitation - create account from invitation token
  app.post("/api/v1/auth/accept-invitation", async (req, reply) => {
    const input = parse(acceptInvitationSchema, req.body);
    const r = await handlers.acceptInvitation.execute({
      token: input.token,
      password: input.password,
      hmacSecret: secret,
    });
    if (!r.ok) throw r.error;
    const ctx: AuthContext = {
      userId: r.value.userId,
      tenantId: r.value.tenantId,
      role: r.value.role,
      email: r.value.email,
      isAdmin: isAdminEmail(r.value.email),
    };
    setSessionCookie(reply, ctx, secret);
    return reply.status(200).send({ data: { ...r.value, token: signSession(ctx, secret) } });
  });

  // POST /api/v1/users/invite - invite a staff or manager (owner or manager only)
  app.post(
    "/api/v1/users/invite",
    { preHandler: requireAuth(secret, ["owner", "manager"]) },
    async (req, reply) => {
      const auth = getAuth(req);
      const input = parse(inviteSchema, req.body);
      const r = await handlers.invite.execute({
        tenantId: auth.tenantId,
        email: input.email,
        role: input.role,
        invitedBy: auth.userId,
        hmacSecret: secret,
      });
      if (!r.ok) throw r.error;
      return reply.status(201).send({ data: r.value });
    },
  );

  // GET /api/v1/users - list all users in the tenant (owner or manager only)
  app.get(
    "/api/v1/users",
    { preHandler: requireAuth(secret, ["owner", "manager"]) },
    async (req, reply) => {
      const auth = getAuth(req);
      const r = await handlers.listUsers.execute(auth.tenantId);
      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: r.value });
    },
  );

  // GET /api/v1/auth/me - return the current session's auth context
  app.get("/api/v1/auth/me", { preHandler: requireAuth(secret) }, async (req, reply) => {
    return reply.status(200).send({ data: getAuth(req) });
  });

  // DELETE /api/v1/auth/account - permanently delete the tenant account + all its
  // data (Google Play / GDPR "delete account"). Owner only; irreversible.
  app.delete(
    "/api/v1/auth/account",
    { preHandler: requireAuth(secret, ["owner"]) },
    async (req, reply) => {
      const auth = getAuth(req);
      const r = await handlers.deleteAccount.execute({ tenantId: auth.tenantId });
      if (!r.ok) throw r.error;
      clearSessionCookie(reply);
      return reply.status(204).send();
    },
  );
}
