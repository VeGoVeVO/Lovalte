import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "../enrollTokens";

const SECRET = "test-secret-key-至少十六字符以上-padding";

describe("enrollTokens", () => {
  it("round-trips claims for the matching token type", () => {
    const tok = signToken(SECRET, { typ: "enroll", templateId: "tpl-1", tenantId: "ten-1" }, 1000);
    const claims = verifyToken(SECRET, tok, "enroll");
    expect(claims).not.toBeNull();
    expect(claims?.templateId).toBe("tpl-1");
    expect(claims?.tenantId).toBe("ten-1");
    expect(claims?.iat).toBe(1000);
  });

  it("rejects a token verified as the wrong type (no enroll↔download confusion)", () => {
    const tok = signToken(SECRET, { typ: "enroll", templateId: "t" }, 1);
    expect(verifyToken(SECRET, tok, "download")).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const tok = signToken(SECRET, { typ: "download", passId: "p", tenantId: "x" }, 1);
    const tampered = tok.slice(0, -2) + (tok.endsWith("aa") ? "bb" : "aa");
    expect(verifyToken(SECRET, tampered, "download")).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const tok = signToken(SECRET, { typ: "enroll", templateId: "t" }, 1);
    expect(verifyToken("another-secret-entirely-different", tok, "enroll")).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyToken(SECRET, "garbage", "enroll")).toBeNull();
    expect(verifyToken(SECRET, "a.b.c", "enroll")).toBeNull();
    expect(verifyToken(SECRET, "", "enroll")).toBeNull();
  });

  it("accepts a token within maxAgeMs", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tok = signToken(SECRET, { typ: "download", passId: "p" }, nowSeconds - 10);
    expect(verifyToken(SECRET, tok, "download", 60_000)).not.toBeNull();
  });

  it("rejects a token older than maxAgeMs (download tokens expire)", () => {
    const thirtyOneDaysAgo = Math.floor(Date.now() / 1000) - 31 * 24 * 60 * 60;
    const tok = signToken(SECRET, { typ: "download", passId: "p" }, thirtyOneDaysAgo);
    expect(verifyToken(SECRET, tok, "download", 30 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it("never expires when maxAgeMs is omitted (enroll QR tokens are printed collateral)", () => {
    const yearsAgo = Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 60 * 60;
    const tok = signToken(SECRET, { typ: "enroll", templateId: "t" }, yearsAgo);
    expect(verifyToken(SECRET, tok, "enroll")).not.toBeNull();
  });
});
