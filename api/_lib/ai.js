// AI step: read a customer's email and turn it into a structured booking
// request + a draft reply, using the business's own catalog and policies.
//
// Works with Google Gemini (GEMINI_API_KEY) or Anthropic Claude
// (ANTHROPIC_API_KEY). Both are asked for strict JSON. Prices are NEVER taken
// from the model: the server re-prices every line from the catalog (see
// priceQuote), so a hallucinated number can't reach an invoice.

export function aiProvider() {
  if (process.env.GEMINI_API_KEY) return 'gemini'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  return null
}

const SCHEMA_HINT = `Return ONLY a JSON object with exactly these keys:
{
  "customer": { "name": string, "email": string | null },
  "date": "YYYY-MM-DD" | null,          // the day they want the service
  "party_size": integer | null,
  "summary": string,                    // one sentence: what they want
  "constraints": string[],              // e.g. "cruise in port 08:00-18:00", "wants private", "child aged 5"
  "items": [ { "catalog_id": string, "quantity": integer, "reason": string } ],
  "unmatched_requests": string[],       // things they asked for that are not in the catalog
  "questions_to_confirm": string[],     // facts the owner must check before sending (only real gaps)
  "reply_subject": string,
  "reply_body": string                  // the email reply, ready to send, signed by the business
}`

function prompt({ business, email, today }) {
  return `You are the booking assistant for "${business.name}", a small business in ${business.location || 'the Caribbean'}.
Today is ${today}. Read the customer's email and prepare a booking quote and a warm, professional reply.

BUSINESS CATALOG (only these can be quoted; use the exact "id" as catalog_id):
${JSON.stringify(business.catalog, null, 2)}

BUSINESS POLICIES:
- Currency: ${business.currency || 'USD'}
- Deposit to confirm: ${business.deposit_pct ?? 50}% (paid online with PayPal; the reply should say a PayPal invoice link is attached/included)
- ${business.policies || ''}

RULES:
- Pick the catalog items that best match the request. quantity = number of people for per-person items, 1 for per-booking items.
- If they mention a year-less date, choose the next occurrence after today.
- Never invent prices, times or inclusions that are not in the catalog or policies. If something they ask is not covered, put it in unmatched_requests and/or questions_to_confirm, and in the reply say you'll confirm it.
- The reply: greet them by first name, answer each question they asked using catalog facts, state the price per person and total, mention the ${business.deposit_pct ?? 50}% deposit via the PayPal link, and close warmly. Sign as "${business.signature || business.name}". Plain text, no markdown, no placeholders like [name].
- Write the reply in the same language as the customer's email.

${SCHEMA_HINT}

CUSTOMER EMAIL:
"""
${String(email).slice(0, 12000)}
"""`
}

// Google retires model names over time. If the configured model is gone and
// the 404 names a replacement ("...use models/<name>..."), retry once with it.
let geminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
async function gemini(p, retried = false) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: p }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (r.status === 404 && !retried) {
    const next = /use models\/([\w.-]+)/.exec(j.error?.message || '')?.[1]
    if (next && next !== geminiModel) { geminiModel = next; return gemini(p, true) }
  }
  if (!r.ok) throw new Error(`Gemini error (${r.status}): ${j.error?.message || 'unknown'}`)
  return j.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') || ''
}

async function anthropic(p) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 2000, temperature: 0.3, messages: [{ role: 'user', content: p }] }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Claude error (${r.status}): ${j.error?.message || 'unknown'}`)
  return (j.content || []).map((c) => c.text || '').join('')
}

function parseJson(text) {
  const t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = t.indexOf('{'), end = t.lastIndexOf('}')
  return JSON.parse(start >= 0 ? t.slice(start, end + 1) : t)
}

// Server-side pricing: the model only chooses WHAT; the catalog decides HOW MUCH.
export function priceQuote(business, ai) {
  const byId = Object.fromEntries((business.catalog || []).map((c) => [c.id, c]))
  const items = []
  const unknown = []
  for (const it of ai.items || []) {
    const c = byId[it.catalog_id]
    if (!c) { unknown.push(it.catalog_id); continue }
    const qty = Math.max(1, Math.round(Number(it.quantity) || (c.per === 'person' ? ai.party_size || 1 : 1)))
    items.push({ catalog_id: c.id, name: c.name, quantity: qty, unit_price: Number(c.price), per: c.per || 'person', note: it.reason || '' })
  }
  const total = items.reduce((a, i) => a + i.unit_price * i.quantity, 0)
  return { items, total: Math.round(total * 100) / 100, unknown_items: unknown }
}

export async function analyzeEmail({ business, email }) {
  const provider = aiProvider()
  if (!provider) throw new Error('No AI key set. Add GEMINI_API_KEY or ANTHROPIC_API_KEY.')
  const today = new Date().toISOString().slice(0, 10)
  const raw = provider === 'gemini' ? await gemini(prompt({ business, email, today })) : await anthropic(prompt({ business, email, today }))
  let ai
  try { ai = parseJson(raw) } catch { throw new Error('The AI reply was not valid JSON. Try again.') }
  const priced = priceQuote(business, ai)
  return { provider, ...ai, ...priced, deposit_pct: business.deposit_pct ?? 50 }
}
