import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * One API for browser and Android. On Android, Capacitor plugins are used
 * (native storage, Custom Tabs, share sheet, haptics, local notifications);
 * in the browser the equivalent web APIs are used.
 */
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'android' | 'web'

export const storage = {
  async get(key: string): Promise<string | null> {
    if (isNative) return (await Preferences.get({ key })).value;
    try { return localStorage.getItem(key); } catch { return null; }
  },
  async set(key: string, value: string | null): Promise<void> {
    if (isNative) {
      if (value == null) await Preferences.remove({ key });
      else await Preferences.set({ key, value });
      return;
    }
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* private mode: session-only */ }
  },
};

/** Opens an official source. Never changes application status. */
export async function openExternal(url: string) {
  if (isNative) await Browser.open({ url });
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export async function shareText(title: string, text: string) {
  if (isNative) {
    await Share.share({ title, text });
    return 'shared';
  }
  if (navigator.share) {
    try { await navigator.share({ title, text }); return 'shared'; } catch { return 'cancelled'; }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

export function tap() {
  if (isNative) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  else if (navigator.vibrate) navigator.vibrate(8);
}

// ---- Reminders --------------------------------------------------------------

export type ReminderPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export async function reminderPermission(): Promise<ReminderPermission> {
  if (isNative) {
    const p = await LocalNotifications.checkPermissions();
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : (Notification.permission as ReminderPermission);
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (isNative) {
    const p = await LocalNotifications.requestPermissions();
    return p.display === 'granted' ? 'granted' : 'denied';
  }
  if (!('Notification' in window)) return 'unsupported';
  const r = await Notification.requestPermission();
  return r === 'default' ? 'prompt' : r;
}

export interface Reminder { id: number; title: string; body: string; at: Date }

/**
 * Schedules local reminders (Android: exact OS notifications, even when the
 * app is closed). In the browser, reminders due while the app is open are
 * shown; the Home screen always lists upcoming dates as well.
 */
export async function scheduleReminders(reminders: Reminder[]) {
  const future = reminders.filter((r) => r.at.getTime() > Date.now());
  if (isNative) {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (future.length) {
      await LocalNotifications.schedule({
        notifications: future.slice(0, 60).map((r) => ({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at, allowWhileIdle: true } })),
      });
    }
    return;
  }
  webTimers.forEach(clearTimeout);
  webTimers = [];
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  for (const r of future) {
    const ms = r.at.getTime() - Date.now();
    if (ms < 2 ** 31 - 1) webTimers.push(setTimeout(() => new Notification(r.title, { body: r.body, icon: '/icon-192.png' }), ms));
  }
}
let webTimers: ReturnType<typeof setTimeout>[] = [];
