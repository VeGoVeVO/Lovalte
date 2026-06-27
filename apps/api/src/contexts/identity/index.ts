import type { ContextModule } from "../../http/app";
import { TenantRepository } from "./infrastructure/TenantRepository";
import { UserRepository } from "./infrastructure/UserRepository";
import { InvitationRepository } from "./infrastructure/InvitationRepository";
import { IdentityTxRunner } from "./infrastructure/IdentityTxRunner";
import { SignUpTenantHandler } from "./application/SignUpTenantHandler";
import { LoginHandler } from "./application/LoginHandler";
import { InviteUserHandler } from "./application/InviteUserHandler";
import { AcceptInvitationHandler } from "./application/AcceptInvitationHandler";
import { ListUsersHandler } from "./application/ListUsersHandler";
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
  const txRunner = new IdentityTxRunner(deps.pool);

  // Application handlers
  const handlers = {
    signUp: new SignUpTenantHandler(tenantRepo, txRunner, deps.bus),
    login: new LoginHandler(tenantRepo, userRepo),
    invite: new InviteUserHandler(userRepo, invitationRepo, deps.bus),
    acceptInvitation: new AcceptInvitationHandler(invitationRepo, txRunner, deps.bus),
    listUsers: new ListUsersHandler(userRepo),
  };

  // Cross-context subscriptions (none for identity in MVP - it is upstream to all)
  // Future: subscribe to "TenantSuspended" from a billing context to gate logins.

  // Presentation
  registerIdentityRoutes(app, deps, handlers);
};
