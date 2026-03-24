// lib/notify.ts
// Resend email helpers for newsletters, offer alerts, welcome emails

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'Smart Card Offers <hello@smartcardoffers.ca>'

// -----------------------------------------------
// Welcome email when someone subscribes
// -----------------------------------------------
export async function sendWelcomeEmail(email: string, firstName?: string) {
  return resend.emails.send({
    from: FROM,
    to: email,
    subject: "Welcome to Smart Card Offers 🇨🇦",
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e;">
        <h1 style="color: #1a1a2e;">Welcome${firstName ? `, ${firstName}` : ''}! 🎉</h1>
        <p>You're now part of Canada's smartest credit card community.</p>
        <p>Here's what you'll get:</p>
        <ul>
          <li>🔥 <strong>Best welcome bonuses</strong> — we track them so you don't have to</li>
          <li>⏰ <strong>Limited-time alerts</strong> — know before offers expire</li>
          <li>✈️ <strong>Points transfer guides</strong> — maximize your redemptions</li>
          <li>📊 <strong>Mortgage rate updates</strong> — when rates drop, you'll know</li>
        </ul>
        <a href="https://smartcardoffers.ca/best-offers" 
           style="display:inline-block; background:#f4a818; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:bold; margin-top:16px;">
          See Today's Best Offers →
        </a>
        <p style="margin-top:32px; font-size:12px; color:#666;">
          You subscribed at smartcardoffers.ca. 
          <a href="https://smartcardoffers.ca/unsubscribe?email=${encodeURIComponent(email)}">Unsubscribe</a>
        </p>
      </body>
      </html>
    `,
  })
}

// -----------------------------------------------
// Weekly digest email
// -----------------------------------------------
export async function sendWeeklyDigest(
  subscribers: { email: string; first_name?: string }[],
  offers: {
    card_name: string
    headline: string
    expires_at?: string
    apply_url?: string
    is_limited_time?: boolean
  }[]
) {
  const offerCards = offers
    .slice(0, 5)
    .map(
      (o) => `
      <div style="border:1px solid #eee; border-radius:8px; padding:16px; margin-bottom:12px;">
        ${o.is_limited_time ? '<span style="background:#ff4444; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold;">LIMITED TIME</span>' : ''}
        <h3 style="margin:8px 0 4px;">${o.card_name}</h3>
        <p style="margin:0; color:#444;">${o.headline}</p>
        ${o.expires_at ? `<p style="margin:4px 0 8px; font-size:12px; color:#e44;">Expires: ${o.expires_at}</p>` : ''}
        ${o.apply_url ? `<a href="${o.apply_url}" style="color:#1a1a2e; font-weight:bold;">Apply Now →</a>` : ''}
      </div>
    `
    )
    .join('')

  // Batch send using Resend batch API
  const batch = subscribers.map((sub) => ({
    from: FROM,
    to: sub.email,
    subject: `This Week's Best Credit Card Offers in Canada 🔥`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e;">
        <h1>This Week's Best Offers${sub.first_name ? `, ${sub.first_name}` : ''}</h1>
        ${offerCards}
        <a href="https://smartcardoffers.ca/best-offers" 
           style="display:inline-block; background:#f4a818; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:bold; margin-top:8px;">
          See All Offers →
        </a>
        <p style="margin-top:32px; font-size:12px; color:#666;">
          <a href="https://smartcardoffers.ca/unsubscribe?email=${encodeURIComponent(sub.email)}">Unsubscribe</a>
        </p>
      </body>
      </html>
    `,
  }))

  // Send in batches of 100 (Resend limit)
  const BATCH_SIZE = 100
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    await resend.batch.send(batch.slice(i, i + BATCH_SIZE))
    if (i + BATCH_SIZE < batch.length) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

// -----------------------------------------------
// Limited-time offer alert
// -----------------------------------------------
export async function sendOfferAlert(
  subscribers: { email: string }[],
  offer: {
    card_name: string
    headline: string
    expires_at?: string
    apply_url?: string
    issuer?: string
  }
) {
  const batch = subscribers.map((sub) => ({
    from: FROM,
    to: sub.email,
    subject: `⚡ Limited-Time: ${offer.headline}`,
    html: `
      <body style="font-family:sans-serif; max-width:600px; margin:0 auto; padding:20px;">
        <div style="background:#fff3cd; border:1px solid #ffc107; border-radius:8px; padding:16px; margin-bottom:20px;">
          <strong>⚡ Limited-Time Offer Alert</strong>
          ${offer.expires_at ? `— Expires ${offer.expires_at}` : ''}
        </div>
        <h2>${offer.card_name}</h2>
        <p style="font-size:18px;">${offer.headline}</p>
        ${offer.apply_url ? `
          <a href="${offer.apply_url}" 
             style="display:inline-block; background:#f4a818; color:#fff; padding:14px 28px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:16px;">
            Apply Now →
          </a>
        ` : ''}
      </body>
    `,
  }))

  for (let i = 0; i < batch.length; i += 100) {
    await resend.batch.send(batch.slice(i, i + 100))
  }
}
