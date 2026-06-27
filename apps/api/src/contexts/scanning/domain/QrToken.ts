import { ValueObject } from "../../../kernel";

export interface QrTokenProps {
  readonly passId: string;    // "sub" claim — Pass aggregate ID
  readonly tenantId: string;  // "tid" claim — tenant isolation
  readonly nonce: string;     // "nce" claim — single-use 16-byte hex
  readonly iat: number;       // issued-at seconds
  readonly exp: number;       // expiry seconds (10-year nominal; nonce is the real guard)
}

/** Parsed and cryptographically verified QR token claims.
 *  Created only after signature verification in QrVerifier (infrastructure). */
export class QrToken extends ValueObject<QrTokenProps> {
  private constructor(props: QrTokenProps) {
    super(props);
  }

  static create(props: QrTokenProps): QrToken {
    return new QrToken(props);
  }

  isExpired(nowMs: number): boolean {
    return Math.floor(nowMs / 1000) > this.props.exp;
  }

  get passId(): string { return this.props.passId; }
  get tenantId(): string { return this.props.tenantId; }
  get nonce(): string { return this.props.nonce; }
  get iat(): number { return this.props.iat; }
  get exp(): number { return this.props.exp; }
}
