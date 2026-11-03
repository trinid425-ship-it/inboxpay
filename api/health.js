// GET /api/health -> which services are configured (never returns the keys).
import { aiProvider } from './_lib/ai.js'
import { paypalConfigured } from './_lib/paypal.js'
import { send } from './_lib/http.js'

export default function handler(req, res) {
  send(res, 200, {
    ok: true,
    paypal: paypalConfigured() ? (process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox') : 'missing',
    ai: aiProvider() || 'missing',
  })
}
