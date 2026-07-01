import type { ContextModule } from "../../http/app";
import { TenantRepository } from "./infrastructure/TenantRepository";
import { UserRepository } from "./infrastructure/UserRepository";
import { InvitationRepository } from "./infrastructure/InvitationRepository";
import { IdentityTxRunner } from "./infrastructure/IdentityTxRunner";
import { PasswordResetRepository } from "./infrastructure/PasswordResetRepository";
import { ResendIdentityEmailSender } from "./infrastructure/ResendIdentityEmailSender";
import { SignUpTenantHandler } from "./application/SignUpTenantHandler";
import { LoginHandler } from "./application/LoginHandler";
import { LoginWithAppleHandler } from "./application/LoginWithAppleHandler";
import { SignUpTenantWithAppleHandler } from "./application/SignUpTenantWithAppleHandler";
import { InviteUserHandler } from "./application/InviteUserHandler";
import { AcceptInvitationHandler } from "./application/AcceptInvitationHandler";
import { ListUsersHandler } from "./application/ListUsersHandler";
import { DeleteAccountHandler } from "./application/DeleteAccountHandler";
import { RequestPasswordResetHandler } from "./application/RequestPasswordResetHandler";
import { ResetPasswordHandler } from "./application/ResetPasswordHandler";
import { AppleIdentityTokenVerifier } from "./infrastructure/AppleIdentityTokenVerifier";
import { registerIdentityRoutes } from "./presentation/routes";

/**
 * Identity & Access bounded context module.
 * Wires repos → handlers → routes and subscribes to cross-context events.
 * Exported name: registerIdentity (matches composition.ts expectation).
 */
export const registerIdentity: ContextModule = async (app, deps) => {
  // Infrastructure
  const tenantRepo = new TenantRepository(deps.pool);
  const userRepo = new UserRepository(deps.pool);
  const invitationRepo = new InvitationRepository(deps.pool);
  const resetRepo = new PasswordResetRepository(deps.pool);
  const txRunner = new IdentityTxRunner(deps.pool);
  const emailSender = new ResendIdentityEmailSender(deps.config);
  const appleVerifier = new AppleIdentityTokenVerifier(
    deps.config.APPLE_SIGN_IN_CLIENT_IDS.split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );

  // Application handlers
  const handlers = {
    signUp: new SignUpTenantHandler(tenantRepo, txRunner, deps.bus),
    login: new LoginHandler(tenantRepo, userRepo),
    appleLogin: new LoginWithAppleHandler(tenantRepo, userRepo),
    appleSignUp: new SignUpTenantWithAppleHandler(tenantRepo, txRunner, deps.bus),
    appleVerifier,
    invite: new InviteUserHandler(userRepo, invitationRepo, deps.bus),
    acceptInvitation: new AcceptInvitationHandler(invitationRepo, txRunner, deps.bus),
    listUsers: new ListUsersHandler(userRepo),
    deleteAccount: new DeleteAccountHandler(tenantRepo, deps.bus),
    requestPasswordReset: new RequestPasswordResetHandler(userRepo, resetRepo, emailSender),
    resetPassword: new ResetPasswordHandler(userRepo, resetRepo, txRunner),
    emailSender,
  };

  // Cross-context subscriptions (none for identity in MVP - it is upstream to all)
  // Future: subscribe to "TenantSuspended" from a billing context to gate logins.

  // Presentation
  registerIdentityRoutes(app, deps, handlers);
};
