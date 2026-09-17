import { describe, expect, it } from "vitest";
import { fallbackClassify } from "./aiClient.js";

describe("fallbackClassify", () => {
  it("routes login problems to IT access", () => {
    const result = fallbackClassify("Em không đăng nhập được tài khoản sinh viên và quên mật khẩu");
    expect(result.label).toBe("it_access");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("routes transcript problems to academic records", () => {
    const result = fallbackClassify("Em cần xin bảng điểm và kiểm tra điểm học phần");
    expect(result.label).toBe("academic_records");
  });
});
