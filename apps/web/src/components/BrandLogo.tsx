import { useId } from "react";

/**
 * CaseFlow mark: a home outline (the apartment) holding a check (the resolved request),
 * on a deep-green tile. Drawn inline so it stays crisp at any size and in both themes.
 */
export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`logo-mark ${className}`.trim()} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-tile`} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#23a07f" />
          <stop offset="1" stopColor="#0c4439" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill={`url(#${id}-tile)`} />
      <path d="M10 18.6 20 10.2l10 8.4" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 16.6v10.6a2.4 2.4 0 0 0 2.4 2.4h9.2a2.4 2.4 0 0 0 2.4-2.4V16.6" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m16.2 22.4 2.7 2.7 5-5.2" fill="none" stroke="#9ff0cf" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark plus wordmark. `tone="inverse"` is for dark or photographic backgrounds. */
export function BrandLogo({ tagline, tone = "default", size = 36 }: { tagline?: string; tone?: "default" | "inverse"; size?: number }) {
  return (
    <span className={`brand-logo brand-logo-${tone}`}>
      <LogoMark size={size} />
      <span className="brand-logo-text">
        <strong>Case<span>Flow</span></strong>
        {tagline ? <small>{tagline}</small> : null}
      </span>
    </span>
  );
}
