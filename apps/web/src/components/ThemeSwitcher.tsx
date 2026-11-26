import { Monitor, Moon, Sun } from "lucide-react";
import { useLocale } from "../i18n";
import { useTheme, type ThemePreference } from "../theme";
import { PreferenceMenu } from "./PreferenceMenu";

/** Theme picker: a button that opens a short list (system / light / dark). */
export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  const { text } = useLocale();
  const Icon = preference === "dark" ? Moon : preference === "light" ? Sun : Monitor;
  return (
    <PreferenceMenu<ThemePreference>
      className="theme-menu"
      compact
      label={text("Giao diện", "Theme")}
      value={preference}
      onChange={setPreference}
      options={[
        { value: "system", label: text("Theo hệ thống", "System"), icon: <Monitor size={16} /> },
        { value: "light", label: text("Sáng", "Light"), icon: <Sun size={16} /> },
        { value: "dark", label: text("Tối", "Dark"), icon: <Moon size={16} /> }
      ]}
      buttonContent={<Icon size={18} aria-hidden="true" />}
    />
  );
}
