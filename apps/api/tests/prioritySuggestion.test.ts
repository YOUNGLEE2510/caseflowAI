import { expect, it } from "vitest";
import { suggestPriority } from "../src/services/prioritySuggestion.js";

const cases: Array<[string, string, string | undefined, number | undefined]> = [
  ["Ổ cắm trong bếp có tia lửa và mùi khét", "urgent", "electrical", 0],
  ["Ngửi thấy mùi gas gần bếp từ tối qua", "urgent", "appliances", 0],
  ["Có người bị kẹt trong thang máy tòa A", "urgent", "general_support", 0],
  ["Nước tràn ra khắp sàn phòng khách", "urgent", "water", 0],
  ["Căn hộ mất điện từ 7 giờ sáng", "high", "electrical", 0],
  ["Cả tầng 3 không có nước sinh hoạt", "high", "water", 0],
  ["Nước nhỏ xuống từ trần phòng tắm", "high", "water", 0],
  ["Khóa cửa chính bị hỏng, không khóa được cửa", "high", "access_security", 0],
  ["Vòi sen chảy yếu", "normal", "water", 0],
  ["Điều hòa chạy nhưng không làm lạnh", "normal", "appliances", 0],
  ["Máy bơm đang chạy nhưng không lên nước", "normal", "water", 0],
  ["Bếp từ bị cháy, có khói trong căn hộ", "urgent", "appliances", 0],
  ["Nuoc chay rat yeu o voi bep", "normal", "water", 0],
  ["Wifi trong phòng chập chờn vào buổi tối", "normal", "internet", 0],
  ["Muốn hỏi thông tin gia hạn hợp đồng, không gấp", "low", "general_support", 0],
  ["Đề nghị bổ sung thêm chỗ để xe đạp", "low", "general_support", 0],
  ["Wifi trong phòng chập chờn vào buổi tối", "high", "internet", 3]
];

it.each(cases)("%s → %s", (text, expected, category, related) => {
  const result = suggestPriority({ text, category, relatedOpenCases: related });
  expect(result.priority).toBe(expected);
  expect(result.reasons.length).toBeGreaterThan(0);
});

it("explains a possible shared incident", () => {
  expect(suggestPriority({ text: "Wifi yếu", category: "internet", relatedOpenCases: 2 }).reasons.join(" ")).toContain("sự cố chung");
});
