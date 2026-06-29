import type { FastifyInstance } from "fastify";
import type { Deps } from "../../shared/deps";
import { GoogleWalletRepository } from "./infrastructure/GoogleWalletRepository";
import { GoogleWalletRestClient } from "./infrastructure/GoogleWalletRestClient";
import { GoogleWalletJwtService } from "./infrastructure/GoogleWalletJwtService";
import { GetPassSaveUrlHandler } from "./application/GetPassSaveUrlHandler";
import { SyncWalletPassHandler } from "./application/SyncWalletPassHandler";
import { ExpireWalletPassHandler } from "./application/ExpireWalletPassHandler";
import { registerGoogleWalletRoutes } from "./presentation/routes";

export async function registerGoogleWallet(app: FastifyInstance, deps: Deps): Promise<void> {
  if (!deps.config.GOOGLE_WALLET_SA_JSON || !deps.config.GOOGLE_WALLET_ISSUER_ID) {
    app.log.warn(
      "Google Wallet disabled: set GOOGLE_WALLET_SA_JSON and GOOGLE_WALLET_ISSUER_ID to enable",
    );
    return;
  }

  const saJson    = deps.config.GOOGLE_WALLET_SA_JSON;
  const issuerId  = deps.config.GOOGLE_WALLET_ISSUER_ID;

  const passRepo  = new GoogleWalletRepository(deps.pool);
  const gwClient  = new GoogleWalletRestClient(saJson);
  const jwtSvc    = new GoogleWalletJwtService(saJson, [deps.config.APP_BASE_URL]);

  const getSaveUrl  = new GetPassSaveUrlHandler(passRepo, gwClient, jwtSvc, issuerId, deps.config.APP_BASE_URL);
  const syncPass    = new SyncWalletPassHandler(passRepo, gwClient);
  const expirePass  = new ExpireWalletPassHandler(passRepo, gwClient);

  deps.bus.subscribe("PassFieldsUpdated", async (event) => {
    await syncPass.execute({
      passId:   event.payload.passId as string,
      tenantId: event.payload.tenantId as string,
    });
  });

  deps.bus.subscribe("PassVoided", async (event) => {
    await expirePass.execute({
      passId:   event.payload.passId as string,
      tenantId: event.payload.tenantId as string,
    });
  });

  registerGoogleWalletRoutes(app, deps, { getSaveUrl });
}
