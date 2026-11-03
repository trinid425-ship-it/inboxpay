# InboxPay: Devpost submission kit

Paste each section into the matching Devpost field.

---

## Project name
InboxPay

## Tagline (short)
Turn a customer's booking email into a quote, a reply and a PayPal deposit link in one minute.

## Try it out (links)
- Live demo: https://inboxpay-five.vercel.app
- Code: https://github.com/trinid425-ship-it/inboxpay

## Built with
react, vite, vercel, node.js, paypal-rest-api, paypal-checkout, paypal-invoicing, google-gemini

---

## About the project

### Inspiration
I help run bookings for a small tour operator in Tobago. Most bookings arrive as emails like *"2 of us, cruise day Jan 22, in port 8 to 6, we want the waterfalls, private if possible, and is lunch included?"* Answering each one properly takes the owner close to an hour: work out which tours fit, price them, write a careful reply, make an invoice, then chase the deposit. Slow replies lose the booking to big marketplaces that take 20–30% commission, even though many customers say they'd rather book direct.

### What it does
1. **Paste the customer's email.**
2. **AI reads it**: the customer's name, date, party size, constraints (cruise hours, children, "private"), and which of *your* services fit. Anything it can't answer from your service list goes into a **"Check before sending"** list instead of being made up.
3. **You review the quote.** Prices always come from your own service list. The AI picks *what*, the server decides *how much*, so an invented price can never reach the customer.
4. **One click creates the PayPal payment for the deposit.**
5. **Copy the reply**, written in the customer's own language, answering each question they asked, with the pay link included.
6. **The Invoices tab** shows live status from PayPal: waiting for deposit, deposit paid, paid in full.

### How we built it
- **Frontend:** React + Vite. Inbox → Review → Sent flow, an Invoices dashboard and a Business profile (services, prices, deposit %, policies).
- **Backend:** Vercel serverless functions in `/api`. PayPal credentials stay on the server.
- **AI:** Google Gemini with strict JSON output. The prompt gives the model the business's own service list and policies and tells it never to invent prices, times or inclusions. Several Gemini models are tried in turn, each with a time limit, so one busy model doesn't stall a request.
- **PayPal:**
  - OAuth 2.0 client credentials, with the token cached server-side.
  - **Invoicing v2**: next invoice number, create the invoice with the deposit as the minimum partial payment, send it, and list and show invoices for live status.
  - **Orders v2 (Checkout) fallback**: PayPal Invoicing isn't available in every country, including Trinidad and Tobago. When PayPal refuses Invoicing, InboxPay automatically creates a Checkout order for the deposit instead, captures it on return, and tracks its status. The same app works for merchants anywhere PayPal Checkout works.

### Challenges we ran into
- **Invoicing isn't available everywhere.** Our sandbox account couldn't use Invoicing because of its country, which is the real situation for many Caribbean merchants. That's why the Checkout fallback exists.
- **Keeping the AI honest.** Early versions guessed at pickup times and lunch. We moved every unknown into the "Check before sending" list and re-price every line on the server.
- **Model availability.** Models were retired or overloaded mid-build, so we added the timed model chain.

### Accomplishments we're proud of
- An email that took an hour to answer is now a reviewed quote, a reply and a pay link in about a minute.
- The AI cannot change a price.
- It works for merchants in countries PayPal Invoicing doesn't cover.

### What we learned
AI is most useful here as a careful reader, not a decision-maker. Letting the model pick *what* and the business's own data decide *how much* made the output trustworthy enough to send to a real customer.

### What's next for InboxPay
- Connect Gmail and Outlook so enquiries arrive without pasting.
- Let the customer choose their time slot on the payment page.
- WhatsApp enquiries, which are just as common as email in the Caribbean.
- Automatic reminders when a deposit hasn't been paid.

---

## Demo video script (about 2 minutes)

**[0:00–0:15] The problem.** *Screen: a real-looking booking email.*
"Small tour operators in the Caribbean get bookings like this by email. Answering properly takes the owner up to an hour, and slow replies lose bookings to marketplaces that take a 30% cut."

**[0:15–0:30] Meet InboxPay.** *Screen: the InboxPay home page and Business tab with services and prices.*
"InboxPay turns that email into a quote, a reply and a PayPal deposit link. It works from the business's own services and prices."

**[0:30–1:00] The AI read.** *Paste the sample email, click Analyze.*
"Gemini reads the email: two people, January 22nd, a cruise in port eight to six, wants it private. It picks the matching tours and explains why. And here: 'Is lunch included?' isn't in the service list, so instead of guessing it goes to *Check before sending*."

**[1:00–1:15] The guardrail.** *Point at the price lines.*
"Every price comes from the business's own list. The AI picks what; the server decides how much. A made-up price can't reach the customer."

**[1:15–1:40] PayPal.** *Click to create the payment and open the pay link.*
"One click creates the PayPal deposit. Where PayPal Invoicing is available, it's a real invoice with the deposit as the minimum payment. Here in Trinidad and Tobago, Invoicing isn't offered, so InboxPay automatically switches to PayPal Checkout. The customer pays by PayPal or card." *Pay with the sandbox personal account.*

**[1:40–1:55] Done.** *Show the copied reply and the Invoices tab showing "Deposit paid".*
"The reply is ready to send, in the customer's language, with the link. The Invoices tab shows the deposit has landed."

**[1:55–2:05] Close.**
"InboxPay: an hour of admin down to a minute, and bookings paid direct. Built with PayPal and Gemini."

---

## Before you submit
- [ ] Do one full test payment with your **sandbox personal account** (Developer Dashboard → Testing Tools → Sandbox Accounts) and confirm the Invoices tab shows it paid.
- [ ] Record the video, upload it to YouTube (unlisted is fine) and paste the link.
- [ ] Add 3–4 screenshots: Inbox, Review (with the "Check before sending" list), the PayPal pay page, Invoices.
- [ ] Submit before **Nov 12, 12:00 PT (3:00 pm your time)**.
