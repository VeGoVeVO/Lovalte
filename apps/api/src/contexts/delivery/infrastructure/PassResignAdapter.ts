import type { WalletServices } from "../../../shared/deps";
import type { IPassResignPort } from "../domain/ports";

/**
 * Self-heal on a pkpass cache miss. `ensurePkpassCached` is registered by the
 * pass-issuance context at its own module init; we resolve it lazily at call
 * time (never at construction) so module registration order between
 * pass-issuance and delivery doesn't matter, and so delivery still boots if
 * pass-issuance somehow isn't wired.
 */
export class PassResignAdapter implements IPassResignPort {
  constructor(private readonly services: WalletServices) {}

  async ensureCached(serialNumber: string): Promise<Buffer | null> {
    const ensure = this.services.ensurePkpassCached;
    if (!ensure) return null;
    const buffer = await ensure(serialNumber);
    return buffer ?? null;
  }
}
