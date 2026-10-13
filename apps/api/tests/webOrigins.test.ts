import { describe, expect, it } from "vitest";
import { allowedWebOrigins } from "../src/services/webOrigins.js";

describe("web origin boundary", () => {
  it("allows only same-port loopback aliases locally", () => {
    expect(allowedWebOrigins("http://localhost:8080", "local")).toEqual(["http://localhost:8080", "http://127.0.0.1:8080"]);
    expect(allowedWebOrigins("http://127.0.0.1:5173", "local")).not.toContain("http://localhost:8080");
    expect(allowedWebOrigins("https://example.com", "local")).toEqual(["https://example.com"]);
  });
  it("does not add origins in pilot", () => {
    expect(allowedWebOrigins("https://localhost:8080", "pilot")).toEqual(["https://localhost:8080"]);
  });
});
