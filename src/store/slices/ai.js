// Store actions for the "ai" module: AI Calling Bot (leads, campaigns, calls, scripts, appointments, settings)
// and WhatsApp Chatbot (conversations, bot engine, contacts, campaigns, knowledge base).
// Long-running simulations (campaign dialers, WhatsApp broadcasts, scheduler) keep their timers at module scope so they
// survive page navigation; `aiResumeRunners()` re-attaches them after a reload and is idempotent.
import { uid, nowISO, today, addDays, round2, sum, fmtINR, fmtDate } from '../../lib/format'
import { quotePrice } from '../../lib/pricing'
import { available } from '../../lib/stock'
import { checkWarranty } from '../../lib/warranty'

// ------------------------------------------------------------------ constants
export const CALL_OUTCOMES = {
  APPOINTMENT: { label: 'Appointment booked', tone: 'green', color: '#059669' },
  INTERESTED: { label: 'Interested', tone: 'teal', color: '#0d9488' },
  CALLBACK: { label: 'Callback', tone: 'blue', color: '#0284c7' },
  PROMISE_TO_PAY: { label: 'Promise to pay', tone: 'violet', color: '#7c3aed' },
  NOT_INTERESTED: { label: 'Not interested', tone: 'red', color: '#dc2626' },
  NO_ANSWER: { label: 'No answer', tone: 'gray', color: '#94a3b8' },
}
export const LEAD_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'APPOINTMENT', 'CONVERTED', 'LOST']
export const LEAD_SOURCES = ['Website', 'IndiaMART', 'Facebook Ads', 'Google Ads', 'Trade Fair', 'Referral', 'Missed Call', 'WhatsApp', 'CSV Import']
export const CAMPAIGN_TYPES = { PROMOTIONAL: 'Promotional', ENQUIRY_FOLLOW_UP: 'Enquiry follow-up', REMINDER: 'Appointment reminder', PAYMENT_FOLLOW_UP: 'Payment follow-up' }
export const tempOf = (score, s) => (score >= (s?.scoring?.hot ?? 70) ? 'HOT' : score >= (s?.scoring?.warm ?? 40) ? 'WARM' : 'COLD')
export const fmtDur = (sec) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '0:00')

const CAT_PRODUCT = { Pumps: 'p2', 'Air Compressors': 'p9', 'Vacuum Cleaners': 'p12', 'Pressure Washers': 'p16', 'Spraying Equipment': 'p20', 'Spare Parts': 'p26' }
const CAT_HI = { Pumps: 'pump', 'Air Compressors': 'compressor', 'Vacuum Cleaners': 'vacuum cleaner', 'Pressure Washers': 'pressure washer', 'Spraying Equipment': 'battery sprayer', 'Spare Parts': 'spare parts' }
const isoMinus = (mins, from = Date.now()) => new Date(from - mins * 60000).toISOString()
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length]
const firstName = (n = '') => n.replace(/^(Mr\.?|Mrs\.?|Ms\.?|Dr\.?)\s+/i, '').split(' ')[0]
const daypart = (d = new Date()) => { const h = d.getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening' }

// ------------------------------------------------------------------ call outcome model
export const pickOutcome = (lead, campaignType, rnd = Math.random) => {
  const r = rnd()
  const dist = campaignType === 'PAYMENT_FOLLOW_UP'
    ? [['PROMISE_TO_PAY', 0.5], ['CALLBACK', 0.2], ['NOT_INTERESTED', 0.05], ['NO_ANSWER', 0.25]]
    : lead.temperature === 'HOT' ? [['APPOINTMENT', 0.3], ['INTERESTED', 0.3], ['CALLBACK', 0.15], ['NOT_INTERESTED', 0.05], ['NO_ANSWER', 0.2]]
      : lead.temperature === 'WARM' ? [['APPOINTMENT', 0.14], ['INTERESTED', 0.28], ['CALLBACK', 0.2], ['NOT_INTERESTED', 0.13], ['NO_ANSWER', 0.25]]
        : [['APPOINTMENT', 0.05], ['INTERESTED', 0.15], ['CALLBACK', 0.15], ['NOT_INTERESTED', 0.3], ['NO_ANSWER', 0.35]]
  let acc = 0
  for (const [o, p] of dist) { acc += p; if (r < acc) return o }
  return 'NO_ANSWER'
}
const SCORE_DELTA = { APPOINTMENT: 25, INTERESTED: 15, CALLBACK: 5, PROMISE_TO_PAY: 8, NOT_INTERESTED: -20, NO_ANSWER: -3 }
const SENTIMENT = { APPOINTMENT: ['POSITIVE', 0.82], INTERESTED: ['POSITIVE', 0.58], CALLBACK: ['NEUTRAL', 0.12], PROMISE_TO_PAY: ['NEUTRAL', 0.28], NOT_INTERESTED: ['NEGATIVE', -0.46], NO_ANSWER: [null, 0] }

/** Build transcript + summary for a call. Hindi = Hinglish, everything else English. */
const transcriptFor = (lead, outcome, ctx) => {
  const f = firstName(lead.name)
  const hi = lead.language === 'Hindi' || lead.language === 'Marathi' || lead.language === 'Gujarati'
  const { bot, product, mrp, sp, appt, cat, amount, soNo, inbound, rnd } = ctx
  const L = []
  const ai = (text) => L.push({ who: 'AI', text })
  const cu = (text) => L.push({ who: 'CUSTOMER', text })
  let unanswered = []
  if (outcome === 'NO_ANSWER') return { lines: [], unanswered }
  if (inbound) {
    ai(hi ? `Good ${daypart()}! Btali International me aapka swagat hai. Main ${bot} bol rahi hoon, aapki kya madad kar sakti hoon?` : `Good ${daypart()}! Thank you for calling Btali International. This is ${bot}, how may I help you today?`)
    cu(hi ? `Haan ji, mujhe ${cat} ke baare me jaankari chahiye. ${lead.city} me ${lead.company ? 'dukaan hai humari' : 'ghar ke liye chahiye'}.` : `Hi, I wanted details on your ${cat} range. We are based in ${lead.city}.`)
  } else if (outcome === 'PROMISE_TO_PAY') {
    ai(hi ? `Namaste ${f} ji, main ${bot} Btali International se bol rahi hoon. Aapke order ${soNo} ke baare me ek chhota sa reminder tha.` : `Hello ${f}, this is ${bot} from Btali International calling about your order ${soNo}.`)
    cu(hi ? 'Haan boliye.' : 'Yes, go ahead.')
  } else {
    ai(hi ? `Namaste ${f} ji, main ${bot} Btali International se bol rahi hoon. Aapne ${lead.source === 'Trade Fair' ? 'trade fair me' : 'humari website pe'} ${cat} ke liye enquiry ki thi. Kya do minute baat ho sakti hai?` : `Good ${daypart()} ${f}, this is ${bot} from Btali International. You had enquired about our ${cat} range${lead.source === 'Trade Fair' ? ' at the trade fair' : ''}. Is this a good time to talk?`)
  }
  if (outcome === 'APPOINTMENT') {
    cu(hi ? `Haan ji boliye. ${lead.company ? `${lead.company} ke liye` : 'Hume'} ${cat} ka stock rakhna hai, season aa raha hai.` : `Yes, sure. We want to stock ${cat}s at ${lead.company || 'our store'} before the season.`)
    ai(hi ? `Bahut badhiya. Humara ${product} sabse zyada chalta hai – MRP ${fmtINR(mrp)}, dealer ko base 50% discount aur abhi Diwali scheme bhi chal rahi hai. Monthly kitne piece ki requirement rahegi?` : `Great. Our best seller is the ${product} at an MRP of ${fmtINR(mrp)}; dealers get a 50% base discount plus the running festive scheme. What monthly volume do you expect?`)
    cu(hi ? 'Approx 20-25 piece mahina. Pehle order me 2 lakh tak ka maal lenge.' : 'Around 20 to 25 units a month. First order would be around 2 lakh.')
    ai(hi ? `Theek hai. Humare sales executive ${sp} aapke ${lead.city} store pe demo ke saath aa sakte hain. ${appt} chalega?` : `Perfect. Our sales executive ${sp} can visit your ${lead.city} store with a live demo. Would ${appt} work?`)
    cu(hi ? 'Haan chalega, subah 11 baje ke baad aaiye.' : 'Yes, that works. After 11 in the morning please.')
    ai(hi ? `Confirmed – ${appt}. Main abhi aapko WhatsApp pe brochure aur price list bhej rahi hoon. Dhanyavaad ${f} ji!` : `Confirmed for ${appt}. I am sending the brochure and price list on WhatsApp right away. Thank you, ${f}!`)
  } else if (outcome === 'INTERESTED') {
    cu(hi ? `Haan, ${cat} ka rate kya hai? Aur warranty kitni dete ho?` : `Yes, what are your rates for ${cat}s? And what warranty do you give?`)
    ai(hi ? `${product} ka MRP ${fmtINR(mrp)} hai, dealer price lagbhag aadha padta hai. 12 mahine ki warranty hai aur service ${lead.region} region me humare service partner karte hain.` : `The ${product} has an MRP of ${fmtINR(mrp)}; dealer pricing works out to roughly half. It carries a 12-month warranty with service support across the ${lead.region} region.`)
    if (rnd() < 0.35) {
      cu(hi ? 'Solar pump bhi milta hai kya aapke yahan?' : 'Do you also supply solar pumps?')
      ai(hi ? 'Is par main aapko humari team se confirm karwa deti hoon, wo aapko call karenge.' : 'Let me get our product team to confirm that for you – they will call you back.')
      unanswered = ['Do you supply solar pumps?']
    }
    cu(hi ? 'Theek hai, price list WhatsApp kar dijiye. Next week decide karenge.' : 'Okay, send me the price list on WhatsApp. I will decide next week.')
    ai(hi ? `Zaroor, abhi bhej rahi hoon. ${sp} aapko teen din me follow-up karenge. Dhanyavaad!` : `Sure, sending it now. ${sp} will follow up with you in three days. Thank you!`)
  } else if (outcome === 'CALLBACK') {
    cu(hi ? 'Abhi main market me hoon, shaam ko 6 baje ke baad call kijiye.' : 'I am in a meeting right now. Can you call me after 6 PM?')
    ai(hi ? 'Bilkul, main shaam 6 baje callback schedule kar deti hoon. Dhanyavaad!' : 'Absolutely, I have scheduled a callback at 6 PM today. Thank you!')
  } else if (outcome === 'NOT_INTERESTED') {
    cu(hi ? 'Humare paas already Crompton aur Kirloskar ka stock hai, naya brand abhi nahi chahiye.' : 'We already stock Crompton and Kirloskar. Not looking at a new brand right now.')
    ai(hi ? 'Samajh sakti hoon. Btali me dealer margin 8-10% zyada hai aur 15 din me replacement guarantee hai. Ek baar sample order try karenge?' : 'Understood. Btali offers 8-10% higher dealer margins and a 15-day replacement guarantee. Would you consider a small trial order?')
    cu(hi ? 'Nahi, abhi zaroorat nahi hai. Baad me dekhenge.' : 'No, not now. Maybe later.')
    ai(hi ? 'Koi baat nahi. Kabhi zaroorat ho to WhatsApp 98200 11000 pe message kar dijiye. Dhanyavaad!' : 'No problem. Whenever you need, just WhatsApp us on 98200 11000. Thank you for your time!')
  } else if (outcome === 'PROMISE_TO_PAY') {
    ai(hi ? `Aapke order ka ${fmtINR(amount)} advance pending hai. Payment hote hi same day dispatch ho jayega.` : `An advance of ${fmtINR(amount)} is pending; dispatch happens the same day payment is received.`)
    cu(hi ? 'Haan, Friday tak NEFT kar dunga. UTR WhatsApp kar dunga.' : 'Yes, I will do the NEFT by Friday and share the UTR on WhatsApp.')
    ai(hi ? 'Dhanyavaad. Maine Friday ka payment promise note kar liya hai, Accounts team ko inform kar rahi hoon.' : 'Thank you. I have noted your payment commitment for Friday and informed our accounts team.')
  }
  return { lines: L, unanswered }
}

/** Generate a complete call record (pure). */
export const buildCall = ({ lead, outcome, campaign, settings, products, users, startedAt, number, attempt = 1, direction = 'OUTBOUND', rnd = Math.random, handledBy = 'AI' }) => {
  const prodId = (lead.productIds && lead.productIds[0]) || CAT_PRODUCT[lead.interest] || 'p2'
  const product = products.find((p) => p.id === prodId) || products[0]
  const spUser = users.find((u) => u.id === lead.assignedTo)
  const apptDate = addDays(today(), 1 + Math.floor(rnd() * 3))
  const appt = `${fmtDate(apptDate)}, 11:30 AM`
  const bot = (settings?.voice || 'Aarohi').split(' ')[0]
  const { lines, unanswered } = transcriptFor(lead, outcome, {
    bot, product: product?.name, mrp: product?.mrp, sp: spUser ? spUser.name.split(' ')[0] : 'our executive', appt, cat: CAT_HI[lead.interest] || 'pump',
    amount: lead.amountDue || 48500, soNo: lead.soNo || 'your last order', inbound: direction === 'INBOUND', rnd,
  })
  let t = 2
  const transcript = lines.map((l) => { const at = t; t += Math.max(6, Math.round(l.text.length / 7)) + Math.floor(rnd() * 5); return { ...l, t: at } })
  const connected = outcome !== 'NO_ANSWER'
  const durationSec = connected ? t + 3 : 0
  const ringSec = connected ? 6 + Math.floor(rnd() * 10) : 30
  const rate = settings?.costPerMin ?? 3.2
  const cost = round2(connected ? Math.ceil(durationSec / 60) * rate + 0.4 : 0.4)
  const [sentiment, sScore] = SENTIMENT[outcome]
  const first = firstName(lead.name)
  const summary = {
    APPOINTMENT: `${first} (${lead.company || lead.city}) wants to stock ${CAT_HI[lead.interest] || 'products'} – ~20-25 units/month, first order ≈ ₹2 lakh. Store visit with demo booked for ${appt}. Brochure sent on WhatsApp.`,
    INTERESTED: `${first} asked about ${CAT_HI[lead.interest] || 'product'} pricing and warranty. Price list shared on WhatsApp; decision expected next week.${unanswered.length ? ' Raised a question the bot could not answer (solar pumps).' : ''}`,
    CALLBACK: `${first} was busy and asked for a callback after 6 PM today.`,
    NOT_INTERESTED: `${first} already stocks competing brands (Crompton / Kirloskar). Objection handled with margin and replacement guarantee; still not interested.`,
    PROMISE_TO_PAY: `${first} confirmed payment of ${fmtINR(lead.amountDue || 48500)} for ${lead.soNo || 'the pending order'} by Friday via NEFT.`,
    NO_ANSWER: `No answer after ${ringSec}s ring (attempt ${attempt}).`,
  }[outcome]
  const nextAction = {
    APPOINTMENT: `Visit by ${spUser?.name || 'sales executive'} on ${appt}`,
    INTERESTED: 'Follow-up call in 3 days with dealer price sheet',
    CALLBACK: 'Callback today after 6:00 PM',
    NOT_INTERESTED: 'Re-engage after 60 days with seasonal scheme',
    PROMISE_TO_PAY: 'Accounts to verify receipt on Friday',
    NO_ANSWER: attempt < (campaign?.retry?.maxAttempts || settings?.maxAttempts || 3) ? `Retry in ${campaign?.retry?.gapMinutes || settings?.retryGapMin || 120} min` : 'Max attempts reached – move to WhatsApp nurture',
  }[outcome]
  return {
    id: uid('call'), number, leadId: lead.id, campaignId: campaign?.id || null, direction, startedAt, attempt,
    status: connected ? 'CONNECTED' : 'NO_ANSWER', outcome, durationSec, ringSec, cost, sentiment, sentimentScore: sScore,
    language: lead.language || 'Hindi', voice: campaign?.voice || settings?.voice || 'Aarohi', transcript, summary, nextAction,
    scoreDelta: SCORE_DELTA[outcome], unanswered, handledBy, followUps: connected && ['APPOINTMENT', 'INTERESTED'].includes(outcome) ? ['WhatsApp: brochure & price list'] : [],
    apptDate: outcome === 'APPOINTMENT' ? apptDate : null, taskId: null, recording: connected ? `REC-${number}.mp3` : null,
  }
}

/** Patch a lead after a call. */
export const leadAfterCall = (lead, call, settings) => {
  const score = Math.max(0, Math.min(100, (lead.score || 0) + (call.scoreDelta || 0)))
  const stage = call.outcome === 'APPOINTMENT' ? 'APPOINTMENT'
    : call.outcome === 'INTERESTED' ? (lead.stage === 'APPOINTMENT' ? 'APPOINTMENT' : 'QUALIFIED')
      : call.outcome === 'NOT_INTERESTED' ? (score < 20 ? 'LOST' : 'CONTACTED')
        : lead.stage === 'NEW' ? 'CONTACTED' : lead.stage
  const nextFollowUp = call.outcome === 'CALLBACK' ? today() : call.outcome === 'INTERESTED' ? addDays(today(), 3) : call.outcome === 'APPOINTMENT' ? call.apptDate : call.outcome === 'NO_ANSWER' ? addDays(today(), 1) : call.outcome === 'NOT_INTERESTED' ? addDays(today(), 60) : addDays(today(), 3)
  return { ...lead, score, temperature: tempOf(score, settings), stage: lead.stage === 'CONVERTED' ? 'CONVERTED' : stage, attempts: (lead.attempts || 0) + 1, lastCalledAt: call.startedAt, lastOutcome: call.outcome, nextFollowUp, lastSentiment: call.sentiment || lead.lastSentiment }
}

// ------------------------------------------------------------------ WhatsApp bot engine (pure)
const CAT_WORDS = {
  Pumps: /\b(pump|pumps|motor|monoblock|submersible|borewell|openwell|booster|sewage)\b/,
  'Air Compressors': /\b(compressor|compressors|inflator)\b/,
  'Vacuum Cleaners': /\b(vacuum|vaccum|cleaner)\b/,
  'Pressure Washers': /\b(pressure washers?|washers?|car wash|jet wash)\b/,
  'Spraying Equipment': /\b(sprayer|sprayers|spray|mist blower|knapsack|htp)\b/,
  'Spare Parts': /\b(spare|spares|seal|impeller|capacitor|filter|hose|nozzle|battery|lance|brush|trigger gun|valve|pressure switch|piston)\b/,
}
const STOP = new Set(['the', 'a', 'of', 'for', 'and', 'with', 'kya', 'hai', 'ka', 'ki', 'ke', 'me', 'price', 'rate', 'what', 'is', 'how', 'much', 'mrp', 'stock', 'available', 'need', 'want', 'chahiye', 'kitna', 'kitne', 'please', 'pls', 'bhai', 'ji', 'sir', 'details'])
const tokens = (s) => s.toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w))

export const findProducts = (state, t) => {
  const prods = (state.products || []).filter((p) => p.active !== false)
  const skuHit = prods.find((p) => t.includes(p.sku.toLowerCase()))
  if (skuHit) return { exact: skuHit, category: skuHit.category, list: [skuHit] }
  const cat = Object.keys(CAT_WORDS).find((c) => CAT_WORDS[c].test(t))
  const tk = tokens(t)
  const scored = prods.map((p) => {
    const nt = tokens(`${p.name} ${p.shortName || ''}`)
    const hit = nt.filter((w) => tk.includes(w)).length
    return { p, s: hit + (cat && p.category === cat ? 1.5 : 0) }
  }).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s || b.p.popularity - a.p.popularity)
  if (scored.length && (scored.length === 1 || scored[0].s > scored[1].s) && scored[0].s >= 3) return { exact: scored[0].p, category: scored[0].p.category, list: [scored[0].p] }
  const list = cat ? prods.filter((p) => p.category === cat).sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 4) : scored.slice(0, 4).map((x) => x.p)
  return { exact: null, category: cat || null, list }
}
export const stockLabel = (state, productId) => {
  const q = available(state, productId)
  return q > 50 ? { label: 'In stock – ready to dispatch', tone: 'green', qty: q } : q > 0 ? { label: `Limited stock (${q} units)`, tone: 'amber', qty: q } : { label: 'Out of stock – next container due soon', tone: 'red', qty: 0 }
}
const GREET_QR = ['Product prices', 'Order status', 'Warranty check', 'Become a dealer', 'Talk to executive']

/**
 * Decide the bot reply for a customer message. Returns
 * { intent, confidence, messages:[{text, kind, productId, price, mrp, stock, quick}], effects:[{type,...}] }
 * Effects are applied by the store (ticket creation, handover, lead capture, CSAT, opt-out, unanswered log).
 */
export const waBotAnswer = (state, conv, rawText) => {
  const text = String(rawText || '').trim()
  const t = text.toLowerCase()
  const wa = state.aiSettings?.wa || {}
  const botName = wa.botName || 'Btali Assistant'
  const hindi = /\b(kya|hai|hain|chahiye|kitna|kitne|bhai|kab|mera|meri|nahi|haan|karo|kijiye|bataiye|aap|hoga|milega)\b/.test(t)
  const partner = conv?.partnerId ? (state.partners || []).find((p) => p.id === conv.partnerId) : null
  const out = { intent: 'FALLBACK', confidence: 0.3, messages: [], effects: [] }
  const say = (txt, extra = {}) => out.messages.push({ text: txt, kind: 'text', ...extra })
  const set = (intent, confidence) => { out.intent = intent; out.confidence = confidence }
  const kb = (state.waKnowledge || []).filter((k) => k.active !== false)
  const kbBy = (intent) => kb.find((k) => k.intent === intent)

  if (!t) { set('FALLBACK', 0); say('Please type your question – for example "price of 1 HP pump" or "status of SO/26-27/0012".'); return out }

  // feedback after a CSAT prompt
  if (conv?.awaitingCsat && /^[1-5](\s*(star|stars|⭐)?)?$/.test(t)) {
    const v = Number(t[0])
    set('FEEDBACK', 0.99)
    say(v >= 4 ? `Thank you for rating us ${v}/5! 🙏 Have a great day.` : `Thank you for the ${v}/5 rating. We're sorry we fell short – a supervisor will review this conversation.`)
    out.effects.push({ type: 'CSAT', value: v })
    return out
  }
  if (/^(stop|unsubscribe|opt out|optout)$/.test(t)) {
    set('OPT_OUT', 0.99)
    say('You have been unsubscribed from Btali promotional messages. You can still message us here any time for support. Reply START to subscribe again.')
    out.effects.push({ type: 'OPT_OUT', value: true })
    return out
  }
  if (/^start$/.test(t)) { set('OPT_IN', 0.99); say('Welcome back! You are subscribed to Btali offers and updates again.'); out.effects.push({ type: 'OPT_OUT', value: false }); return out }

  // human handover
  if (/\b(agent|human|executive|representative|real person|talk to (someone|sales)|call me|baat karni|baat karwao|insaan|manager)\b/.test(t)) {
    set('HUMAN_HANDOVER', 0.95)
    say(hindi ? 'Bilkul ji, main aapko humare sales executive se connect kar raha hoon. Working hours (10 AM – 7 PM) me 5 minute ke andar reply milega. 🙏' : 'Sure – I am connecting you to a Btali sales executive. During working hours (10 AM – 7 PM, Mon–Sat) someone will reply within 5 minutes. 🙏')
    out.effects.push({ type: 'HANDOVER', reason: 'Customer requested an executive' })
    return out
  }
  // greeting
  if (/^(hi+|hello+|hey+|helo|namaste|namaskar|good (morning|afternoon|evening)|hii+|hlo|ram ram)\b/.test(t) && t.length < 30) {
    set('GREETING', 0.97)
    const nm = conv?.name ? ` ${firstName(conv.name)}` : ''
    say(`${wa.autoGreeting || `Namaste${nm}! 👋 Welcome to Btali International – pumps, air compressors, vacuum cleaners, pressure washers & sprayers.`}\nI'm ${botName}. How can I help you today?`, { quick: GREET_QR })
    return out
  }
  // negotiation → escalate (with list price if we know the product)
  if (/\b(discount|best price|best rate|last price|kam karo|kam kijiye|negotiat|bulk rate|lowest|final price)\b/.test(t)) {
    set('NEGOTIATION', 0.9)
    const fp = findProducts(state, t)
    if (fp.exact) say(`${fp.exact.name} – MRP ${fmtINR(fp.exact.mrp)}.`)
    say(hindi ? 'Special rate / bulk discount ke liye main aapko humare sales executive se connect kar raha hoon – wo aapko best offer denge.' : 'For special pricing and bulk discounts I am handing you over to our sales executive, who will share the best offer for your volume.')
    out.effects.push({ type: 'HANDOVER', reason: 'Negotiation / special price request' })
    return out
  }
  // order status by SO number
  const soM = text.match(/\bSO\s*[/#-]?\s*(?:(\d{2})\s*-\s*(\d{2})\s*\/\s*)?(\d{1,4})\b/i)
  if (soM) {
    const num = soM[1] ? `SO/${soM[1]}-${soM[2]}/${soM[3].padStart(4, "0")}` : `SO/26-27/${soM[3].padStart(4, "0")}`
    const so = (state.salesOrders || []).find((s) => s.number === num)
    set('ORDER_STATUS', 0.96)
    if (!so) { say(`I couldn't find order ${num}. Please check the number on your order confirmation email (format SO/26-27/0001).`); return out }
    if (partner && so.partnerId !== partner.id) { say(`Order ${num} is not linked to this WhatsApp number. For security, order details are shared only with the registered dealer mobile.`); return out }
    const inv = so.invoiceId ? (state.invoices || []).find((i) => i.id === so.invoiceId) : null
    const tr = (state.transporters || []).find((x) => x.id === (inv?.transporterId || so.transporterId))
    const st = { PENDING_REVIEW: 'received and under review by our sales team', CONFIRMED: 'confirmed – awaiting advance payment', PAID: 'paid – being packed at our Bhiwandi warehouse', INVOICED: 'invoiced – handed to transporter', DISPATCHED: 'dispatched', DELIVERED: 'delivered', CANCELLED: 'cancelled' }[so.status] || so.status
    const lines = [`📦 *${so.number}* (${fmtDate(so.date)})`, `Status: ${st}`, `Value: ${fmtINR(so.total)} · Payment: ${so.paymentStatus === 'PAID' ? 'received ✅' : so.paymentStatus === 'PARTIAL' ? `partial (${fmtINR(so.paidAmount)})` : 'pending'}`]
    if (inv) lines.push(`Invoice: ${inv.number}`)
    if (inv?.lr) lines.push(`LR: ${inv.lr.number} via ${tr?.name || 'transporter'} (${fmtDate(inv.lr.date)})`)
    else if (tr) lines.push(`Transporter: ${tr.name}`)
    say(lines.join('\n'), { quick: inv ? ['Send invoice copy', 'Talk to executive'] : ['Payment details', 'Talk to executive'] })
    return out
  }
  // warranty by barcode / warranty number
  const bcM = text.match(/\b((PUMP|COMP|VAC|PWS|SPRY|SP)\d{6}|WR[-/A-Z0-9]{4,})\b/i)
  if (bcM) {
    const w = checkWarranty(state, bcM[1])
    set('WARRANTY_CHECK', 0.95)
    if (!w.found) { say(`Serial ${bcM[1].toUpperCase()} was not found. Please share the barcode printed on the product sticker (e.g. PUMP001234).`); return out }
    const c = w.customer
    say([`🛡️ *${w.product?.name}*`, `Serial: ${w.code}`, c.registered ? `Warranty: ${c.valid ? `valid till ${fmtDate(c.end)} (${c.daysLeft} days left) ✅` : `expired on ${fmtDate(c.end)}`}` : 'Warranty not registered yet – register at your dealer or reply "register" with your bill photo.', w.partner ? `Sold by: ${w.partner.name}, ${w.partner.city}` : ''].filter(Boolean).join('\n'),
    { quick: c.valid ? ['Raise service request', 'Talk to executive'] : ['Buy spare parts', 'Talk to executive'] })
    return out
  }
  // complaint → ticket
  if (/\b(not working|complaint|defect|defective|problem|issue|kharab|band ho|chal nahi|leak|leakage|repair|service request|raise service|broken|damage|damaged|noise)\b/.test(t)) {
    set('COMPLAINT', 0.9)
    const fp = findProducts(state, t)
    out.effects.push({ type: 'TICKET', category: /damage/.test(t) ? 'DAMAGE_IN_TRANSIT' : 'PRODUCT_DEFECT', productId: fp.exact?.id || null, subject: `${fp.exact ? fp.exact.shortName || fp.exact.name : 'Product'} – ${text.slice(0, 60)}`, description: text, priority: /urgent|jaldi|immediately/.test(t) ? 'HIGH' : 'MEDIUM' })
    say(hindi ? 'Asuvidha ke liye maafi chahte hain. 🙏 Aapki service request *{{ticket}}* register ho gayi hai. Humari service team 24 ghante me aapko call karegi. Product ka barcode aur photo share karenge to jaldi resolve hoga.' : 'Sorry for the trouble. 🙏 Your service request *{{ticket}}* has been registered. Our service team will call you within 24 hours. Sharing the product barcode and a photo will help us resolve it faster.', { quick: ['Check warranty', 'Talk to executive'] })
    return out
  }
  if (/\b(warranty|guarantee|garanty)\b/.test(t)) {
    set('WARRANTY_CHECK', 0.8)
    const k = kbBy('WARRANTY_POLICY')
    say(`${k ? `${k.answer}\n\n` : ''}To check your product's warranty, please type the barcode on the sticker (e.g. PUMP001234).`, { quick: ['Raise service request', 'Talk to executive'] })
    if (k) out.effects.push({ type: 'KB_HIT', id: k.id })
    return out
  }
  if (/\b(order status|my order|track|tracking|dispatch|dispatched|delivery|lr copy|kab aayega|kab milega|order kab)\b/.test(t) || t === 'order status') {
    set('ORDER_STATUS', 0.85)
    const mine = partner ? (state.salesOrders || []).filter((s) => s.partnerId === partner.id && !['DELIVERED', 'CANCELLED'].includes(s.status)).slice(0, 3) : []
    if (mine.length) say(`Here are your open orders, ${partner.contact?.split(' ')[0] || ''}:\n${mine.map((s) => `• ${s.number} – ${fmtINR(s.total)} – ${s.status.replace('_', ' ').toLowerCase()}`).join('\n')}\n\nType an order number for full details.`, { quick: mine.map((s) => s.number) })
    else say('Please share your order number (e.g. SO/26-27/0012) and I will check the status for you.')
    return out
  }
  // dealership → KB + lead capture
  if (/\b(dealer|dealership|distributor|distributorship|franchise|agency|stockist)\b/.test(t)) {
    set('DEALERSHIP', 0.9)
    const k = kbBy('DEALERSHIP')
    say(k ? k.answer : 'We appoint dealers across India with attractive margins, schemes and marketing support.', { quick: ['Talk to executive', 'Product prices'] })
    say('I have shared your interest with our sales team – an executive will call you within one working day. Which city is your shop in?')
    if (k) out.effects.push({ type: 'KB_HIT', id: k.id })
    out.effects.push({ type: 'LEAD', interest: Object.keys(CAT_WORDS).find((c) => CAT_WORDS[c].test(t)) || 'Pumps' })
    return out
  }
  if (/^(product prices|products|catalogue|product range)$/.test(t)) {
    set('PRODUCT_PRICE', 0.85)
    say('We sell pumps, air compressors, vacuum cleaners, pressure washers, spraying equipment and genuine spares. Which product are you looking for?', { quick: ['Pumps', 'Pressure washers', 'Sprayers', 'Compressors', 'Vacuum cleaners'] })
    return out
  }
  // product price / availability
  const priceIntent = /\b(price|prices|rate|rates|cost|kitna|kitne|mrp|daam|stock|available|availability|milega|catalog|catalogue|range|models?)\b/.test(t) || t === 'product prices'
  const fp = findProducts(state, t)
  if (fp.exact || (fp.category && (priceIntent || fp.list.length))) {
    if (fp.exact) {
      const p = fp.exact
      const q = partner ? quotePrice(state, { productId: p.id, partnerId: partner.id }) : null
      const sl = stockLabel(state, p.id)
      set(/stock|available|availability|milega/.test(t) ? 'STOCK_CHECK' : 'PRODUCT_PRICE', 0.93)
      say(partner ? `Your dealer price for ${p.name} is ${fmtINR(q.unitPrice)} + GST (MRP ${fmtINR(p.mrp)}).` : `${p.name} is available at MRP ${fmtINR(p.mrp)} (incl. GST). Dealer pricing is shared with registered dealers.`, {
        kind: 'product', productId: p.id, price: partner ? q.unitPrice : p.mrp, mrp: p.mrp, stock: sl.label, stockTone: sl.tone, quick: ['Place order', 'Send brochure', 'Talk to executive'],
      })
      return out
    }
    set('PRODUCT_PRICE', 0.82)
    const rows = fp.list.map((p) => `• ${p.name} (${p.sku}) – MRP ${fmtINR(p.mrp)} · ${stockLabel(state, p.id).label.split(' –')[0]}`)
    if (rows.length) say(`Popular ${fp.category || 'products'}:\n${rows.join('\n')}\n\nReply with a model code for price & availability.`, { quick: fp.list.slice(0, 3).map((p) => p.sku) })
    else say('We sell pumps, air compressors, vacuum cleaners, pressure washers, spraying equipment and genuine spares. Which product are you looking for?', { quick: ['Pumps', 'Pressure washers', 'Sprayers', 'Compressors'] })
    return out
  }
  if (/^(pumps|compressors|vacuum cleaners|pressure washers|sprayers|spares)$/.test(t)) {
    set('PRODUCT_PRICE', 0.8)
    return waBotAnswer(state, conv, `${t} price`)
  }
  // knowledge base match
  let best = null
  for (const k of kb) {
    const kw = (k.keywords || []).filter((w) => w && t.includes(String(w).toLowerCase())).length
    const qt = tokens(k.question || '').filter((w) => w.length > 3 && t.includes(w)).length
    const s = kw * 1 + qt * 0.35
    if (s > 0 && (!best || s > best.s)) best = { k, s }
  }
  if (best && best.s >= 1) {
    set(best.k.intent, Math.min(0.95, 0.6 + best.s * 0.1))
    say(best.k.answer, { quick: best.k.quickReplies || [], attachment: best.k.attachment || null, kind: best.k.attachment ? 'document' : 'text' })
    out.effects.push({ type: 'KB_HIT', id: best.k.id })
    return out
  }
  if (/\b(thank|thanks|thx|dhanyavad|dhanyawad|shukriya|bye|ok thanks|great)\b/.test(t)) {
    set('THANKS', 0.9)
    say(wa.csatEnabled === false ? 'Happy to help! 😊' : 'Happy to help! 😊 How would you rate this chat? Reply with a number from 1 (poor) to 5 (excellent).', { quick: wa.csatEnabled === false ? [] : ['5', '4', '3', '2', '1'] })
    if (wa.csatEnabled !== false) out.effects.push({ type: 'ASK_CSAT' })
    return out
  }
  // fallback
  set('FALLBACK', 0.2)
  const handoverAfter = wa.handoverAfterFallbacks ?? 2
  if ((conv?.fallbacks || 0) + 1 >= handoverAfter) {
    say(hindi ? 'Maaf kijiye, is sawaal ka jawab mere paas abhi nahi hai. Main aapko humare executive se connect kar raha hoon.' : "I'm sorry, I don't have an approved answer for that yet. Let me connect you with a Btali executive who can help.")
    out.effects.push({ type: 'UNANSWERED' }, { type: 'HANDOVER', reason: 'Bot could not answer' })
  } else {
    say(hindi ? 'Maaf kijiye, main samajh nahi paaya. Kya aap thoda detail me bata sakte hain? Aap ye bhi pooch sakte hain:' : "Sorry, I didn't quite get that. Could you rephrase? You can also ask me about:", { quick: GREET_QR })
    out.effects.push({ type: 'UNANSWERED' })
  }
  return out
}

// ------------------------------------------------------------------ module-scope runners
const RUN = { calls: {}, wa: {}, sched: null, bot: {} }

export const aiSlice = (set, get) => {
  const S = () => get().aiSettings || {}
  const counter = (key, start = 1000) => {
    const n = ((S().counters || {})[key] || start) + 1
    set((s) => ({ aiSettings: { ...s.aiSettings, counters: { ...(s.aiSettings?.counters || {}), [key]: n } } }))
    return n
  }
  const upd = (col, id, fn) => get().updateItem(col, id, fn)
  const conv = (id) => (get().waConversations || []).find((c) => c.id === id)
  const msg = (from, text, extra = {}) => ({ id: uid('m'), from, text, ts: nowISO(), kind: 'text', ...extra })

  return {
    // ================================================================ runners
    aiResumeRunners: () => {
      for (const c of get().aiCampaigns || []) if (c.status === 'RUNNING') get()._aiStartTimer(c.id)
      for (const c of get().waCampaigns || []) if (c.status === 'SENDING') get()._waStartSend(c.id)
      if (!RUN.sched) {
        RUN.sched = setInterval(() => {
          const now = nowISO()
          for (const c of get().aiCampaigns || []) if (c.status === 'SCHEDULED' && c.schedule?.startAt && c.schedule.startAt <= now) get().aiStartCampaign(c.id)
          for (const c of get().waCampaigns || []) if (c.status === 'SCHEDULED' && c.scheduledAt && c.scheduledAt <= now) get().waSendCampaign(c.id)
        }, 15000)
      }
    },
    _aiStartTimer: (id) => {
      if (RUN.calls[id]) return
      const c = (get().aiCampaigns || []).find((x) => x.id === id)
      const ms = Math.max(800, Math.min(1500, Math.round(18000 / Math.max(1, c?.pace || 12))))
      RUN.calls[id] = setInterval(() => get()._aiTick(id), ms)
    },
    _aiStopTimer: (id) => { if (RUN.calls[id]) { clearInterval(RUN.calls[id]); delete RUN.calls[id] } },
    _aiTick: (id) => {
      const c = (get().aiCampaigns || []).find((x) => x.id === id)
      if (!c || c.status !== 'RUNNING') { get()._aiStopTimer(id); return }
      if (c.current) {
        const call = get().aiSimulateCall(c.current.leadId, { campaignId: id, attempt: c.current.attempt })
        const maxA = c.retry?.maxAttempts || S().maxAttempts || 3
        const retry = call && ['NO_ANSWER'].includes(call.outcome) && c.current.attempt < maxA && (c.retry?.retryOn || ['NO_ANSWER']).includes('NO_ANSWER')
        upd('aiCampaigns', id, (x) => ({
          ...x, current: null, processed: (x.processed || 0) + 1,
          queue: retry ? [...x.queue, { leadId: c.current.leadId, attempt: c.current.attempt + 1 }] : x.queue,
          retries: (x.retries || 0) + (retry ? 1 : 0),
        }))
        return
      }
      const queue = [...(c.queue || [])]
      let next = queue.shift()
      let skipped = 0
      const leads = get().aiLeads || []
      while (next && (leads.find((l) => l.id === next.leadId)?.dnd)) { skipped++; next = queue.shift() }
      if (!next) { get()._aiComplete(id, skipped); return }
      upd('aiCampaigns', id, (x) => ({ ...x, queue, dndSkipped: (x.dndSkipped || 0) + skipped, current: { ...next, since: nowISO() } }))
    },
    _aiComplete: (id, skipped = 0) => {
      get()._aiStopTimer(id)
      const c = upd('aiCampaigns', id, (x) => ({ ...x, status: 'COMPLETED', current: null, completedAt: nowISO(), dndSkipped: (x.dndSkipped || 0) + skipped }))
      if (!c) return
      const calls = (get().aiCalls || []).filter((k) => k.campaignId === id)
      const conn = calls.filter((k) => k.status === 'CONNECTED').length
      const appts = calls.filter((k) => k.outcome === 'APPOINTMENT').length
      const body = `${calls.length} calls · ${conn} connected · ${appts} appointments booked · cost ${fmtINR(sum(calls, (k) => k.cost))}`
      get().notify({ title: `Campaign completed: ${c.name}`, body, link: '/erp/ai-calling/campaigns', roles: ['SALES_MANAGER', 'ADMIN'] })
      const owner = get().users.find((u) => u.id === c.createdBy)
      if (owner) get().sendEmail({ to: owner.email, subject: `AI calling campaign completed – ${c.name}`, body: `Hi ${owner.name.split(' ')[0]},\n\nYour campaign "${c.name}" has finished.\n${body}.\n\nOpen Btali ERP → AI Calling Bot → Call Campaigns for the full results.`, ref: c.number, kind: 'AI_CALLING' })
    },

    // ================================================================ leads
    aiAddLead: (data) => {
      const s = S()
      const n = counter('LEAD', 1040)
      const score = data.score ?? 35
      const lead = { id: uid('lead'), number: `LD-${n}`, stage: 'NEW', score, temperature: tempOf(score, s), attempts: 0, language: 'Hindi', dnd: false, createdAt: nowISO(), assignedTo: null, notes: '', qualification: {}, ...data }
      if (!lead.assignedTo) lead.assignedTo = get()._aiNextAssignee(lead.region)
      set((st) => ({ aiLeads: [lead, ...(st.aiLeads || [])] }))
      get().audit('Lead created', 'Lead', `${lead.number} ${lead.name}`)
      return lead
    },
    _aiNextAssignee: (region) => {
      const execs = get().users.filter((u) => u.role === 'SALES_EXEC')
      const pool = execs.filter((u) => !region || (u.regions || []).includes(region))
      const list = pool.length ? pool : execs
      const counts = Object.fromEntries(list.map((u) => [u.id, (get().aiLeads || []).filter((l) => l.assignedTo === u.id && !['CONVERTED', 'LOST'].includes(l.stage)).length]))
      return list.sort((a, b) => counts[a.id] - counts[b.id])[0]?.id || null
    },
    aiUpdateLead: (id, patch) => {
      const l = upd('aiLeads', id, (x) => {
        const n = { ...x, ...(typeof patch === 'function' ? patch(x) : patch) }
        if (patch.score != null) n.temperature = tempOf(n.score, S())
        return n
      })
      return l
    },
    aiImportLeads: (rows, source = 'CSV Import') => {
      let added = 0, dup = 0
      const phones = new Set((get().aiLeads || []).map((l) => String(l.phone).replace(/\D/g, '').slice(-10)))
      for (const r of rows) {
        const phone = String(r.phone || r.Phone || r.mobile || '').trim()
        const name = String(r.name || r.Name || r.contact || '').trim()
        if (!phone || !name) continue
        const key = phone.replace(/\D/g, '').slice(-10)
        if (phones.has(key)) { dup++; continue }
        phones.add(key)
        const score = Number(r.score) || 35
        get().aiAddLead({ name, phone, company: r.company || r.Company || '', city: r.city || r.City || '', state: r.state || r.State || '', region: r.region || r.Region || 'West', email: r.email || '', interest: r.interest || r.product || 'Pumps', source: r.source || source, language: r.language || 'Hindi', score, type: r.type || 'DEALER_PROSPECT', notes: r.notes || '' })
        added++
      }
      if (added) get().notify({ title: `${added} leads imported`, body: `${dup} duplicates skipped · auto-assigned to sales executives`, link: '/erp/ai-calling/leads', roles: ['SALES_MANAGER'] })
      return { added, dup }
    },
    aiAssignLeads: (ids, userId) => {
      const u = get().users.find((x) => x.id === userId)
      set((st) => ({ aiLeads: st.aiLeads.map((l) => (ids.includes(l.id) ? { ...l, assignedTo: userId } : l)) }))
      if (u) {
        get().notify({ title: `${ids.length} lead${ids.length > 1 ? 's' : ''} assigned to you`, body: 'Open the Sales Mobile App to call them', link: '/erp/ai-calling/mobile', userIds: [userId] })
        get().sendEmail({ to: u.email, subject: `${ids.length} new lead(s) assigned`, body: `Hi ${u.name.split(' ')[0]},\n\n${ids.length} lead(s) have been assigned to you in Btali ERP. Please call them from the Sales Mobile App.`, kind: 'AI_CALLING' })
      }
    },
    aiAssignSequential: (ids) => {
      const execs = get().users.filter((u) => u.role === 'SALES_EXEC')
      let i = 0
      set((st) => ({ aiLeads: st.aiLeads.map((l) => {
        if (!ids.includes(l.id)) return l
        const pool = execs.filter((u) => (u.regions || []).includes(l.region))
        const list = pool.length ? pool : execs
        return { ...l, assignedTo: list[i++ % list.length].id }
      }) }))
      get().notify({ title: 'Leads distributed', body: `${ids.length} leads assigned round-robin by region`, link: '/erp/ai-calling/leads', roles: ['SALES_EXEC'] })
    },
    aiConvertLead: (id, extra = {}) => {
      const l = (get().aiLeads || []).find((x) => x.id === id)
      if (!l) return null
      const p = get().submitDealerOnboarding({ name: l.company || l.name, contact: l.name, phone: l.phone, email: l.email || '', city: l.city, state: l.state, region: l.region, address: extra.address || `${l.city}`, gstin: extra.gstin || '', pan: extra.pan || '', salespersonId: l.assignedTo, priceListId: 'pl1', tier: 'C', source: `AI Calling lead ${l.number}`, ...extra })
      get().aiUpdateLead(id, { stage: 'CONVERTED', partnerId: p.id, convertedAt: nowISO() })
      get().audit('Lead converted to dealer onboarding', 'Lead', l.number)
      return p
    },
    aiDeleteLead: (id) => get().removeItem('aiLeads', id),

    // ================================================================ calls
    aiSimulateCall: (leadId, { campaignId = null, attempt = 1, outcome: forced, direction = 'OUTBOUND' } = {}) => {
      const st = get()
      const lead = (st.aiLeads || []).find((l) => l.id === leadId)
      if (!lead) return null
      const campaign = campaignId ? st.aiCampaigns.find((c) => c.id === campaignId) : null
      const outcome = forced || pickOutcome(lead, campaign?.type)
      const n = counter('CALL', 5000)
      const call = buildCall({ lead: { ...lead, amountDue: lead.amountDue, soNo: lead.soNo }, outcome, campaign, settings: st.aiSettings, products: st.products, users: st.users, startedAt: nowISO(), number: `CL-${n}`, attempt, direction })
      set((s) => ({ aiCalls: [call, ...(s.aiCalls || [])].slice(0, 1500) }))
      const nl = leadAfterCall(lead, call, st.aiSettings)
      upd('aiLeads', leadId, () => ({ ...nl, campaignId: campaignId || lead.campaignId }))
      if (outcome === 'APPOINTMENT') {
        const ap = { id: uid('appt'), leadId, callId: call.id, assignedTo: lead.assignedTo, at: `${call.apptDate}T11:30:00`, type: lead.type === 'END_CUSTOMER' ? 'DEMO' : 'SITE_VISIT', location: `${lead.company ? `${lead.company}, ` : ''}${lead.city}`, status: 'SCHEDULED', feedback: '', createdAt: nowISO() }
        set((s) => ({ aiAppointments: [ap, ...(s.aiAppointments || [])] }))
        if (lead.assignedTo) get().notify({ title: `Appointment booked by AI: ${lead.name}`, body: `${lead.city} · ${fmtDate(call.apptDate)} 11:30 AM`, link: '/erp/ai-calling/mobile', userIds: [lead.assignedTo] })
      }
      if (nl.temperature === 'HOT' && lead.temperature !== 'HOT' && lead.assignedTo) get().notify({ title: `Hot lead: ${lead.name}`, body: call.summary, link: '/erp/ai-calling/leads', userIds: [lead.assignedTo] })
      if (call.followUps.length && S().autoWhatsApp !== false) get().waLogOutbound({ name: lead.name, phone: lead.phone, city: lead.city }, `Hi ${firstName(lead.name)}, thank you for speaking with Btali International. 📄 Here is our latest brochure and dealer price list as discussed.`, { kind: 'document', attachment: { name: 'Btali-Product-Catalogue-2026.pdf', size: 2480000 }, source: `Call ${call.number}` })
      return call
    },
    aiLogManualCall: (leadId, { outcome, notes = '', durationSec = 0, by }) => {
      const lead = (get().aiLeads || []).find((l) => l.id === leadId)
      if (!lead) return null
      const n = counter('CALL', 5000)
      const [sentiment, sScore] = SENTIMENT[outcome] || [null, 0]
      const call = {
        id: uid('call'), number: `CL-${n}`, leadId, campaignId: null, direction: 'OUTBOUND', startedAt: nowISO(), attempt: (lead.attempts || 0) + 1, status: outcome === 'NO_ANSWER' ? 'NO_ANSWER' : 'CONNECTED', outcome, durationSec, ringSec: 8, cost: round2(durationSec ? Math.ceil(durationSec / 60) * 1.1 : 0), sentiment, sentimentScore: sScore,
        language: lead.language, voice: 'Sales executive', transcript: [], summary: notes || `Manual call by sales executive – ${CALL_OUTCOMES[outcome]?.label}`, nextAction: outcome === 'APPOINTMENT' ? 'Visit as scheduled' : outcome === 'CALLBACK' ? 'Call back' : '', scoreDelta: SCORE_DELTA[outcome] || 0, unanswered: [], handledBy: by || get().session.userId, followUps: [], apptDate: outcome === 'APPOINTMENT' ? addDays(today(), 1) : null,
      }
      set((s) => ({ aiCalls: [call, ...(s.aiCalls || [])] }))
      upd('aiLeads', leadId, (l) => leadAfterCall(l, call, S()))
      if (outcome === 'APPOINTMENT') set((s) => ({ aiAppointments: [{ id: uid('appt'), leadId, callId: call.id, assignedTo: lead.assignedTo || by, at: `${call.apptDate}T11:00:00`, type: 'SITE_VISIT', location: `${lead.company ? `${lead.company}, ` : ''}${lead.city}`, status: 'SCHEDULED', feedback: '', createdAt: nowISO() }, ...(s.aiAppointments || [])] }))
      get().audit('Logged call', 'Lead', `${lead.number} ${outcome}`)
      return call
    },
    aiCreateFollowUp: (callId, { title, dueDate, assigneeId, notes } = {}) => {
      const call = (get().aiCalls || []).find((c) => c.id === callId)
      const lead = call && (get().aiLeads || []).find((l) => l.id === call.leadId)
      if (!call || !lead) return null
      let taskId = null
      if (Array.isArray(get().tasks) && get().addTask) {
        const t = get().addTask({ title: title || `Follow up ${lead.name} (${lead.company || lead.city}) – ${call.nextAction}`, type: 'FOLLOW_UP', partnerId: lead.partnerId || null, assigneeId: assigneeId || lead.assignedTo, dueDate: dueDate || lead.nextFollowUp || today(), priority: lead.temperature === 'HOT' ? 'HIGH' : 'MEDIUM', notes: notes || call.summary, location: lead.city, leadId: lead.id, callId })
        taskId = t.id
      } else {
        get().notify({ title: `Follow-up: ${lead.name}`, body: `${call.nextAction} · due ${fmtDate(dueDate || today())}`, link: '/erp/ai-calling/calls', userIds: [assigneeId || lead.assignedTo].filter(Boolean) })
      }
      upd('aiCalls', callId, { taskId: taskId || 'NOTIFIED' })
      upd('aiLeads', lead.id, { nextFollowUp: dueDate || lead.nextFollowUp || today() })
      return taskId
    },
    aiUpdateCall: (id, patch) => upd('aiCalls', id, patch),

    // ================================================================ appointments / visits
    aiUpdateAppointment: (id, patch) => {
      const a = upd('aiAppointments', id, (x) => ({ ...x, ...patch, updatedAt: nowISO() }))
      if (a && patch.status === 'COMPLETED') get().aiUpdateLead(a.leadId, (l) => ({ score: Math.min(100, (l.score || 0) + 10), temperature: tempOf(Math.min(100, (l.score || 0) + 10), S()) }))
      return a
    },
    aiRetriggerFollowUp: (apptId) => {
      const a = (get().aiAppointments || []).find((x) => x.id === apptId)
      if (!a) return null
      upd('aiAppointments', apptId, { status: 'MISSED', followUpTriggeredAt: nowISO() })
      const call = get().aiSimulateCall(a.leadId, { outcome: Math.random() < 0.6 ? 'APPOINTMENT' : 'CALLBACK' })
      return call
    },
    aiCheckIn: ({ leadId, partnerId, appointmentId, note, lat, lng, userId }) => {
      const v = { id: uid('visit'), leadId: leadId || null, partnerId: partnerId || null, appointmentId: appointmentId || null, note, lat, lng, userId: userId || get().session.userId, ts: nowISO() }
      set((s) => ({ aiVisits: [v, ...(s.aiVisits || [])] }))
      if (appointmentId) upd('aiAppointments', appointmentId, { checkedInAt: v.ts })
      get().audit('Visit check-in', 'Visit', note || '')
      return v
    },

    // ================================================================ campaigns
    aiAudience: (aud = {}) => (get().aiLeads || []).filter((l) =>
      !l.dnd && !['CONVERTED'].includes(l.stage) &&
      (!aud.temperatures?.length || aud.temperatures.includes(l.temperature)) &&
      (!aud.sources?.length || aud.sources.includes(l.source)) &&
      (!aud.regions?.length || aud.regions.includes(l.region)) &&
      (!aud.stages?.length || aud.stages.includes(l.stage)) &&
      (!aud.interests?.length || aud.interests.includes(l.interest)) &&
      (!aud.assignedTo || l.assignedTo === aud.assignedTo)),
    aiSaveCampaign: (data) => {
      if (data.id && (get().aiCampaigns || []).some((c) => c.id === data.id)) return upd('aiCampaigns', data.id, (c) => ({ ...c, ...data }))
      const n = counter('CMP', 100)
      const c = { id: uid('cmp'), number: `CMP-${n}`, status: 'DRAFT', processed: 0, retries: 0, queue: [], current: null, createdBy: get().session.userId, createdAt: nowISO(), ...data }
      set((s) => ({ aiCampaigns: [c, ...(s.aiCampaigns || [])] }))
      get().audit('Campaign created', 'AI Campaign', c.number)
      return c
    },
    aiStartCampaign: (id) => {
      const c = (get().aiCampaigns || []).find((x) => x.id === id)
      if (!c) return
      let patch = { status: 'RUNNING', resumedAt: nowISO() }
      if (!c.startedAt || c.status === 'DRAFT' || c.status === 'SCHEDULED') {
        const leads = get().aiAudience(c.audience)
        patch = { ...patch, startedAt: nowISO(), leadIds: leads.map((l) => l.id), total: leads.length, queue: leads.map((l) => ({ leadId: l.id, attempt: 1 })), processed: 0 }
        set((s) => ({ aiLeads: s.aiLeads.map((l) => (patch.leadIds.includes(l.id) ? { ...l, campaignId: id } : l)) }))
      }
      upd('aiCampaigns', id, patch)
      get()._aiStartTimer(id)
      get().aiResumeRunners()
      get().audit('Campaign started', 'AI Campaign', c.number)
    },
    aiPauseCampaign: (id) => { get()._aiStopTimer(id); upd('aiCampaigns', id, { status: 'PAUSED', pausedAt: nowISO() }); get().audit('Campaign paused', 'AI Campaign', id) },
    aiStopCampaign: (id) => {
      get()._aiStopTimer(id)
      const c = (get().aiCampaigns || []).find((x) => x.id === id)
      upd('aiCampaigns', id, { status: 'STOPPED', current: null, stoppedAt: nowISO(), remainingAtStop: (c?.queue || []).length })
      get().audit('Campaign stopped', 'AI Campaign', c?.number)
    },
    aiScheduleCampaign: (id, startAt) => upd('aiCampaigns', id, (c) => ({ ...c, status: 'SCHEDULED', schedule: { ...(c.schedule || {}), mode: 'SCHEDULED', startAt } })),
    aiDeleteCampaign: (id) => { get()._aiStopTimer(id); get().removeItem('aiCampaigns', id) },

    // ================================================================ scripts / settings
    aiSaveScript: (data) => {
      if (data.id && (get().aiScripts || []).some((s) => s.id === data.id)) return upd('aiScripts', data.id, (x) => ({ ...x, ...data, updatedAt: nowISO(), version: (x.version || 1) + 1, updatedBy: get().session.userId }))
      const s = { id: uid('scr'), version: 1, active: true, createdAt: nowISO(), updatedAt: nowISO(), updatedBy: get().session.userId, ...data }
      set((st) => ({ aiScripts: [s, ...(st.aiScripts || [])] }))
      return s
    },
    aiDeleteScript: (id) => get().removeItem('aiScripts', id),
    aiSaveSettings: (patch) => {
      set((s) => ({ aiSettings: { ...s.aiSettings, ...patch } }))
      get().audit('AI settings updated', 'AI Settings', Object.keys(patch).join(', '))
    },

    // ================================================================ WhatsApp – conversations
    waStartConversation: ({ contactId, name, phone, city, partnerId, language = 'English' }) => {
      const st = get()
      const ct = contactId ? (st.waContacts || []).find((c) => c.id === contactId) : null
      const ph = ct?.phone || phone
      const existing = (st.waConversations || []).find((c) => c.phone === ph && c.status !== 'RESOLVED')
      if (existing) return existing
      const c = { id: uid('wac'), contactId: ct?.id || null, name: ct?.name || name || ph, phone: ph, city: ct?.city || city || '', partnerId: ct?.partnerId || partnerId || null, language: ct?.language || language, status: 'BOT', takeover: false, agentId: null, unread: 0, fallbacks: 0, messages: [], ticketIds: [], createdAt: nowISO(), lastAt: nowISO(), tags: [] }
      set((s) => ({ waConversations: [c, ...(s.waConversations || [])] }))
      return c
    },
    waLogOutbound: (who, text, extra = {}) => {
      const c = get().waStartConversation({ name: who.name, phone: who.phone, city: who.city, partnerId: who.partnerId })
      upd('waConversations', c.id, (x) => ({ ...x, lastAt: nowISO(), messages: [...x.messages, msg('bot', text, { ...extra, intent: 'OUTBOUND_FOLLOW_UP', status: 'delivered' })] }))
      return c.id
    },
    waSendMessage: (convId, { from = 'customer', text = '', ...extra }) => {
      const c = conv(convId)
      if (!c) return
      const by = get().session.userId
      const m = msg(from, text, { ...extra, by: from === 'agent' ? by : undefined, status: from === 'customer' ? undefined : 'sent' })
      upd('waConversations', convId, (x) => ({ ...x, lastAt: m.ts, status: x.status === 'RESOLVED' && from === 'customer' ? 'BOT' : x.status, unread: from === 'customer' ? (x.unread || 0) + 1 : 0, messages: [...x.messages, m], firstAgentReplyAt: from === 'agent' && !x.firstAgentReplyAt ? m.ts : x.firstAgentReplyAt }))
      if (from !== 'customer') {
        // delivery / read ticks
        setTimeout(() => upd('waConversations', convId, (x) => ({ ...x, messages: x.messages.map((y) => (y.id === m.id ? { ...y, status: 'delivered' } : y)) })), 700)
        setTimeout(() => upd('waConversations', convId, (x) => ({ ...x, messages: x.messages.map((y) => (y.id === m.id ? { ...y, status: 'read' } : y)) })), 2200)
        return m
      }
      const cur = conv(convId)
      if (cur.takeover) return m
      if (RUN.bot[convId]) clearTimeout(RUN.bot[convId])
      upd('waConversations', convId, { botTyping: true })
      RUN.bot[convId] = setTimeout(() => {
        delete RUN.bot[convId]
        const now = conv(convId)
        if (!now) return
        if (now.takeover) { upd('waConversations', convId, { botTyping: false }); return }
        const res = waBotAnswer(get(), now, text)
        get()._waApply(convId, res, text)
      }, 900 + Math.round(Math.random() * 600))
      return m
    },
    _waApply: (convId, res, text) => {
      const st = get()
      const c = conv(convId)
      let msgs = res.messages.map((x) => msg('bot', x.text, { ...x, intent: res.intent, confidence: res.confidence, status: 'read' }))
      const patch = { botTyping: false, lastIntent: res.intent, unread: 0 }
      let fallbacks = res.intent === 'FALLBACK' ? (c.fallbacks || 0) + 1 : 0
      for (const e of res.effects) {
        if (e.type === 'TICKET') {
          const lastProd = [...c.messages].reverse().find((m) => m.productId)?.productId
          const t = st.createTicket({ source: 'WEBSITE', channel: 'WHATSAPP', category: e.category, subject: `[WhatsApp] ${e.subject}`, description: `${e.description}\n\nCustomer: ${c.name} · ${c.phone}${c.city ? ` · ${c.city}` : ''}`, partnerId: c.partnerId, productId: e.productId || lastProd || null, priority: e.priority, customer: { name: c.name, phone: c.phone, city: c.city } })
          msgs = msgs.map((m) => ({ ...m, text: m.text.replace('{{ticket}}', t.number), ticketId: t.id }))
          patch.ticketIds = [...(c.ticketIds || []), t.id]
        } else if (e.type === 'HANDOVER') {
          patch.status = 'WAITING_AGENT'
          patch.escalationReason = e.reason
          patch.escalatedAt = nowISO()
          fallbacks = 0
          get().notify({ title: `WhatsApp handover: ${c.name}`, body: e.reason, link: `/erp/whatsapp/inbox?c=${c.id}`, roles: ['SALES_MANAGER', 'SALES_EXEC'] })
        } else if (e.type === 'LEAD') {
          const ph = String(c.phone).replace(/\D/g, '').slice(-10)
          if (!(st.aiLeads || []).some((l) => String(l.phone).replace(/\D/g, '').slice(-10) === ph)) {
            const l = get().aiAddLead({ name: c.name, phone: c.phone, city: c.city, state: '', region: 'West', source: 'WhatsApp', interest: e.interest, score: 62, type: 'DEALER_PROSPECT', language: c.language === 'Hindi' ? 'Hindi' : 'English', notes: `Dealership enquiry on WhatsApp: "${text}"` })
            patch.leadId = l.id
          }
        } else if (e.type === 'CSAT') { patch.csat = e.value; patch.awaitingCsat = false; patch.csatAt = nowISO() }
        else if (e.type === 'ASK_CSAT') patch.awaitingCsat = true
        else if (e.type === 'OPT_OUT') {
          const ct = (st.waContacts || []).find((x) => x.phone === c.phone)
          if (ct) upd('waContacts', ct.id, { optOut: e.value, optOutAt: e.value ? nowISO() : null })
        } else if (e.type === 'UNANSWERED') {
          set((s) => ({ waUnanswered: [{ id: uid('unq'), question: text, convId, name: c.name, ts: nowISO(), status: 'OPEN' }, ...(s.waUnanswered || [])] }))
        } else if (e.type === 'KB_HIT') upd('waKnowledge', e.id, (k) => ({ ...k, hits: (k.hits || 0) + 1, lastHitAt: nowISO() }))
      }
      patch.fallbacks = fallbacks
      upd('waConversations', convId, (x) => ({ ...x, ...patch, lastAt: nowISO(), messages: [...x.messages, ...msgs] }))
    },
    waSetTakeover: (convId, on) => {
      const u = get().users.find((x) => x.id === get().session.userId)
      if (RUN.bot[convId]) { clearTimeout(RUN.bot[convId]); delete RUN.bot[convId] }
      upd('waConversations', convId, (x) => ({
        ...x, takeover: on, botTyping: false, status: on ? 'AGENT' : 'BOT', agentId: on ? u?.id : x.agentId, takeoverAt: on ? nowISO() : x.takeoverAt,
        messages: [...x.messages, msg('system', on ? `${u?.name || 'Agent'} joined the conversation` : `${u?.name || 'Agent'} handed the chat back to ${S().wa?.botName || 'Btali Assistant'}`)],
      }))
      get().audit(on ? 'WhatsApp takeover' : 'WhatsApp handback', 'Conversation', convId)
    },
    waResolveConversation: (convId) => {
      upd('waConversations', convId, (x) => ({ ...x, status: 'RESOLVED', takeover: false, resolvedAt: nowISO(), awaitingCsat: S().wa?.csatEnabled !== false, messages: [...x.messages, msg('system', 'Conversation marked resolved'), ...(S().wa?.csatEnabled !== false ? [msg('bot', 'Thank you for contacting Btali International! How would you rate your experience? Reply 1 (poor) to 5 (excellent).', { quick: ['5', '4', '3', '2', '1'], intent: 'CSAT_PROMPT', status: 'delivered' })] : [])] }))
    },
    waMarkRead: (convId) => { const c = conv(convId); if (c?.unread) upd('waConversations', convId, { unread: 0 }) },
    waTagConversation: (convId, tags) => upd('waConversations', convId, { tags }),

    // ================================================================ WhatsApp – contacts
    waSaveContact: (data) => {
      if (data.id && (get().waContacts || []).some((c) => c.id === data.id)) return upd('waContacts', data.id, (c) => ({ ...c, ...data }))
      const c = { id: uid('wct'), optOut: false, tags: [], createdAt: nowISO(), language: 'Hindi', type: 'PROSPECT', source: 'Manual', ...data }
      set((s) => ({ waContacts: [c, ...(s.waContacts || [])] }))
      return c
    },
    waImportContacts: (rows) => {
      const have = new Set((get().waContacts || []).map((c) => String(c.phone).replace(/\D/g, '').slice(-10)))
      let added = 0, dup = 0
      const fresh = []
      for (const r of rows) {
        const phone = String(r.phone || r.Phone || r.mobile || '').trim()
        const name = String(r.name || r.Name || '').trim()
        if (!phone || !name) continue
        const k = phone.replace(/\D/g, '').slice(-10)
        if (have.has(k)) { dup++; continue }
        have.add(k)
        fresh.push({ id: uid('wct'), name, phone, city: r.city || r.City || '', state: r.state || '', type: (r.type || 'PROSPECT').toUpperCase(), tags: String(r.tags || '').split(/[;|]/).map((x) => x.trim()).filter(Boolean), language: r.language || 'Hindi', optOut: false, source: 'CSV Import', createdAt: nowISO() })
        added++
      }
      set((s) => ({ waContacts: [...fresh, ...(s.waContacts || [])] }))
      return { added, dup }
    },
    waToggleOptOut: (id) => upd('waContacts', id, (c) => ({ ...c, optOut: !c.optOut, optOutAt: !c.optOut ? nowISO() : null })),
    waDeleteContact: (id) => get().removeItem('waContacts', id),
    waSegment: (seg = {}) => (get().waContacts || []).filter((c) =>
      (!seg.types?.length || seg.types.includes(c.type)) &&
      (!seg.tags?.length || seg.tags.some((t) => (c.tags || []).includes(t))) &&
      (!seg.cities?.length || seg.cities.includes(c.city)) &&
      (!seg.languages?.length || seg.languages.includes(c.language))),

    // ================================================================ WhatsApp – campaigns
    waSaveCampaign: (data) => {
      if (data.id && (get().waCampaigns || []).some((c) => c.id === data.id)) return upd('waCampaigns', data.id, (c) => ({ ...c, ...data }))
      const n = counter('WAC', 20)
      const c = { id: uid('wcp'), number: `WAC-${n}`, status: 'DRAFT', createdBy: get().session.userId, createdAt: nowISO(), stats: null, history: [{ ts: nowISO(), text: 'Campaign drafted' }], ...data }
      set((s) => ({ waCampaigns: [c, ...(s.waCampaigns || [])] }))
      return c
    },
    waSubmitCampaign: (id) => {
      const u = get().users.find((x) => x.id === get().session.userId)
      const c = upd('waCampaigns', id, (x) => ({ ...x, status: 'PENDING_APPROVAL', submittedAt: nowISO(), submittedBy: u?.id, remark: '', history: [...(x.history || []), { ts: nowISO(), text: `Submitted for approval by ${u?.name || 'user'}` }] }))
      get().notify({ title: 'WhatsApp campaign awaiting approval', body: `${c.name} · ${get().waSegment(c.segment).filter((x) => !x.optOut).length} recipients`, link: '/erp/whatsapp/campaigns', roles: ['ADMIN', 'SALES_MANAGER'] })
      get().audit('WhatsApp campaign submitted', 'WA Campaign', c.number)
      return c
    },
    approveWaCampaign: (id, approved, remark = '') => {
      const u = get().users.find((x) => x.id === get().session.userId)
      const c0 = (get().waCampaigns || []).find((x) => x.id === id)
      if (!c0) return null
      const scheduled = approved && c0.scheduledAt && c0.scheduledAt > nowISO()
      const c = upd('waCampaigns', id, (x) => ({
        ...x, status: approved ? (scheduled ? 'SCHEDULED' : 'APPROVED') : 'REJECTED', approvedBy: u?.id, approvedAt: nowISO(), remark,
        history: [...(x.history || []), { ts: nowISO(), text: `${approved ? 'Approved' : 'Rejected'} by ${u?.name || 'approver'}${remark ? ` – ${remark}` : ''}${scheduled ? ` · scheduled for ${fmtDate(x.scheduledAt)}` : ''}` }],
      }))
      const owner = get().users.find((x) => x.id === (c0.submittedBy || c0.createdBy))
      get().notify({ title: `WhatsApp campaign ${approved ? 'approved' : 'rejected'}`, body: `${c0.name}${remark ? ` – ${remark}` : ''}`, link: '/erp/whatsapp/campaigns', userIds: owner ? [owner.id] : [], type: approved ? 'info' : 'warning' })
      if (owner) get().sendEmail({ to: owner.email, subject: `WhatsApp campaign ${approved ? 'approved' : 'rejected'}: ${c0.name}`, body: `Hi ${owner.name.split(' ')[0]},\n\nYour WhatsApp campaign "${c0.name}" (${c0.number}) was ${approved ? 'approved' : 'rejected'} by ${u?.name || 'the approver'}.${remark ? `\nRemark: ${remark}` : ''}${scheduled ? `\nIt will be broadcast on ${fmtDate(c0.scheduledAt)}.` : ''}`, ref: c0.number, kind: 'WHATSAPP' })
      get().audit(`WhatsApp campaign ${approved ? 'approved' : 'rejected'}`, 'WA Campaign', c0.number)
      get().aiResumeRunners()
      return c
    },
    waScheduleCampaign: (id, at) => {
      const c = (get().waCampaigns || []).find((x) => x.id === id)
      if (!c) return
      const approved = ['APPROVED', 'SCHEDULED'].includes(c.status)
      upd('waCampaigns', id, (x) => ({ ...x, scheduledAt: at, status: approved ? (at ? 'SCHEDULED' : 'APPROVED') : x.status, history: [...(x.history || []), { ts: nowISO(), text: at ? `Scheduled for ${new Date(at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Schedule cancelled' }] }))
      get().aiResumeRunners()
    },
    waDeleteCampaign: (id) => { if (RUN.wa[id]) { clearInterval(RUN.wa[id]); delete RUN.wa[id] } get().removeItem('waCampaigns', id) },
    waSendCampaign: (id) => {
      const c = (get().waCampaigns || []).find((x) => x.id === id)
      if (!c || !['APPROVED', 'SCHEDULED'].includes(c.status)) return false
      const all = get().waSegment(c.segment)
      const recips = all.filter((x) => !x.optOut)
      upd('waCampaigns', id, (x) => ({ ...x, status: 'SENDING', sendStartedAt: nowISO(), recipientIds: recips.map((r) => r.id), stats: { targeted: recips.length, excludedOptOut: all.length - recips.length, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, optedOut: 0 }, history: [...(x.history || []), { ts: nowISO(), text: `Broadcast started to ${recips.length} contacts (${all.length - recips.length} opted-out excluded)` }] }))
      get()._waStartSend(id)
      return true
    },
    _waStartSend: (id) => {
      if (RUN.wa[id]) return
      let tick = 0
      RUN.wa[id] = setInterval(() => {
        tick++
        const c = (get().waCampaigns || []).find((x) => x.id === id)
        if (!c || c.status !== 'SENDING') { clearInterval(RUN.wa[id]); delete RUN.wa[id]; return }
        const s = { ...c.stats }
        const T = s.targeted
        const f = Math.min(1, tick / 8)
        s.sent = Math.round(T * f)
        s.failed = Math.round(s.sent * 0.03)
        s.delivered = Math.round((s.sent - s.failed) * Math.min(1, f * 1.05) * 0.98)
        s.read = Math.round(s.delivered * Math.min(0.78, tick * 0.09))
        s.replied = Math.round(s.read * Math.min(0.16, tick * 0.02))
        s.optedOut = Math.round(T * 0.01 * f)
        if (tick >= 10) {
          clearInterval(RUN.wa[id]); delete RUN.wa[id]
          upd('waCampaigns', id, (x) => ({ ...x, status: 'SENT', sentAt: nowISO(), stats: s, history: [...(x.history || []), { ts: nowISO(), text: `Broadcast completed – ${s.delivered} delivered, ${s.read} read, ${s.replied} replies` }] }))
          get().notify({ title: `WhatsApp campaign sent: ${c.name}`, body: `${s.delivered}/${T} delivered · ${s.read} read · ${s.replied} replies`, link: '/erp/whatsapp/campaigns', roles: ['SALES_MANAGER', 'ADMIN'] })
          // a couple of customer replies land in the live inbox and are answered by the bot
          const ids = (c.recipientIds || []).slice(0, 2)
          const replies = ['Price kya hai? Stock available hai?', 'Interested. Please share dealer price list']
          ids.forEach((cid, i) => {
            const ct = (get().waContacts || []).find((x) => x.id === cid)
            if (!ct) return
            const cv = get().waStartConversation({ contactId: ct.id })
            upd('waConversations', cv.id, (x) => ({ ...x, messages: [...x.messages, msg('bot', c.message.replace(/\{\{name\}\}/g, firstName(ct.name)).replace(/\{\{city\}\}/g, ct.city || ''), { intent: 'CAMPAIGN', campaignId: id, status: 'read', attachment: c.attachment || null, kind: c.attachment ? 'document' : 'text' })], lastAt: nowISO() }))
            setTimeout(() => get().waSendMessage(cv.id, { from: 'customer', text: `${replies[i]}${c.productId ? ` ${(get().products.find((p) => p.id === c.productId) || {}).sku || ''}` : ''}`, campaignId: id }), 1500 + i * 2500)
          })
          return
        }
        upd('waCampaigns', id, { stats: s })
      }, 900)
    },

    // ================================================================ WhatsApp – knowledge base
    waSaveKnowledge: (data) => {
      const by = get().session.userId
      if (data.id && (get().waKnowledge || []).some((k) => k.id === data.id)) return upd('waKnowledge', data.id, (k) => ({ ...k, ...data, updatedAt: nowISO(), updatedBy: by }))
      const k = { id: uid('kb'), active: true, hits: 0, quickReplies: [], keywords: [], createdAt: nowISO(), updatedAt: nowISO(), updatedBy: by, ...data }
      set((s) => ({ waKnowledge: [k, ...(s.waKnowledge || [])] }))
      get().audit('Knowledge entry saved', 'WA Knowledge', k.intent)
      return k
    },
    waDeleteKnowledge: (id) => get().removeItem('waKnowledge', id),
    waResolveUnanswered: (id, kbId = null) => upd('waUnanswered', id, { status: 'ANSWERED', kbId, resolvedAt: nowISO() }),
    waDismissUnanswered: (id) => upd('waUnanswered', id, { status: 'DISMISSED', resolvedAt: nowISO() }),
  }
}
