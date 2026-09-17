import { getStoredLocale } from "../../i18n";

export function formatDate(value: string | Date, includeTime = true) {
  return new Intl.DateTimeFormat(getStoredLocale() === "en" ? "en-GB" : "vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(new Date(value));
}

export function formatFullDate(value: Date = new Date()) {
  return new Intl.DateTimeFormat(getStoredLocale() === "en" ? "en-GB" : "vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(value);
}

export function formatRelative(value: string | Date) {
  const diffMinutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat(getStoredLocale(), { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, "hour");
  return formatter.format(Math.round(diffHours / 24), "day");
}
