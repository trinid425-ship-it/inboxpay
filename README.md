# InboxPay

**Turn customer emails into paid bookings.** Paste a booking enquiry; AI reads it, matches it to your services and prices, drafts your reply, and PayPal collects the deposit.

**Live demo:** https://inboxpay-five.vercel.app (PayPal sandbox)

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

## The problem

Small tour operators and service businesses in the Caribbean get booking requests by email: *"2 of us, cruise day Jan 22, in port 8 to 6, we want the summit and the waterfalls, private if possible."* Answering takes the owner an hour: work out what fits, price it, write a careful reply, make an invoice, chase the deposit. Many never reply in time, and the customer books through a marketplace that takes 20–30% commission. Customers often say outright that they *prefer to book direct*.

## What InboxPay does

1. **Paste the email** (or pick a sample).
2. **AI reads it:** customer, date, party size, constraints (cruise hours, kids' ages, "private"), and which of *your* services fit. Anything it can't answer from your catalog goes into a "Check before sending" list instead of being made up.
3. **You review the quote.** Prices always come from your service list, never from the AI (the server re-prices every line).
4. **One click creates the PayPal payment.** If the account has PayPal Invoicing, it creates and sends an invoice with the deposit as the minimum partial payment. If not (Invoicing isn't offered in every country), it falls back to a **PayPal Checkout** link for the deposit. Either way the customer pays by PayPal or card.
5. **Copy the drafted reply**, now with the pay link.
6. **Invoices tab:** live status from PayPal (waiting for deposit → deposit paid → paid in full) plus totals quoted, collected and still due.

## How PayPal is used

| PayPal capability | Where |
|---|---|
| OAuth 2.0 client credentials | `api/_lib/paypal.js`: token cached server-side; the secret never reaches the browser |
| Invoicing v2: generate next invoice number | `POST /v2/invoicing/generate-next-invoice-number` |
| Invoicing v2: create draft invoice | `POST /v2/invoicing/invoices` with items, terms, recipient, and `configuration.partial_payment` (`allow_partial_payment` + `minimum_amount_due` = the deposit) |
| Invoicing v2: send invoice | `POST /v2/invoicing/invoices/{id}/send` returns the customer's PayPal pay page (`payer-view`) |
| Invoicing v2: list and show invoices | Live status, paid and due amounts for the dashboard |
| Orders v2 (Checkout) fallback | `POST /v2/checkout/orders` for the deposit when Invoicing is unavailable; `api/capture.js` is the `return_url` and captures the approved order; `api/checkout.js` reports status |

The server tries Invoicing first and switches to Checkout automatically when PayPal refuses it (403); `/api/health?deep=1` shows whether the account has the Invoicing scope. This way the same app works for merchants in countries where PayPal Invoicing isn't enabled, which includes much of the Caribbean.

## How AI is used

`api/_lib/ai.js` sends the email, the business's catalog and policies, and strict rules to **Google Gemini** (tries several Gemini models in turn, each with a time limit, so a busy model doesn't stall the request) (or **Anthropic Claude**, with whichever key is set) and asks for JSON only:
- extracts the customer, date (resolving "January 22nd" to the next occurrence), party size and constraints
- chooses catalog items and quantities, with a reason for each
- lists unanswered questions and requests that aren't in the catalog, so the owner checks them instead of the model guessing
- writes the reply in the customer's language, answering each question they asked

**Guardrail:** the model only decides *what*; the server decides *how much* (`priceQuote`), so a hallucinated price can never reach an invoice.

## Run it

Requirements: Node 18+, a free [PayPal developer](https://developer.paypal.com) sandbox app, and a Gemini **or** Anthropic API key.

```bash
git clone https://github.com/trinid425-ship-it/inboxpay
cd inboxpay
cp .env.example .env      # paste your keys
npm install
npm run dev               # http://localhost:5173
```

`.env`:
```
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
GEMINI_API_KEY=...        # or ANTHROPIC_API_KEY=...
```

The API handlers in `/api` run inside the Vite dev server locally and as Vercel functions in production. No database is needed: invoices live in PayPal, and the business profile is saved in the browser.

To test paying: open the pay link and log in with a **sandbox personal account** (Developer Dashboard → Testing Tools → Sandbox Accounts).

## Deploy

Import the repo into Vercel, add the same environment variables, and deploy.

## Project layout

```
api/
  analyze.js        POST: email -> structured quote + draft reply (AI)
  invoices.js       GET list/one, POST create + send (Invoicing v2, or Checkout fallback)
  checkout.js       GET status of Checkout deposit orders
  capture.js        PayPal return_url: captures the approved deposit
  health.js         which services are configured
  _lib/ai.js        prompt, Gemini/Claude calls, server-side pricing
  _lib/paypal.js    OAuth, REST helper, invoice body builder
src/
  App.jsx           Inbox → Review → Sent, Invoices, Business
  demo.js           fictional Tobago tour operator + sample emails
```

## License

MIT
