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
    const err = new Error(`PayPal ${method} ${path} failed (${r.status}): ${j?.message || ''}${detail ? ' — ' + detail : ''}`)
    err.status = r.status
    throw err
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

// ---------------------------------------------------------------------------
// PayPal Checkout (Orders v2): used for the deposit when the merchant's PayPal
// account can't use Invoicing (Invoicing isn't offered in every country). The
// customer gets a PayPal pay link for exactly the deposit; when they approve,
// PayPal sends them to /api/capture, which captures the money.

export function depositOrderBody({ business, quote, origin, ref }) {
  const cur = business.currency || 'USD'
  const total = quote.items.reduce((a, it) => a + Number(it.unit_price) * Number(it.quantity), 0)
  const deposit = Math.round(total * (Number(quote.deposit_pct ?? business.deposit_pct ?? 50) / 100) * 100) / 100
  const amount = deposit > 0 ? deposit : total
  const what = quote.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')
  return {
    total, deposit: amount,
    body: {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: ref,
        custom_id: ref,
        invoice_id: ref,
        description: `${deposit > 0 && deposit < total ? 'Deposit' : 'Payment'}: ${what}${quote.date ? ` on ${quote.date}` : ''}`.slice(0, 127),
        soft_descriptor: String(business.name || 'InboxPay').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 22) || undefined,
        amount: money(cur, amount),
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: String(business.name || 'InboxPay').slice(0, 127),
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            return_url: `${origin}/api/capture`,
            cancel_url: `${origin}/?cancelled=1`,
          },
        },
      },
    },
  }
}

export function approveLink(order) {
  return order?.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href || null
}

export function summarizeOrder(o, meta = {}) {
  const pu = o.purchase_units?.[0] || {}
  const cap = pu.payments?.captures?.[0]
  const status = o.status === 'COMPLETED' ? 'PAID' : o.status === 'APPROVED' ? 'PAYMENT_PENDING' : 'SENT'
  return {
    id: o.id,
    kind: 'checkout',
    number: pu.reference_id || pu.invoice_id || o.id,
    status,
    created: o.create_time || meta.created,
    customer: meta.customer || o.payer?.name?.given_name || '—',
    email: meta.email || o.payer?.email_address || null,
    total: meta.total ?? pu.amount?.value,
    currency: pu.amount?.currency_code,
    paid: cap?.status === 'COMPLETED' ? cap.amount?.value : '0.00',
    due: meta.total != null ? (Number(meta.total) - (cap?.status === 'COMPLETED' ? Number(cap.amount?.value) : 0)).toFixed(2) : null,
    payer_link: o.status === 'COMPLETED' ? null : approveLink(o),
    memo: pu.description || '',
  }
}
