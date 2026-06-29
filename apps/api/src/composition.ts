import type { ContextModule } from "./http/app";
import { registerIdentity } from "./contexts/identity";
import { registerCardDesign } from "./contexts/card-design";
import { registerPassIssuance } from "./contexts/pass-issuance";
import { registerMembership } from "./contexts/membership";
import { registerScanning } from "./contexts/scanning";
import { registerDelivery } from "./contexts/delivery";
import { registerAnalytics } from "./contexts/analytics";
import { registerGoogleWallet } from "./contexts/google-wallet";
import { registerSupport } from "./contexts/support";

/** Composition root: the ordered set of bounded-context modules mounted on the API.
 *  Contexts never import each other - they integrate via deps.bus (DomainEventBus). */
export const contextModules: ContextModule[] = [
  registerIdentity,
  registerCardDesign,
  registerPassIssuance,
  registerMembership,
  registerScanning,
  registerDelivery,
  registerAnalytics,
  registerGoogleWallet,
  registerSupport,
];
