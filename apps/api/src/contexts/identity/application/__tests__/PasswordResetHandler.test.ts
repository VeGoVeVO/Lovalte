import { describe, expect, it } from "vitest";
import type {
  IdentityEmailSender,
  IIdentityTxRunner,
  IPasswordResetRepository,
  IUserRepository,
} from "../ports";
import { PasswordHash } from "../../domain/PasswordHash";
import { PasswordReset } from "../../domain/PasswordReset";
import { Email } from "../../domain/Email";
import { User } from "../../domain/User";
import { RequestPasswordResetHandler } from "../RequestPasswordResetHandler";
import { ResetPasswordHandler } from "../ResetPasswordHandler";

const SECRET = "reset-secret-with-enough-length";
const EMAIL = "owner@acme.com";
const OLD_PASSWORD = "old-password-long";
const NEW_PASSWORD = "new-password-long";

function makeUser(): User {
  return User.createOwner({
    tenantId: "tenant-reset-test",
    email: Email.create(EMAIL),
    passwordHash: PasswordHash.hash(OLD_PASSWORD),
  });
}

function userRepo(user: User | null): IUserRepository {
  return {
    async findByEmail() {
      return user;
    },
    async findByEmailGlobal() {
      return user;
    },
    async findById() {
      return user;
    },
    async findAllByTenant() {
      return user ? [user] : [];
    },
    async save() {},
  };
}

function resetRepo(saved: PasswordReset[] = []): IPasswordResetRepository {
  return {
    async findByTokenHash(tokenHash) {
      return saved.find((reset) => reset.tokenHash === tokenHash) ?? null;
    },
    async save(reset) {
      saved.push(reset);
    },
  };
}

function txRunner(): IIdentityTxRunner {
  return {
    async signUpTx() {},
    async acceptInvitationTx() {},
    async resetPasswordTx() {},
  };
}

function emailSender(sent: string[] = []): IdentityEmailSender {
  return {
    async sendWelcomeEmail() {},
    async sendInvitationEmail() {},
    async sendPasswordResetEmail(input) {
      sent.push(input.resetUrl);
    },
    async sendTestEmailPreset() {},
  };
}

describe("RequestPasswordResetHandler", () => {
  it("creates a single-use reset and sends an email for active users", async () => {
    const user = makeUser();
    const resets: PasswordReset[] = [];
    const sent: string[] = [];
    const handler = new RequestPasswordResetHandler(
      userRepo(user),
      resetRepo(resets),
      emailSender(sent),
    );

    const result = await handler.execute({
      email: "OWNER@ACME.COM",
      hmacSecret: SECRET,
      appBaseUrl: "https://lovalte.com",
    });

    expect(result.ok).toBe(true);
    expect(resets).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("https://lovalte.com/reset-password?token=");
  });

  it("returns success without sending email for unknown users", async () => {
    const sent: string[] = [];
    const handler = new RequestPasswordResetHandler(userRepo(null), resetRepo(), emailSender(sent));

    const result = await handler.execute({
      email: "missing@acme.com",
      hmacSecret: SECRET,
      appBaseUrl: "https://lovalte.com",
    });

    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(0);
  });
});

describe("ResetPasswordHandler", () => {
  it("updates the user password with a valid reset token", async () => {
    const user = makeUser();
    const { reset, rawToken } = PasswordReset.create({
      tenantId: user.tenantId,
      userId: user.id.value,
      email: user.email.value,
      hmacSecret: SECRET,
    });

    const handler = new ResetPasswordHandler(userRepo(user), resetRepo([reset]), txRunner());
    const result = await handler.execute({
      token: rawToken,
      password: NEW_PASSWORD,
      hmacSecret: SECRET,
    });

    expect(result.ok).toBe(true);
    expect(user.verifyPassword(NEW_PASSWORD)).toBe(true);
    expect(user.verifyPassword(OLD_PASSWORD)).toBe(false);
  });

  it("rejects an invalid token", async () => {
    const handler = new ResetPasswordHandler(userRepo(makeUser()), resetRepo(), txRunner());

    const result = await handler.execute({
      token: "0".repeat(64),
      password: NEW_PASSWORD,
      hmacSecret: SECRET,
    });

    expect(result.ok).toBe(false);
  });
});
