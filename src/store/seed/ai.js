// Module seed for "ai": AI Calling Bot + WhatsApp Chatbot collections.
// Calls and bot replies are generated with the same engine the live app uses (store/slices/ai.js), so seeded data
// is consistent with real prices, stock, orders and warranties.
import { addDays, daysAgo, today, mulberry32, uid } from '../../lib/format'
import { buildCall, leadAfterCall, waBotAnswer, tempOf } from '../slices/ai'

const REGION_EXEC = { West: 'u5', Central: 'u5', North: 'u6', South: 'u7', East: 'u18' }
const isoAt = (date, h, m = 0) => `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString()

// [name, company, city, state, region, source, interest, type, score, language]
const LEADS = [
  ['Mahesh Agarwal', 'Agarwal Hardware & Sanitary', 'Indore', 'Madhya Pradesh', 'Central', 'IndiaMART', 'Pumps', 'DEALER_PROSPECT', 82, 'Hindi'],
  ['Suresh Choudhary', 'Choudhary Krishi Seva Kendra', 'Jodhpur', 'Rajasthan', 'North', 'Trade Fair', 'Spraying Equipment', 'DEALER_PROSPECT', 74, 'Hindi'],
  ['Lakshmi Narayanan', 'LN Pumps & Pipes', 'Madurai', 'Tamil Nadu', 'South', 'Website', 'Pumps', 'DEALER_PROSPECT', 68, 'Tamil'],
  ['Imtiaz Qureshi', 'Qureshi Car Care', 'Hyderabad', 'Telangana', 'South', 'Google Ads', 'Pressure Washers', 'INSTITUTIONAL', 77, 'English'],
  ['Pradeep Yadav', 'Yadav Agro Agency', 'Varanasi', 'Uttar Pradesh', 'North', 'Facebook Ads', 'Spraying Equipment', 'DEALER_PROSPECT', 55, 'Hindi'],
  ['Kiran Shetty', 'Shetty Industrial Tools', 'Mangaluru', 'Karnataka', 'South', 'IndiaMART', 'Air Compressors', 'DEALER_PROSPECT', 61, 'English'],
  ['Harpreet Gill', 'Gill Tractors & Spares', 'Bathinda', 'Punjab', 'North', 'Referral', 'Pumps', 'DEALER_PROSPECT', 48, 'Hindi'],
  ['Ramesh Bhai Patel', 'Patel Irrigation Centre', 'Mehsana', 'Gujarat', 'West', 'Trade Fair', 'Pumps', 'DEALER_PROSPECT', 88, 'Gujarati'],
  ['Sandeep Kulkarni', 'Kulkarni Auto Garage', 'Kolhapur', 'Maharashtra', 'West', 'Website', 'Air Compressors', 'END_CUSTOMER', 42, 'Marathi'],
  ['Anita Deshmukh', 'Deshmukh Farms', 'Ahmednagar', 'Maharashtra', 'West', 'Facebook Ads', 'Spraying Equipment', 'END_CUSTOMER', 36, 'Marathi'],
  ['Biswajit Das', 'Das Machinery Store', 'Cuttack', 'Odisha', 'East', 'IndiaMART', 'Pumps', 'DEALER_PROSPECT', 58, 'English'],
  ['Rakesh Tiwari', 'Tiwari Electricals', 'Bhopal', 'Madhya Pradesh', 'Central', 'Missed Call', 'Pumps', 'RETAILER', 45, 'Hindi'],
  ['Joseph Mathew', 'Mathew Hardwares', 'Thrissur', 'Kerala', 'South', 'Website', 'Vacuum Cleaners', 'RETAILER', 52, 'English'],
  ['Vinod Saini', 'Saini Pump House', 'Hisar', 'Haryana', 'North', 'Google Ads', 'Pumps', 'DEALER_PROSPECT', 71, 'Hindi'],
  ['Nilesh Shah', 'Shah Cleaning Solutions', 'Ahmedabad', 'Gujarat', 'West', 'Website', 'Vacuum Cleaners', 'INSTITUTIONAL', 64, 'Gujarati'],
  ['Abdul Rahman', 'Rahman Spray Centre', 'Malda', 'West Bengal', 'East', 'Facebook Ads', 'Spraying Equipment', 'DEALER_PROSPECT', 33, 'English'],
  ['Gopal Krishna Rao', 'Sri Venkateswara Agencies', 'Vijayawada', 'Andhra Pradesh', 'South', 'Trade Fair', 'Spraying Equipment', 'DEALER_PROSPECT', 79, 'English'],
  ['Manoj Pandey', 'Pandey Hardware', 'Gorakhpur', 'Uttar Pradesh', 'North', 'IndiaMART', 'Air Compressors', 'RETAILER', 28, 'Hindi'],
  ['Swati Joshi', 'Joshi Car Spa', 'Pune', 'Maharashtra', 'West', 'Google Ads', 'Pressure Washers', 'INSTITUTIONAL', 66, 'Marathi'],
  ['Prakash Meena', 'Meena Krishi Yantra', 'Kota', 'Rajasthan', 'North', 'Missed Call', 'Spraying Equipment', 'RETAILER', 39, 'Hindi'],
  ['Arvind Reddy', 'Reddy Borewells', 'Nalgonda', 'Telangana', 'South', 'Referral', 'Pumps', 'INSTITUTIONAL', 73, 'English'],
  ['Rajiv Bansal', 'Bansal Traders', 'Raipur', 'Chhattisgarh', 'Central', 'Website', 'Pumps', 'DEALER_PROSPECT', 57, 'Hindi'],
  ['Sunita Rawat', 'Rawat Agro Inputs', 'Dehradun', 'Uttarakhand', 'North', 'Facebook Ads', 'Spraying Equipment', 'DEALER_PROSPECT', 22, 'Hindi'],
  ['Dinesh Solanki', 'Solanki Engineering Works', 'Vadodara', 'Gujarat', 'West', 'IndiaMART', 'Air Compressors', 'END_CUSTOMER', 47, 'Gujarati'],
  ['Faisal Khan', 'Khan Auto Wash', 'Lucknow', 'Uttar Pradesh', 'North', 'Google Ads', 'Pressure Washers', 'INSTITUTIONAL', 84, 'Hindi'],
  ['Tapan Saha', 'Saha Hardware Mart', 'Siliguri', 'West Bengal', 'East', 'Trade Fair', 'Pumps', 'DEALER_PROSPECT', 50, 'English'],
  ['Venkatesh Iyer', 'Iyer Facility Services', 'Chennai', 'Tamil Nadu', 'South', 'Website', 'Vacuum Cleaners', 'INSTITUTIONAL', 63, 'English'],
  ['Bharat Thakkar', 'Thakkar Sales Agency', 'Rajkot', 'Gujarat', 'West', 'Referral', 'Spare Parts', 'DEALER_PROSPECT', 69, 'Gujarati'],
  ['Ajay Chauhan', 'Chauhan Farm Equipments', 'Meerut', 'Uttar Pradesh', 'North', 'Missed Call', 'Pumps', 'RETAILER', 31, 'Hindi'],
  ['Kavya Nair', 'Nair Home Needs', 'Kozhikode', 'Kerala', 'South', 'Facebook Ads', 'Vacuum Cleaners', 'RETAILER', 18, 'English'],
  ['Santosh Jadhav', 'Jadhav Krishi Kendra', 'Satara', 'Maharashtra', 'West', 'Trade Fair', 'Spraying Equipment', 'DEALER_PROSPECT', 76, 'Marathi'],
  ['Ravi Prakash', 'Prakash Electric Co.', 'Ranchi', 'Jharkhand', 'East', 'IndiaMART', 'Pumps', 'DEALER_PROSPECT', 44, 'Hindi'],
  ['Mohit Goyal', 'Goyal Industrial Corp.', 'Ludhiana', 'Punjab', 'North', 'Website', 'Air Compressors', 'DEALER_PROSPECT', 59, 'Hindi'],
  ['Shankar Gowda', 'Gowda Agri Clinic', 'Mysuru', 'Karnataka', 'South', 'Referral', 'Spraying Equipment', 'RETAILER', 41, 'English'],
  ['Naveen Jain', 'Jain Plumbing Mart', 'Jabalpur', 'Madhya Pradesh', 'Central', 'Google Ads', 'Pumps', 'RETAILER', 54, 'Hindi'],
  ['Pooja Mehra', 'Mehra Hospitality', 'Gurugram', 'Haryana', 'North', 'Website', 'Vacuum Cleaners', 'INSTITUTIONAL', 26, 'English'],
]
const QUAL = {
  Pumps: ['₹1.5 – 2 lakh first order', 'Monoblock & openwell pumps', 'Before Rabi season (Nov)'],
  'Spraying Equipment': ['₹1 lakh first order', 'Battery sprayers 16–20 L', 'Within 2 weeks'],
  'Air Compressors': ['₹80,000 – 1.2 lakh', '24 L & 50 L compressors', 'This month'],
  'Pressure Washers': ['₹60,000 – 1 lakh', 'Induction 2.2 kW washers', 'Next 30 days'],
  'Vacuum Cleaners': ['₹50,000', 'Wet & dry 30 L SS', 'Next quarter'],
  'Spare Parts': ['₹40,000 monthly', 'Seals, impellers, capacitors', 'Immediate'],
}

export const aiSeed = (core) => {
  const rnd = mulberry32(2026)
  const settings = {
    provider: 'Exotel', providerAccount: 'btali-intl', apiKeyMasked: 'exo_live_••••••••4f2a', webhookUrl: 'https://erp.btali.in/hooks/telephony',
    callerIds: [
      { id: 'cid1', number: '+91 22 4890 1100', label: 'Mumbai HQ (primary)', active: true },
      { id: 'cid2', number: '+91 80 4718 2200', label: 'Bengaluru – South campaigns', active: true },
      { id: 'cid3', number: '1800 270 1100', label: 'Toll-free inbound', active: true },
    ],
    callingHours: { from: '10:00', to: '19:00', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
    timezone: 'Asia/Kolkata', dndCheck: true, dndLastSync: daysAgo(1), maxAttempts: 3, retryGapMin: 120, pace: 12, concurrency: 2,
    language: 'Hindi', languages: ['Hindi', 'English', 'Marathi', 'Gujarati', 'Tamil'], voice: 'Aarohi (Female · Hindi-English)',
    voices: ['Aarohi (Female · Hindi-English)', 'Kabir (Male · Hindi-English)', 'Meera (Female · English-India)', 'Arjun (Male · Tamil-English)'],
    recordCalls: true, recordingRetentionDays: 180, costPerMin: 3.2, monthlyBudget: 25000, autoWhatsApp: true, autoEmail: false, transferNumber: '98200 11004',
    inbound: { enabled: true, greetingMorning: 'Good morning! Thank you for calling Btali International.', greetingAfternoon: 'Good afternoon! Thank you for calling Btali International.', greetingEvening: 'Good evening! Thank you for calling Btali International.', missedCallFollowUp: true, afterHoursMessage: 'Our team will call you back at 10 AM next working day.' },
    scoring: { hot: 70, warm: 40 },
    wa: { businessNumber: '+91 98200 11000', displayName: 'Btali International', botName: 'Btali Assistant', autoGreeting: '', workingHours: '10:00 – 19:00, Mon–Sat', handoverAfterFallbacks: 2, csatEnabled: true, optOutKeyword: 'STOP', retryFailed: 2, provider: 'Meta WhatsApp Cloud API' },
    counters: { LEAD: 1100, CALL: 5000, CMP: 103, WAC: 24 },
  }

  // ------------------------------------------------------------ leads
  const leads = LEADS.map(([name, company, city, state, region, source, interest, type, score, language], i) => ({
    id: `lead${i + 1}`, number: `LD-${1001 + i}`, name, company, city, state, region, source, interest, type, score, temperature: tempOf(score), language,
    phone: `9${String(8123456 + i * 73491).slice(0, 4)} ${String(31000 + i * 1777).slice(0, 5)}`, email: `${name.split(' ')[0].toLowerCase()}@${company.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 14)}.in`,
    stage: 'NEW', attempts: 0, assignedTo: REGION_EXEC[region], dnd: i === 22, createdAt: `${daysAgo(30 - (i % 25))}T05:30:00.000Z`,
    qualification: { budget: QUAL[interest][0], requirement: QUAL[interest][1], timeline: QUAL[interest][2], location: city },
    notes: '', campaignId: null, nextFollowUp: null,
  }))
  // existing dealers with unpaid confirmed orders → payment follow-up leads
  const unpaid = core.salesOrders.filter((s) => s.status === 'CONFIRMED' && s.paymentStatus === 'UNPAID')
  const seenP = new Set()
  for (const so of unpaid) {
    if (seenP.has(so.partnerId) || seenP.size >= 4) continue
    seenP.add(so.partnerId)
    const p = core.partners.find((x) => x.id === so.partnerId)
    leads.push({
      id: `lead${leads.length + 1}`, number: `LD-${1001 + leads.length}`, name: p.contact, company: p.name, city: p.city, state: p.state, region: p.region, source: 'ERP Receivables', interest: 'Pumps', type: 'EXISTING_DEALER',
      score: 60, temperature: 'WARM', language: ['South', 'East'].includes(p.region) ? 'English' : 'Hindi', phone: p.phone, email: p.email, stage: 'QUALIFIED', attempts: 0, assignedTo: p.salespersonId, dnd: false, createdAt: `${so.date}T06:00:00.000Z`,
      qualification: { budget: '', requirement: `Advance for ${so.number}`, timeline: 'This week', location: p.city }, partnerId: p.id, soNo: so.number, amountDue: so.total, notes: '', campaignId: null,
    })
  }

  // ------------------------------------------------------------ campaigns
  const campaigns = [
    {
      id: 'cmp1', number: 'CMP-101', name: 'Kharif Sprayer Dealer Drive', type: 'PROMOTIONAL', scriptId: 'scr1', status: 'COMPLETED', voice: settings.voice, language: 'Hindi',
      audience: { interests: ['Spraying Equipment', 'Pumps'], temperatures: [], sources: [], regions: [], stages: [] }, schedule: { mode: 'NOW', windowFrom: '10:00', windowTo: '19:00' }, retry: { maxAttempts: 3, gapMinutes: 120, retryOn: ['NO_ANSWER'] }, pace: 12, callerId: 'cid1',
      createdBy: 'u4', createdAt: `${daysAgo(14)}T04:30:00.000Z`, startedAt: `${daysAgo(13)}T04:40:00.000Z`, completedAt: `${daysAgo(12)}T12:10:00.000Z`, queue: [], current: null, processed: 0, retries: 0,
    },
    {
      id: 'cmp2', number: 'CMP-102', name: 'Diwali Dealer Onboarding Blitz', type: 'ENQUIRY_FOLLOW_UP', scriptId: 'scr1', status: 'PAUSED', voice: settings.voice, language: 'Hindi',
      audience: { temperatures: ['HOT', 'WARM'], sources: [], regions: [], stages: [], interests: [] }, schedule: { mode: 'NOW', windowFrom: '10:00', windowTo: '19:00' }, retry: { maxAttempts: 3, gapMinutes: 90, retryOn: ['NO_ANSWER'] }, pace: 12, callerId: 'cid1',
      createdBy: 'u4', createdAt: `${daysAgo(1)}T04:00:00.000Z`, startedAt: minsAgo(320), pausedAt: minsAgo(15), queue: [], current: null, processed: 0, retries: 2,
    },
    {
      id: 'cmp3', number: 'CMP-103', name: 'Advance payment reminders – open orders', type: 'PAYMENT_FOLLOW_UP', scriptId: 'scr2', status: 'DRAFT', voice: 'Kabir (Male · Hindi-English)', language: 'Hindi',
      audience: { sources: ['ERP Receivables'], temperatures: [], regions: [], stages: [], interests: [] }, schedule: { mode: 'SCHEDULED', startAt: `${addDays(today(), 1)}T05:00:00.000Z`, windowFrom: '11:00', windowTo: '18:00' }, retry: { maxAttempts: 2, gapMinutes: 240, retryOn: ['NO_ANSWER'] }, pace: 6, callerId: 'cid1',
      createdBy: 'u4', createdAt: minsAgo(90), queue: [], current: null, processed: 0, retries: 0,
    },
  ]

  // ------------------------------------------------------------ calls (history)
  const calls = []
  let callNo = 4700
  const users = core.users
  const products = core.products
  const mk = (lead, outcome, startedAt, campaign, attempt = 1, direction = 'OUTBOUND') => {
    const c = buildCall({ lead, outcome, campaign, settings, products, users, startedAt, number: `CL-${++callNo}`, attempt, direction, rnd })
    c.id = `call${callNo}`
    calls.push(c)
    return c
  }
  const finalOutcome = (l) => (l.score >= 75 ? (rnd() < 0.6 ? 'APPOINTMENT' : 'INTERESTED') : l.score >= 55 ? (rnd() < 0.6 ? 'INTERESTED' : 'CALLBACK') : l.score >= 35 ? (rnd() < 0.5 ? 'CALLBACK' : 'NO_ANSWER') : rnd() < 0.6 ? 'NOT_INTERESTED' : 'NO_ANSWER')
  const todayLeads = new Set(['lead1', 'lead8', 'lead14', 'lead19', 'lead21', 'lead25', 'lead28', 'lead31', 'lead4', 'lead6', 'lead12', 'lead26', 'lead3', 'lead17'])
  const finalLeads = []
  leads.forEach((l, i) => {
    if (i >= 32 && i < 36) return // fresh leads not yet called
    if (l.type === 'EXISTING_DEALER') {
      if (i % 2 === 0) { const c = mk(l, 'PROMISE_TO_PAY', `${daysAgo(2)}T07:${10 + i}:00.000Z`, null); finalLeads.push([l, c]) }
      return
    }
    const camp = l.interest === 'Spraying Equipment' || (l.interest === 'Pumps' && i % 2) ? campaigns[0] : null
    let last = null
    const prior = 1 + Math.floor(rnd() * 2)
    for (let k = 0; k < prior; k++) {
      const d = 13 - k * 3 - (i % 3)
      last = mk(l, k === 0 && rnd() < 0.5 ? 'NO_ANSWER' : 'CALLBACK', isoAt(daysAgo(Math.max(2, d)), 5 + (i % 8), (i * 7) % 60), camp, k + 1)
    }
    if (!todayLeads.has(l.id)) last = mk(l, finalOutcome(l), isoAt(daysAgo(1 + (i % 5)), 6 + (i % 7), (i * 13) % 60), camp, prior + 1, i % 9 === 0 ? 'INBOUND' : 'OUTBOUND')
    finalLeads.push([l, last])
  })
  // today: paused Diwali campaign
  ;[...todayLeads].forEach((id, k) => {
    const l = leads.find((x) => x.id === id)
    const outcome = id === 'lead8' || id === 'lead1' || id === 'lead31' ? 'APPOINTMENT' : finalOutcome(l)
    const c = mk(l, outcome, minsAgo(300 - k * 20), campaigns[1], 1)
    const fl = finalLeads.find((x) => x[0].id === id)
    if (fl) fl[1] = c
    l.campaignId = 'cmp2'
  })
  // apply call history to leads (keep seeded score as the final value)
  for (const l of leads) {
    const mine = calls.filter((c) => c.leadId === l.id).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    let cur = { ...l }
    for (const c of mine) cur = leadAfterCall(cur, c, settings)
    Object.assign(l, { stage: mine.length ? cur.stage : l.stage, attempts: mine.length, lastCalledAt: cur.lastCalledAt || null, lastOutcome: cur.lastOutcome || null, lastSentiment: cur.lastSentiment || null, nextFollowUp: cur.nextFollowUp || null })
    if (!l.campaignId && mine.some((c) => c.campaignId === 'cmp1')) l.campaignId = 'cmp1'
  }
  // queue for paused campaign: remaining HOT/WARM leads not yet called today
  const remaining = leads.filter((l) => ['HOT', 'WARM'].includes(l.temperature) && !l.dnd && !todayLeads.has(l.id) && l.type !== 'EXISTING_DEALER').slice(0, 9)
  campaigns[1].leadIds = [...todayLeads, ...remaining.map((l) => l.id)]
  campaigns[1].total = campaigns[1].leadIds.length
  campaigns[1].processed = todayLeads.size
  campaigns[1].queue = remaining.map((l) => ({ leadId: l.id, attempt: 1 }))
  const c1calls = calls.filter((c) => c.campaignId === 'cmp1')
  campaigns[0].leadIds = [...new Set(c1calls.map((c) => c.leadId))]
  campaigns[0].total = campaigns[0].leadIds.length
  campaigns[0].processed = c1calls.length
  campaigns[0].retries = c1calls.filter((c) => c.attempt > 1).length

  // ------------------------------------------------------------ appointments
  const L = (id) => leads.find((l) => l.id === id)
  const callOf = (id) => calls.filter((c) => c.leadId === id).slice(-1)[0]?.id || null
  const appointments = [
    { id: 'appt1', leadId: 'lead8', assignedTo: 'u5', at: `${today()}T12:00:00`, type: 'SITE_VISIT', status: 'SCHEDULED' },
    { id: 'appt2', leadId: 'lead1', assignedTo: 'u5', at: `${today()}T16:30:00`, type: 'SITE_VISIT', status: 'SCHEDULED' },
    { id: 'appt3', leadId: 'lead31', assignedTo: 'u5', at: `${addDays(today(), 1)}T11:30:00`, type: 'DEMO', status: 'SCHEDULED' },
    { id: 'appt4', leadId: 'lead25', assignedTo: 'u6', at: `${addDays(today(), 1)}T15:00:00`, type: 'DEMO', status: 'SCHEDULED' },
    { id: 'appt5', leadId: 'lead17', assignedTo: 'u7', at: `${daysAgo(2)}T11:00:00`, type: 'SITE_VISIT', status: 'COMPLETED', feedback: 'Met owner Gopal ji – keen on 20 L dual-motor sprayers. Shared KYC checklist; onboarding form to be filled this week.', attendance: 'ATTENDED' },
    { id: 'appt6', leadId: 'lead4', assignedTo: 'u7', at: `${daysAgo(1)}T17:00:00`, type: 'DEMO', status: 'MISSED', feedback: 'Customer not available at site – garage closed for Diwali cleaning.', attendance: 'NO_SHOW' },
    { id: 'appt7', leadId: 'lead28', assignedTo: 'u5', at: `${daysAgo(3)}T12:30:00`, type: 'SITE_VISIT', status: 'COMPLETED', feedback: 'Wants spares range for 3 talukas; sample order of seals & capacitors likely next week.', attendance: 'ATTENDED' },
  ].map((a) => ({ ...a, callId: callOf(a.leadId), location: `${L(a.leadId).company}, ${L(a.leadId).city}`, feedback: a.feedback || '', createdAt: `${daysAgo(4)}T06:00:00.000Z` }))
  for (const a of appointments) {
    const l = L(a.leadId)
    if (a.status === 'SCHEDULED') { l.stage = 'APPOINTMENT'; l.nextFollowUp = a.at.slice(0, 10) }
  }

  // ------------------------------------------------------------ scripts
  const scripts = [
    {
      id: 'scr1', name: 'Dealer acquisition & enquiry follow-up', purpose: 'ENQUIRY_FOLLOW_UP', language: 'Hindi', voice: settings.voice, active: true, version: 7, updatedAt: `${daysAgo(3)}T09:00:00.000Z`, updatedBy: 'u4', createdAt: `${daysAgo(60)}T09:00:00.000Z`,
      greeting: 'Namaste {{customer_name}} ji, main Aarohi Btali International se bol rahi hoon. Aapne {{product_interest}} ke liye enquiry ki thi – kya do minute baat ho sakti hai?',
      about: { profile: 'Btali International is a Mumbai-based importer and distributor of Btali-branded pumps, air compressors, vacuum cleaners, pressure washers, spraying equipment and genuine spares, supplying 400+ dealers across India.', contact: 'Sales helpline 1800 270 1100 · WhatsApp +91 98200 11000 · sales@btali.in', locations: 'Head office: Andheri (E), Mumbai · Warehouse: Starex 3PL, Bhiwandi · Btali stores: Pune, Ahmedabad, Jaipur, Bengaluru', hours: 'Mon–Sat, 10:00 AM – 7:00 PM' },
      qualification: [
        { key: 'budget', question: 'Pehle order ke liye aapka approximate budget kitna rahega?' },
        { key: 'requirement', question: 'Aapko kaun se products chahiye – pumps, sprayers, compressors ya pressure washers?' },
        { key: 'timeline', question: 'Aap stock kab tak lena chahenge?' },
      ],
      context: { productIds: ['p2', 'p4', 'p9', 'p16', 'p17', 'p20', 'p21'], pricing: 'Dealer price = MRP less 50% base discount; Tier-A dealers get an extra 2%. Bulk slabs: 10+ units +2%, 25+ units +4%.', paymentPlans: '100% advance via NEFT/RTGS for new dealers; credit of 15 days after 6 months of regular business.', offers: 'Diwali Dhamaka: extra 5% on pressure washers and compressors till 15 Nov. Buy 10 battery sprayers, get 1 free.' },
      closing: { siteVisit: 'Offer a store visit with live demo by the regional sales executive within 72 hours. Confirm date, time and address.', callback: 'If busy, book a callback at the customer\'s preferred time and confirm it on WhatsApp.', nextAction: 'Send brochure + dealer price list on WhatsApp immediately after the call.' },
      faqs: [
        { q: 'Warranty kitni hai?', a: 'Sabhi machines par 12 mahine ki warranty hai, sprayers aur cordless products par 6 mahine. Service network sabhi regions me hai.', keywords: ['warranty', 'guarantee'] },
        { q: 'Delivery kitne din me hogi?', a: 'Payment ke baad 24 ghante me dispatch hota hai, aur 3–7 din me delivery.', keywords: ['delivery', 'dispatch', 'kitne din'] },
        { q: 'Minimum order kitna hai?', a: 'Naye dealer ke liye minimum order ₹50,000 ka hai, mix products allowed hain.', keywords: ['minimum', 'moq'] },
        { q: 'Price kya hai?', a: 'Dealer ko MRP par 50% base discount milta hai, plus current scheme. Detailed price list WhatsApp pe bhej deti hoon.', keywords: ['price', 'rate', 'kitna', 'cost'] },
      ],
      objections: [
        { objection: 'Already stock another brand', keywords: ['crompton', 'kirloskar', 'already', 'dusra brand'], response: 'Bilkul, aap Btali ko saath me rakh sakte hain – humara dealer margin 8–10% zyada hai aur 15 din ki replacement guarantee hai.' },
        { objection: 'Price is high', keywords: ['mehenga', 'costly', 'expensive', 'zyada'], response: 'Humare products imported grade ke hain, aur slab discount se 25+ units par extra 4% milta hai. Ek trial order se shuru kar sakte hain.' },
        { objection: 'No time now', keywords: ['busy', 'baad me', 'later', 'time nahi'], response: 'Koi baat nahi, aap bataiye kis samay callback karun? Main WhatsApp pe confirm kar deti hoon.' },
      ],
      flow: [
        { title: 'Greet & confirm identity', text: 'Time-based greeting, confirm the person and permission to talk.' },
        { title: 'Reference enquiry', text: 'Mention source of enquiry and product interest.' },
        { title: 'Qualify', text: 'Ask the 3 qualification questions: budget, requirement, timeline.' },
        { title: 'Pitch', text: 'Share best-seller, dealer pricing guideline and the live scheme.' },
        { title: 'Handle objections', text: 'Use objection library; escalate to human if price negotiation is requested.' },
        { title: 'Close', text: 'Book store visit / demo or callback; confirm on WhatsApp; update lead score.' },
      ],
    },
    {
      id: 'scr2', name: 'Advance payment reminder', purpose: 'PAYMENT_FOLLOW_UP', language: 'Hindi', voice: 'Kabir (Male · Hindi-English)', active: true, version: 3, updatedAt: `${daysAgo(9)}T09:00:00.000Z`, updatedBy: 'u4', createdAt: `${daysAgo(40)}T09:00:00.000Z`,
      greeting: 'Namaste {{customer_name}} ji, main Kabir Btali International se. Aapke order {{order_no}} ke {{amount_due}} advance ke baare me ek reminder tha.',
      about: { profile: 'Btali International – accounts & collections desk.', contact: 'Accounts: 98200 11009 · accounts@btali.in', locations: 'Mumbai', hours: 'Mon–Sat, 10:00 AM – 6:00 PM' },
      qualification: [
        { key: 'payDate', question: 'Payment kab tak ho jayega?' },
        { key: 'mode', question: 'NEFT/RTGS karenge ya UPI?' },
        { key: 'contact', question: 'UTR kis number par share karenge?' },
      ],
      context: { productIds: [], pricing: 'Amount as per order confirmation.', paymentPlans: 'HDFC Bank current a/c 50200011223344, IFSC HDFC0000240 · UPI btali@hdfcbank', offers: 'Same-day dispatch on payment before 2 PM.' },
      closing: { siteVisit: '—', callback: 'If the dealer disputes the amount, transfer to Accounts.', nextAction: 'Record promise-to-pay date; Accounts verifies receipt.' },
      faqs: [{ q: 'Bank details kya hain?', a: 'HDFC Bank current account 50200011223344, IFSC HDFC0000240. UPI: btali@hdfcbank.', keywords: ['bank', 'account', 'ifsc', 'upi'] }],
      objections: [{ objection: 'Will pay after delivery', keywords: ['delivery ke baad', 'after delivery', 'credit'], response: 'New dealers ke liye advance policy hai; 6 mahine ke regular business ke baad credit enable ho jata hai.' }],
      flow: [
        { title: 'Greet & reference order', text: 'Mention order number and pending amount.' },
        { title: 'Ask for date', text: 'Capture promise-to-pay date and mode.' },
        { title: 'Confirm & close', text: 'Share bank details on WhatsApp; notify Accounts.' },
      ],
    },
  ]

  // ------------------------------------------------------------ WhatsApp knowledge base
  const K = (id, intent, category, question, keywords, answer, quickReplies = [], extra = {}) => ({ id, intent, category, question, keywords, answer, quickReplies, active: true, hits: Math.floor(rnd() * 120) + 4, createdAt: `${daysAgo(50)}T06:00:00.000Z`, updatedAt: `${daysAgo(Math.floor(rnd() * 20))}T06:00:00.000Z`, updatedBy: 'u4', ...extra })
  const knowledge = [
    K('kb1', 'COMPANY_PROFILE', 'Company', 'Who is Btali International?', ['about btali', 'about you', 'company', 'who are you', 'btali kaun'], 'Btali International (Mumbai) imports and distributes Btali-brand pumps, air compressors, vacuum cleaners, pressure washers, spraying equipment and genuine spares through 400+ dealers across India. 🇮🇳', ['Product prices', 'Become a dealer']),
    K('kb2', 'BUSINESS_HOURS', 'Company', 'What are your working hours?', ['working hours', 'timing', 'open', 'office time', 'kab khulta'], 'Our team is available Mon–Sat, 10:00 AM – 7:00 PM. This WhatsApp assistant answers 24×7. 🕙'),
    K('kb3', 'CONTACT', 'Company', 'How can I contact Btali?', ['contact', 'phone number', 'email', 'helpline', 'toll free', 'call number'], 'Sales helpline: 1800 270 1100 (toll-free)\nWhatsApp: +91 98200 11000\nEmail: sales@btali.in\nService: service@btali.in', ['Talk to executive']),
    K('kb4', 'LOCATIONS', 'Company', 'Where is your office / warehouse?', ['office', 'address', 'warehouse', 'location', 'showroom'], 'Head office: Andheri (E), Mumbai. Central warehouse: Starex 3PL, Bhiwandi. Btali stores: Pune, Ahmedabad, Jaipur and Bengaluru. 📍 https://maps.google.com/?q=Btali+International+Mumbai'),
    K('kb5', 'DEALERSHIP', 'Dealership', 'How do I become a Btali dealer?', ['dealership', 'become a dealer', 'distributor'], 'Becoming a Btali dealer is simple: ✅ GST registration ✅ PAN & cancelled cheque ✅ minimum first order ₹50,000. Dealers get 50% off MRP, seasonal schemes, marketing material and a dealer portal for 24×7 ordering.', ['Talk to executive']),
    K('kb6', 'WARRANTY_POLICY', 'Warranty', 'What warranty do you give?', ['warranty period', 'guarantee period'], 'Pumps, compressors, vacuum cleaners and pressure washers carry a 12-month warranty (borewell pumps 18 months). Sprayers, cordless products and tyre inflators carry 6 months. Spares: 3 months against manufacturing defects.'),
    K('kb7', 'RETURN_POLICY', 'Policies', 'What is your return / replacement policy?', ['return', 'replace', 'replacement', 'exchange', 'refund'], 'Manufacturing defects reported within 15 days of sale are replaced directly by the dealer. After that, repairs are handled under warranty by our service network. Transit damage must be reported within 48 hours with photos.'),
    K('kb8', 'PAYMENT_MODES', 'Pricing', 'What are your bank / payment details?', ['payment details', 'bank details', 'neft', 'rtgs', 'upi', 'account number', 'ifsc'], '💳 HDFC Bank – Btali International\nA/c 50200011223344 · IFSC HDFC0000240\nUPI: btali@hdfcbank\nPlease share the UTR here after payment so we can dispatch the same day.'),
    K('kb9', 'PAYMENT_TERMS', 'Pricing', 'Do you give credit?', ['credit', 'payment terms', 'udhaar', 'advance'], 'New dealers work on 100% advance. After 6 months of regular business, credit up to 15 days can be enabled by our accounts team.'),
    K('kb10', 'DELIVERY_TIME', 'Orders', 'How long does delivery take?', ['delivery time', 'how many days', 'kitne din', 'transit time', 'shipping'], 'Orders paid before 2 PM are dispatched the same day from Bhiwandi. Transit: Maharashtra/Gujarat 1–3 days, North & South 3–6 days, East & North-East 5–8 days. 🚚 You get the LR copy on WhatsApp and email.'),
    K('kb11', 'GST_INVOICE', 'Orders', 'Will I get a GST invoice? / invoice copy', ['gst', 'invoice', 'bill', 'invoice copy', 'e-way'], 'Every order is billed with a GST tax invoice and e-way bill, emailed automatically at dispatch. Need a copy? Our executive will share it here.', ['Talk to executive']),
    K('kb12', 'PLACE_ORDER', 'Orders', 'How do I place an order?', ['place order', 'how to order', 'order kaise', 'book order', 'order karna'], 'Registered dealers can order 24×7 on the Btali Dealer Portal (portal.btali.in) or just send the model codes and quantities here – our sales executive will confirm the order and share payment details. 🛒', ['Talk to executive', 'Payment details']),
    K('kb13', 'SERVICE_CENTRES', 'Service', 'Where is the nearest service centre?', ['service centre', 'service center', 'repair centre', 'mechanic'], 'We have authorised service partners in 120+ cities. Share your PIN code and we will send the nearest centre. You can also raise a service request here – just describe the problem.', ['Raise service request']),
    K('kb14', 'DEALER_LOCATOR', 'Dealership', 'Where can I buy Btali products?', ['where to buy', 'kaha milega', 'kahan milega', 'nearest dealer', 'shop near'], 'Btali products are sold by 400+ dealers. Nearby: Pune – Shree Ganesh Hardware · Rajkot – Patel Agri Equipments · Jaipur – Royal Hardware Stores · Bengaluru – Deccan Pump House. Share your city for the closest dealer. 📍'),
    K('kb15', 'PUMP_SELECTION', 'Products', 'Which pump HP do I need?', ['which pump', 'kaun sa pump', 'hp chahiye', 'pump selection', 'head'], 'Rule of thumb: up to 25 m head & 1-inch pipe → 0.5 HP monoblock; up to 35 m or overhead tank on 3rd floor → 1 HP; open well → openwell submersible; borewell 100 m+ → V4 1.5 HP submersible. Share your depth & pipe size for an exact suggestion.', ['Pumps']),
    K('kb16', 'BROCHURE', 'Products', 'Please send your catalogue / brochure', ['brochure', 'catalogue', 'catalog', 'pdf', 'price list'], 'Here is our 2026 product catalogue with specifications and MRPs. 📄', ['Product prices', 'Become a dealer'], { attachment: { name: 'Btali-Product-Catalogue-2026.pdf', size: 2480000 } }),
    K('kb17', 'SCHEMES_OFFERS', 'Pricing', 'Any current schemes / offers?', ['scheme', 'offer', 'diwali', 'festival', 'promotion'], '🪔 Diwali Dhamaka (till 15 Nov): extra 5% on pressure washers & compressors. Buy 10 battery sprayers, get 1 free. Slab bonus: 25+ units get an extra 4%.', ['Place order', 'Talk to executive']),
    K('kb18', 'INSTALLATION', 'Service', 'Do you provide installation?', ['installation', 'install', 'fitting', 'lagwana'], 'Installation for borewell & openwell pumps is arranged through our local dealer / plumber network at nominal charges. Compressors, washers and vacuums are plug-and-play – a video guide is included.'),
    K('kb19', 'DEMO_REQUEST', 'Products', 'Can I get a product demo?', ['demo', 'demonstration', 'trial'], 'Yes! We arrange free demos for workshops, car-wash owners, hotels and farms. Share your address and preferred time – our regional executive will confirm. 📅', ['Talk to executive']),
    K('kb20', 'EXPORT', 'Company', 'Do you export?', ['export', 'nepal', 'bangladesh', 'sri lanka', 'international'], 'Yes, we supply distributors in Nepal, Bangladesh, Sri Lanka and Africa in USD. Please share your company details and our export team will contact you.', ['Talk to executive']),
    K('kb21', 'SPRAYER_BATTERY', 'Products', 'How long does a battery sprayer run?', ['battery backup', 'charging', 'battery life', 'kitni der'], 'Our 16 L sprayer (12 V 8 Ah) sprays 12–14 tanks on a full charge; the 20 L dual-motor sprayer 10–12 tanks. Full charge takes 6–8 hours. Replacement Li-ion batteries (SP-BAT8) are available.'),
  ]

  // ------------------------------------------------------------ WhatsApp contacts
  const TAGS = { Pumps: 'Pumps', 'Spraying Equipment': 'Sprayers', 'Pressure Washers': 'Pressure Washers', 'Air Compressors': 'Compressors', 'Vacuum Cleaners': 'Vacuum', 'Spare Parts': 'Spares' }
  const contacts = []
  core.partners.filter((p) => p.type !== 'EXPORT').forEach((p, i) => contacts.push({
    id: `wct_${p.id}`, name: p.contact, business: p.name, phone: p.phone, city: p.city, state: p.state, region: p.region, type: p.type === 'FRANCHISE' ? 'FRANCHISE' : p.stage === 'IN_DECISION' ? 'PROSPECT' : 'DEALER', partnerId: p.id,
    tags: [['Pumps', 'Sprayers'], ['Pumps', 'Compressors'], ['Pressure Washers', 'Vacuum'], ['Sprayers', 'Spares']][i % 4].concat(i % 3 === 0 ? ['Diwali-2026'] : []), language: ['South', 'East'].includes(p.region) ? 'English' : 'Hindi', optOut: p.stage === 'DEAD', source: 'ERP', createdAt: `${daysAgo(200 - i)}T06:00:00.000Z`, lastMessageAt: null,
  }))
  leads.filter((l) => l.type !== 'EXISTING_DEALER').forEach((l, i) => contacts.push({
    id: `wct_${l.id}`, name: l.name, business: l.company, phone: l.phone, city: l.city, state: l.state, region: l.region, type: l.type === 'END_CUSTOMER' || l.type === 'INSTITUTIONAL' ? 'END_CUSTOMER' : l.type === 'RETAILER' ? 'RETAILER' : 'PROSPECT', leadId: l.id,
    tags: [TAGS[l.interest]].concat(l.type === 'INSTITUTIONAL' && l.interest === 'Pressure Washers' ? ['Car Wash'] : l.type === 'END_CUSTOMER' ? ['Farmers'] : []), language: l.language === 'English' || l.language === 'Tamil' ? 'English' : 'Hindi', optOut: i === 7, source: l.source, createdAt: l.createdAt, lastMessageAt: null,
  }))
  const extraC = [
    ['Meena Sharma', 'Jaipur', 'Rajasthan', 'North', 'END_CUSTOMER', ['Pumps']], ['Rohan Mishra', 'Bhopal', 'Madhya Pradesh', 'Central', 'PROSPECT', ['Pumps', 'Sprayers']],
    ['Kishore Bhatt', 'Surat', 'Gujarat', 'West', 'END_CUSTOMER', ['Pressure Washers', 'Car Wash']], ['Farhan Ali', 'Aurangabad', 'Maharashtra', 'West', 'RETAILER', ['Compressors']],
  ]
  extraC.forEach(([name, city, state, region, type, tags], i) => contacts.push({ id: `wct_x${i + 1}`, name, business: '', phone: `97${String(65012340 + i * 40519).slice(0, 8)}`, city, state, region, type, tags, language: 'Hindi', optOut: i === 3, source: 'WhatsApp', createdAt: `${daysAgo(6 - i)}T06:00:00.000Z`, lastMessageAt: null }))

  // ------------------------------------------------------------ WhatsApp conversations (scripted turns; bot replies via engine)
  const engineState = { ...core, waKnowledge: knowledge, aiSettings: settings, aiLeads: leads }
  const ticketNo = core.tickets[0]?.number || 'TKT-01201'
  const openSO = (pid) => core.salesOrders.filter((s) => s.partnerId === pid && !['DELIVERED', 'CANCELLED'].includes(s.status)).sort((a, b) => b.date.localeCompare(a.date))[0] || core.salesOrders.find((s) => s.partnerId === pid)
  const wBarcode = (pid) => (core.warranties.find((w) => w.partnerId === pid) || core.warranties[3] || core.warranties[0])?.barcode
  const contactBy = (pred) => contacts.find(pred)
  const conversations = []
  const build = ({ id, contact, startMins, turns, status = 'BOT', agentId = null, resolved = false, csat = null, escalationReason = null, unread = 0, tags = [] }) => {
    let t = startMins
    const c = { id, contactId: contact.id, name: contact.name, phone: contact.phone, city: contact.city, partnerId: contact.partnerId || null, language: contact.language, status, takeover: status === 'AGENT', agentId, unread, fallbacks: 0, messages: [], ticketIds: [], createdAt: minsAgo(startMins), tags, escalationReason, csat, awaitingCsat: false }
    for (const [who, text, extra = {}] of turns) {
      const ts = minsAgo(t)
      t = Math.max(0, t - (who === 'c' ? 1 : 2))
      if (who === 'c') {
        c.messages.push({ id: uid('m'), from: 'customer', text, ts, kind: 'text', ...extra })
        if (extra.noBot) continue
        const res = waBotAnswer(engineState, c, text)
        const bts = new Date(new Date(ts).getTime() + 2000).toISOString()
        for (const m of res.messages) c.messages.push({ id: uid('m'), from: 'bot', ts: bts, status: 'read', intent: res.intent, confidence: res.confidence, ...m, text: m.text.replace('{{ticket}}', ticketNo) })
        c.fallbacks = res.intent === 'FALLBACK' ? c.fallbacks + 1 : 0
        for (const e of res.effects) {
          if (e.type === 'ASK_CSAT') c.awaitingCsat = true
          if (e.type === 'CSAT') { c.csat = e.value; c.awaitingCsat = false }
          if (e.type === 'HANDOVER') { c.escalationReason = e.reason; c.escalatedAt = ts }
          if (e.type === 'TICKET') c.ticketIds = [core.tickets[0]?.id].filter(Boolean)
        }
      } else if (who === 'a') c.messages.push({ id: uid('m'), from: 'agent', by: agentId, text, ts, kind: extra.attachment ? 'document' : 'text', status: 'read', ...extra })
      else if (who === 'b') c.messages.push({ id: uid('m'), from: 'bot', text, ts, kind: 'text', status: 'read', intent: 'FOLLOW_UP', ...extra })
      else c.messages.push({ id: uid('m'), from: 'system', text, ts, kind: 'text' })
    }
    c.lastAt = c.messages[c.messages.length - 1].ts
    if (resolved) { c.status = 'RESOLVED'; c.resolvedAt = c.lastAt; c.awaitingCsat = false }
    if (agentId && !c.firstAgentReplyAt) c.firstAgentReplyAt = c.messages.find((m) => m.from === 'agent')?.ts
    conversations.push(c)
  }
  const ganesh = contactBy((c) => c.partnerId === 'd2')
  const soG = openSO('d2')
  build({ id: 'wa1', contact: ganesh, startMins: 2900, resolved: true, turns: [['c', 'Namaste'], ['c', `${soG?.number || 'SO/26-27/0001'} status?`], ['c', 'Thanks'], ['c', '5']] })
  build({ id: 'wa2', contact: contactBy((c) => c.name === 'Anita Deshmukh'), startMins: 1500, resolved: true, turns: [['c', 'Battery sprayer price kya hai?'], ['c', 'BT-BS16'], ['c', 'Dhanyavad'], ['c', '4']] })
  build({ id: 'wa3', contact: contactBy((c) => c.name === 'Imtiaz Qureshi'), startMins: 22, status: 'WAITING_AGENT', unread: 1, tags: ['Car Wash'], turns: [['c', 'Hi'], ['c', 'Commercial pressure washer 3 kW price?'], ['c', 'Need 5 pieces for my car wash chain, give best price']] })
  const kaveri = contactBy((c) => c.partnerId === 'd3')
  build({ id: 'wa4', contact: kaveri, startMins: 64, status: 'AGENT', agentId: 'u4', tags: ['Service'], turns: [['c', `Warranty check ${wBarcode('d3')}`], ['c', 'Customer says motor making noise and not working properly'], ['s', 'Priya Desai joined the conversation'], ['a', 'Hello Kumaravel ji, Priya here from Btali. I have assigned your ticket to Imran from our service team – he will call the customer today.'], ['c', 'Ok madam, please do it fast. Customer is regular buyer.', { noBot: true }], ['a', 'Sure. Replacement will be arranged if the motor is found defective. 🙏']] })
  build({ id: 'wa5', contact: contactBy((c) => c.name === 'Rohan Mishra'), startMins: 180, turns: [['c', 'Hello'], ['c', 'I want dealership for Btali pumps'], ['c', 'Bhopal, MP – hardware shop hai', { noBot: true }], ['b', 'Thank you! Our executive for Central India, Rohit Kulkarni, will call you today between 4 and 6 PM. 📞']] })
  build({ id: 'wa6', contact: contactBy((c) => c.name === 'Farhan Ali'), startMins: 45, status: 'WAITING_AGENT', unread: 2, turns: [['c', 'EMI option milega kya Bajaj Finserv se?'], ['c', 'EMI pe lena hai']] })
  build({ id: 'wa7', contact: contactBy((c) => c.name === 'Swati Joshi'), startMins: 1300, resolved: true, csat: 5, tags: ['Car Wash'], turns: [['c', 'Please send brochure'], ['c', 'Do you give demo?'], ['c', 'Thanks'], ['c', '5']] })
  const patel = contactBy((c) => c.partnerId === 'd5')
  const invP = core.invoices.find((i) => i.partnerId === 'd5' && i.lr) || core.invoices.find((i) => i.partnerId === 'd5')
  build({ id: 'wa8', contact: patel, startMins: 3400, resolved: true, agentId: 'u5', csat: 5, turns: [['c', 'Diwali scheme kya hai?'], ['c', 'Place order'], ['s', 'Rohit Kulkarni joined the conversation'], ['a', 'Hasmukh bhai, 20 battery sprayers + 2 free under the scheme – order confirmed, payment details shared on email.'], ['a', `LR copy for your last dispatch ${invP?.number || ''}`, { attachment: { name: `LR-${invP?.lr?.number || '88231'}.pdf`, size: 182000 }, docType: 'LR' }], ['s', 'Rohit Kulkarni handed the chat back to Btali Assistant'], ['c', 'Thank you'], ['c', '5']] })
  build({ id: 'wa9', contact: contactBy((c) => c.name === 'Meena Sharma'), startMins: 600, resolved: true, csat: 4, turns: [['c', 'Monoblock Pump 1 HP ka price?'], ['c', 'Jaipur me kahan milega?'], ['c', 'ok thanks'], ['c', '4']] })
  const sai = contactBy((c) => c.partnerId === 'd8')
  build({ id: 'wa10', contact: sai, startMins: 190, turns: [['c', 'Air Compressor 50 L 2 HP stock hai?'], ['c', 'Payment details']] })
  build({ id: 'wa11', contact: contactBy((c) => c.optOut && c.type !== 'DEALER') || contacts[30], startMins: 4300, resolved: true, turns: [['b', '🪔 Diwali Dhamaka is live! Extra 5% on pressure washers & compressors till 15 Nov.', { intent: 'CAMPAIGN', campaignId: 'wcp1' }], ['c', 'STOP']] })
  build({ id: 'wa12', contact: contactBy((c) => c.name === 'Pooja Mehra'), startMins: 6, unread: 1, turns: [['c', 'Hi, industrial vacuum 60 L price?'], ['c', 'Can we get a demo at our hotel in Gurugram?']] })
  for (const c of conversations) { const ct = contacts.find((x) => x.id === c.contactId); if (ct) ct.lastMessageAt = c.lastAt }

  // ------------------------------------------------------------ WhatsApp campaigns
  const at = (d, h, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`).toISOString()
  const waCampaigns = [
    {
      id: 'wcp1', number: 'WAC-021', name: 'Diwali Dhamaka – dealer offer', type: 'FESTIVAL', category: 'MARKETING', templateName: 'btali_diwali_offer_v2', language: 'Hindi',
      segment: { types: ['DEALER', 'FRANCHISE'], tags: [], cities: [], languages: [] }, message: 'Namaste {{name}} ji! 🪔 Diwali Dhamaka is live – extra 5% on pressure washers & compressors and Buy 10 sprayers Get 1 FREE till 15 Nov. Reply ORDER to book or tap below.',
      attachment: { name: 'Diwali-Dhamaka-Scheme.pdf', size: 860000 }, buttons: ['Place order', 'Talk to sales'], productId: 'p17', status: 'SENT', scheduledAt: at(daysAgo(6), 10), createdBy: 'u4', createdAt: `${daysAgo(8)}T06:00:00.000Z`, submittedAt: `${daysAgo(8)}T07:00:00.000Z`, submittedBy: 'u4', approvedBy: 'u1', approvedAt: `${daysAgo(7)}T05:00:00.000Z`, remark: 'Approved – keep scheme dates clear.', sentAt: at(daysAgo(6), 10, 4),
      stats: { targeted: 24, excludedOptOut: 1, sent: 24, delivered: 23, read: 19, replied: 6, failed: 1, optedOut: 1 },
      history: [{ ts: `${daysAgo(8)}T06:00:00.000Z`, text: 'Campaign drafted' }, { ts: `${daysAgo(8)}T07:00:00.000Z`, text: 'Submitted for approval by Priya Desai' }, { ts: `${daysAgo(7)}T05:00:00.000Z`, text: 'Approved by Vikram Mehta – Approved – keep scheme dates clear.' }, { ts: at(daysAgo(6), 10, 4), text: 'Broadcast completed – 23 delivered, 19 read, 6 replies' }],
    },
    {
      id: 'wcp2', number: 'WAC-022', name: 'Rabi season sprayer launch', type: 'PROMOTION', category: 'MARKETING', templateName: 'btali_product_launch_v1', language: 'Hindi',
      segment: { types: [], tags: ['Sprayers', 'Farmers'], cities: [], languages: [] }, message: 'Namaste {{name}} ji 🌾 Rabi season ke liye naya Btali 20 L Dual-Motor Battery Sprayer – 12 tanks per charge, 6 months warranty. Intro price for {{city}} dealers. Reply YES for price list.',
      attachment: { name: 'BT-BS20-Leaflet.pdf', size: 540000 }, buttons: ['Get price list', 'Talk to sales'], productId: 'p21', status: 'PENDING_APPROVAL', scheduledAt: at(addDays(today(), 2), 10), createdBy: 'u4', createdAt: minsAgo(260), submittedAt: minsAgo(180), submittedBy: 'u4', stats: null,
      history: [{ ts: minsAgo(260), text: 'Campaign drafted' }, { ts: minsAgo(180), text: 'Submitted for approval by Priya Desai' }],
    },
    {
      id: 'wcp3', number: 'WAC-023', name: 'Car-wash owners – pressure washer promo', type: 'PROMOTION', category: 'MARKETING', templateName: 'btali_carwash_promo_v1', language: 'English',
      segment: { types: [], tags: ['Car Wash', 'Pressure Washers'], cities: [], languages: [] }, message: 'Hi {{name}} 🚗 Upgrade your car wash with the Btali 2200 W Induction Pressure Washer – 150 bar, copper motor, 12-month warranty. Festive price valid this week only.',
      attachment: null, buttons: ['Book demo', 'Price'], productId: 'p17', status: 'SCHEDULED', scheduledAt: at(addDays(today(), 1), 11), createdBy: 'u4', createdAt: `${daysAgo(2)}T06:00:00.000Z`, submittedAt: `${daysAgo(2)}T07:00:00.000Z`, submittedBy: 'u4', approvedBy: 'u1', approvedAt: `${daysAgo(1)}T05:30:00.000Z`, remark: 'OK', stats: null,
      history: [{ ts: `${daysAgo(2)}T06:00:00.000Z`, text: 'Campaign drafted' }, { ts: `${daysAgo(2)}T07:00:00.000Z`, text: 'Submitted for approval by Priya Desai' }, { ts: `${daysAgo(1)}T05:30:00.000Z`, text: 'Approved by Vikram Mehta – OK · scheduled' }],
    },
    {
      id: 'wcp4', number: 'WAC-024', name: 'Pune service camp reminder', type: 'REMINDER', category: 'UTILITY', templateName: 'btali_service_camp_v1', language: 'Hindi',
      segment: { types: [], tags: [], cities: ['Pune', 'Satara', 'Kolhapur'], languages: [] }, message: 'Namaste {{name}} ji, Btali free service camp at Btali Store Pune this Sunday 10 AM – 5 PM. Bring your pump / sprayer for a free check-up. 🔧',
      attachment: null, buttons: ['Get directions'], productId: null, status: 'DRAFT', scheduledAt: null, createdBy: 'u4', createdAt: minsAgo(40), stats: null, history: [{ ts: minsAgo(40), text: 'Campaign drafted' }],
    },
  ]

  const unanswered = [
    { id: 'unq1', question: 'EMI option milega kya Bajaj Finserv se?', convId: 'wa6', name: 'Farhan Ali', ts: minsAgo(45), status: 'OPEN' },
    { id: 'unq2', question: 'Do you have solar pump with controller?', convId: null, name: 'Tapan Saha', ts: minsAgo(1900), status: 'OPEN' },
    { id: 'unq3', question: 'Pressure washer ke saath foam cannon free hai?', convId: null, name: 'Kishore Bhatt', ts: minsAgo(3100), status: 'OPEN' },
    { id: 'unq4', question: 'Can I pay by cheque?', convId: null, name: 'Rakesh Tiwari', ts: minsAgo(5200), status: 'ANSWERED', kbId: 'kb8' },
  ]

  return {
    aiLeads: leads, aiCampaigns: campaigns, aiCalls: calls.sort((a, b) => b.startedAt.localeCompare(a.startedAt)), aiScripts: scripts, aiAppointments: appointments, aiSettings: settings, aiVisits: [],
    waConversations: conversations.sort((a, b) => b.lastAt.localeCompare(a.lastAt)), waContacts: contacts, waCampaigns, waKnowledge: knowledge, waUnanswered: unanswered,
  }
}
