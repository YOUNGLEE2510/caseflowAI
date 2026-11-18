export function Avatar({
  name,
  color = "var(--brand-solid)",
  size = "medium"
}: {
  name: string;
  color?: string;
  size?: "small" | "medium" | "large";
}) {
  const initials = name
    .split(" ")
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <span className={`avatar avatar-${size}`} style={{ backgroundColor: color }} aria-label={name}>
      {initials}
    </span>
  );
}
