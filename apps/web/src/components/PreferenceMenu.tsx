import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface PreferenceOption<T extends string> { value: T; label: string; icon?: ReactNode }

/**
 * A button that opens a small list of choices below it (language, theme…).
 * Keyboard: Enter/Space/ArrowDown open, arrows move, Enter selects, Escape or Tab closes.
 */
export function PreferenceMenu<T extends string>({ label, value, options, onChange, buttonContent, compact = false, className = "" }: {
  label: string; value: T; options: PreferenceOption<T>[]; onChange: (value: T) => void;
  buttonContent: ReactNode; compact?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const current = options.find(option => option.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => { if (open) itemRefs.current[active]?.focus(); }, [open, active]);

  function openMenu() {
    setActive(Math.max(0, options.findIndex(option => option.value === value)));
    setOpen(true);
  }
  function choose(next: T) {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  }
  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); buttonRef.current?.focus(); }
    else if (event.key === "Tab") setOpen(false);
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive(index => (index + 1) % options.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => (index - 1 + options.length) % options.length); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(options.length - 1); }
  }

  return (
    <div className={`preference-menu ${compact ? "preference-menu-compact" : ""} ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="preference-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${label}: ${current?.label || value}`}
        title={`${label}: ${current?.label || value}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={event => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); openMenu(); } }}
      >
        {buttonContent}
        {!compact ? <ChevronDown size={14} aria-hidden="true" className="preference-menu-chevron" /> : null}
      </button>
      {open ? (
        <div className="preference-menu-list" role="menu" id={menuId} aria-label={label} onKeyDown={onMenuKey}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={node => { itemRefs.current[index] = node; }}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              tabIndex={index === active ? 0 : -1}
              className={option.value === value ? "selected" : ""}
              onClick={() => choose(option.value)}
            >
              {option.icon ? <span className="preference-menu-icon" aria-hidden="true">{option.icon}</span> : null}
              <span>{option.label}</span>
              {option.value === value ? <Check size={15} aria-hidden="true" className="preference-menu-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
