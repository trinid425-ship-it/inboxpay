import { useEffect, useMemo, useState } from 'react'
import { DEMO_BUSINESS, SAMPLE_EMAILS } from './demo.js'

const KEY = 'inboxpay-business-v1'
function loadBusiness() {
  try { const b = JSON.parse(localStorage.getItem(KEY) || 'null'); if (b?.catalog) return b } catch { /* private mode */ }
  return DEMO_BUSINESS
}
function saveBusiness(b) { try { localStorage.setItem(KEY, JSON.stringify(b)) } catch { /* ignore */ } }

// Deposits taken with PayPal Checkout (when the account can't use Invoicing)
// are remembered in this browser so the Invoices tab can show their status.
const CK = 'inboxpay-checkouts-v1'
function loadCheckouts() { try { return JSON.parse(localStorage.getItem(CK) || '[]') } catch { return [] } }
function rememberCheckout(r) {
  try { localStorage.setItem(CK, JSON.stringify([{ id: r.id, number: r.number, customer: r.customer, email: r.email, total: r.total, created: r.created }, ...loadCheckouts()].slice(0, 50))) } catch { /* ignore */ }
}

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json' } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`)
  return j
}

const fmt = (n, cur = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(Number(n) || 0) } catch { return `${cur} ${Number(n || 0).toFixed(2)}` }
}

export default function App() {
  const [tab, setTab] = useState('inbox')
  const [business, setBusiness] = useState(loadBusiness)
  const [health, setHealth] = useState(null)
  const [paidId, setPaidId] = useState(() => new URLSearchParams(window.location.search).get('paid'))
  useEffect(() => { api('/api/health').then(setHealth).catch(() => setHealth({ paypal: 'missing', ai: 'missing' })) }, [])
  const update = (b) => { setBusiness(b); saveBusiness(b) }

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><span className="logo">✉</span> InboxPay</div>
        <nav className="tabs">
          {[['inbox', 'Inbox'], ['invoices', 'Invoices'], ['business', 'Business']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
      </header>
      {health && (health.paypal === 'missing' || health.ai === 'missing') && (
        <div className="warn">Setup needed: {health.paypal === 'missing' && 'PayPal keys '}{health.paypal === 'missing' && health.ai === 'missing' && '& '}{health.ai === 'missing' && 'an AI key '}are missing on the server. See README.</div>
      )}
      {health && health.paypal === 'sandbox' && <div className="sandbox">PayPal Sandbox mode: test payments only, no real money moves.</div>}
      {paidId ? <PaidBanner id={paidId} onClose={() => { setPaidId(null); window.history.replaceState(null, '', '/') }} /> : null}
      {tab === 'inbox' && <Inbox business={business} onSent={() => setTab('invoices')} />}
      {tab === 'invoices' && <Invoices business={business} />}
      {tab === 'business' && <Business business={business} onChange={update} />}
      <footer className="foot">Built for the PayPal AI Hackathon · <a href="https://github.com/trinid425-ship-it/inboxpay" target="_blank" rel="noreferrer">Source</a></footer>
    </div>
  )
}

// ---------------------------------------------------------------- Inbox
function Inbox({ business, onSent }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [q, setQ] = useState(null)           // the quote being reviewed
  const [result, setResult] = useState(null) // the sent invoice

  async function read() {
    setErr(''); setResult(null); setBusy(true)
    try { setQ(await api('/api/analyze', { method: 'POST', body: JSON.stringify({ business, email }) })) }
    catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function sendInvoice() {
    setErr(''); setBusy(true)
    try {
      const r = await api('/api/invoices', { method: 'POST', body: JSON.stringify({ business, quote: q, send: true }) })
      if (r.kind === 'checkout') rememberCheckout(r)
      setResult(r)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  if (result) return <Sent result={result} quote={q} business={business} onNew={() => { setResult(null); setQ(null); setEmail('') }} onList={onSent} />

  return (
    <main>
      {!q && (
        <section className="card">
          <h2>Paste a customer email</h2>
          <p className="muted">InboxPay reads it, matches it to your services and prices, drafts your reply, and gets a PayPal invoice ready with a {business.deposit_pct ?? 50}% deposit.</p>
          <textarea rows={11} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Paste the whole email here, including their name and email address…" />
          <div className="row wrapgap">
            <span className="muted small">Try a sample:</span>
            {SAMPLE_EMAILS.map((s) => <button key={s.label} className="chip" onClick={() => setEmail(s.text)}>{s.label}</button>)}
          </div>
          {err && <div className="err">{err}</div>}
          <button className="primary big" disabled={busy || !email.trim()} onClick={read}>{busy ? 'Reading the email…' : '✨ Read email & build quote'}</button>
        </section>
      )}
      {q && <Review q={q} setQ={setQ} business={business} busy={busy} err={err} onBack={() => setQ(null)} onSend={sendInvoice} />}
    </main>
  )
}

function Review({ q, setQ, business, busy, err, onBack, onSend }) {
  const cur = business.currency || 'USD'
  const total = useMemo(() => q.items.reduce((a, i) => a + Number(i.unit_price) * Number(i.quantity), 0), [q.items])
  const deposit = Math.round(total * (Number(q.deposit_pct ?? 50) / 100) * 100) / 100
  const set = (patch) => setQ({ ...q, ...patch })
  const setItem = (idx, patch) => set({ items: q.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) })
  const addable = business.catalog.filter((c) => !q.items.some((i) => i.catalog_id === c.id))

  return (
    <>
      <section className="card">
        <div className="row between"><h2>What they’re asking for</h2><button className="link" onClick={onBack}>← Different email</button></div>
        <p className="lead">{q.summary}</p>
        <div className="facts">
          <label>Customer<input value={q.customer?.name || ''} onChange={(e) => set({ customer: { ...q.customer, name: e.target.value } })} /></label>
          <label>Email<input type="email" value={q.customer?.email || ''} onChange={(e) => set({ customer: { ...q.customer, email: e.target.value } })} placeholder="needed to send the invoice" /></label>
          <label>Date<input type="date" value={q.date || ''} onChange={(e) => set({ date: e.target.value })} /></label>
          <label>People<input type="number" min={1} value={q.party_size || ''} onChange={(e) => set({ party_size: Number(e.target.value) || null })} /></label>
        </div>
        {q.constraints?.length > 0 && <div className="tags">{q.constraints.map((c, i) => <span key={i} className="tag">{c}</span>)}</div>}
        {(q.questions_to_confirm?.length > 0 || q.unmatched_requests?.length > 0) && (
          <div className="check">
            <strong>Check before sending</strong>
            <ul>
              {q.questions_to_confirm?.map((x, i) => <li key={'q' + i}>{x}</li>)}
              {q.unmatched_requests?.map((x, i) => <li key={'u' + i}>Not in your services: {x}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Quote</h2>
        <p className="muted small">Prices come from your service list, never from the AI.</p>
        <table className="quote">
          <thead><tr><th>Service</th><th>Qty</th><th>Price</th><th>Line</th><th /></tr></thead>
          <tbody>
            {q.items.map((it, i) => (
              <tr key={i}>
                <td><div className="strong">{it.name}</div>{it.note && <div className="muted small">{it.note}</div>}</td>
                <td><input className="qty" type="number" min={1} value={it.quantity} onChange={(e) => setItem(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} /></td>
                <td>{fmt(it.unit_price, cur)}{it.per === 'person' ? <span className="muted small"> /person</span> : ''}</td>
                <td className="strong">{fmt(it.unit_price * it.quantity, cur)}</td>
                <td><button className="link bad" onClick={() => set({ items: q.items.filter((_, j) => j !== i) })}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {addable.length > 0 && (
          <select className="add" value="" onChange={(e) => {
            const c = business.catalog.find((x) => x.id === e.target.value); if (!c) return
            set({ items: [...q.items, { catalog_id: c.id, name: c.name, quantity: c.per === 'person' ? q.party_size || 1 : 1, unit_price: Number(c.price), per: c.per, note: '' }] })
          }}>
            <option value="">+ Add a service…</option>
            {addable.map((c) => <option key={c.id} value={c.id}>{c.name} · {fmt(c.price, cur)}</option>)}
          </select>
        )}
        <div className="totals">
          <div><span>Total</span><b>{fmt(total, cur)}</b></div>
          <div className="dep"><span>Deposit to confirm ({q.deposit_pct ?? 50}%), paid with PayPal</span><b>{fmt(deposit, cur)}</b></div>
        </div>
      </section>

      <section className="card">
        <h2>Your reply</h2>
        <input className="subject" value={q.reply_subject || ''} onChange={(e) => set({ reply_subject: e.target.value })} />
        <textarea rows={14} value={q.reply_body || ''} onChange={(e) => set({ reply_body: e.target.value })} />
        <p className="muted small">The PayPal pay link is added to the end of this reply when the invoice is created.</p>
        {err && <div className="err">{err}</div>}
        <button className="primary big" disabled={busy || !q.items.length || !q.customer?.email} onClick={onSend}>
          {busy ? 'Creating the PayPal invoice…' : `💳 Create PayPal invoice & send (${fmt(deposit, cur)} deposit)`}
        </button>
        {!q.customer?.email && <div className="muted small center">Add the customer’s email above to send the invoice.</div>}
      </section>
    </>
  )
}

function Sent({ result, quote, business, onNew, onList }) {
  const [copied, setCopied] = useState('')
  const replyText = `${quote.reply_body || ''}\n\nPay your deposit securely with PayPal or card:\n${result.pay_link || '(link in your PayPal invoice email)'}`
  const copy = (k, v) => { try { navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(''), 1500) } catch { /* ignore */ } }
  return (
    <main>
      <section className="card done">
        <div className="tick">✓</div>
        {result.kind === 'checkout' ? (
          <>
            <h2>PayPal deposit link ready{result.number ? ` · ${result.number}` : ''}</h2>
            <p className="muted">Send {quote.customer?.name || 'your customer'} the reply below. The link takes them to PayPal to pay the {fmt(result.deposit, business.currency)} deposit by PayPal or card, and it shows up as paid on your Invoices tab.</p>
          </>
        ) : (
          <>
            <h2>Invoice {result.number ? `#${result.number} ` : ''}sent with PayPal</h2>
            <p className="muted">{quote.customer?.name} will get PayPal’s invoice email at {quote.customer?.email}. They can pay the {fmt(result.deposit, business.currency)} deposit now and the rest later.</p>
          </>
        )}
        <div className="kv">
          <div><span>Total</span><b>{fmt(result.total, business.currency)}</b></div>
          <div><span>Deposit</span><b>{fmt(result.deposit, business.currency)}</b></div>
          <div><span>Status</span><b><Status s={result.status} /></b></div>
        </div>
        {result.pay_link && (
          <div className="linkrow">
            <input readOnly value={result.pay_link} onFocus={(e) => e.target.select()} />
            <button onClick={() => copy('link', result.pay_link)}>{copied === 'link' ? 'Copied ✓' : 'Copy pay link'}</button>
            <a className="btn" href={result.pay_link} target="_blank" rel="noreferrer">Open</a>
          </div>
        )}
        <h3>Your reply, with the pay link</h3>
        <textarea rows={10} readOnly value={replyText} />
        <div className="row wrapgap">
          <button className="primary" onClick={() => copy('reply', replyText)}>{copied === 'reply' ? 'Copied ✓' : 'Copy reply'}</button>
          {quote.customer?.email && <a className="btn" href={`mailto:${quote.customer.email}?subject=${encodeURIComponent(quote.reply_subject || '')}&body=${encodeURIComponent(replyText)}`}>Open in email app</a>}
          <button onClick={onList}>See all invoices</button>
          <button className="link" onClick={onNew}>Next email →</button>
        </div>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------- Invoices
const STATUS = {
  DRAFT: ['Draft', 'grey'], SENT: ['Waiting for deposit', 'amber'], UNPAID: ['Waiting for deposit', 'amber'],
  PARTIALLY_PAID: ['Deposit paid', 'blue'], PAID: ['Paid in full', 'green'], MARKED_AS_PAID: ['Paid (marked)', 'green'],
  CANCELLED: ['Cancelled', 'grey'], REFUNDED: ['Refunded', 'grey'], PARTIALLY_REFUNDED: ['Part refunded', 'grey'],
  PAYMENT_PENDING: ['Payment pending', 'amber'], SCHEDULED: ['Scheduled', 'grey'],
}
function Status({ s }) { const [l, c] = STATUS[s] || [s || '—', 'grey']; return <span className={`pill ${c}`}>{l}</span> }

function Invoices({ business }) {
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const load = () => {
    setErr('')
    const ck = loadCheckouts()
    Promise.all([
      api('/api/invoices').then((j) => j.invoices || []),
      ck.length ? api(`/api/checkout?ids=${ck.map((c) => c.id).join(',')}`).then((j) => (j.orders || []).map((o) => {
        const m = ck.find((c) => c.id === o.id) || {}
        const paid = Number(o.paid || 0)
        return { ...o, number: m.number || o.number, customer: m.customer || o.customer, email: m.email || o.email, total: m.total ?? o.total, created: m.created || o.created,
          status: paid > 0 && m.total && paid < Number(m.total) ? 'PARTIALLY_PAID' : o.status, due: m.total != null ? (Number(m.total) - paid).toFixed(2) : o.due }
      })) : Promise.resolve([]),
    ]).then(([a, b]) => setList([...b, ...a].sort((x, y) => String(y.created || '').localeCompare(String(x.created || '')))))
      .catch((e) => { setErr(e.message); setList([]) })
  }
  useEffect(load, [])
  const sum = (k) => (list || []).reduce((a, i) => a + Number(i[k] || 0), 0)
  return (
    <main>
      <section className="card">
        <div className="row between"><h2>Invoices</h2><button onClick={load}>↻ Refresh</button></div>
        {list && list.length > 0 && (
          <div className="kv">
            <div><span>Quoted</span><b>{fmt(sum('total'), business.currency)}</b></div>
            <div><span>Collected</span><b>{fmt(sum('paid'), business.currency)}</b></div>
            <div><span>Still due</span><b>{fmt(sum('due'), business.currency)}</b></div>
          </div>
        )}
        {err && <div className="err">{err}</div>}
        {list === null && <p className="muted">Loading from PayPal…</p>}
        {list && list.length === 0 && !err && <p className="muted">No invoices yet. Paste a customer email on the Inbox tab.</p>}
        {list && list.map((i) => (
          <div key={i.id} className="inv">
            <div>
              <div className="strong">#{i.number} · {i.customer}</div>
              <div className="muted small">{i.email} · {i.created ? new Date(i.created).toLocaleDateString() : ''}</div>
            </div>
            <div className="right">
              <Status s={i.status} />
              <div className="small">{fmt(i.paid, i.currency)} paid of {fmt(i.total, i.currency)}</div>
              {i.payer_link && <a className="small" href={i.payer_link} target="_blank" rel="noreferrer">Customer’s pay page ↗</a>}
            </div>
          </div>
        ))}
        <p className="muted small">Live from PayPal: statuses update the moment a customer pays.</p>
      </section>
    </main>
  )
}

// Shown to the customer after they pay the deposit on PayPal (?paid=ORDER_ID).
function PaidBanner({ id, onClose }) {
  const ok = id && id !== 'error'
  return (
    <section className={'card done'} style={{ marginBottom: 14 }}>
      <div className="tick" style={ok ? null : { background: 'var(--bad)' }}>{ok ? '✓' : '!'}</div>
      <h2>{ok ? 'Deposit received. You’re booked!' : 'Payment didn’t go through'}</h2>
      <p className="muted">{ok ? 'PayPal has confirmed your deposit. The business will be in touch with the final details.' : 'Nothing was charged. Please open the pay link again, or reply to the business email.'}</p>
      {ok && <p className="muted small">PayPal reference: {id}</p>}
      <button className="link" onClick={onClose}>Close</button>
    </section>
  )
}

// ---------------------------------------------------------------- Business
function Business({ business, onChange }) {
  const b = business
  const set = (patch) => onChange({ ...b, ...patch })
  const setItem = (i, patch) => set({ catalog: b.catalog.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  return (
    <main>
      <section className="card">
        <h2>Your business</h2>
        <p className="muted small">The AI only quotes from what you put here. Saved in this browser.</p>
        <div className="facts">
          <label>Business name<input value={b.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <label>Location<input value={b.location || ''} onChange={(e) => set({ location: e.target.value })} /></label>
          <label>Currency<select value={b.currency} onChange={(e) => set({ currency: e.target.value })}>{['USD', 'TTD', 'EUR', 'GBP', 'CAD', 'JMD', 'BBD', 'XCD'].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Deposit %<input type="number" min={0} max={100} value={b.deposit_pct} onChange={(e) => set({ deposit_pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} /></label>
          <label className="wide">Sign replies as<input value={b.signature || ''} onChange={(e) => set({ signature: e.target.value })} /></label>
          <label className="wide">Policies the AI should know<textarea rows={3} value={b.policies || ''} onChange={(e) => set({ policies: e.target.value })} /></label>
          <label className="wide">Terms printed on the invoice<textarea rows={2} value={b.terms || ''} onChange={(e) => set({ terms: e.target.value })} /></label>
        </div>
      </section>
      <section className="card">
        <h2>Services & prices</h2>
        {b.catalog.map((c, i) => (
          <div key={i} className="svc">
            <input className="grow" value={c.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="Service name" />
            <input className="price" type="number" min={0} step="0.01" value={c.price} onChange={(e) => setItem(i, { price: Number(e.target.value) || 0 })} />
            <select value={c.per || 'person'} onChange={(e) => setItem(i, { per: e.target.value })}><option value="person">per person</option><option value="booking">per booking</option></select>
            <button className="link bad" onClick={() => set({ catalog: b.catalog.filter((_, j) => j !== i) })}>Remove</button>
            <textarea className="full" rows={2} value={c.details || ''} onChange={(e) => setItem(i, { details: e.target.value })} placeholder="Times, what’s included, meeting point…" />
          </div>
        ))}
        <div className="row wrapgap">
          <button onClick={() => set({ catalog: [...b.catalog, { id: `svc-${Date.now().toString(36)}`, name: '', price: 0, per: 'person', details: '' }] })}>+ Add service</button>
          <button className="link" onClick={() => onChange(DEMO_BUSINESS)}>Reset to demo business</button>
        </div>
      </section>
    </main>
  )
}
