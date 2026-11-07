/**
 * Calendar-day difference in India Standard Time, so "closes in N days"
 * matches what students see on a calendar (and in the iOS app).
 */
const IST_OFFSET_MS = 5.5 * 3600000;
const DAY = 86400000;
const istDayNumber = (d) => Math.floor((new Date(d).getTime() + IST_OFFSET_MS) / DAY);

export function calendarDaysUntil(date, now = new Date()) {
  return istDayNumber(date) - istDayNumber(now);
}

export const DEADLINE_WINDOWS = ['this_week', 'this_month', 'next_7_days', 'next_30_days'];

/**
 * End of a deadline window as an instant, using India's calendar:
 * this_week ends Sunday 23:59:59 IST, this_month at the month's last second IST.
 */
export function deadlineWindowEnd(window, now = new Date()) {
  const ist = new Date(new Date(now).getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  const endOfIstDay = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd + 1) - IST_OFFSET_MS - 1);
  switch (window) {
    case 'this_week': return endOfIstDay(y, m, d + ((7 - ist.getUTCDay()) % 7));
    case 'this_month': return endOfIstDay(y, m + 1, 0);
    case 'next_7_days': return endOfIstDay(y, m, d + 7);
    case 'next_30_days': return endOfIstDay(y, m, d + 30);
    default: return null;
  }
}
