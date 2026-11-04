import { expect, it } from "vitest";
import { retainServiceFields } from "./serviceFields";

it("removes invisible fields when switching services while preserving shared values", () => {
  expect(retainServiceFields({ studentId: "example", semester: "1" }, ["semester"])).toEqual({ semester: "1" });
  expect(retainServiceFields({ studentId: "example" }, [])).toEqual({});
});
