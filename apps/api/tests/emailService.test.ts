import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config.js", () => ({ config: {} }));
import { emailPasswordReset } from "../src/services/emailService.js";

describe("password reset email", () => {
  it("rejects unsafe or invalid URLs in both email formats", () => {
    for (const url of ["javascript:alert(1)", "not-a-url"]) {
      const email = emailPasswordReset("Student", url);
      expect(email.html).toContain('href="#"');
      expect(email.text).not.toContain(url);
    }
  });
  it("preserves raw query parameters in text and escapes HTML separately", () => {
    const url = "https://example.com/reset?organization=university&token=abc123";
    const email = emailPasswordReset("A & B", url);
    expect(email.text).toContain(url);
    expect(email.text).toContain("A & B");
    expect(email.text).not.toContain("&amp;");
    expect(email.html).toContain("organization=university&amp;token=abc123");
    expect(email.html).toContain("A &amp; B");
  });
});
