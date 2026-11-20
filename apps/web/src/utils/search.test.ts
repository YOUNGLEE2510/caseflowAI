import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearch } from "./search";

describe("Vietnamese document and member search", () => {
  it("matches case-insensitive unaccented words", () => {
    expect(matchesSearch("Quy trình khôi phục mật khẩu", "MAT KHAU")).toBe(true);
    expect(normalizeSearch("Đăng ký gửi xe")).toBe("dang ky gui xe");
  });
  it("expands supported abbreviations and ignores question filler", () => {
    expect(matchesSearch("Người thuê quên mật khẩu", "em cần đổi mk")).toBe(false);
    expect(matchesSearch("Báo điều hòa chảy nước", "dh")).toBe(true);
    expect(matchesSearch("Liên hệ ban quản lý tòa nhà", "bql")).toBe(true);
    expect(matchesSearch("Kẹt thang máy", "tm")).toBe(true);
  });
  it("keeps unrelated documents out and accepts empty filters", () => {
    expect(matchesSearch("Phí gửi xe", "wifi")).toBe(false);
    expect(matchesSearch("Phí gửi xe", "")).toBe(true);
  });
});
