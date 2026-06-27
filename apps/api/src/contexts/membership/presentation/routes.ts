import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../../../shared/deps";
import { requireAuth, getAuth } from "../../../http/auth";
import { parse } from "../../../http/validation";
import type { GetMemberHandler } from "../application/GetMemberHandler";
import type { GetMemberActivityHandler } from "../application/GetMemberActivityHandler";
import type { ListMembersHandler } from "../application/ListMembersHandler";

interface MemberHandlers {
  getMember: GetMemberHandler;
  getMemberActivity: GetMemberActivityHandler;
  listMembers: ListMembersHandler;
}

const memberIdSchema = z.object({ memberId: z.string().uuid() });

const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * Register read-only member routes.
 * Auth: owner or manager (tenant-scoped).
 */
export function registerMemberRoutes(
  app: FastifyInstance,
  deps: Deps,
  handlers: MemberHandlers,
): void {
  const authHook = {
    preHandler: requireAuth(deps.config.SESSION_SECRET, ["owner", "manager"]),
  };

  /**
   * GET /api/v1/members
   * Returns a summary list of all active members for the tenant.
   */
  app.get(
    "/api/v1/members",
    authHook,
    async (req, reply) => {
      const auth = getAuth(req);
      const r = await handlers.listMembers.execute({ tenantId: auth.tenantId });
      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: r.value });
    },
  );

  /**
   * GET /api/v1/members/:memberId
   * Returns the member's profile, current balance (from ledger), and tier.
   */
  app.get<{ Params: { memberId: string } }>(
    "/api/v1/members/:memberId",
    authHook,
    async (req, reply) => {
      const auth = getAuth(req);
      const { memberId } = parse(memberIdSchema, req.params);

      const r = await handlers.getMember.execute({
        memberId,
        tenantId: auth.tenantId,
      });

      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: r.value });
    },
  );

  /**
   * GET /api/v1/members/:memberId/activity
   * Returns a paginated list of point ledger entries for the member.
   * Query params: page (default 1), pageSize (default 25, max 100).
   */
  app.get<{ Params: { memberId: string }; Querystring: Record<string, string> }>(
    "/api/v1/members/:memberId/activity",
    authHook,
    async (req, reply) => {
      const auth = getAuth(req);
      const { memberId } = parse(memberIdSchema, req.params);
      const rawQuery = parse(activityQuerySchema, req.query);
      const page = rawQuery.page ?? 1;
      const pageSize = rawQuery.pageSize ?? 25;

      const r = await handlers.getMemberActivity.execute({
        memberId,
        tenantId: auth.tenantId,
        page,
        pageSize,
      });

      if (!r.ok) throw r.error;
      return reply.status(200).send({ data: r.value });
    },
  );
}
