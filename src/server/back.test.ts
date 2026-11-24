import { describe, expect, test } from "bun:test";
import { safeBack } from "./back";

describe("safeBack", () => {
  test("keeps the team app pages a draft card can return to", () => {
    expect(safeBack("/today")).toBe("/today");
    expect(safeBack("/texts")).toBe("/texts");
    expect(safeBack("/texts/0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e")).toBe("/texts/0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e");
  });

  test("sends anything that could leave the site to Today instead", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "/today/../..//evil.example", "/%2F%2Fevil.example", "", null, "/texts/not-an-id"]) {
      expect(safeBack(bad)).toBe("/today");
    }
  });
});
