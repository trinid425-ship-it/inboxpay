// GET /api/capture?token=ORDER_ID  (PayPal's return_url after the customer approves)
// Captures the deposit, then sends the customer to a thank-you screen.
import { pp } from './_lib/paypal.js'
import { query } from './_lib/http.js'

export default async function handler(req, res) {
  const { token } = query(req)
  const go = (path) => { res.statusCode = 302; res.setHeader('Location', path); res.end() }
  if (!token || !/^[A-Z0-9]+$/.test(token)) return go('/?paid=error')
  try {
    const o = await pp(`/v2/checkout/orders/${token}`)
    if (o.status === 'APPROVED') await pp(`/v2/checkout/orders/${token}/capture`, { method: 'POST' })
    return go(`/?paid=${encodeURIComponent(token)}`)
  } catch {
    return go(`/?paid=error&order=${encodeURIComponent(token)}`)
  }
}
