export interface WorkingHoursCalendar {
  timezone?: "Asia/Ho_Chi_Minh";
  holidays?: string[];
}

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1_000;
const WORKING_WINDOWS = [
  [8 * 60, 12 * 60],
  [13 * 60, 17 * 60]
] as const;
const DEFAULT_CALENDAR: WorkingHoursCalendar = {};
const holidaySets = new WeakMap<WorkingHoursCalendar, ReadonlySet<string>>();

function localDate(value: Date) {
  return new Date(value.getTime() + VIETNAM_OFFSET_MS);
}

function fromLocalParts(year: number, month: number, day: number, minute = 0) {
  return new Date(Date.UTC(year, month, day, 0, minute) - VIETNAM_OFFSET_MS);
}

function dateKey(local: Date) {
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

function holidaySet(calendar: WorkingHoursCalendar) {
  const cached = holidaySets.get(calendar);
  if (cached) return cached;
  const holidays = new Set(calendar.holidays || []);
  holidaySets.set(calendar, holidays);
  return holidays;
}

function isWorkingDay(local: Date, calendar: WorkingHoursCalendar) {
  const day = local.getUTCDay();
  return day !== 0 && day !== 6 && !holidaySet(calendar).has(dateKey(local));
}

function nextWorkingMoment(value: Date, calendar: WorkingHoursCalendar) {
  let local = localDate(value);
  while (true) {
    if (!isWorkingDay(local, calendar)) {
      local = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1));
      continue;
    }
    const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    for (const [start, end] of WORKING_WINDOWS) {
      if (minute < start) return fromLocalParts(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), start);
      if (minute < end) return value;
    }
    local = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1));
  }
}

export function addBusinessHours(start: Date, hours: number, calendar: WorkingHoursCalendar = DEFAULT_CALENDAR) {
  let remainingMs = Math.max(0, hours * 3_600_000);
  let cursor = nextWorkingMoment(start, calendar);
  while (remainingMs > 0) {
    const local = localDate(cursor);
    const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    const window = WORKING_WINDOWS.find(([windowStart, windowEnd]) => minute >= windowStart && minute < windowEnd);
    if (!window) {
      cursor = nextWorkingMoment(new Date(cursor.getTime() + 60_000), calendar);
      continue;
    }
    const [, windowEnd] = window;
    const windowEndAt = fromLocalParts(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), windowEnd);
    const consumed = Math.min(windowEndAt.getTime() - cursor.getTime(), remainingMs);
    cursor = new Date(cursor.getTime() + consumed);
    remainingMs -= consumed;
    if (remainingMs > 0) cursor = nextWorkingMoment(new Date(cursor.getTime() + 1), calendar);
  }
  return cursor;
}

export function businessHoursBetween(start: Date, end: Date, calendar: WorkingHoursCalendar = DEFAULT_CALENDAR) {
  if (end <= start) return 0;
  let cursor = nextWorkingMoment(start, calendar);
  let milliseconds = 0;
  while (cursor < end) {
    const local = localDate(cursor);
    const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    const window = WORKING_WINDOWS.find(([windowStart, windowEnd]) => minute >= windowStart && minute < windowEnd);
    if (!window) {
      cursor = nextWorkingMoment(new Date(cursor.getTime() + 60_000), calendar);
      continue;
    }
    const [, windowEnd] = window;
    const windowEndAt = fromLocalParts(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), windowEnd);
    const segmentEnd = windowEndAt < end ? windowEndAt : end;
    milliseconds += Math.max(0, segmentEnd.getTime() - cursor.getTime());
    cursor = segmentEnd < end ? nextWorkingMoment(new Date(segmentEnd.getTime() + 1), calendar) : end;
  }
  return milliseconds / 3_600_000;
}

export function organizationCalendar(settings?: { holidayDates?: string[] }) {
  return { holidays: settings?.holidayDates || [] } satisfies WorkingHoursCalendar;
}
