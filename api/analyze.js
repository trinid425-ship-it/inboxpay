// POST /api/analyze  { business, email }  ->  structured quote + draft reply
import { analyzeEmail } from './_lib/ai.js'
import { readJson, send } from './_lib/http.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' })
  try {
    const { business, email } = await readJson(req)
    if (!business?.catalog?.length) return send(res, 400, { error: 'Add at least one service to your catalog first.' })
    if (!String(email || '').trim()) return send(res, 400, { error: 'Paste the customer email first.' })
    const out = await analyzeEmail({ business, email })
    return send(res, 200, out)
  } catch (e) {
    return send(res, 500, { error: e.message })
  }
}
