import { UniqueId } from "../../../kernel";
import { randomUUID } from "node:crypto";

/** Identity value object for the Member aggregate. */
export class MemberId extends UniqueId {
  static override create(): MemberId {
    return new MemberId(randomUUID());
  }

  static override from(value: string): MemberId {
    return new MemberId(value);
  }
}
