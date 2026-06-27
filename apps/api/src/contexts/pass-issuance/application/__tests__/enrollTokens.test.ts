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
});
