import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearch } from "./search";

describe("Vietnamese document and member search", () => {
  it("matches case-insensitive unaccented words", () => {
    expect(matchesSearch("Quy trình khôi phục mật khẩu", "MAT KHAU")).toBe(true);
    expect(normalizeSearch("Đăng ký học phần")).toBe("dang ky hoc phan");
  });
  it("expands supported abbreviations and ignores question filler", () => {
    expect(matchesSearch("Sinh viên quên mật khẩu", "em cần đổi mk")).toBe(false);
    expect(matchesSearch("Hỗ trợ sinh viên khôi phục mật khẩu", "SV mk")).toBe(true);
    expect(matchesSearch("Học phí và miễn giảm", "hp")).toBe(true);
    expect(matchesSearch("Quy trình ký túc xá", "ktx")).toBe(true);
  });
  it("keeps unrelated documents out and accepts empty filters", () => {
    expect(matchesSearch("Học phí", "wifi")).toBe(false);
    expect(matchesSearch("Học phí", "")).toBe(true);
  });
});
