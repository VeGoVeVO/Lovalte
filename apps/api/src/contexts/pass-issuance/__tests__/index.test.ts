import { describe, it, expect } from "vitest";
import { mapBrandFieldDefinitions } from "../index";

describe("mapBrandFieldDefinitions", () => {
  it("maps backFields into back-region fieldDefinitions and carries changeMessage", () => {
    const brand = {
      primaryFields: [{ key: "points", label: "Points" }],
      backFields: [
        { key: "terms", label: "Terms", valueTemplate: "See lovalte.com/terms" },
        { key: "phone", label: "Phone", valueTemplate: "555-0100", changeMessage: "Call us: %@" },
      ],
    };

    const defs = mapBrandFieldDefinitions(brand, "points", 10);

    const back = defs.filter((d) => d.region === "back");
    expect(back).toHaveLength(2);
    expect(back).toContainEqual({
      key: "terms",
      label: "Terms",
      region: "back",
      value: "See lovalte.com/terms",
    });
    expect(back).toContainEqual({
      key: "phone",
      label: "Phone",
      region: "back",
      value: "555-0100",
      changeMessage: "Call us: %@",
    });
  });

  it("defaults the loyalty counter's changeMessage to `<label>: %@` when the merchant set none", () => {
    const brand = { primaryFields: [{ key: "points", label: "Sellos" }] };

    const defs = mapBrandFieldDefinitions(brand, "stamps", 10);

    const points = defs.find((d) => d.key === "points");
    expect(points?.changeMessage).toBe("Sellos: %@");
    expect(points?.loyaltyType).toBe("stamps");
    expect(points?.loyaltyGoal).toBe(10);
  });

  it("preserves a merchant-authored changeMessage on the loyalty counter instead of overriding it", () => {
    const brand = {
      primaryFields: [{ key: "points", label: "Points", changeMessage: "New balance: %@" }],
    };

    const defs = mapBrandFieldDefinitions(brand, "points", 10);

    expect(defs.find((d) => d.key === "points")?.changeMessage).toBe("New balance: %@");
  });

  it("leaves non-loyalty fields untouched by tagLoyalty", () => {
    const brand = { headerFields: [{ key: "tier", label: "Tier", valueTemplate: "Gold" }] };

    const defs = mapBrandFieldDefinitions(brand, "points", 10);

    const tier = defs.find((d) => d.key === "tier");
    expect(tier).toEqual({ key: "tier", label: "Tier", region: "header", value: "Gold" });
    expect(tier?.loyaltyType).toBeUndefined();
  });
});
