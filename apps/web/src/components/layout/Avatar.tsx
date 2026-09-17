export function Avatar({
  name,
  color = "#155c4d",
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
