import type { ContextModule } from "../../http/app";
import { CardTemplateRepository } from "./infrastructure/CardTemplateRepository";
import { SqlImageRepository } from "./infrastructure/SqlImageRepository";
import { SharpImageNormalizer } from "./infrastructure/SharpImageNormalizer";
import { CreateCardTemplateHandler } from "./application/CreateCardTemplateHandler";
import { UpdateCardTemplateHandler } from "./application/UpdateCardTemplateHandler";
import { PublishCardTemplateHandler } from "./application/PublishCardTemplateHandler";
import { GetCardTemplateHandler } from "./application/GetCardTemplateHandler";
import { ListCardTemplatesHandler } from "./application/ListCardTemplatesHandler";
import { RegisterAssetRefHandler } from "./application/RegisterAssetRefHandler";
import { StoreImageHandler } from "./application/StoreImageHandler";
import { GetImageHandler } from "./application/GetImageHandler";
import { DeleteCardTemplateHandler } from "./application/DeleteCardTemplateHandler";
import { registerCardDesignRoutes } from "./presentation/routes";

/**
 * Card Design bounded context module.
 *
 * Responsibilities:
 *  - CardTemplate aggregate lifecycle (draft → published)
 *  - BrandConfig and RewardRule value objects
 *  - Asset ref registration (S3 key/URL storage)
 *  - Emits CardTemplatePublished → consumed by Pass Issuance context
 *
 * Routes mounted at /api/v1/card-templates/*
 * RBAC: owner | manager only
 */
export const registerCardDesign: ContextModule = async (app, deps) => {
  const repo = new CardTemplateRepository(deps.pool);
  const imageRepo = new SqlImageRepository(deps.pool);
  const imageNormalizer = new SharpImageNormalizer();

  const handlers = {
    create: new CreateCardTemplateHandler(repo, deps.bus),
    update: new UpdateCardTemplateHandler(repo, deps.bus),
    publish: new PublishCardTemplateHandler(repo, deps.bus, imageRepo),
    get: new GetCardTemplateHandler(repo),
    list: new ListCardTemplatesHandler(repo),
    registerAsset: new RegisterAssetRefHandler(repo),
    storeImage: new StoreImageHandler(imageRepo, imageNormalizer),
    getImage: new GetImageHandler(imageRepo),
    deleteTemplate: new DeleteCardTemplateHandler(repo, deps.bus),
  };

  // Subscribe to cross-context events consumed by this context.
  deps.bus.subscribe("TenantDeleted", async (event) => {
    await repo.purgeByTenant(String(event.payload.tenantId));
  });

  registerCardDesignRoutes(app, deps, handlers);
};
