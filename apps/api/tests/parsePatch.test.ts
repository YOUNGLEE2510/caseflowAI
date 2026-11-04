import { expect, it } from "vitest";
import { z } from "zod";
import { parsePatch } from "../src/services/parsePatch.js";

it("never fills omitted PATCH fields with creation defaults", () => {
  const schema = z.object({ title: z.string(), status: z.enum(["draft", "published"]).default("draft"), tags: z.array(z.string()).default([]) }).partial();
  expect(parsePatch(schema, { title: "Updated" })).toEqual({ title: "Updated" });
  expect(parsePatch(schema, { status: "draft" })).toEqual({ status: "draft" });
});
