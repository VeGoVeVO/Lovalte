import { randomUUID } from "node:crypto";
import { AggregateRoot, UniqueId, DomainError } from "../../../kernel";
import type { SerialNumber } from "./SerialNumber";
import type { AuthenticationToken } from "./AuthenticationToken";

export class PassId extends UniqueId {
  static override create(): PassId { return new PassId(randomUUID()); }
  static override from(v: string): PassId { return new PassId(v); }
}

export interface PassFieldValue {
  key: string;
  label: string;
  value: string | number;
  changeMessage?: string;
}

interface PassProps {
  serialNumber: SerialNumber;
  passTypeId: string;
  memberId: string;
  tenantId: string;
  authToken: AuthenticationToken;
  fieldValues: PassFieldValue[];
  voided: boolean;
  lastUpdated: Date;
  version: number;
  createdAt: Date;
}

/**
 * Pass aggregate root.
 *
 * Invariants:
 *  - authToken is set once at minting and NEVER changes.
 *  - lastUpdated is monotonically increasing on every mutation.
 *  - A voided pass cannot have its fields updated.
 *
 * Domain events: PassIssued, PassFieldsUpdated, PassVoided
 */
export class Pass extends AggregateRoot<PassId> {
  private readonly _serialNumber: SerialNumber;
  private readonly _passTypeId: string;
  private readonly _memberId: string;
  private readonly _tenantId: string;
  private readonly _authToken: AuthenticationToken; // immutable; private; no setter
  private _fieldValues: PassFieldValue[];
  private _voided: boolean;
  private _lastUpdated: Date;
  private _version: number;
  readonly createdAt: Date;

  private constructor(id: PassId, props: PassProps) {
    super(id);
    this._serialNumber = props.serialNumber;
    this._passTypeId   = props.passTypeId;
    this._memberId     = props.memberId;
    this._tenantId     = props.tenantId;
    this._authToken    = props.authToken;
    this._fieldValues  = props.fieldValues;
    this._voided       = props.voided;
    this._lastUpdated  = props.lastUpdated;
    this._version      = props.version;
    this.createdAt     = props.createdAt;
  }

  /** Factory: mint a brand-new pass. Emits PassIssued. */
  static issue(params: {
    passTypeId: string;
    memberId: string;
    tenantId: string;
    serialNumber: SerialNumber;
    authToken: AuthenticationToken;
    fieldValues: PassFieldValue[];
    now: Date;
  }): Pass {
    const id = PassId.create();
    const pass = new Pass(id, {
      serialNumber: params.serialNumber,
      passTypeId:   params.passTypeId,
      memberId:     params.memberId,
      tenantId:     params.tenantId,
      authToken:    params.authToken,
      fieldValues:  params.fieldValues,
      voided:       false,
      lastUpdated:  params.now,
      version:      1,
      createdAt:    params.now,
    });
    pass.addEvent(pass.makeEvent("PassIssued", {
      passId:    id.value,
      memberId:  params.memberId,
      tenantId:  params.tenantId,
      serial:    params.serialNumber.value,
    }));
    return pass;
  }

  /** Reconstitute from persistence - no event emitted. */
  static reconstitute(id: string, props: PassProps): Pass {
    return new Pass(PassId.from(id), props);
  }

  /** Update field values and bump lastUpdated monotonically. Throws if pass is voided. */
  updateFields(fieldValues: PassFieldValue[], now: Date): void {
    if (this._voided) {
      throw new DomainError("Cannot update a voided pass", "PASS_VOIDED");
    }
    if (now <= this._lastUpdated) {
      // Ensure monotonic - use at least one ms ahead.
      now = new Date(this._lastUpdated.getTime() + 1);
    }
    this._fieldValues = [...fieldValues];
    this._lastUpdated = now;
    this._version    += 1;
    this.addEvent(this.makeEvent("PassFieldsUpdated", {
      passId:   this.id.value,
      serial:   this._serialNumber.value,
      tenantId: this._tenantId,
      version:  this._version,
    }));
  }

  /** Void the pass - idempotent. */
  voidPass(now: Date): void {
    if (this._voided) return;
    this._voided      = true;
    this._lastUpdated = now;
    this._version    += 1;
    this.addEvent(this.makeEvent("PassVoided", {
      passId:  this.id.value,
      serial:  this._serialNumber.value,
      tenantId: this._tenantId,
    }));
  }

  get serialNumber(): SerialNumber  { return this._serialNumber; }
  get passTypeId(): string          { return this._passTypeId; }
  get memberId(): string            { return this._memberId; }
  get tenantId(): string            { return this._tenantId; }
  get authToken(): AuthenticationToken { return this._authToken; }
  get fieldValues(): PassFieldValue[] { return [...this._fieldValues]; }
  get voided(): boolean             { return this._voided; }
  get lastUpdated(): Date           { return this._lastUpdated; }
  get version(): number             { return this._version; }
}
