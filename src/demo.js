// A fictional Tobago tour operator so anyone can try InboxPay straight away.
// Owners replace this with their own services on the Business tab.
export const DEMO_BUSINESS = {
  name: 'Reef & Ridge Tours',
  location: 'Tobago, Trinidad and Tobago',
  website: '',
  paypal_email: '',
  currency: 'USD',
  deposit_pct: 50,
  signature: 'The Reef & Ridge Tours team',
  policies: 'Cruise guests: we pick up at the Scarborough cruise terminal and guarantee return at least 1 hour before all-aboard. Full refund if the ship cannot dock. Balance due before the tour day.',
  terms: 'A 50% deposit confirms your date. The balance is due before the tour. Full refund if your cruise ship cannot dock in Tobago.',
  catalog: [
    { id: 'reef-half', name: 'Buccoo Reef & Nylon Pool (half day)', price: 30, per: 'person', details: 'Glass-bottom boat, snorkel the Coral Garden, swim in the Nylon Pool, beach BBQ. 11:00am or 2:00pm from Crown Point. About 3 hours.' },
    { id: 'little-tobago', name: 'Little Tobago & Angel Reef (with lunch)', price: 120, per: 'person', details: '9:00am from Speyside. Boat past Goat Island, guided hike on Little Tobago (about 1.5 hours) for seabirds, snorkel Angel Reef (about 1 hour), lunch included. Back about 3:00pm.' },
    { id: 'rainforest-half', name: 'Main Ridge Rainforest (half day)', price: 85, per: 'person', details: 'Guided trail walk and birdwatching in the oldest protected rainforest in the Western Hemisphere. 6-11am, 8am-1pm or 1:30-6:30pm.' },
    { id: 'rainforest-full', name: 'Main Ridge Rainforest (full day, waterfall + lunch)', price: 110, per: 'person', details: 'Trail walk, birdwatching, waterfall swim and lunch. About 8:30am-4:00pm.' },
    { id: 'rainforest-private', name: 'Private Main Ridge summit trek', price: 200, per: 'person', details: 'Private guide, route planned around you: summit of Main Ridge, waterfalls and birds. Cruise-day timing available.' },
    { id: 'transfer', name: 'Hotel or cruise-terminal transfer', price: 25, per: 'person', details: 'Return transport from your hotel or the Scarborough cruise terminal.' },
  ],
}

export const SAMPLE_EMAILS = [
  {
    label: 'Cruise couple, rainforest summit',
    text: `Greetings,
Found your website, trying to see if you can accommodate us. Prefer to book directly to avoid 3rd party commissions.

We're arriving on a cruise on Friday, January 22nd, scheduled 0800-1800 in port. There would be 2 of us.

Most interested in reaching the highest point in Tobago, along with birds & waterfalls too. Does your rainforest tour hike over this point? Happy to go private or join a group.

Thanks,
Patrick Miles
patrick.miles@example.com`,
  },
  {
    label: 'Little Tobago on New Year’s Day',
    text: `Hi there,

My partner and I are interested in booking a glass-bottom boat tour to Little Tobago on January 1. Before confirming, we'd like to know how much time is spent at each stop (how much time on Little Tobago? how much time at Angel Reef?) and whether lunch is provided.

Thanks in advance,
Cam Rivers
cam.rivers@example.com`,
  },
  {
    label: 'Family of 4, reef tour + pickup',
    text: `Good morning! We are a family of 4 (2 adults and 2 kids, 7 and 10) staying at a hotel in Crown Point from March 3-10. We'd love to do the Nylon Pool tour, ideally the afternoon one on the 5th. Can you pick us up from the hotel? What should we bring?

Maria Santos
maria.santos@example.com`,
  },
]
