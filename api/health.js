// GET /api/health -> which services are configured (never returns the keys).
// Add ?deep=1 to sign in to PayPal and check the Invoicing permission.
import { aiProvider } from './_lib/ai.js'
import { paypalCanInvoice, paypalConfigured } from './_lib/paypal.js'
import { query, send } from './_lib/http.js'

export default async function handler(req, res) {
  const out = {
    ok: true,
    paypal: paypalConfigured() ? (process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox') : 'missing',
    ai: aiProvider() || 'missing',
  }
  if (query(req).deep && paypalConfigured()) {
    try { const c = await paypalCanInvoice(); out.paypal_invoicing = c.invoicing; out.paypal_scopes = c.scopes } catch (e) { out.paypal_error = e.message }
  }
  send(res, 200, out)
}
