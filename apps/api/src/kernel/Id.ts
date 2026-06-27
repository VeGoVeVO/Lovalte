import { randomUUID } from "node:crypto";

/** Identity value object. Context-specific ids extend this (class TenantId extends UniqueId {}). */
export class UniqueId {
  constructor(public readonly value: string) {}
  static create(): UniqueId {
    return new UniqueId(randomUUID());
  }
  static from(value: string): UniqueId {
    return new UniqueId(value);
  }
  equals(other?: UniqueId | null): boolean {
    return !!other && other.value === this.value;
  }
  toString(): string {
    return this.value;
  }
}
