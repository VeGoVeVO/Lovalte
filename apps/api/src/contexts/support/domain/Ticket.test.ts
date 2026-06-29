import { describe, it, expect } from "vitest";
import { Ticket } from "./Ticket";
import { ValidationError } from "../../../kernel";

const base = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  createdBy: "22222222-2222-2222-2222-222222222222",
  createdByEmail: "owner@shop.test",
};

describe("Ticket", () => {
  it("opens with one user message and emits TicketOpened", () => {
    const t = Ticket.open({ ...base, subject: "Help", body: "It broke" });
    expect(t.status).toBe("open");
    expect(t.priority).toBe("normal");
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0].authorKind).toBe("user");
    expect(t.lastReplyBy).toBe("user");

    const newMsgs = t.pullNewMessages();
    expect(newMsgs).toHaveLength(1);
    expect(t.pullNewMessages()).toHaveLength(0); // drained

    const events = t.pullEvents();
    expect(events.map((e) => e.name)).toContain("TicketOpened");
  });

  it("rejects empty subject or body", () => {
    expect(() => Ticket.open({ ...base, subject: "  ", body: "x" })).toThrow(ValidationError);
    expect(() => Ticket.open({ ...base, subject: "ok", body: "  " })).toThrow(ValidationError);
  });

  it("moves open -> pending when admin replies", () => {
    const t = Ticket.open({ ...base, subject: "Help", body: "It broke" });
    t.pullNewMessages();
    t.pullEvents();
    const msg = t.reply({ authorKind: "admin", authorId: null, authorEmail: "admin@lovalte.test", body: "On it" });
    expect(t.status).toBe("pending");
    expect(t.lastReplyBy).toBe("admin");
    expect(t.messages).toHaveLength(2);
    expect(t.pullNewMessages()).toEqual([msg]);
    expect(t.pullEvents().map((e) => e.name)).toContain("TicketReplied");
  });

  it("reopens a resolved ticket when the user replies", () => {
    const t = Ticket.open({ ...base, subject: "Help", body: "It broke" });
    t.changeStatus("resolved");
    t.reply({ authorKind: "user", authorId: base.createdBy, authorEmail: base.createdByEmail, body: "Still broken" });
    expect(t.status).toBe("open");
  });

  it("refuses replies on a closed ticket", () => {
    const t = Ticket.open({ ...base, subject: "Help", body: "It broke" });
    t.changeStatus("closed");
    expect(() =>
      t.reply({ authorKind: "user", authorId: base.createdBy, authorEmail: base.createdByEmail, body: "hi" })
    ).toThrow(ValidationError);
  });

  it("validates status and priority changes", () => {
    const t = Ticket.open({ ...base, subject: "Help", body: "It broke" });
    expect(() => t.changeStatus("nope" as never)).toThrow(ValidationError);
    expect(() => t.changePriority("nope" as never)).toThrow(ValidationError);
    t.changePriority("urgent");
    expect(t.priority).toBe("urgent");
  });
});
