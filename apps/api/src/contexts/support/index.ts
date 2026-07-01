import type { ContextModule } from "../../http/app";
import { TicketRepository } from "./infrastructure/TicketRepository";
import { CreateTicketHandler } from "./application/CreateTicketHandler";
import { ListTicketsHandler } from "./application/ListTicketsHandler";
import { GetTicketHandler } from "./application/GetTicketHandler";
import { ReplyTicketHandler } from "./application/ReplyTicketHandler";
import { AdminListTicketsHandler } from "./application/AdminListTicketsHandler";
import { AdminGetTicketHandler } from "./application/AdminGetTicketHandler";
import { AdminReplyTicketHandler } from "./application/AdminReplyTicketHandler";
import { AdminUpdateTicketHandler } from "./application/AdminUpdateTicketHandler";
import { AdminStatsHandler } from "./application/AdminStatsHandler";
import { registerSupportRoutes } from "./presentation/routes";
import { ResendIdentityEmailSender } from "../identity/infrastructure/ResendIdentityEmailSender";

/**
 * Support / Helpdesk bounded context.
 *
 * Tenant users open + reply to tickets (tenant-scoped); the single platform
 * super-admin answers and manages them across all tenants (admin plane, RLS
 * bypass via app.is_admin). No cross-context subscriptions today; emits
 * TicketOpened / TicketReplied for future notification subscribers.
 */
export const registerSupport: ContextModule = async (app, deps) => {
  const tickets = new TicketRepository(deps.pool);
  const emailSender = new ResendIdentityEmailSender(deps.config);

  deps.bus.subscribe("TicketOpened", async (event) => {
    await emailSender.sendSupportEmail({
      subject: "New Lovalte support ticket",
      text: `A support ticket was opened: ${String(event.payload["subject"] ?? "")}`,
      html: `<p style="font-size:16px;line-height:1.6;margin:0;">A support ticket was opened in Lovalte.</p>`,
    });
  });

  registerSupportRoutes(app, deps, {
    createTicket: new CreateTicketHandler(tickets, deps.bus),
    listTickets: new ListTicketsHandler(tickets),
    getTicket: new GetTicketHandler(tickets),
    replyTicket: new ReplyTicketHandler(tickets, deps.bus),
    adminList: new AdminListTicketsHandler(tickets),
    adminGet: new AdminGetTicketHandler(tickets),
    adminReply: new AdminReplyTicketHandler(tickets, deps.bus),
    adminUpdate: new AdminUpdateTicketHandler(tickets),
    adminStats: new AdminStatsHandler(tickets),
  });
};
