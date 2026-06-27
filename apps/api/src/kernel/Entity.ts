import { UniqueId } from "./Id";

/** Entity: identity equality (two entities are equal iff same id). */
export abstract class Entity<TId extends UniqueId = UniqueId> {
  protected constructor(public readonly id: TId) {}
  equals(other?: Entity<TId> | null): boolean {
    return !!other && this.id.equals(other.id);
  }
}
