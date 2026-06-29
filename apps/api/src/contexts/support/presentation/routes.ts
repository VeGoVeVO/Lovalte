import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../../../shared/deps";
import { requireAuth, requireAdmin, getAuth } from "../../../http/auth";
import { parse } from "../../../http/validation";
import type { CreateTicketHandler } from "../application/CreateTicketHandler";
import type { ListTicketsHandler } from "../application/ListTicketsHandler";
import type { GetTicketHandler } from "../application/GetTicketHandler";
import type { ReplyTicketHandler } from "../application/ReplyTicketHandler";
import type { AdminListTicketsHandler } from "../application/AdminListTicketsHandler";
import type { AdminGetTicketHandler } from "../application/AdminGetTicketHandler";
import type { AdminReplyTicketHandler } from "../application/AdminReplyTicketHandler";
import type { AdminUpdateTicketHandler } from "../application/AdminUpdateTicketHandler";
import type { AdminStatsHandler } from "../application/AdminStatsHandler";

export interface SupportHandlers {
  createTicket: CreateTicketHandler;
  listTickets: ListTicketsHandler;
  getTicket: GetTicketHandler;
  replyTicket: ReplyTicketHandler;
  adminList: AdminListTicketsHandler;
  adminGet: AdminGetTicketHandler;
  adminReply: AdminReplyTicketHandler;
  adminUpdate: AdminUpdateTicketHandler;
  adminStats: AdminStatsHandler;
}

const STATUS = z.enum(["open", "pending", "resolved", "closed"]);
const PRIORITY = z.enum(["low", "normal", "high", "urgent"]);

const createSchema = z
  .object({
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
    priority: PRIORITY.optional(),
  })
  .strict();

const replySchema = z.object({ body: z.string().min(1).max(5000) }).strict();
const idSchema = z.object({ id: z.string().uuid() });

const adminListQuerySchema = z.object({
  status: STATUS.optional(),
  q: z.string().min(1).max(100).optional(),
});

const adminUpdateSchema = z
  .object({ status: STATUS.optional(), priority: PRIORITY.optional() })
  .strict()
  .refine((d) => d.status !== undefined || d.priority !== undefined, {
    message: "Provide status and/or priority",
  });

/**
 * Support / helpdesk routes.
 *   /api/v1/support/*  - tenant users open + reply to their own tickets.
 *   /api/v1/admin/*    - the single platform super-admin, cross-tenant desk.
 */
export function registerSupportRoutes(
  app: FastifyInstance,
  deps: Deps,
  handlers: SupportHandlers
): void {
  const secret = deps.config.SESSION_SECRET;
  const userHook = { preHandler: requireAuth(secret) };
  const adminHook = { preHandler: requireAdmin(secret) };

  // ── Tenant plane ────────────────────────────────────────────────────────────

  // POST /api/v1/support/tickets - open a new ticket
  app.post("/api/v1/support/tickets", userHook, async (req, reply) => {
    const auth = getAuth(req);
    const input = parse(createSchema, req.body);
    const r = await handlers.createTicket.execute({
      tenantId: auth.tenantId,
      createdBy: auth.userId,
      createdByEmail: auth.email,
      subject: input.subject,
      body: input.body,
      priority: input.priority,
    });
    if (!r.ok) throw r.error;
    return reply.status(201).send({ data: r.value });
  });

  // GET /api/v1/support/tickets - list the tenant's tickets
  app.get("/api/v1/support/tickets", userHook, async (req, reply) => {
    const auth = getAuth(req);
    const r = await handlers.listTickets.execute(auth.tenantId);
    if (!r.ok) throw r.error;
    return reply.status(200).send({ data: r.value });
  });

  // GET /api/v1/support/tickets/:id - ticket + thread
  app.get<{ Params: { id: string } }>(
    "/api/v1/support/tickets/:id",
    userHook,
    async (req, reply) => {
      const auth = getAuth(req);
      const { id } = parse(idSchema, req.params);
      const r = await handlers.getTicket.execute({ ticketId: id, tenantId: auth.tenantId });
      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: r.value });
    }
  );

  // POST /api/v1/support/tickets/:id/messages - user reply
  app.post<{ Params: { id: string } }>(
    "/api/v1/support/tickets/:id/messages",
    userHook,
    async (req, reply) => {
      const auth = getAuth(req);
      const { id } = parse(idSchema, req.params);
      const input = parse(replySchema, req.body);
      const r = await handlers.replyTicket.execute({
        ticketId: id,
        tenantId: auth.tenantId,
        authorId: auth.userId,
        authorEmail: auth.email,
        body: input.body,
      });
      if (!r.ok) throw r.error;
      return reply.status(201).send({ data: r.value });
    }
  );

  // ── Admin plane (cross-tenant) ──────────────────────────────────────────────

  // GET /api/v1/admin/tickets/stats - desk KPIs
  app.get("/api/v1/admin/tickets/stats", adminHook, async (_req, reply) => {
    const r = await handlers.adminStats.execute();
    if (!r.ok) throw r.error;
    return reply.status(200).send({ data: r.value });
  });

  // GET /api/v1/admin/tickets?status=&q= - list across all tenants
  app.get<{ Querystring: Record<string, string> }>(
    "/api/v1/admin/tickets",
    adminHook,
    async (req, reply) => {
      const q = parse(adminListQuerySchema, req.query);
      const r = await handlers.adminList.execute({ status: q.status, search: q.q });
      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: r.value });
    }
  );

  // GET /api/v1/admin/tickets/:id - ticket + thread (any tenant)
  app.get<{ Params: { id: string } }>(
    "/api/v1/admin/tickets/:id",
    adminHook,
    async (req, reply) => {
      const { id } = parse(idSchema, req.params);
      const r = await handlers.adminGet.execute(id);
      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: r.value });
    }
  );

  // POST /api/v1/admin/tickets/:id/messages - admin reply
  app.post<{ Params: { id: string } }>(
    "/api/v1/admin/tickets/:id/messages",
    adminHook,
    async (req, reply) => {
      const auth = getAuth(req);
      const { id } = parse(idSchema, req.params);
      const input = parse(replySchema, req.body);
      const r = await handlers.adminReply.execute({
        ticketId: id,
        authorEmail: auth.email,
        body: input.body,
      });
      if (!r.ok) throw r.error;
      return reply.status(201).send({ data: r.value });
    }
  );

  // PATCH /api/v1/admin/tickets/:id - change status and/or priority
  app.patch<{ Params: { id: string } }>(
    "/api/v1/admin/tickets/:id",
    adminHook,
    async (req, reply) => {
      const { id } = parse(idSchema, req.params);
      const input = parse(adminUpdateSchema, req.body);
      const r = await handlers.adminUpdate.execute({
        ticketId: id,
        status: input.status,
        priority: input.priority,
      });
      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: r.value });
    }
  );
}
