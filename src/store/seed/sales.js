// Module seed for "sales": quotations, sales tasks, targets (dealer monthly + salesperson quarterly), nudge actions.
import { addDays, daysAgo, lastMonths, today } from '../../lib/format'
import { priceOrder } from '../../lib/pricing'

const SLABS = [
  { achievePct: 90, incentivePct: 1 },
  { achievePct: 100, incentivePct: 2 },
  { achievePct: 120, incentivePct: 3 },
]
const ts = (d, h = 10) => `${d}T${String(h).padStart(2, '0')}:20:00.000Z`

export const quarterStart = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number)
  const qm = Math.floor((m - 1) / 3) * 3 + 1
  return `${y}-${String(qm).padStart(2, '0')}`
}
const prevQuarter = (qs) => {
  const [y, m] = qs.split('-').map(Number)
  const d = new Date(y, m - 4, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const salesSeed = (core) => {
  // ---------------------------------------------------------------- quotations
  const qSpec = [
    ['qt1', 'd2', 3, [['p16', 20], ['p17', 10], ['p33', 20]], 'SENT', 'Diwali stock-up proposal'],
    ['qt2', 'd6', 6, [['p5', 6], ['p7', 4], ['p26', 40]], 'DRAFT', 'Borewell + sewage pumps from Indian vendors'],
    ['qt3', 'd10', 9, [['p20', 40], ['p37', 40]], 'ACCEPTED', 'Sprayer + battery combo'],
    ['qt4', 'd4', 24, [['p12', 12], ['p13', 8], ['p31', 50]], 'EXPIRED', 'Vacuum range for new showroom'],
    ['qt5', 'd17', 2, [['p8', 10], ['p9', 6], ['p28', 40]], 'SENT', 'Compressor package for workshop chain'],
  ]
  let qtN = core.settings.series.QT || 0
  const quotations = qSpec.map(([id, partnerId, ago, lines, status, note]) => {
    const priced = priceOrder(core, partnerId, lines.map(([productId, qty]) => ({ productId, qty })))
    const partner = core.partners.find((p) => p.id === partnerId)
    qtN++
    const date = daysAgo(ago)
    return {
      id, number: `QT/26-27/${String(qtN).padStart(4, '0')}`, partnerId, date, validTill: addDays(date, 15),
      lines: priced.lines, subtotal: priced.subtotal, gst: priced.gst, total: priced.total, appliedSchemes: priced.appliedSchemes,
      status, soId: null, note, createdBy: partner.salespersonId, salespersonId: partner.salespersonId,
      sentAt: status !== 'DRAFT' ? ts(date, 12) : null,
      timeline: [{ ts: ts(date), text: 'Quotation created' }, ...(status !== 'DRAFT' ? [{ ts: ts(date, 12), text: `Emailed to ${partner.email}` }] : []), ...(status === 'ACCEPTED' ? [{ ts: ts(addDays(date, 2)), text: 'Marked accepted – dealer confirmed by phone' }] : []), ...(status === 'EXPIRED' ? [{ ts: ts(addDays(date, 15)), text: 'Marked expired' }] : [])],
    }
  })
  core.settings.series.QT = qtN

  // ---------------------------------------------------------------- tasks
  const T = (id, title, type, partnerId, assigneeId, due, status, priority, extra = {}) => ({
    id, title, type, partnerId, soId: null, assigneeId, dueDate: due, status, priority, notes: '', outcome: '', completedAt: null,
    createdBy: assigneeId === 'u4' ? 'u4' : 'u4', createdAt: ts(addDays(due, -4)), location: core.partners.find((p) => p.id === partnerId)?.city || '', ...extra,
  })
  const done = (d, outcome, h = 15) => ({ status: 'DONE', outcome, completedAt: ts(d, h) })
  const tasks = [
    T('task1', 'Visit Shree Ganesh Hardware – Diwali display & scheme briefing', 'VISIT', 'd2', 'u5', today(), 'OPEN', 'HIGH'),
    T('task2', 'Follow up on quotation for compressor package', 'FOLLOW_UP', 'd17', 'u5', today(), 'OPEN', 'MEDIUM'),
    T('task3', 'Collect advance for order SO (Patel Agri – sprayers)', 'COLLECTION', 'd5', 'u5', today(), 'OPEN', 'HIGH', { soId: 'so_open_6' }),
    T('task4', 'Call Raipur Hardware Hub – onboarding decision', 'CALL', 'd21', 'u5', daysAgo(2), 'OPEN', 'MEDIUM'),
    T('task5', 'Pressure washer demo at Jain Industrial Supplies', 'DEMO', 'd6', 'u5', addDays(today(), 2), 'OPEN', 'MEDIUM'),
    T('task6', 'Visit Mahalaxmi Tools – collect stock position', 'VISIT', 'd9', 'u5', daysAgo(4), 'OPEN', 'LOW'),
    T('task7', 'Goa Marine & Tools – share price list & KYC checklist', 'FOLLOW_UP', 'd22', 'u5', addDays(today(), 1), 'OPEN', 'MEDIUM'),
    T('task8', 'Nashik Agro – review sprayer sell-through', 'VISIT', 'd16', 'u5', daysAgo(3), 'DONE', 'MEDIUM', done(daysAgo(3), 'Sell-through good; next order expected in 10 days')),
    T('task9', 'Vijay Engineering – payment follow-up', 'COLLECTION', 'd17', 'u5', daysAgo(6), 'DONE', 'HIGH', done(daysAgo(5), 'Advance received via NEFT')),
    T('task10', 'Btali Store Ahmedabad – monthly review', 'VISIT', 'f2', 'u5', daysAgo(9), 'DONE', 'MEDIUM', done(daysAgo(9), 'POS usage reviewed, barcode scanning improved')),
    T('task11', 'Visit Sharma Agro – review portal order', 'VISIT', 'd1', 'u6', today(), 'OPEN', 'HIGH', { soId: 'so_open_1' }),
    T('task12', 'Amar Electricals – advance for borewell pumps', 'COLLECTION', 'd14', 'u6', daysAgo(1), 'OPEN', 'HIGH', { soId: 'so_open_4' }),
    T('task13', 'Royal Hardware – compressor demo', 'DEMO', 'd7', 'u6', addDays(today(), 3), 'OPEN', 'MEDIUM'),
    T('task14', 'Punjab Tractor & Pumps – win-back call', 'CALL', 'd20', 'u6', daysAgo(8), 'DONE', 'LOW', done(daysAgo(8), 'Not interested this season; revisit in Feb')),
    T('task15', 'Ganga Sales – scheme briefing', 'VISIT', 'd11', 'u6', daysAgo(5), 'DONE', 'MEDIUM', done(daysAgo(5), 'Placed order for pumps + seals')),
    T('task16', 'Deccan Pump House – Diwali order follow-up', 'FOLLOW_UP', 'd10', 'u7', today(), 'OPEN', 'HIGH', { soId: 'so_open_2' }),
    T('task17', 'Kaveri Pumps – advance follow-up', 'COLLECTION', 'd3', 'u7', daysAgo(1), 'OPEN', 'HIGH', { soId: 'so_open_3' }),
    T('task18', 'Chennai Power Tools – visit, low stock reported', 'VISIT', 'd18', 'u7', daysAgo(3), 'OPEN', 'MEDIUM'),
    T('task19', 'Kerala Machinery – vacuum demo', 'DEMO', 'd13', 'u7', daysAgo(7), 'DONE', 'MEDIUM', done(daysAgo(7), 'Demo done, quotation requested')),
    T('task20', 'Sai Krishna Agencies – compressor payment', 'COLLECTION', 'd8', 'u7', daysAgo(2), 'DONE', 'HIGH', done(daysAgo(2), 'Payment received')),
    T('task21', 'Gupta Brothers – inactivity check-in', 'CALL', 'd15', 'u18', daysAgo(5), 'OPEN', 'HIGH'),
    T('task22', 'Bengal Machinery – invoice & LR status update', 'FOLLOW_UP', 'd4', 'u18', today(), 'OPEN', 'MEDIUM', { soId: 'so_open_13' }),
    T('task23', 'Assam Agro Mart – visit with sprayer samples', 'VISIT', 'd19', 'u18', addDays(today(), 4), 'OPEN', 'MEDIUM'),
    T('task24', 'Odisha Krishi Kendra – monsoon review', 'VISIT', 'd12', 'u18', daysAgo(10), 'DONE', 'LOW', done(daysAgo(10), 'Placed sprayer order')),
    T('task25', 'Weekly pipeline review with team', 'FOLLOW_UP', null, 'u4', addDays(today(), 1), 'OPEN', 'MEDIUM'),
    T('task26', 'Jain Industrial – collect stock report', 'CALL', 'd6', 'u5', daysAgo(12), 'DONE', 'LOW', done(daysAgo(11), 'Stock updated on portal')),
    T('task27', 'Deccan Pump House – quarterly business review', 'VISIT', 'd10', 'u7', daysAgo(15), 'DONE', 'MEDIUM', done(daysAgo(15), 'Agreed Q3 target')),
  ]

  // ---------------------------------------------------------------- targets
  const months = lastMonths(13)
  const cur = months[months.length - 1]
  const prevMonths = months.slice(-3) // prev 2 + current
  const revByPartnerMonth = {}
  for (const inv of core.invoices) {
    const k = `${inv.partnerId}|${inv.date.slice(0, 7)}`
    revByPartnerMonth[k] = (revByPartnerMonth[k] || 0) + inv.subtotal
  }
  const targets = []
  const dealers = core.partners.filter((p) => p.type === 'DEALER' && p.stage === 'CURRENT')
  for (const d of dealers) {
    const hist = months.slice(0, 12).map((m) => revByPartnerMonth[`${d.id}|${m}`] || 0)
    const avg = hist.reduce((a, x) => a + x, 0) / 12
    const base = Math.max(50000, Math.round((avg * 1.1) / 10000) * 10000)
    for (const m of prevMonths) {
      targets.push({ id: `tg_${d.id}_${m}`, ownerType: 'DEALER', ownerId: d.id, periodType: 'MONTH', period: m, amount: base, slabs: SLABS, createdAt: ts(`${m}-01`) })
    }
  }
  const qCur = quarterStart(cur)
  const qPrev = prevQuarter(qCur)
  const spRev = {}
  for (const inv of core.invoices) {
    const p = core.partners.find((x) => x.id === inv.partnerId)
    if (!p?.salespersonId) continue
    spRev[p.salespersonId] = (spRev[p.salespersonId] || 0) + inv.subtotal
  }
  for (const sp of ['u5', 'u6', 'u7', 'u18']) {
    const q = Math.max(500000, Math.round(((spRev[sp] || 0) / 4) * 1.08 / 50000) * 50000)
    targets.push({ id: `tg_${sp}_${qPrev}`, ownerType: 'SALESPERSON', ownerId: sp, periodType: 'QUARTER', period: qPrev, amount: q, slabs: SLABS, createdAt: ts(`${qPrev}-01`) })
    targets.push({ id: `tg_${sp}_${qCur}`, ownerType: 'SALESPERSON', ownerId: sp, periodType: 'QUARTER', period: qCur, amount: Math.round(q * 1.05 / 50000) * 50000, slabs: SLABS, createdAt: ts(`${qCur}-01`) })
  }

  // ---------------------------------------------------------------- nudge actions (history)
  const nudgeActions = [
    ['d11', 'TASK', 24, 'u6'], ['d16', 'EMAIL', 20, 'u5'], ['d12', 'TASK', 18, 'u18'], ['d8', 'EMAIL', 14, 'u7'],
    ['d5', 'ACTIONED', 11, 'u5'], ['d13', 'TASK', 9, 'u7'], ['d7', 'EMAIL', 6, 'u6'], ['d17', 'ORDERED', 4, 'u5'],
  ].map(([partnerId, action, ago, by], i) => ({ id: `na${i + 1}`, partnerId, action, note: action === 'ORDERED' ? 'Dealer placed reorder after reminder' : action === 'TASK' ? 'Follow-up task created' : action === 'EMAIL' ? 'Reminder emailed' : 'Discussed on call', productIds: [], date: daysAgo(ago), ts: ts(daysAgo(ago)), by }))

  // onboarding history (submission dates) so onboarding cycle-time KPIs have a baseline
  core.partners.forEach((p, i) => {
    if (p.submittedAt) return
    if (p.onboardedAt) { p.submittedAt = ts(addDays(p.onboardedAt, -(3 + (i % 6)))); p.submittedBy = p.salespersonId }
    else if (p.status === 'PENDING_APPROVAL') { p.submittedAt = ts(daysAgo(2)); p.submittedBy = p.salespersonId }
  })

  return { quotations, tasks, targets, nudgeActions }
}
