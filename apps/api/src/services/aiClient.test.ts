import { describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: {
    AI_FALLBACK_KEYWORDS: undefined,
    AI_SERVICE_URL: "http://127.0.0.1:8001",
    AI_REQUEST_TIMEOUT_MS: 10000,
    AI_INTERNAL_TOKEN: ""
  }
}));

import { fallbackClassify } from "./aiClient.js";

describe("fallbackClassify", () => {
  it("routes water problems to plumbing", () => {
    const result = fallbackClassify("Nước yếu ở tất cả vòi và ống nước dưới bồn rửa bị rò");
    expect(result.label).toBe("water");
    expect(result.confidence).toBeLessThan(0.55);
    expect(result.provider).toBe("fallback");
  });

  it("routes appliance problems to appliances", () => {
    const result = fallbackClassify("Điều hòa và máy giặt trong căn đều không chạy");
    expect(result.label).toBe("appliances");
  });
});
