import { describe, it, expect } from "vitest";
import { Email } from "./Email";
import { PasswordHash } from "./PasswordHash";
import { User } from "./User";
import { Invitation } from "./Invitation";
import { ValidationError } from "../../../kernel";

describe("Email value object", () => {
  it("normalises to lowercase and trims whitespace", () => {
    const email = Email.create("  OWNER@EXAMPLE.COM  ");
    expect(email.value).toBe("owner@example.com");
  });

  it("throws ValidationError for addresses without @", () => {
    expect(() => Email.create("notanemail")).toThrow(ValidationError);
  });

  it("throws ValidationError for empty input", () => {
    expect(() => Email.create("")).toThrow(ValidationError);
  });

  it("considers structurally equal emails as equal", () => {
    const a = Email.create("a@b.com");
    const b = Email.create("a@b.com");
    expect(a.equals(b)).toBe(true);
  });
});

describe("PasswordHash value object", () => {
  it("verifies the correct plaintext", () => {
    const hash = PasswordHash.hash("superSecret123!");
    expect(hash.verify("superSecret123!")).toBe(true);
  });

  it("rejects an incorrect plaintext", () => {
    const hash = PasswordHash.hash("superSecret123!");
    expect(hash.verify("wrongPassword")).toBe(false);
  });

  it("produces different encoded values for the same plaintext (salt randomisation)", () => {
    const h1 = PasswordHash.hash("samePassword");
    const h2 = PasswordHash.hash("samePassword");
    expect(h1.encoded).not.toBe(h2.encoded);
  });
});

describe("User aggregate", () => {
  const makeUser = () => {
    const email = Email.create("alice@acme.com");
    const hash = PasswordHash.hash("p@ssw0rd-long");
    return User.createOwner({ tenantId: "tenant-abc", email, passwordHash: hash });
  };

  it("creates an owner with role=owner and status=active", () => {
    const user = makeUser();
    expect(user.role).toBe("owner");
    expect(user.status).toBe("active");
  });

  it("verifies the correct password via the aggregate", () => {
    const user = makeUser();
    expect(user.verifyPassword("p@ssw0rd-long")).toBe(true);
    expect(user.verifyPassword("wrong")).toBe(false);
  });

  it("emits UserActivated when created from an invitation", () => {
    const email = Email.create("bob@acme.com");
    const hash = PasswordHash.hash("another-long-p@ss");
    const user = User.createFromInvitation({
      tenantId: "tenant-abc",
      email,
      passwordHash: hash,
      role: "staff",
    });
    const events = user.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("UserActivated");
    expect(events[0].payload.role).toBe("staff");
  });
});

describe("Invitation invariants", () => {
  const SECRET = "test-hmac-secret-32-chars-minimum!!";

  it("verifies a valid raw token", () => {
    const { invitation, rawToken } = Invitation.create({
      tenantId: "t1",
      email: "staff@acme.com",
      role: "staff",
      invitedBy: "owner-id",
      hmacSecret: SECRET,
    });
    expect(Invitation.verifyToken(rawToken, invitation.tokenHash, SECRET)).toBe(true);
  });

  it("rejects a tampered token", () => {
    const { invitation } = Invitation.create({
      tenantId: "t1",
      email: "staff@acme.com",
      role: "staff",
      invitedBy: "owner-id",
      hmacSecret: SECRET,
    });
    expect(Invitation.verifyToken("tampered-token", invitation.tokenHash, SECRET)).toBe(false);
  });

  it("throws when consumed twice", () => {
    const { invitation } = Invitation.create({
      tenantId: "t1",
      email: "staff@acme.com",
      role: "staff",
      invitedBy: "owner-id",
      hmacSecret: SECRET,
    });
    invitation.consume();
    expect(() => invitation.consume()).toThrow(ValidationError);
  });
});
