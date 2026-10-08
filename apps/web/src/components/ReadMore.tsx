import { useState } from "react";
import { useLocale } from "../i18n";

export function ReadMore({ text: content, limit = 260, className = "" }: {
  text: string;
  limit?: number;
  className?: string;
}) {
  const { text } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > limit;
  const visible = expanded || !isLong ? content : `${content.slice(0, limit).trimEnd()}...`;

  return (
    <div className={`read-more ${className}`.trim()}>
      {visible}
      {isLong ? (
        <button type="button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? text("Thu gọn", "Show less") : text("Xem thêm", "Read more")}
        </button>
      ) : null}
    </div>
  );
}
