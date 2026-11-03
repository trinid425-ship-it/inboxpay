// /api/checkout
//   GET ?ids=ID1,ID2  -> status of deposit payments made with PayPal Checkout
import { pp, summarizeOrder } from './_lib/paypal.js'
import { query, send } from './_lib/http.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET' })
  const ids = String(query(req).ids || '').split(',').filter((x) => /^[A-Z0-9]+$/.test(x)).slice(0, 50)
  const out = await Promise.all(ids.map((id) => pp(`/v2/checkout/orders/${id}`).then((o) => summarizeOrder(o)).catch(() => null)))
  send(res, 200, { orders: out.filter(Boolean) })
}
