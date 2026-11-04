import { describe, expect, it } from "vitest";
import { googleDomainAllowed } from "../src/services/googleDomain.js";

describe("Google hosted domain policy", () => {
  it("allows provisioned personal accounts only when no domain restriction is configured", () => {
    expect(googleDomainAllowed(undefined, [])).toBe(true);
    expect(googleDomainAllowed(undefined, ["ptit.edu.vn"])).toBe(false);
  });
  it("compares the signed hd claim exactly rather than trusting an email suffix", () => {
    expect(googleDomainAllowed("ptit.edu.vn", ["ptit.edu.vn"])).toBe(true);
    expect(googleDomainAllowed("ptit.edu.vn.attacker.invalid", ["ptit.edu.vn"])).toBe(false);
    expect(googleDomainAllowed("gmail.com", ["ptit.edu.vn"])).toBe(false);
  });
});
