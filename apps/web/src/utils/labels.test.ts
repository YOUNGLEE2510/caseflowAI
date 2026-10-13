import { describe, expect, it } from "vitest";
import { timelineLabel } from "./labels";

describe("timeline labels", () => {
  it("renders status names instead of internal keys", () => {
    expect(timelineLabel({ type: "status_changed", label: "Chuyển trạng thái từ triaged sang in_progress" }, "vi")).toBe("Đã phân loại → Đang xử lý");
    expect(timelineLabel({ type: "status_changed", label: "Chuyển trạng thái từ triaged sang in_progress" }, "en")).toBe("Triaged → In progress");
  });
  it("localizes channels and classification keys", () => {
    expect(timelineLabel({ type: "created", label: "Tiếp nhận từ kênh portal" }, "vi")).toBe("Tiếp nhận qua Cổng trực tuyến");
    expect(timelineLabel({ type: "ai_reviewed", label: "Đã xác nhận phân loại AI: it_access" }, "vi")).not.toContain("it_access");
  });
});
