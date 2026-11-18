import { Monitor, Moon, Sun } from "lucide-react";
import { useLocale } from "../i18n";
import { useTheme, type ThemePreference } from "../theme";

const order: ThemePreference[] = ["system", "light", "dark"];

/** One button that cycles system → light → dark; the label names the current mode and the next one. */
export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  const { text } = useLocale();
  const labels: Record<ThemePreference, string> = {
    system: text("Theo hệ thống", "System"),
    light: text("Sáng", "Light"),
    dark: text("Tối", "Dark")
  };
  const next = order[(order.indexOf(preference) + 1) % order.length];
  const Icon = preference === "dark" ? Moon : preference === "light" ? Sun : Monitor;
  const label = text(`Giao diện: ${labels[preference]}. Chuyển sang ${labels[next].toLowerCase()}`, `Theme: ${labels[preference]}. Switch to ${labels[next].toLowerCase()}`);
  return (
    <button type="button" className="icon-button theme-switcher" onClick={() => setPreference(next)} aria-label={label} title={label}>
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
