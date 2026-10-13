import { describe, expect, it } from "vitest";
import { expandKnowledgeQuery, knowledgeTerms, normalizedKnowledgeText } from "../src/services/knowledgeQuery.js";

describe("knowledge query preprocessing", () => {
  it("expands abbreviations without destroying Vietnamese characters", () => {
    expect(expandKnowledgeQuery("SV quên MK ở KTX")).toBe("sinh viên quên mật khẩu ở ký túc xá");
    expect(knowledgeTerms("Em cần xin hướng dẫn đổi mật khẩu")).toContain("mật");
    expect(knowledgeTerms("Em cần xin hướng dẫn đổi mật khẩu")).not.toContain("cần");
  });
  it("supports unaccented comparison and removes repeated terms", () => {
    expect(normalizedKnowledgeText("Đăng nhập")).toBe("dang nhap");
    expect(knowledgeTerms("học phí học phí")).toEqual(["học", "phí"]);
  });
});
