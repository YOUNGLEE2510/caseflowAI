import { describe, expect, it } from "vitest";
import { parseCsv, participantPlan, pilotCaseCode, readScenarios } from "../src/scripts/pilotSetup.js";

describe("pilot setup helpers", () => {
  it("reads quoted CSV with commas, doubled quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿group,title,description\r\ng1,"A, b","Say ""hi""\nthere"\r\n\r\n'))
      .toEqual([["group", "title", "description"], ["g1", "A, b", 'Say "hi"\nthere']]);
  });

  it("validates scenario rows and requires both groups", () => {
    const ok = "group,title,description\ng1,Rò nước,Vòi bếp rỉ liên tục từ tối qua\nG2,Ổ cắm,Ổ cắm có mùi khét và nhảy aptomat";
    expect(readScenarios(ok).map(item => item.group)).toEqual(["g1", "g2"]);
    expect(() => readScenarios("group,title,description\ng1,Rò nước,Vòi bếp rỉ liên tục từ tối qua")).toThrow(/g2/);
    expect(() => readScenarios("group,title,description\ng3,Rò nước,Vòi bếp rỉ liên tục từ tối qua")).toThrow(/Row 2/);
    expect(() => readScenarios("group,title,description\ng1,Rò nước,ngắn\ng2,Ổ cắm,Ổ cắm có mùi khét")).toThrow(/Row 2: description/);
    expect(() => readScenarios("title,description\nA,B")).toThrow(/columns/);
  });

  it("counterbalances condition and group order across participants", () => {
    expect(participantPlan(4)).toEqual([
      { code: "p01", firstCondition: "manual", firstGroup: "g1" },
      { code: "p02", firstCondition: "assisted", firstGroup: "g1" },
      { code: "p03", firstCondition: "manual", firstGroup: "g2" },
      { code: "p04", firstCondition: "assisted", firstGroup: "g2" }
    ]);
    const plan = participantPlan(8);
    expect(plan.filter(item => item.firstCondition === "manual")).toHaveLength(4);
    expect(plan.filter(item => item.firstGroup === "g1")).toHaveLength(4);
    expect(() => participantPlan(0)).toThrow();
    expect(() => participantPlan(100)).toThrow();
  });

  it("builds case codes that the case search and maintenance code rules accept", () => {
    expect(pilotCaseCode("p03", "g2", 7)).toBe("PL-P03-G2-07");
    expect(pilotCaseCode("p03", "g2", 7)).toMatch(/^[A-Z\d-]{1,64}$/);
  });
});
