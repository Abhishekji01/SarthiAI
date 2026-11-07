import { appendFile } from 'node:fs/promises';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Pluggable mailer.
 *  - RESEND_API_KEY + MAIL_FROM set: sends through Resend's HTTPS API.
 *  - Otherwise (development/test): nothing is sent; the message, including any
 *    link, is logged to the console so you can follow it locally. Messages are
 *    also kept in `outbox` (tests) and appended to MAIL_OUTBOX_FILE when set
 *    (end-to-end tests). Never used in production.
 *  - Production without a provider: nothing is sent and a warning is logged,
 *    without the message body (it may contain a one-time link).
 */
export const outbox = [];

export const mailConfigured = () => Boolean(env.RESEND_API_KEY && env.MAIL_FROM);

async function sendWithResend(msg) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
}

/** Sends one email. Resolves to { delivered, transport }; never throws. */
export async function sendMail(msg) {
  if (mailConfigured()) {
    try {
      await sendWithResend(msg);
      return { delivered: true, transport: 'resend' };
    } catch (err) {
      logger.error('Email could not be sent', { error: err, kind: msg.kind });
      return { delivered: false, transport: 'resend' };
    }
  }
  if (env.NODE_ENV === 'production') {
    logger.warn('Email not sent: no email provider configured (set RESEND_API_KEY and MAIL_FROM)', { kind: msg.kind });
    return { delivered: false, transport: 'none' };
  }
  outbox.push({ ...msg, at: new Date() });
  if (outbox.length > 200) outbox.shift();
  // Development only: print the message so links can be opened locally.
  if (env.NODE_ENV !== 'test') process.stdout.write(`\n[mail:${msg.kind}] To: ${msg.to}\nSubject: ${msg.subject}\n${msg.text}\n\n`);
  if (env.MAIL_OUTBOX_FILE) await appendFile(env.MAIL_OUTBOX_FILE, `${JSON.stringify({ to: msg.to, kind: msg.kind, subject: msg.subject, text: msg.text })}\n`).catch(() => {});
  return { delivered: false, transport: 'console' };
}

/** Escapes text for the HTML part of an email. */
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Public base URL for links in emails. Taken from configuration, never from the
 * request's Host header (which an attacker controls).
 */
export function appUrl() {
  return (env.APP_URL ?? env.RENDER_EXTERNAL_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, '');
}

/** A minimal, safe email body: escaped paragraphs plus one button link. */
export function simpleEmail({ greetingName, paragraphs, action }) {
  const hi = `Hi ${greetingName || 'there'},`;
  const text = [hi, '', ...paragraphs.flatMap((p) => [p, '']), ...(action ? [`${action.label}: ${action.url}`, ''] : []), '— SarthiAI'].join('\n');
  const html = `<div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5;color:#171B1F">
<p>${escapeHtml(hi)}</p>${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}${action ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#133B39;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p><p style="font-size:13px;color:#5A616B">Or open this link: ${escapeHtml(action.url)}</p>` : ''}<p>— SarthiAI</p></div>`;
  return { text, html };
}
