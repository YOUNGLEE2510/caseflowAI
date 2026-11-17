import { expect, it } from "vitest";
import { retainServiceFields } from "./serviceFields";

it("removes invisible fields when switching services while preserving shared values", () => {
  expect(retainServiceFields({ contractCode: "example", moveInDate: "1" }, ["moveInDate"])).toEqual({ moveInDate: "1" });
  expect(retainServiceFields({ contractCode: "example" }, [])).toEqual({});
});
