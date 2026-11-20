import { Languages } from "lucide-react";
import { useLocale, type Locale } from "../i18n";
import { PreferenceMenu } from "./PreferenceMenu";

/** Language picker: a button that opens a short list (Tiếng Việt / English). */
export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, text } = useLocale();
  return (
    <PreferenceMenu<Locale>
      className="locale-menu"
      compact={compact}
      label={text("Ngôn ngữ", "Language")}
      value={locale}
      onChange={setLocale}
      options={[{ value: "vi", label: "Tiếng Việt" }, { value: "en", label: "English" }]}
      buttonContent={<><Languages size={16} aria-hidden="true" /><span className="preference-menu-value">{locale.toUpperCase()}</span></>}
    />
  );
}
