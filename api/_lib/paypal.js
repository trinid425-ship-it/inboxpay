// Thin PayPal REST client: OAuth token + the Invoicing v2 calls InboxPay uses.
// Runs only on the server (Vercel functions / the dev middleware), so the
// client secret never reaches the browser.

const BASE = () => (process.env.PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com')

let cached = { token: null, exp: 0 }

export function paypalConfigured() {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
}

async function token() {
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')
  const r = await fetch(`${BASE()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`PayPal sign-in failed: ${j.error_description || r.status}`)
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000, scope: j.scope || '' }
  return cached.token
}

// For /api/health: does the current token include the Invoicing permission?
export async function paypalCanInvoice() {
  cached = { token: null, exp: 0 }
  await token()
  const scopes = String(cached.scope || '').split(/\s+/).filter(Boolean)
    .map((x) => x.replace(/^https:\/\/uri\.paypal\.com\/services\//, '').replace(/^https?:\/\//, ''))
  return { invoicing: scopes.some((x) => /invoic/i.test(x)), scopes }
}

export async function pp(path, { method = 'GET', body } = {}, retried = false) {
  const r = await fetch(`${BASE()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let j = null
  try { j = text ? JSON.parse(text) : null } catch { j = { raw: text } }
  // A token issued before a feature (e.g. Invoicing) was switched on in the
  // PayPal dashboard keeps the old permissions. On 401/403, get a fresh token
  // and try once more.
  if ((r.status === 401 || r.status === 403) && !retried) {
    cached = { token: null, exp: 0 }
    return pp(path, { method, body }, true)
  }
  if (!r.ok) {
    const detail = j?.details?.map((d) => `${d.field || ''} ${d.description || d.issue || ''}`.trim()).join('; ')
    throw new Error(`PayPal ${method} ${path} failed (${r.status}): ${j?.message || ''}${detail ? ' — ' + detail : ''}`)
  }
  return j
}

const money = (currency, n) => ({ currency_code: currency, value: (Math.round(Number(n) * 100) / 100).toFixed(2) })

// Build the Invoicing v2 body from a reviewed quote.
export function invoiceBody({ business, quote }) {
  const cur = business.currency || 'USD'
  const total = quote.items.reduce((a, it) => a + Number(it.unit_price) * Number(it.quantity), 0)
  const deposit = Math.round(total * (Number(quote.deposit_pct ?? business.deposit_pct ?? 50) / 100) * 100) / 100
  const [given, ...rest] = String(quote.customer?.name || 'Guest').trim().split(/\s+/)
  const body = {
    detail: {
      currency_code: cur,
      note: quote.invoice_note || `Thank you for booking with ${business.name}!`,
      terms_and_conditions: business.terms || undefined,
      memo: `Created by InboxPay from a customer email${quote.date ? ` · service date ${quote.date}` : ''}`,
      payment_term: quote.due_date
        ? { term_type: 'DUE_ON_DATE_SPECIFIED', due_date: quote.due_date }
        : { term_type: 'DUE_ON_RECEIPT' },
    },
    invoicer: {
      business_name: business.name,
      website: business.website || undefined,
      ...(business.paypal_email ? { email_address: business.paypal_email } : {}),
    },
    primary_recipients: quote.customer?.email ? [{
      billing_info: {
        name: { given_name: given || 'Guest', surname: rest.join(' ') || undefined },
        email_address: quote.customer.email,
      },
    }] : [],
    items: quote.items.map((it) => ({
      name: String(it.name).slice(0, 200),
      description: [it.note, quote.date && `Date: ${quote.date}`].filter(Boolean).join(' · ').slice(0, 1000) || undefined,
      quantity: String(it.quantity),
      unit_amount: money(cur, it.unit_price),
      unit_of_measure: 'QUANTITY',
    })),
    configuration: {
      allow_tip: false,
      tax_calculated_after_discount: true,
      tax_inclusive: false,
      ...(deposit > 0 && deposit < total ? {
        partial_payment: { allow_partial_payment: true, minimum_amount_due: money(cur, deposit) },
      } : {}),
    },
  }
  return { body, total, deposit }
}

// The link the customer opens to pay. PayPal returns it on send ("payer-view")
// and in detail.metadata.recipient_view_url on the invoice itself.
export function payerLink(...objs) {
  for (const o of objs) {
    const l = o?.links?.find?.((x) => x.rel === 'payer-view')?.href
    if (l) return l
    if (o?.href && /invoice\/p\//.test(o.href)) return o.href
    const m = o?.detail?.metadata?.recipient_view_url
    if (m) return m
  }
  return null
}

export function summarize(inv) {
  const d = inv.detail || {}
  return {
    id: inv.id,
    number: d.invoice_number,
    status: inv.status,
    created: d.metadata?.create_time || d.invoice_date,
    customer: inv.primary_recipients?.[0]?.billing_info?.name?.full_name
      || [inv.primary_recipients?.[0]?.billing_info?.name?.given_name, inv.primary_recipients?.[0]?.billing_info?.name?.surname].filter(Boolean).join(' ')
      || inv.primary_recipients?.[0]?.billing_info?.email_address || '—',
    email: inv.primary_recipients?.[0]?.billing_info?.email_address || null,
    total: inv.amount?.value ?? null,
    currency: inv.amount?.currency_code || d.currency_code,
    paid: inv.payments?.paid_amount?.value ?? '0.00',
    due: inv.due_amount?.value ?? null,
    payer_link: payerLink(inv),
    memo: d.memo || '',
  }
}
