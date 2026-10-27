// Module seed for "accounts": chart of accounts, banks, vendor bills & payments, expenses, vouchers, notes,
// assets, loans, cash/cheque books, GST/TDS masters, reconciliation trackers. Books start on 1-Apr of the
// current FY; months before ERP go-live are carried as Tally summary vouchers so every report ties out.
import { addDays, daysAgo, today, round2, makeAttachment } from '../../lib/format'
import {
  baseChart, fyStart, goLiveDate, monthEnd, monthsBetween, nextMonth, buildPostings, emiSchedule, monthlyDep, cogsOf, addMonthsISO,
} from '../../apps/erp/accounts/_books'

const iso = (d, h = 11) => `${d}T${String(h).padStart(2, '0')}:20:00.000Z`
const pad = (n) => String(n).padStart(4, '0')

export const accountsSeed = (core) => {
  const T = today()
  const FY = fyStart(T)
  const GL = goLiveDate(T)
  const curYm = T.slice(0, 7)
  const FX = core.settings.fx.USD
  const V = (id) => core.vendors.find((v) => v.id === id)
  const PO = (id) => core.purchaseOrders.find((p) => p.id === id)
  const SH = (id) => core.shipments.find((s) => s.id === id)
  const poUSD = (id) => round2((PO(id)?.lines || []).reduce((a, l) => a + l.qty * l.rate, 0))
  const clampD = (d) => (d < FY ? FY : d)

  // ------------------------------------------------------------ banks
  const bankAccounts = [
    { id: 'bk1', name: 'HDFC Bank Current A/c', bank: 'HDFC Bank', short: 'HDFC', accountNo: '50200034871126', ifsc: 'HDFC0000540', branch: 'Vashi, Navi Mumbai', type: 'CURRENT', ledgerId: '1220', odLimit: 0, swift: 'HDFCINBBXXX', primary: true, manualBalances: [] },
    { id: 'bk2', name: 'ICICI Bank OD A/c', bank: 'ICICI Bank', short: 'ICICI OD', accountNo: '623505012874', ifsc: 'ICIC0006235', branch: 'Turbhe MIDC, Navi Mumbai', type: 'OD', ledgerId: '1221', odLimit: 15000000, odRate: 9.6, swift: 'ICICINBBCTS', primary: false, manualBalances: [] },
  ]

  // ------------------------------------------------------------ vendor bills + payments
  const hist = (date, by, text) => ({ ts: iso(date), by, text })
  const bills = []
  const payments = []
  let vpN = 0
  const mkBill = (n, b) => {
    const v = V(b.vendorId)
    const fxRate = b.currency === 'USD' ? b.fxRate || FX : 1
    const amountINR = round2(b.amount * fxRate)
    const gst = round2(amountINR * (b.gstRate || 0) / 100)
    const tdsRate = b.tdsRate ?? 0
    const tds = Math.round(amountINR * tdsRate / 100)
    const bill = {
      id: `vb${n}`, number: `VB/26-27/${pad(n)}`, vendorId: b.vendorId, vendorRef: b.vendorRef, poId: b.poId || null, shipmentId: b.shipmentId || null,
      date: b.date, dueDate: b.dueDate, currency: b.currency || 'INR', amount: b.amount, fxRate, amountINR, gstRate: b.gstRate || 0, gst,
      tdsSection: b.tdsSection || '', tdsRate, tds, category: b.category, billType: b.billType || 'INVOICE', description: b.description,
      status: b.status, submittedBy: 'u9', submittedAt: iso(b.date, 12), bossApprovedAt: ['APPROVED', 'PAID'].includes(b.status) ? iso(addDays(b.date, 1), 10) : null,
      bossApprovedBy: ['APPROVED', 'PAID', 'REJECTED'].includes(b.status) ? 'u1' : null, bossRemark: b.bossRemark || '',
      paidAt: null, paymentId: null, paymentRef: '', swift: null,
      attachments: [makeAttachment(`${(b.vendorRef || 'bill').replace(/[/ ]/g, '-')}.pdf`, { docType: 'INVOICE' })],
      history: [hist(b.date, 'u9', 'Bill entered and sent for Boss approval')],
    }
    if (bill.bossApprovedAt) bill.history.push(hist(addDays(b.date, 1), 'u1', `Approved by Boss${b.bossRemark ? ` – ${b.bossRemark}` : ''}; forwarded to Madam for payment`))
    if (b.status === 'REJECTED') bill.history.push(hist(addDays(b.date, 1), 'u1', `Rejected – ${b.bossRemark}`))
    if (b.status === 'PAID') {
      vpN++
      const payFx = b.currency === 'USD' ? round2(fxRate + (b.payFxDelta ?? 0.22)) : 1
      const paidINR = b.currency === 'USD' ? round2(b.amount * payFx) : round2(amountINR + gst - tds)
      const pm = {
        id: `vp${vpN}`, number: `VP/26-27/${pad(vpN)}`, billIds: [bill.id], vendorId: b.vendorId, date: b.paidOn, mode: b.currency === 'USD' ? 'SWIFT / TT' : b.mode || 'NEFT',
        bankId: b.bankId || 'bk1', ref: b.payRef, currency: bill.currency, amountFC: b.currency === 'USD' ? b.amount : null, fxRate: payFx,
        bookedINR: round2(amountINR + gst - tds), amountINR: paidINR, swift: b.currency === 'USD' ? makeAttachment(`SWIFT-${b.payRef}.pdf`, { docType: 'SWIFT' }) : null, paidBy: 'u2',
      }
      payments.push(pm)
      Object.assign(bill, { paidAt: iso(b.paidOn, 15), paymentId: pm.id, paymentRef: b.payRef, swift: pm.swift })
      bill.history.push(hist(b.paidOn, 'u2', `Paid by Madam via ${pm.mode} ${b.payRef}`))
    }
    bills.push(bill)
  }
  const usd = (po, pct) => round2(poUSD(po) * pct / 100)
  mkBill(25, { vendorId: 'v1', vendorRef: 'NHP-PI-0826-71/ADV', poId: 'po6', category: 'SUPPLIER', billType: 'ADVANCE', currency: 'USD', amount: usd('po6', 30), fxRate: 83.05, date: daysAgo(55), dueDate: daysAgo(52), status: 'PAID', paidOn: daysAgo(53), payRef: 'HDFCTT2608551', description: '30% advance against PI NHP-PI-0826-71 (PO/26-27/0094)' })
  mkBill(26, { vendorId: 'v2', vendorRef: 'TJC-PI-2609-114/ADV', poId: 'po4', category: 'SUPPLIER', billType: 'ADVANCE', currency: 'USD', amount: usd('po4', 30), fxRate: 83.4, date: daysAgo(24), dueDate: daysAgo(21), status: 'PAID', paidOn: daysAgo(22), payRef: 'HDFCTT2610078', description: '30% advance against PI TJC-PI-2609-114 (PO/26-27/0101)' })
  mkBill(27, { vendorId: 'v3', vendorRef: 'SCV-PI-0826-33/ADV', poId: 'po5', category: 'SUPPLIER', billType: 'ADVANCE', currency: 'USD', amount: usd('po5', 20), fxRate: 83.1, date: daysAgo(43), dueDate: daysAgo(40), status: 'PAID', paidOn: daysAgo(41), payRef: 'HDFCTT2609117', description: '20% advance against PI SCV-PI-0826-33 (PO/26-27/0097)' })
  mkBill(28, { vendorId: 'v5', vendorRef: 'YGS-PI-0526-40/ADV', poId: 'po9', shipmentId: 'sh3', category: 'SUPPLIER', billType: 'ADVANCE', currency: 'USD', amount: usd('po9', 50), fxRate: 82.9, date: daysAgo(128), dueDate: daysAgo(125), status: 'PAID', paidOn: daysAgo(126), payRef: 'HDFCTT2606214', description: '50% advance against PI YGS-PI-0526-40 (PO/25-26/0071)' })
  mkBill(29, { vendorId: 'v5', vendorRef: 'YGS-CI-0526-40/BAL', poId: 'po9', shipmentId: 'sh3', category: 'SUPPLIER', billType: 'BALANCE', currency: 'USD', amount: usd('po9', 50), fxRate: 83.2, date: daysAgo(55), dueDate: daysAgo(34), status: 'PAID', paidOn: daysAgo(36), payRef: 'HDFCTT2609033', description: '50% balance against BL OLS2607702 – telex release' })
  mkBill(30, { vendorId: 'v4', vendorRef: 'ZAQ-PI-0726-12/ADV', poId: 'po7', shipmentId: 'sh1', category: 'SUPPLIER', billType: 'ADVANCE', currency: 'USD', amount: usd('po7', 30), fxRate: 83.0, date: daysAgo(79), dueDate: daysAgo(76), status: 'PAID', paidOn: daysAgo(77), payRef: 'HDFCTT2608102', description: '30% advance against PI ZAQ-PI-0726-12 (PO/26-27/0088)' })
  mkBill(31, { vendorId: 'v2', vendorRef: 'TJC-PI-0626-88/ADV', poId: 'po8', shipmentId: 'sh2', category: 'SUPPLIER', billType: 'ADVANCE', currency: 'USD', amount: usd('po8', 30), fxRate: 82.85, date: daysAgo(95), dueDate: daysAgo(92), status: 'PAID', paidOn: daysAgo(93), payRef: 'HDFCTT2607190', description: '30% advance against PI TJC-PI-0626-88 (PO/26-27/0082)' })
  mkBill(32, { vendorId: 'fw3', vendorRef: 'GAF/IMP/26-27/0412', shipmentId: 'sh4', category: 'FREIGHT', gstRate: 18, tdsSection: '194C', tdsRate: 2, amount: 96800, date: daysAgo(105), dueDate: daysAgo(90), status: 'PAID', paidOn: daysAgo(92), payRef: 'NEFT-HDFC-N2607771', description: 'Ocean freight, DO & local charges – SH/25-26/0015' })
  mkBill(33, { vendorId: 'lg1', vendorRef: 'STX/BHW/26-27/0814', category: 'WAREHOUSE', gstRate: 18, tdsSection: '194C', tdsRate: 2, amount: 178500, date: daysAgo(56), dueDate: daysAgo(26), status: 'PAID', paidOn: daysAgo(27), payRef: 'NEFT-HDFC-N2609921', description: `Warehousing, handling & MIS – ${monthLabelOf(addDays(GL, -1))}` })
  mkBill(34, { vendorId: 'cha1', vendorRef: 'SCH/0912/26', shipmentId: 'sh3', category: 'CHA', gstRate: 18, tdsSection: '194C', tdsRate: 2, amount: 28500, date: daysAgo(26), dueDate: daysAgo(19), status: 'PAID', paidOn: daysAgo(18), payRef: 'NEFT-HDFC-N2610142', description: 'Customs clearance & documentation – BOE 6588120' })
  mkBill(35, { vendorId: 'lg3', vendorRef: 'SST/248', shipmentId: 'sh3', category: 'TRANSPORT', accountId: '5102', gstRate: 0, tdsSection: '194C', tdsRate: 1, amount: 14500, date: daysAgo(25), dueDate: daysAgo(10), status: 'PAID', paidOn: daysAgo(12), payRef: 'NEFT-HDFC-N2610388', description: 'Container movement JNPT → Starex Bhiwandi (CMAU 551809 1)' })
  mkBill(36, { vendorId: 'v6', vendorRef: 'RPP/26-27/1187', poId: 'po12', category: 'SUPPLIER', gstRate: 18, tdsSection: '194Q', tdsRate: 0.1, amount: 153000, date: daysAgo(21), dueDate: addDays(T, 9), status: 'PAID', paidOn: daysAgo(3), payRef: 'NEFT-HDFC-N2610702', description: 'Sewage pumps 1 HP × 30 (PO/26-27/0099)' })
  mkBill(37, { vendorId: 'fw3', vendorRef: 'GAF/IMP/26-27/0587', shipmentId: 'sh3', category: 'FREIGHT', gstRate: 18, tdsSection: '194C', tdsRate: 2, amount: 112400, date: daysAgo(14), dueDate: addDays(T, 1), status: 'APPROVED', description: 'Ocean freight, DO, THC & local charges – SH/26-27/0019 (raised 15 days after arrival)' })
  mkBill(38, { vendorId: 'lg1', vendorRef: 'STX/BHW/26-27/0903', category: 'WAREHOUSE', gstRate: 18, tdsSection: '194C', tdsRate: 2, amount: 185000, date: daysAgo(26), dueDate: addDays(T, 4), status: 'APPROVED', description: `Warehousing, handling & MIS – ${monthLabelOf(GL)}` })
  mkBill(39, { vendorId: 'v2', vendorRef: 'TJC-CI-0626-88/BAL', poId: 'po8', shipmentId: 'sh2', category: 'SUPPLIER', billType: 'BALANCE', currency: 'USD', amount: usd('po8', 70), fxRate: 83.45, date: daysAgo(27), dueDate: daysAgo(1), status: 'APPROVED', description: '70% balance against BL OLS2608870 – required for telex release' })
  mkBill(40, { vendorId: 'v4', vendorRef: 'ZAQ-CI-0726-12/BAL', poId: 'po7', shipmentId: 'sh1', category: 'SUPPLIER', billType: 'BALANCE', currency: 'USD', amount: usd('po7', 70), fxRate: 83.55, date: daysAgo(12), dueDate: addDays(T, 5), status: 'APPROVED', description: '70% balance against BL OLS2609114 – pay before ETA for telex' })
  mkBill(41, { vendorId: 'lg2', vendorRef: 'SFX/26-27/0931', category: 'TRANSPORT', gstRate: 12, tdsSection: '194C', tdsRate: 2, amount: 42600, date: daysAgo(4), dueDate: addDays(T, 11), status: 'PENDING_BOSS', description: `Safex local deliveries & pickups – ${monthLabelOf(GL)}` })
  mkBill(24, { vendorId: 'cha1', vendorRef: 'SCH/1007/26', shipmentId: 'sh2', category: 'CHA', gstRate: 18, tdsSection: '194C', tdsRate: 2, amount: 31200, date: daysAgo(2), dueDate: addDays(T, 5), status: 'PENDING_BOSS', description: 'Customs clearance & BOE filing – SH/26-27/0022' })
  mkBill(23, { vendorId: 'v1', vendorRef: 'NHP-CI-0826-71/BAL', poId: 'po6', category: 'SUPPLIER', billType: 'BALANCE', currency: 'USD', amount: usd('po6', 70), fxRate: FX, date: daysAgo(1), dueDate: addDays(T, 6), status: 'PENDING_BOSS', description: '70% balance before BL release – goods ready to ship (PO/26-27/0094)' })
  mkBill(22, { vendorId: 'lg2', vendorRef: 'SFX/26-27/0902', category: 'TRANSPORT', gstRate: 12, tdsSection: '194C', tdsRate: 2, amount: 38900, date: daysAgo(30), dueDate: daysAgo(15), status: 'REJECTED', bossRemark: 'Duplicate of LR-wise bills already paid in August – logged in Wrong Workings', description: 'Safex local deliveries – consolidated' })
  bills.sort((a, b) => b.date.localeCompare(a.date))

  // ------------------------------------------------------------ expenses
  const expenseTemplates = [
    { id: 'et1', name: 'Office rent – Turbhe', category: 'Rent', payee: 'Sai Properties LLP', amount: 85000, gstRate: 18, tdsSection: '194I', dayOfMonth: 1, payFrom: 'bk1', active: true, lastGenerated: curYm },
    { id: 'et2', name: 'C&F agent commission', category: 'Sales Commission', payee: 'Agarwal Marketing Services', amount: 45000, gstRate: 0, tdsSection: '194H', dayOfMonth: 5, payFrom: 'bk1', active: true, lastGenerated: GL.slice(0, 7) },
    { id: 'et3', name: 'Electricity – MSEDCL', category: 'Electricity & Utilities', payee: 'MSEDCL', amount: 12400, gstRate: 0, tdsSection: '', dayOfMonth: 10, payFrom: 'bk1', active: true, lastGenerated: GL.slice(0, 7) },
    { id: 'et4', name: 'Leased line & mobiles', category: 'Internet & Telephone', payee: 'Bharti Airtel Ltd', amount: 4000, gstRate: 18, tdsSection: '', dayOfMonth: 8, payFrom: 'bk1', active: true, lastGenerated: curYm },
    { id: 'et5', name: 'Housekeeping & security', category: 'Office Expenses', payee: 'Om Facility Services', amount: 18000, gstRate: 18, tdsSection: '194C', dayOfMonth: 1, payFrom: 'bk1', active: true, lastGenerated: curYm },
  ]
  let exN = 60
  const expenses = []
  const mkExp = (e) => {
    exN++
    const gst = round2((e.amount * (e.gstRate || 0)) / 100)
    const tdsRate = e.tdsSection === '194I' ? 10 : e.tdsSection === '194H' ? 5 : e.tdsSection === '194J' ? 10 : e.tdsSection === '194C' ? 2 : 0
    const tds = Math.round((e.amount * tdsRate) / 100)
    const x = {
      id: `ex${exN}`, number: `EXPN-${pad(exN)}`, date: e.date, category: e.category, accountId: undefined, description: e.description, payee: e.payee || '', amount: e.amount, gstRate: e.gstRate || 0, gst,
      tdsSection: e.tdsSection || '', tdsRate, tds, recurring: !!e.templateId, templateId: e.templateId || null, frequency: e.templateId ? 'MONTHLY' : null,
      status: e.status, payFrom: e.payFrom || 'bk1', paymentMode: e.payFrom === 'PETTY' || e.payFrom === 'CASH' ? 'CASH' : 'NEFT', paidAt: e.status === 'PAID' ? iso(e.paidOn || e.date, 16) : null, paymentRef: e.status === 'PAID' ? e.ref || `NEFT-HDFC-N${String(2609000 + exN * 37)}` : '',
      submittedBy: e.by || 'u9', approvedBy: ['APPROVED', 'PAID', 'REJECTED'].includes(e.status) ? (e.amount <= 5000 ? null : 'u1') : null, remark: e.remark || '',
      attachments: e.noAtt ? [] : [makeAttachment(`${e.category.replace(/\W+/g, '-')}-${e.date}.pdf`)],
      history: [{ ts: iso(e.date, 10), by: e.by || 'u9', text: 'Expense logged' }],
    }
    delete x.accountId
    if (e.amount <= 5000 && e.status !== 'PENDING_APPROVAL' && e.status !== 'REJECTED') x.history.push({ ts: iso(e.date, 10), by: 'system', text: 'Auto-approved (within ₹5,000 approval threshold)' })
    else if (['APPROVED', 'PAID'].includes(e.status)) x.history.push({ ts: iso(e.date, 15), by: 'u1', text: 'Approved' })
    if (e.status === 'REJECTED') x.history.push({ ts: iso(e.date, 15), by: 'u1', text: `Rejected – ${e.remark}` })
    if (e.status === 'PAID') x.history.push({ ts: iso(e.paidOn || e.date, 16), by: 'u2', text: `Paid from ${e.payFrom === 'PETTY' ? 'petty cash' : e.payFrom === 'CASH' ? 'cash' : 'HDFC Bank'}` })
    expenses.push(x)
  }
  const glm = GL.slice(0, 7)
  const day = (ym, d) => { const x = `${ym}-${String(d).padStart(2, '0')}`; return x > T ? T : x }
  for (const ym of monthsBetween(glm, curYm)) {
    const isCur = ym === curYm
    for (const t of expenseTemplates) {
      if (isCur && t.lastGenerated !== curYm) continue
      const d = day(ym, t.dayOfMonth)
      const paid = !isCur || t.id === 'et4' || t.id === 'et1'
      mkExp({ date: d, category: t.category, payee: t.payee, description: `${t.name} – ${monthLabelOf(d)}`, amount: t.id === 'et3' ? (isCur ? 12400 : 13180) : t.amount, gstRate: t.gstRate, tdsSection: t.tdsSection, templateId: t.id, status: paid ? 'PAID' : 'APPROVED', paidOn: addDays(d, 2) > T ? T : addDays(d, 2) })
    }
  }
  const adhoc = [
    { date: daysAgo(48), category: 'Travelling & Conveyance', payee: 'Rohit Kulkarni', description: 'Dealer visits Pune–Nashik (fuel, tolls, stay)', amount: 8450, status: 'PAID', by: 'u5' },
    { date: daysAgo(44), category: 'Courier & Postage', payee: 'Blue Dart', description: 'Courier of PI originals & dealer kits', amount: 1250, status: 'PAID', payFrom: 'PETTY', noAtt: true },
    { date: daysAgo(39), category: 'Printing & Stationery', payee: 'Shree Printers', description: 'Warranty cards & dealer price list booklets (2,000 nos)', amount: 6800, gstRate: 18, status: 'PAID' },
    { date: daysAgo(33), category: 'Repairs & Maintenance', payee: 'CoolTech Services', description: 'Server room AC servicing', amount: 4200, gstRate: 18, status: 'PAID' },
    { date: daysAgo(15), category: 'Professional Fees', payee: 'Mehta & Associates, CA', description: 'GST & TDS compliance retainer – Q2', amount: 45000, gstRate: 18, tdsSection: '194J', status: 'PAID', paidOn: daysAgo(12) },
    { date: daysAgo(9), category: 'Insurance', payee: 'ICICI Lombard GIC', description: 'Stock-in-warehouse fire & burglary policy renewal', amount: 38000, gstRate: 18, status: 'APPROVED' },
    { date: daysAgo(6), category: 'Travelling & Conveyance', payee: 'Sameer Khan', description: 'Ludhiana & Amritsar dealer meet travel', amount: 11850, status: 'PAID', by: 'u6', paidOn: daysAgo(4) },
    { date: daysAgo(5), category: 'Office Expenses', payee: 'D-Mart Business', description: 'Pantry & office supplies', amount: 3450, status: 'PAID', payFrom: 'PETTY' },
    { date: daysAgo(3), category: 'Business Promotion', payee: 'Hotel Fern Residency', description: 'Diwali dealer meet – Navi Mumbai (60 dealers)', amount: 62000, gstRate: 18, status: 'PENDING_APPROVAL', by: 'u4' },
    { date: daysAgo(2), category: 'Staff Welfare', payee: 'Chitale Bandhu', description: 'Diwali sweets & gifts for staff and Starex team', amount: 14500, gstRate: 5, status: 'PENDING_APPROVAL', by: 'u10' },
    { date: daysAgo(1), category: 'Repairs & Maintenance', payee: 'Sanket Electricals', description: 'Battery stacker – charger replacement', amount: 7600, gstRate: 18, status: 'PENDING_APPROVAL', by: 'u17' },
    { date: daysAgo(20), category: 'Travelling & Conveyance', payee: 'Vendor visit', description: 'Personal family travel booked on company card', amount: 12000, status: 'REJECTED', remark: 'Personal expense – not reimbursable', by: 'u5' },
  ]
  for (const a of adhoc) mkExp(a)
  expenses.sort((a, b) => b.date.localeCompare(a.date))

  // ------------------------------------------------------------ notes (credit / debit)
  const lastInv = (pid, minAge = 0) => core.invoices.filter((i) => i.partnerId === pid && i.date <= daysAgo(minAge)).sort((a, b) => b.date.localeCompare(a.date))[0]
  const notes = []
  const mkNote = (n) => {
    const inv = n.partnerId ? lastInv(n.partnerId, n.minAge || 5) : null
    const gst = round2(n.amount * (n.gstRate ?? 18) / 100)
    notes.push({ id: n.id, number: n.number, type: n.type, partnerId: n.partnerId || null, vendorId: n.vendorId || null, invoiceId: inv?.id || null, billId: n.billId || null, amount: n.amount, gstRate: n.gstRate ?? 18, gst, total: round2(n.amount + gst), reason: n.reason, source: n.source, date: n.date, status: n.status || 'ISSUED', createdBy: n.by || 'u9', createdAt: iso(n.date) })
  }
  mkNote({ id: 'nt1', number: 'CN/26-27/0007', type: 'CREDIT', partnerId: 'd3', amount: 4200, reason: 'Rate difference – price list revision applied late on invoice', source: 'MANUAL', date: daysAgo(18), minAge: 20 })
  mkNote({ id: 'nt2', number: 'CN/26-27/0008', type: 'CREDIT', partnerId: 'd5', amount: 11500, reason: 'Q2 turnover scheme – 1% quantity discount', source: 'MANUAL', date: daysAgo(10) })
  mkNote({ id: 'nt3', number: 'DN/26-27/0012', type: 'DEBIT', partnerId: 'd16', vendorId: 'lg2', amount: 860, reason: 'Safex pickup charges for consignment collected from Starex', source: 'SAFEX', date: daysAgo(16), minAge: 16 })
  mkNote({ id: 'nt4', number: 'DN/26-27/0013', type: 'DEBIT', partnerId: 'd2', vendorId: 'lg2', amount: 640, reason: 'Safex pickup charges for consignment collected from Starex', source: 'SAFEX', date: daysAgo(8), minAge: 8 })
  mkNote({ id: 'nt5', number: 'DN/26-27/0014', type: 'DEBIT', vendorId: 'v5', amount: round2(4 * 19 * FX), gstRate: 0, reason: 'Short supply – 4 × Battery Sprayer 20 L on SH/26-27/0019 (GRN/26-27/0021)', source: 'DISCREPANCY', date: daysAgo(25) })
  mkNote({ id: 'nt6', number: 'CN/26-27/0009', type: 'CREDIT', partnerId: 'd4', amount: 3800, reason: 'Transit damage – dealer accepted unit with discount', source: 'RETURN', date: daysAgo(6) })

  // ------------------------------------------------------------ fixed assets
  const assetDefs = [
    ['FA-001', 'Pallet racking system – Starex Gala 14-18', 'Plant & Machinery', '1101', 'Starex, Bhiwandi', '2024-05-10', 1850000, 'SLM', 0, 15, 92500, 'Godrej Storage Solutions'],
    ['FA-002', 'Battery-operated stacker 1.5 T', 'Plant & Machinery', '1101', 'Starex, Bhiwandi', '2025-01-15', 420000, 'WDV', 15, 0, 21000, 'Kion India'],
    ['FA-003', 'Office furniture & workstations', 'Furniture & Fixtures', '1102', 'Turbhe HO', '2023-08-01', 640000, 'SLM', 0, 10, 32000, 'Featherlite'],
    ['FA-004', 'Dell Latitude laptops (8 nos)', 'Computers & IT Equipment', '1103', 'Turbhe HO', '2025-06-12', 520000, 'WDV', 40, 0, 0, 'Dell India'],
    ['FA-005', 'Server, firewall & networking', 'Computers & IT Equipment', '1103', 'Turbhe HO', '2024-11-20', 280000, 'WDV', 40, 0, 0, 'Netweb Technologies'],
    ['FA-006', 'Tata Intra V30 pickup (MH43 BX 2214)', 'Motor Vehicles', '1104', 'Turbhe HO', '2025-02-24', 950000, 'WDV', 15, 0, 47500, 'Tata Motors – Concorde'],
    ['FA-007', 'Toyota Innova Crysta (MH43 BK 7710)', 'Motor Vehicles', '1104', 'Director', '2023-04-18', 2350000, 'WDV', 15, 0, 117500, 'Toyota – Sai Service'],
    ['FA-008', 'Air conditioners, CCTV & office equipment', 'Office Equipment', '1105', 'Turbhe HO', '2024-03-15', 310000, 'SLM', 0, 15, 15500, 'Voltas / CP Plus'],
  ]
  const lastDone = addMonthsISO(`${curYm}-01`, -1).slice(0, 7)
  const depByMonth = {}
  const assets = assetDefs.map(([code, name, category, ledgerId, location, purchaseDate, cost, method, rate, lifeYears, salvage, vendor], i) => {
    const a = { id: `fa${i + 1}`, code, name, category, ledgerId, location, purchaseDate, cost, method, rate, lifeYears, salvage, vendor, invoiceRef: `${vendor.split(' ')[0].toUpperCase()}/${purchaseDate.slice(2, 4)}/${100 + i * 7}`, status: 'ACTIVE', accumulatedDep: 0, openingAccDep: 0, lastDepPeriod: null, attachments: [makeAttachment(`${code}-invoice.pdf`)] }
    let acc = 0
    for (const ym of monthsBetween(purchaseDate.slice(0, 7), lastDone)) {
      const d = monthlyDep(a, acc)
      acc = round2(acc + d)
      if (`${ym}-01` >= FY) { depByMonth[ym] = depByMonth[ym] || []; depByMonth[ym].push([a, d]) } else a.openingAccDep = acc
    }
    a.accumulatedDep = acc
    a.lastDepPeriod = lastDone
    return a
  })

  // ------------------------------------------------------------ loans
  const firstOfMonth = `${curYm}-01`
  const mkLoan = (id, d) => {
    const { emi, rows } = emiSchedule(d)
    for (const r of rows) if (r.dueDate <= T) { r.status = 'PAID'; r.paidOn = r.dueDate; r.ref = `ACH-${d.short}-${r.dueDate.replace(/-/g, '')}` }
    return { id, ...d, emi, schedule: rows, status: 'ACTIVE', attachments: [makeAttachment(`${d.short}-sanction-letter.pdf`)] }
  }
  const loans = [
    mkLoan('ln1', { lender: 'HDFC Bank', short: 'HDFC-TL', type: 'TERM_LOAN', purpose: 'Warehouse racking & working capital', accountNo: 'TL/8801/22457', principal: 4000000, rate: 10.25, tenureMonths: 48, startDate: addMonthsISO(firstOfMonth, -14), dayOfMonth: 5, bankId: 'bk1', ledgerId: '2301', security: 'Hypothecation of stock & book debts; personal guarantee of directors' }),
    mkLoan('ln2', { lender: 'ICICI Bank', short: 'ICICI-VL', type: 'VEHICLE', purpose: 'Tata Intra V30 pickup + Innova Crysta', accountNo: 'LAVMU00041872215', principal: 950000, rate: 8.9, tenureMonths: 60, startDate: addMonthsISO(firstOfMonth, -20), dayOfMonth: 10, bankId: 'bk1', ledgerId: '2302', security: 'Hypothecation of vehicles' }),
  ]

  // ------------------------------------------------------------ journals (Tally summaries, depreciation, manual vouchers)
  const journals = []
  let jvN = 96, cv = 0, pv = 0, rv = 0
  const J = (type, date, narration, lines, extra = {}) => {
    let number
    if (type === 'CONTRA') number = `CV/26-27/${pad(++cv)}`
    else if (type === 'PAYMENT') number = `PV/26-27/${pad(++pv)}`
    else if (type === 'RECEIPT') number = `RV/26-27/${pad(++rv)}`
    else number = `JV/26-27/${pad(++jvN)}`
    const j = { id: `jv${journals.length + 1}`, number, type, date, narration, lines: lines.filter((l) => (l.dr || 0) + (l.cr || 0) > 0).map((l) => ({ ...l, dr: round2(l.dr || 0), cr: round2(l.cr || 0) })), status: 'POSTED', source: 'MANUAL', createdBy: 'u9', postedBy: 'u9', createdAt: iso(date, 18), ...extra }
    journals.push(j)
    return j
  }
  // monthly Tally summaries for FY months before go-live
  const fyInv = core.invoices.filter((i) => i.date >= FY && i.type !== 'FOC')
  const cogsBy = {}
  for (const i of fyInv) { const m = i.date.slice(0, 7); cogsBy[m] = (cogsBy[m] || 0) + cogsOf(core, i.lines) }
  const summaryMonths = GL > FY ? monthsBetween(FY.slice(0, 7), addMonthsISO(GL, -1).slice(0, 7)) : []
  const china = ['v1', 'v2', 'v3', 'v4', 'v5']
  const shares = [0.24, 0.2, 0.18, 0.22, 0.16]
  const tdsByMonth = {}
  for (const m of summaryMonths) {
    const d = monthEnd(m)
    const P = Math.round(((cogsBy[m] || 0) * 0.86) / 1000) * 1000
    const split = china.map((v, k) => ({ v, amt: k === china.length - 1 ? 0 : Math.round(P * shares[k]) }))
    split[split.length - 1].amt = P - split.slice(0, -1).reduce((a, x) => a + x.amt, 0)
    J('JOURNAL', d, `Import purchases booked – ${monthLabelOf(d)} (Tally summary)`, [{ accountId: '1201', dr: P }, ...split.map((x) => ({ accountId: '2101', cr: x.amt, partyType: 'VENDOR', partyId: x.v }))], { source: 'TALLY' })
    J('PAYMENT', d, `Supplier remittances (SWIFT/TT) – ${monthLabelOf(d)} (Tally summary)`, [...split.map((x) => ({ accountId: '2101', dr: x.amt, partyType: 'VENDOR', partyId: x.v })), { accountId: '1220', cr: P }], { source: 'TALLY' })
    const run = (core.payrollRuns || []).find((r) => r.period === m)
    const sal = Math.round(run?.totalGross || 1305000)
    const oh = [['5201', sal], ['5202', 85000], ['5203', 45000], ['5204', 12900], ['5205', 4000], ['5206', 31500], ['5207', 26400], ['5103', 176000], ['5104', 58200], ['5101', 88400], ['5106', 28000], ['5102', 14500]]
    const t194I = 8500, t194H = 2250, t194C = Math.round((176000 + 88400 + 28000 + 18000) * 0.02 + 14500 * 0.01)
    tdsByMonth[m] = { '194I': t194I, '194H': t194H, '194C': t194C }
    const gross = oh.reduce((a, x) => a + x[1], 0)
    J('PAYMENT', d, `Salaries, overheads & logistics – ${monthLabelOf(d)} (Tally summary)`, [...oh.map(([a, v]) => ({ accountId: a, dr: v })), { accountId: '2213', cr: t194I }, { accountId: '2214', cr: t194H }, { accountId: '2210', cr: t194C }, { accountId: '1220', cr: gross - t194I - t194H - t194C }], { source: 'TALLY' })
  }
  // depreciation runs for completed FY months
  for (const [ym, list] of Object.entries(depByMonth).sort()) {
    const amt = round2(list.reduce((a, [, d]) => a + d, 0))
    const byLedger = {}
    for (const [a, d] of list) byLedger[a.ledgerId] = round2((byLedger[a.ledgerId] || 0) + d)
    J('JOURNAL', monthEnd(ym), `Depreciation for ${monthLabelOf(`${ym}-01`)} – ${list.length} assets (SLM/WDV as per register)`, [{ accountId: '5212', dr: amt }, { accountId: '1150', cr: amt }], { source: 'DEPRECIATION', period: ym, detail: Object.fromEntries(list.map(([a, d]) => [a.id, d])) })
  }
  const depRuns = Object.keys(depByMonth).sort().map((ym) => ({ period: ym, journalId: journals.find((j) => j.period === ym)?.id, by: 'u9', at: iso(monthEnd(ym), 19) }))
  // operational vouchers after go-live
  J('RECEIPT', clampD(daysAgo(70)), 'Unsecured loan from Director (Vikram Mehta) for import duty', [{ accountId: '1220', dr: 2500000 }, { accountId: '2310', cr: 2500000 }])
  J('CONTRA', clampD(addDays(GL, 4)), 'Transfer HDFC → ICICI OD to reduce utilisation', [{ accountId: '1221', dr: 1000000 }, { accountId: '1220', cr: 1000000 }])
  J('RECEIPT', clampD(monthEnd(GL.slice(0, 7))), 'Interest on FD credited – HDFC FD 50300088172', [{ accountId: '1220', dr: 18450 }, { accountId: '4030', cr: 18450 }])
  J('JOURNAL', clampD(monthEnd(GL.slice(0, 7))), 'Provision for statutory audit fees – H1', [{ accountId: '5209', dr: 60000 }, { accountId: '2220', cr: 60000 }])
  J('CONTRA', daysAgo(9), 'Cash withdrawn for office & petty cash', [{ accountId: '1230', dr: 50000 }, { accountId: '1220', cr: 50000 }])
  J('JOURNAL', daysAgo(7), 'Insurance paid in advance – unexpired portion (Nov–Mar) reclassified', [{ accountId: '1280', dr: 15800 }, { accountId: '5215', cr: 15800 }])
  J('PAYMENT', daysAgo(11), 'ICICI OD interest debited for the month', [{ accountId: '5211', dr: 48650 }, { accountId: '1221', cr: 48650 }])
  journals.push({ id: 'jvd1', number: 'JV/26-27/DRAFT', type: 'JOURNAL', date: T, narration: 'Rent equalisation – Starex security deposit adjustment (to be reviewed)', lines: [{ accountId: '5103', dr: 12000, cr: 0 }, { accountId: '1270', dr: 0, cr: 12000 }], status: 'DRAFT', source: 'MANUAL', createdBy: 'u9', createdAt: iso(T, 10) })

  // ------------------------------------------------------------ cash book & cheques
  const cashEntries = [
    { id: 'cb1', number: 'CB-0141', book: 'CASH', type: 'OUT', date: daysAgo(9), amount: 15000, accountId: '1231', narration: 'Petty cash imprest top-up', by: 'u9' },
    { id: 'cb2', number: 'CB-0142', book: 'CASH', type: 'OUT', date: daysAgo(8), amount: 3500, accountId: '5206', narration: 'Diesel – Tata Intra pickup', by: 'u9' },
    { id: 'cb3', number: 'CB-0143', book: 'CASH', type: 'IN', date: daysAgo(7), amount: 4500, accountId: '4040', narration: 'Sale of packing scrap (cartons, pallets)', by: 'u9' },
    { id: 'cb4', number: 'PC-0318', book: 'PETTY', type: 'OUT', date: daysAgo(6), amount: 850, accountId: '5216', narration: 'Courier – DTDC (dealer documents)', by: 'u9' },
    { id: 'cb5', number: 'PC-0319', book: 'PETTY', type: 'OUT', date: daysAgo(5), amount: 3200, accountId: '5217', narration: 'Tea, snacks & pantry', by: 'u9' },
    { id: 'cb6', number: 'CB-0144', book: 'CASH', type: 'OUT', date: daysAgo(4), amount: 2300, accountId: '5206', narration: 'Local conveyance – bank & CHA office visits', by: 'u9' },
    { id: 'cb7', number: 'PC-0320', book: 'PETTY', type: 'OUT', date: daysAgo(2), amount: 1240, accountId: '5208', narration: 'Stationery – files, toner refill', by: 'u9' },
    { id: 'cb8', number: 'PC-0321', book: 'PETTY', type: 'OUT', date: daysAgo(1), amount: 600, accountId: '5207', narration: 'Hamali – loading samples', by: 'u9' },
  ]
  const so4 = core.salesOrders.find((s) => s.id === 'so_open_4')
  const cheques = [
    { id: 'cq1', direction: 'RECEIVED', instrument: 'CHEQUE', number: '004512', date: daysAgo(2), bankName: 'Punjab National Bank', partyType: 'DEALER', partyId: 'd14', partyName: 'Amar Electricals & Pumps', amount: so4?.total || 252402, soId: 'so_open_4', bankId: 'bk1', status: 'DEPOSITED', depositedOn: daysAgo(1), note: 'Advance for back-to-back order' },
    { id: 'cq2', direction: 'ISSUED', instrument: 'CHEQUE', number: '771204', date: addDays(T, 5), bankName: 'HDFC Bank', partyType: 'OTHER', partyName: 'Sai Properties LLP', amount: 91800, bankId: 'bk1', status: 'ISSUED', note: 'PDC – office rent (post-dated)' },
    { id: 'cq3', direction: 'ISSUED', instrument: 'DD', number: 'DD 118843', date: daysAgo(29), bankName: 'HDFC Bank', partyType: 'OTHER', partyName: 'Commissioner of Customs, JNCH', amount: 25000, bankId: 'bk1', status: 'CLEARED', clearedOn: daysAgo(27), note: 'Bond deposit – provisional assessment' },
    { id: 'cq4', direction: 'ISSUED', instrument: 'CHEQUE', number: '771198', date: daysAgo(18), bankName: 'HDFC Bank', partyType: 'VENDOR', partyId: 'lg3', partyName: 'Shiv Sai Transport', amount: 6500, bankId: 'bk1', status: 'CANCELLED', note: 'Cancelled – paid by NEFT instead' },
    { id: 'cq5', direction: 'RECEIVED', instrument: 'CHEQUE', number: '220917', date: daysAgo(64), bankName: 'State Bank of India', partyType: 'DEALER', partyId: 'd15', partyName: 'Gupta Brothers Trading', amount: 38400, bankId: 'bk1', status: 'BOUNCED', depositedOn: daysAgo(63), bouncedOn: daysAgo(60), note: 'Returned – funds insufficient; order put on hold' },
    { id: 'cq6', direction: 'RECEIVED', instrument: 'DD', number: 'DD 554120', date: daysAgo(35), bankName: 'Bank of Baroda', partyType: 'DEALER', partyId: 'd12', partyName: 'Odisha Krishi Kendra', amount: 64250, bankId: 'bk1', status: 'CLEARED', depositedOn: daysAgo(34), clearedOn: daysAgo(33) },
  ]

  // ------------------------------------------------------------ GST rate master & settings
  const gstRates = [
    { id: 'gr1', hsn: '8413', description: 'Pumps for liquids (monoblock, submersible, booster)', rate: 18, cess: 0, type: 'GOODS', effectiveFrom: '2017-07-01' },
    { id: 'gr2', hsn: '8414', description: 'Air compressors & tyre inflators', rate: 18, cess: 0, type: 'GOODS', effectiveFrom: '2017-07-01' },
    { id: 'gr3', hsn: '8508', description: 'Vacuum cleaners', rate: 18, cess: 0, type: 'GOODS', effectiveFrom: '2017-07-01' },
    { id: 'gr4', hsn: '8424', description: 'Pressure washers & sprayers', rate: 18, cess: 0, type: 'GOODS', effectiveFrom: '2017-07-01' },
    { id: 'gr5', hsn: '8481', description: 'Valves & taps (spares)', rate: 18, cess: 0, type: 'GOODS', effectiveFrom: '2017-07-01' },
    { id: 'gr6', hsn: '9965', description: 'Goods transport agency (GTA) – RCM', rate: 5, cess: 0, type: 'SERVICE', effectiveFrom: '2017-07-01' },
    { id: 'gr7', hsn: '9967', description: 'Warehousing & cargo handling', rate: 18, cess: 0, type: 'SERVICE', effectiveFrom: '2017-07-01' },
    { id: 'gr8', hsn: '9972', description: 'Renting of commercial property', rate: 18, cess: 0, type: 'SERVICE', effectiveFrom: '2017-07-01' },
    { id: 'gr9', hsn: '9982', description: 'Legal & accounting services', rate: 18, cess: 0, type: 'SERVICE', effectiveFrom: '2017-07-01' },
  ]
  const accountsSettings = {
    booksStart: FY, goLive: GL,
    counters: { VP: vpN, CV: cv, PV: pv, RV: rv, CB: 144, PC: 321, WW: 6, FA: 8, BS: 1, TDS: 0 },
    einvoice: { provider: 'ClearTax GSP', env: 'Production', gstin: core.settings.company.gstin, connected: true, autoIrn: true, autoEwb: true, lastSync: iso(daysAgo(1), 18), apiUser: 'btali_api', ewbDefaultDistanceKm: 0 },
    reminders: { billsDueDays: 7, lastSent: iso(daysAgo(2), 10) },
  }

  // ------------------------------------------------------------ wrong workings tracker
  const wrongWorkings = [
    { id: 'ww1', number: 'WW-0001', vendorId: 'lg1', source: 'STAREX', ref: 'STX/BHW/26-27/0814', period: monthLabelOf(addDays(GL, -1)), category: 'QTY_MISMATCH', issue: 'Pallet positions billed 1,240 vs 1,180 actual occupancy (MIS stock report)', billedAmount: 74400, correctAmount: 70800, difference: 3600, status: 'RESOLVED', recoveredAmount: 3600, resolution: 'Credit adjusted in next month bill', loggedBy: 'u9', loggedAt: iso(daysAgo(50)), resolvedAt: iso(daysAgo(26)), history: [] },
    { id: 'ww2', number: 'WW-0002', vendorId: 'lg2', source: 'SAFEX', ref: 'SFX/26-27/0902', period: monthLabelOf(GL), category: 'DUPLICATE', issue: 'Consolidated bill duplicates LR-wise bills already paid', billedAmount: 43568, correctAmount: 0, difference: 43568, status: 'RAISED_WITH_VENDOR', recoveredAmount: 0, resolution: '', loggedBy: 'u9', loggedAt: iso(daysAgo(29)), history: [] },
    { id: 'ww3', number: 'WW-0003', vendorId: 'fw3', source: 'GAF', ref: 'GAF/IMP/26-27/0587', period: 'SH/26-27/0019', category: 'RATE_MISMATCH', issue: 'Detention charged for 3 days though within 14 free days agreed in RFQ', billedAmount: 18900, correctAmount: 0, difference: 18900, status: 'OPEN', recoveredAmount: 0, resolution: '', loggedBy: 'u9', loggedAt: iso(daysAgo(12)), history: [] },
    { id: 'ww4', number: 'WW-0004', vendorId: 'lg1', source: 'STAREX', ref: 'Weekly truck report', period: 'Last week', category: 'NOT_ORDERED', issue: 'Handling charged on cancelled dispatch (order put on hold)', billedAmount: 2450, correctAmount: 0, difference: 2450, status: 'OPEN', recoveredAmount: 0, resolution: '', loggedBy: 'u9', loggedAt: iso(daysAgo(4)), history: [] },
    { id: 'ww5', number: 'WW-0005', vendorId: 'lg3', source: 'SHIV_SAI', ref: 'SST/231', period: 'SH/25-26/0015', category: 'DUPLICATE', issue: 'Waiting charges billed twice for the same container', billedAmount: 3000, correctAmount: 1500, difference: 1500, status: 'WRITTEN_OFF', recoveredAmount: 0, resolution: 'Below recovery threshold – written off with Boss consent', loggedBy: 'u9', loggedAt: iso(daysAgo(98)), resolvedAt: iso(daysAgo(80)), history: [] },
    { id: 'ww6', number: 'WW-0006', vendorId: 'lg1', source: 'STAREX', ref: 'STX/BHW/26-27/0903', period: monthLabelOf(GL), category: 'GST_ERROR', issue: 'IGST charged instead of CGST+SGST (intra-state supply)', billedAmount: 33300, correctAmount: 33300, difference: 0, status: 'RESOLVED', recoveredAmount: 0, resolution: 'Revised tax invoice received', loggedBy: 'u9', loggedAt: iso(daysAgo(24)), resolvedAt: iso(daysAgo(20)), history: [] },
  ].map((w) => ({ ...w, history: [{ ts: w.loggedAt, by: w.loggedBy, text: 'Logged in Wrong Workings tracker' }, ...(w.resolvedAt ? [{ ts: w.resolvedAt, by: 'u9', text: `${w.status === 'RESOLVED' ? 'Resolved' : 'Written off'} – ${w.resolution}` }] : [])] }))

  // ------------------------------------------------------------ provisional state → GST settlement, TDS challans, bank sweeps
  const chart = baseChart()
  const prov = () => ({ ...core, bankAccounts, vendorBills: bills, vendorPayments: payments, expenses, journals, notes, loans, cashEntries, chartOfAccounts: chart, accountsSettings })
  let postings = buildPostings(prov(), { booksStart: FY })
  const months = monthsBetween(FY.slice(0, 7), curYm)
  // GST: output tax for month m settled on the 20th of m+1 (GSTR-3B), using import IGST + input credit of the month
  const tdsChallans = []
  let tdsN = 0
  for (const m of months) {
    if (m === curYm) continue
    const payDate = `${nextMonth(m)}-20`
    if (payDate > T) continue
    const inM = postings.filter((p) => p.date.slice(0, 7) === m)
    const net = (acc, side) => round2(inM.filter((p) => p.account === acc).reduce((a, p) => a + (side === 'cr' ? p.cr - p.dr : p.dr - p.cr), 0))
    const oC = net('2201', 'cr'), oS = net('2202', 'cr'), oI = net('2203', 'cr')
    const iC = Math.min(net('1240', 'dr'), oC), iS = Math.min(net('1241', 'dr'), oS), iI = net('1242', 'dr'), imp = net('1243', 'dr')
    const cash = round2(oC + oS + oI - iC - iS - iI - imp)
    J('PAYMENT', payDate, `GST paid – GSTR-3B for ${monthLabelOf(`${m}-01`)} (ITC utilised incl. import IGST)`, [
      { accountId: '2201', dr: oC }, { accountId: '2202', dr: oS }, { accountId: '2203', dr: oI },
      { accountId: '1240', cr: iC }, { accountId: '1241', cr: iS }, { accountId: '1242', cr: iI }, { accountId: '1243', cr: imp },
      cash >= 0 ? { accountId: '1220', cr: cash } : { accountId: '1242', dr: -cash },
    ], { source: 'GST' })
  }
  // TDS: deposited on the 7th of the following month
  for (const m of months) {
    if (m === curYm) continue
    const payDate = `${nextMonth(m)}-07`
    if (payDate > T) continue
    const inM = postings.filter((p) => p.date.slice(0, 7) === m && /^221[0-4]$/.test(p.account))
    const by = {}
    for (const p of inM) {
      const sec = { 2210: '194C', 2211: '194J', 2212: '194Q', 2213: '194I', 2214: '194H' }[p.account]
      by[sec] = round2((by[sec] || 0) + p.cr - p.dr)
    }
    const secs = Object.entries(by).filter(([, v]) => v > 0)
    if (!secs.length) continue
    const total = round2(secs.reduce((a, [, v]) => a + v, 0))
    const j = J('PAYMENT', payDate, `TDS deposited for ${monthLabelOf(`${m}-01`)} – challan ITNS 281 (${secs.map(([s]) => s).join(', ')})`, [
      ...secs.map(([s, v]) => ({ accountId: { '194C': '2210', '194J': '2211', '194Q': '2212', '194I': '2213', '194H': '2214' }[s], dr: v })), { accountId: '1220', cr: total },
    ], { source: 'TDS' })
    tdsN++
    tdsChallans.push({ id: `tc${tdsN}`, period: m, sections: Object.fromEntries(secs), amount: total, challanNo: `0510308${String(payDate).replace(/-/g, '').slice(2)}${String(10 + tdsN).padStart(5, '0')}`, bsr: '0510308', paidOn: payDate, bankId: 'bk1', journalId: j.id, by: 'u9' })
  }
  accountsSettings.counters.TDS = tdsN

  // HDFC sweep into FD at month end when balance exceeds ₹75 L
  postings = buildPostings(prov(), { booksStart: FY })
  const HDFC_OPEN = 4200000
  let swept = 0
  for (const m of months) {
    if (m === curYm) continue
    const d = monthEnd(m)
    const bal = HDFC_OPEN - swept + postings.filter((p) => p.account === '1220' && p.date <= d).reduce((a, p) => a + p.dr - p.cr, 0)
    if (bal > 7500000) {
      const amt = Math.floor((bal - 4500000) / 500000) * 500000
      if (amt > 0) { J('CONTRA', d, `Surplus swept to HDFC fixed deposit (auto-sweep FD 5030008${m.replace('-', '')})`, [{ accountId: '1290', dr: amt }, { accountId: '1220', cr: amt }], { source: 'MANUAL' }); swept += amt }
    }
  }

  // ------------------------------------------------------------ openings (as on 1-Apr, migrated from Tally)
  postings = buildPostings(prov(), { booksStart: FY })
  const open = {}
  for (const a of assets.filter((x) => x.purchaseDate < FY)) open[a.ledgerId] = (open[a.ledgerId] || 0) + a.cost
  open['1150'] = round2(assets.reduce((a, x) => a + x.openingAccDep, 0))
  open['1220'] = HDFC_OPEN
  open['1221'] = -1250000
  open['1230'] = 85000
  open['1231'] = 15000
  open['1250'] = 48000
  open['1270'] = 510000
  open['1290'] = 2500000
  open['3001'] = 5000000
  for (const ln of loans) {
    const paidBefore = ln.schedule.filter((r) => r.status === 'PAID' && r.paidOn < FY).reduce((a, r) => a + r.principal, 0)
    open[ln.ledgerId] = round2(ln.principal - paidBefore)
  }
  // inventory: books carried so that current book stock equals physical stock at landed cost
  const stockValue = Object.values(core.stock || {}).reduce((a, loc) => a + Object.entries(loc).reduce((b, [pid, q]) => b + q * (core.products.find((p) => p.id === pid)?.landedCost || 0), 0), 0)
  const invMove = postings.filter((p) => p.account === '1201').reduce((a, p) => a + p.dr - p.cr, 0)
  open['1201'] = Math.max(0, Math.round(stockValue - invMove))
  for (const a of chart) a.opening = round2(open[a.id] || 0)
  const drSum = chart.filter((a) => a.nature === 'DR').reduce((x, a) => x + a.opening, 0)
  const crSum = chart.filter((a) => a.nature === 'CR' && a.id !== '3002').reduce((x, a) => x + a.opening, 0)
  chart.find((a) => a.id === '3002').opening = round2(drSum - crSum)

  // ------------------------------------------------------------ bank statement (HDFC, last 3 weeks) + manual balance history
  const all = buildPostings({ ...prov(), chartOfAccounts: chart }, { booksStart: FY })
  const bookBal = (ledger, d) => round2((chart.find((a) => a.id === ledger)?.opening || 0) + all.filter((p) => p.account === ledger && p.date <= d).reduce((a, p) => a + p.dr - p.cr, 0))
  const from = daysAgo(20)
  const lines = []
  let ln = 0
  const L = (date, description, ref, debit, credit, match) => {
    ln++
    lines.push({ id: `bs${ln}`, bankId: 'bk1', date, valueDate: date, description, ref, debit: round2(debit || 0), credit: round2(credit || 0), status: match ? 'MATCHED' : 'UNMATCHED', match: match || null, importId: 'bsi1', matchedBy: match ? 'u9' : null, matchedAt: match ? iso(addDays(date, 1), 10) : null })
  }
  const partnerName = (id) => core.partners.find((p) => p.id === id)?.name || ''
  for (const r of core.receipts.filter((x) => x.date >= from && x.bankId === 'bk1').sort((a, b) => a.date.localeCompare(b.date))) {
    L(r.date, `NEFT CR-${(r.ref || '').slice(0, 16)}-${partnerName(r.partnerId).toUpperCase().slice(0, 22)}`, r.ref, 0, r.amount, r.date < daysAgo(5) ? { type: 'RECEIPT', id: r.id } : null)
  }
  for (const p of payments.filter((x) => x.date >= from)) {
    const vn = V(p.vendorId)?.name?.toUpperCase().slice(0, 22) || ''
    L(p.date, `${p.mode === 'SWIFT / TT' ? 'TT REMIT' : 'NEFT DR'}-${p.ref}-${vn}`, p.ref, p.amountINR, 0, p.date < daysAgo(10) ? { type: 'VENDOR_PAYMENT', id: p.id } : null)
  }
  for (const e of expenses.filter((x) => x.status === 'PAID' && (x.payFrom || 'bk1') === 'bk1' && x.paidAt && x.paidAt.slice(0, 10) >= from)) {
    const amt = round2(e.amount + e.gst - e.tds)
    L(e.paidAt.slice(0, 10), `NEFT DR-${e.paymentRef}-${(e.payee || '').toUpperCase().slice(0, 20)}`, e.paymentRef, amt, 0, null)
  }
  for (const lnr of loans) for (const r of lnr.schedule.filter((x) => x.status === 'PAID' && x.paidOn >= from)) L(r.paidOn, `ACH DR-${lnr.lender.toUpperCase()}-${lnr.accountNo}-EMI`, r.ref, r.emi, 0, { type: 'EMI', id: `${lnr.id}:${r.n}` })
  for (const j of journals.filter((x) => x.status === 'POSTED' && x.date >= from && x.lines.some((l) => l.accountId === '1220'))) {
    const l1220 = j.lines.find((l) => l.accountId === '1220')
    L(j.date, `${j.type === 'CONTRA' ? 'SELF TRF' : 'DR'}-${j.number}-${j.narration.toUpperCase().slice(0, 24)}`, j.number, l1220.cr, l1220.dr, j.date < daysAgo(6) ? { type: 'JOURNAL', id: j.id } : null)
  }
  L(daysAgo(17), 'SWIFT CHGS + GST ON OUTWARD REMITTANCE', 'CHG2610170', 1416, 0, null)
  L(daysAgo(3), `NEFT CR-AXISN${String(26103000 + 412)}-KAVERI PUMPS AND MOTORS`, `AXISN${String(26103000 + 412)}`, 0, 50000, null)
  L(daysAgo(2), 'IMPS CR-INT ON FD 50300088172', 'IMPS2610FD', 0, 6210, null)
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  let run = bookBal('1220', addDays(from, -1))
  for (const l of lines) { run = round2(run + l.credit - l.debit); l.balance = run }
  const bankStatementImports = [{ id: 'bsi1', bankId: 'bk1', fileName: `HDFC-Statement-${from}-to-${T}.csv`, from, to: T, lines: lines.length, importedAt: iso(T, 9), by: 'u9' }]
  for (const [bk, led] of [['bk1', '1220'], ['bk2', '1221']]) {
    const acc = bankAccounts.find((b) => b.id === bk)
    acc.manualBalances = [21, 14, 7, 1].map((n, i) => {
      const d = daysAgo(n)
      const bal = bookBal(led, d) + (bk === 'bk1' && i === 3 ? 6210 : 0)
      return { id: `mb_${bk}_${i}`, date: d, balance: Math.round(bal), note: i === 3 ? 'As per net-banking, morning' : 'Weekly balance confirmation', by: 'u2', at: iso(d, 10) }
    })
  }

  return {
    chartOfAccounts: chart,
    bankAccounts,
    bankStatements: lines,
    bankStatementImports,
    vendorBills: bills,
    vendorPayments: payments,
    expenses,
    expenseTemplates,
    journals: journals.sort((a, b) => b.date.localeCompare(a.date)),
    notes,
    assets,
    depRuns,
    loans,
    cashEntries,
    cheques,
    gstRates,
    tdsChallans,
    wrongWorkings,
    accountsSettings,
  }
}

function monthLabelOf(d) {
  const [y, m] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
