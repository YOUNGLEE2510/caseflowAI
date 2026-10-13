import { describe, expect, it } from "vitest";
import { validateInputKeys } from "../src/middleware/inputBoundary.js";

describe("JSON input boundary", () => {
  it("accepts normal text without treating it as a database operator", () => {
    expect(() => validateInputKeys({ description: "$ne or <script> is ordinary text", customFields: { "Student ID": "123" } })).not.toThrow();
  });
  it.each(["__proto__", "constructor", "prototype", "$ne", "a.b"])("rejects unsafe key %s", key => {
    expect(() => validateInputKeys(JSON.parse(JSON.stringify({ data: { [key]: "x" } })))).toThrow();
  });
  it("rejects excessive nesting", () => {
    let value: unknown = "leaf";
    for (let i = 0; i < 32; i++) value = { child: value };
    expect(() => validateInputKeys(value)).toThrow();
  });
});
