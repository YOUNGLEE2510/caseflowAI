import { Languages } from "lucide-react";
import { useLocale, type Locale } from "../i18n";

const options: Array<{ value: Locale; label: string }> = [
  { value: "vi", label: "VI" },
  { value: "en", label: "EN" }
];

export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, text } = useLocale();

  return (
    <div className={`locale-switcher ${compact ? "locale-switcher-compact" : ""}`} aria-label={text("Ngôn ngữ", "Language")}>
      {!compact ? <Languages size={15} aria-hidden="true" /> : null}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={locale === option.value ? "active" : ""}
          onClick={() => setLocale(option.value)}
          aria-pressed={locale === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
