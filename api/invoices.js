// /api/invoices
//   GET                -> recent PayPal invoices created by this app (status, paid, due, pay link)
//   GET  ?id=INV2-...  -> one invoice
//   POST { business, quote, send: true } -> create the PayPal invoice (with a
//        deposit as the minimum partial payment) and send it; returns the
//        customer's pay link.
import { approveLink, depositOrderBody, invoiceBody, payerLink, paypalConfigured, pp, summarize } from './_lib/paypal.js'
import { query, readJson, send } from './_lib/http.js'

export default async function handler(req, res) {
  if (!paypalConfigured()) return send(res, 500, { error: 'PayPal keys are not set on the server (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).' })
  try {
    if (req.method === 'GET') {
      const { id } = query(req)
      if (id) return send(res, 200, summarize(await pp(`/v2/invoicing/invoices/${encodeURIComponent(id)}`)))
      let list
      try {
        list = await pp('/v2/invoicing/invoices?page=1&page_size=25&total_required=true&fields=amount')
      } catch (e) {
        if (e.status === 403) return send(res, 200, { invoices: [], invoicing: false })
        throw e
      }
      // Only show invoices this app made (memo tag), newest first.
      const items = (list.items || []).filter((i) => /InboxPay/.test(i.detail?.memo || ''))
      const full = await Promise.all(items.map((i) => pp(`/v2/invoicing/invoices/${i.id}`).catch(() => i)))
      return send(res, 200, { invoices: full.map(summarize) })
    }

    if (req.method === 'POST') {
      const { business, quote, send: doSend = true } = await readJson(req)
      if (!quote?.items?.length) return send(res, 400, { error: 'The quote has no items.' })
      if (!quote.customer?.email) return send(res, 400, { error: 'Add the customer’s email so PayPal can send the invoice.' })
      const { body, total, deposit } = invoiceBody({ business, quote })

      // Let PayPal number it (INV-0001 style, unique per merchant).
      try {
        const n = await pp('/v2/invoicing/generate-next-invoice-number', { method: 'POST' })
        if (n?.invoice_number) body.detail.invoice_number = n.invoice_number
      } catch { /* PayPal assigns one anyway */ }

      let created
      try {
        created = await pp('/v2/invoicing/invoices', { method: 'POST', body })
      } catch (e) {
        // Invoicing isn't available on every PayPal account (it depends on the
        // merchant's country). Fall back to a PayPal Checkout link for the deposit.
        if (e.status !== 403) throw e
        const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`
        const ref = `IP-${Date.now().toString(36).toUpperCase()}`
        const o = depositOrderBody({ business, quote, origin, ref })
        const order = await pp('/v2/checkout/orders', { method: 'POST', body: o.body })
        return send(res, 200, {
          kind: 'checkout', id: order.id, number: ref, status: 'SENT',
          pay_link: approveLink(order), total: o.total, deposit: o.deposit,
          customer: quote.customer?.name || '', email: quote.customer?.email || '',
          created: new Date().toISOString(),
        })
      }
      const id = created.id || String(created.href || '').split('/').pop()
      let sent = null
      if (doSend) {
        sent = await pp(`/v2/invoicing/invoices/${id}/send`, {
          method: 'POST',
          body: {
            subject: quote.reply_subject || `Your booking with ${business.name}`,
            note: `Pay the ${business.deposit_pct ?? 50}% deposit to confirm your date. You can pay with PayPal or a card.`,
            send_to_invoicer: true,
            send_to_recipient: true,
          },
        })
      }
      const inv = await pp(`/v2/invoicing/invoices/${id}`)
      return send(res, 200, { ...summarize(inv), pay_link: payerLink(sent, inv), total, deposit })
    }

    return send(res, 405, { error: 'Use GET or POST' })
  } catch (e) {
    return send(res, 500, { error: e.message })
  }
}
