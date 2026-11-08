import { sendMail, mailConfigured } from '../mail/mailer.js';
import { canEmail } from '../auth/emailVerification.js';
import { Notification } from '../models/Notification.js';

/**
 * Delivery channels. Email is implemented (Resend, via the mailer). WhatsApp is
 * a hook for later: implement send() with a provider (e.g. the WhatsApp Business
 * Cloud API), gate it behind env credentials and a FEATURE_ flag, and let
 * students opt in with a verified phone number. Until then it reports
 * "not configured" and nothing is sent.
 */
export const CHANNELS = {
  email: {
    available: (user) => canEmail(user),
    send: (user, msg) => sendMail({ ...msg, to: user.email }),
  },
  whatsapp: {
    available: () => false,
    send: async () => ({ delivered: false, transport: 'not_configured' }),
  },
};

/**
 * Sends a message at most once per (user, key, channel). The record is written
 * before sending, so two job runs at once can't both send it.
 */
export async function sendOnce(user, key, msg, channel = 'email') {
  const ch = CHANNELS[channel];
  if (!ch?.available(user)) return { sent: false, reason: 'channel_unavailable' };
  try {
    await Notification.create({ userId: user._id, key, channel });
  } catch (err) {
    if (err?.code === 11000) return { sent: false, reason: 'already_sent' };
    throw err;
  }
  const r = await ch.send(user, msg);
  await Notification.updateOne({ userId: user._id, key, channel }, { $set: { delivered: Boolean(r.delivered) } });
  return { sent: true, delivered: Boolean(r.delivered) };
}

export const emailDelivery = () => mailConfigured();
