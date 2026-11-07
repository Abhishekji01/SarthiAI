/**
 * Calendar files for deadlines (RFC 5545). An all-day event on the deadline
 * date in India, with reminders 3 days and 1 day before.
 */
const IST = 5.5 * 3600000;
const ymd = (d) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10).replace(/-/g, '');
const nextDay = (d) => ymd(new Date(new Date(d).getTime() + 86400000));
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds lines longer than 75 octets, as the spec requires. */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (parts.length ? 74 : 75), bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1; // don't split a UTF-8 character
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return parts.join('\r\n ');
}

export function deadlineIcs(o, { url, now = new Date() } = {}) {
  if (!o.deadline) return null;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SarthiAI//Deadlines//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:deadline-${o._id ?? o.id}@sarthiai`,
    `DTSTAMP:${new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${ymd(o.deadline)}`,
    `DTEND;VALUE=DATE:${nextDay(o.deadline)}`,
    `SUMMARY:${esc(`Deadline: ${o.title}`)}`,
    `DESCRIPTION:${esc(`${o.organization}\nOfficial source: ${o.sourceUrl}${url ? `\nOn SarthiAI: ${url}` : ''}\nConfirm the date on the official source.`)}`,
    ...(url ? [`URL:${url}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${o.title} closes in 3 days`)}`, 'TRIGGER:-P3D', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${o.title} closes tomorrow`)}`, 'TRIGGER:-P1D', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** "Add to Google Calendar" link for the same all-day event. */
export function googleCalendarUrl(o, { url } = {}) {
  if (!o.deadline) return null;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Deadline: ${o.title}`,
    dates: `${ymd(o.deadline)}/${nextDay(o.deadline)}`,
    details: `${o.organization}\nOfficial source: ${o.sourceUrl}${url ? `\nOn SarthiAI: ${url}` : ''}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
