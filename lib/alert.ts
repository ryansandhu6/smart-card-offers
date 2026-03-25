// lib/alert.ts
// Sends an alert email via Resend when scrapers fail or data looks wrong.
// Requires RESEND_API_KEY. Recipient defaults to ALERT_EMAIL env var,
// falls back to hello@smartcardoffers.ca.

import { Resend } from 'resend'

export async function sendAlert(subject: string, details: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.error(`[alert] No RESEND_API_KEY — skipping alert: ${subject}`)
    return
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  const to = process.env.ALERT_EMAIL ?? 'hello@smartcardoffers.ca'
  try {
    await resend.emails.send({
      from: 'Smart Card Offers Alerts <hello@smartcardoffers.ca>',
      to,
      subject: `[Smart Card Offers Alert] ${subject}`,
      html: `<pre style="font-family:monospace;white-space:pre-wrap;font-size:13px">${details}</pre>`,
    })
    console.log(`[alert] Sent alert: ${subject}`)
  } catch (err) {
    console.error(`[alert] Failed to send alert email "${subject}":`, err)
  }
}
