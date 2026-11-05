import { api } from './api';
import { reminderPermission, scheduleReminders, type Reminder } from './platform';
import type { User } from './types';

/**
 * Rebuilds local deadline / next-action reminders from the student's real
 * tracker and saved items. Called after sign-in and whenever applications
 * change. Respects notification preferences and OS permission.
 */
export async function syncReminders(user: User) {
  if (!user.notificationPrefs?.deadlineReminders) return scheduleReminders([]);
  if ((await reminderPermission()) !== 'granted') return;
  const items = await api.deadlines();
  const daysBefore = user.notificationPrefs.reminderDaysBefore ?? 3;
  const reminders: Reminder[] = [];
  let id = 1;
  for (const d of items) {
    const due = new Date(d.date);
    if (d.kind === 'next_action') {
      // Morning of the due day, 9:00 IST.
      const at = new Date(due);
      at.setUTCHours(3, 30, 0, 0);
      reminders.push({ id: id++, title: `Due today: ${d.title}`, body: d.organization ?? 'Your next action', at });
    } else {
      const at = new Date(due.getTime() - daysBefore * 86400000);
      at.setUTCHours(3, 30, 0, 0);
      reminders.push({ id: id++, title: `${d.title} closes ${daysBefore === 0 ? 'today' : `in ${daysBefore} day${daysBefore === 1 ? '' : 's'}`}`, body: d.organization ?? 'Check the official source and finish your application.', at });
    }
  }
  await scheduleReminders(reminders);
}
