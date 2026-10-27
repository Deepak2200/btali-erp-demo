// Btali Books – pure accounting engine (no React). Used by the accounts seed, slice and screens.
// Every business document is turned into balanced double-entry postings, so Trial Balance, P&L,
// Balance Sheet, party ledgers, bank books and GST/TDS registers are always derived consistently.
import { round2, today, addDays } from '../../../lib/format'

// ------------------------------------------------------------------ periods
export const fyStart = (d = today()) => {
  const [y, m] = d.split('-').map(Number)
  return `${m >= 4 ? y : y - 1}-04-01`
}
export const fyEnd = (d = today()) => `${Number(fyStart(d).slice(0, 4)) + 1}-03-31`
export const fyLabel = (d = today()) => {
  const y = Number(fyStart(d).slice(0, 4))
  return `FY ${y}-${String(y + 1).slice(2)}`
}
/** ERP go-live (detailed books) – 1st of the previous month; earlier FY months were migrated from Tally as summary vouchers */
export const goLiveDate = (d = today()) => {
  const [y, m] = d.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 2, 1))
  return dt.toISOString().slice(0, 10)
}
export const monthEnd = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
export const nextMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1))
  return d.toISOString().slice(0, 7)
}
export const monthsBetween = (fromYm, toYm) => {
  const out = []
  let c = fromYm
  while (c <= toYm && out.length < 240) { out.push(c); c = nextMonth(c) }
  return out
}
export const quarterOf = (iso) => {
  const m = Number(iso.slice(5, 7))
  const y = Number(iso.slice(0, 4))
  const fy = m >= 4 ? y : y - 1
  const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 && m <= 12 ? 3 : 4
  return { key: `${fy}-Q${q}`, label: `Q${q} ${fy}-${String(fy + 1).slice(2)}`, q, fy }
}

// ------------------------------------------------------------------ masters
export const GROUPS = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses']
// [code, name, group, subgroup, nature]
const COA_DEF = [
  ['1101', 'Plant & Machinery', 'Assets', 'Fixed Assets', 'DR'],
  ['1102', 'Furniture & Fixtures', 'Assets', 'Fixed Assets', 'DR'],
  ['1103', 'Computers & IT Equipment', 'Assets', 'Fixed Assets', 'DR'],
  ['1104', 'Motor Vehicles', 'Assets', 'Fixed Assets', 'DR'],
  ['1105', 'Office Equipment', 'Assets', 'Fixed Assets', 'DR'],
  ['1150', 'Accumulated Depreciation', 'Assets', 'Fixed Assets', 'CR'],
  ['1201', 'Stock-in-Trade (Inventory)', 'Assets', 'Current Assets', 'DR'],
  ['1210', 'Sundry Debtors (Dealers)', 'Assets', 'Current Assets', 'DR'],
  ['1220', 'HDFC Bank Current A/c', 'Assets', 'Bank Accounts', 'DR'],
  ['1221', 'ICICI Bank OD A/c', 'Assets', 'Bank Accounts', 'DR'],
  ['1230', 'Cash in Hand', 'Assets', 'Cash-in-Hand', 'DR'],
  ['1231', 'Petty Cash', 'Assets', 'Cash-in-Hand', 'DR'],
  ['1240', 'Input CGST', 'Assets', 'Duties & Taxes (ITC)', 'DR'],
  ['1241', 'Input SGST', 'Assets', 'Duties & Taxes (ITC)', 'DR'],
  ['1242', 'Input IGST', 'Assets', 'Duties & Taxes (ITC)', 'DR'],
  ['1243', 'Import IGST Credit (Customs)', 'Assets', 'Duties & Taxes (ITC)', 'DR'],
  ['1250', 'TDS Receivable', 'Assets', 'Loans & Advances', 'DR'],
  ['1260', 'Advances to Suppliers', 'Assets', 'Loans & Advances', 'DR'],
  ['1270', 'Security Deposits', 'Assets', 'Loans & Advances', 'DR'],
  ['1280', 'Prepaid Expenses', 'Assets', 'Loans & Advances', 'DR'],
  ['1290', 'Fixed Deposits – HDFC Bank', 'Assets', 'Investments', 'DR'],
  ['2101', 'Sundry Creditors – Import Suppliers', 'Liabilities', 'Current Liabilities', 'CR'],
  ['2102', 'Sundry Creditors – Domestic & Logistics', 'Liabilities', 'Current Liabilities', 'CR'],
  ['2201', 'Output CGST', 'Liabilities', 'Duties & Taxes', 'CR'],
  ['2202', 'Output SGST', 'Liabilities', 'Duties & Taxes', 'CR'],
  ['2203', 'Output IGST', 'Liabilities', 'Duties & Taxes', 'CR'],
  ['2210', 'TDS Payable – 194C', 'Liabilities', 'Duties & Taxes', 'CR'],
  ['2211', 'TDS Payable – 194J', 'Liabilities', 'Duties & Taxes', 'CR'],
  ['2212', 'TDS Payable – 194Q', 'Liabilities', 'Duties & Taxes', 'CR'],
  ['2213', 'TDS Payable – 194I', 'Liabilities', 'Duties & Taxes', 'CR'],
  ['2214', 'TDS Payable – 194H', 'Liabilities', 'Duties & Taxes', 'CR'],
  ['2220', 'Outstanding Expenses', 'Liabilities', 'Provisions', 'CR'],
  ['2230', 'Salary Payable', 'Liabilities', 'Provisions', 'CR'],
  ['2301', 'HDFC Bank Term Loan', 'Liabilities', 'Secured Loans', 'CR'],
  ['2302', 'ICICI Bank Vehicle Loan', 'Liabilities', 'Secured Loans', 'CR'],
  ['2310', 'Unsecured Loan – Directors', 'Liabilities', 'Unsecured Loans', 'CR'],
  ['3001', 'Share Capital', 'Equity', 'Capital Account', 'CR'],
  ['3002', 'Reserves & Surplus', 'Equity', 'Reserves & Surplus', 'CR'],
  ['4001', 'Sales – Domestic (GST)', 'Income', 'Sales Accounts', 'CR'],
  ['4002', 'Sales – Export', 'Income', 'Sales Accounts', 'CR'],
  ['4010', 'Freight & Pickup Charges Recovered', 'Income', 'Indirect Income', 'CR'],
  ['4020', 'Foreign Exchange Gain / (Loss)', 'Income', 'Indirect Income', 'CR'],
  ['4030', 'Interest Income', 'Income', 'Indirect Income', 'CR'],
  ['4040', 'Discounts & Recoveries from Vendors', 'Income', 'Indirect Income', 'CR'],
  ['4099', 'Round Off', 'Income', 'Indirect Income', 'CR'],
  ['5001', 'Cost of Goods Sold', 'Expenses', 'Direct Expenses', 'DR'],
  ['5101', 'Freight Inward & Forwarding (GAF)', 'Expenses', 'Direct Expenses', 'DR'],
  ['5102', 'Port Transport (Shiv Sai)', 'Expenses', 'Direct Expenses', 'DR'],
  ['5103', 'Warehousing Charges (Starex)', 'Expenses', 'Direct Expenses', 'DR'],
  ['5104', 'Carriage Outward (Safex & Transporters)', 'Expenses', 'Direct Expenses', 'DR'],
  ['5105', 'Sales Returns & Discounts', 'Expenses', 'Direct Expenses', 'DR'],
  ['5106', 'Clearing Charges (CHA)', 'Expenses', 'Direct Expenses', 'DR'],
  ['5201', 'Salaries & Wages', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5202', 'Rent', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5203', 'Sales Commission', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5204', 'Electricity & Utilities', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5205', 'Internet & Telephone', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5206', 'Travelling & Conveyance', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5207', 'Office Expenses', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5208', 'Printing & Stationery', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5209', 'Professional & Legal Fees', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5210', 'Bank Charges', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5211', 'Interest on Loans', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5212', 'Depreciation', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5213', 'Repairs & Maintenance', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5214', 'Business Promotion', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5215', 'Insurance', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5216', 'Courier & Postage', 'Expenses', 'Indirect Expenses', 'DR'],
  ['5217', 'Staff Welfare', 'Expenses', 'Indirect Expenses', 'DR'],
]
export const baseChart = () => COA_DEF.map(([code, name, group, subgroup, nature]) => ({ id: code, code, name, group, subgroup, nature, opening: 0, system: true, active: true }))

export const EXPENSE_CATEGORIES = {
  Rent: '5202', 'Sales Commission': '5203', 'Electricity & Utilities': '5204', 'Internet & Telephone': '5205', 'Travelling & Conveyance': '5206',
  'Office Expenses': '5207', 'Printing & Stationery': '5208', 'Professional Fees': '5209', 'Repairs & Maintenance': '5213', 'Business Promotion': '5214',
  Insurance: '5215', 'Courier & Postage': '5216', 'Staff Welfare': '5217', 'Bank Charges': '5210', 'Salaries & Wages': '5201', 'Employer PF & ESIC': '5201',
}
export const EXPENSE_CATEGORY_LIST = Object.keys(EXPENSE_CATEGORIES).filter((c) => !['Salaries & Wages', 'Employer PF & ESIC'].includes(c))
export const BILL_CATEGORIES = [
  { value: 'SUPPLIER', label: 'Supplier (goods)', account: '1201' },
  { value: 'FREIGHT', label: 'Freight / Forwarding', account: '5101' },
  { value: 'CHA', label: 'CHA / Clearing', account: '5106' },
  { value: 'WAREHOUSE', label: 'Warehousing (Starex)', account: '5103' },
  { value: 'TRANSPORT', label: 'Transport', account: '5104' },
  { value: 'OTHER', label: 'Other', account: '5207' },
]
export const billAccount = (b, vendor) => {
  if (b.accountId) return b.accountId
  if (b.category === 'TRANSPORT' && vendor?.subtype === 'PORT_TRANSPORT') return '5102'
  return BILL_CATEGORIES.find((c) => c.value === b.category)?.account || '5207'
}
export const TDS_SECTIONS = [
  { code: '194C', label: '194C – Contractors (transport, warehousing, CHA)', rate: 2, rateIndividual: 1, account: '2210' },
  { code: '194J', label: '194J – Professional / technical fees', rate: 10, account: '2211' },
  { code: '194Q', label: '194Q – Purchase of goods (> ₹50 L)', rate: 0.1, account: '2212' },
  { code: '194I', label: '194I – Rent (land & building)', rate: 10, account: '2213' },
  { code: '194H', label: '194H – Commission / brokerage', rate: 5, account: '2214' },
]
export const tdsAccount = (section) => TDS_SECTIONS.find((t) => t.code === section)?.account || '2210'
/** default TDS rate: 194C is 1% for individuals/HUF (4th PAN char P/H) */
export const tdsRateFor = (section, pan = '') => {
  const t = TDS_SECTIONS.find((x) => x.code === section)
  if (!t) return 0
  if (section === '194C' && /^[A-Z]{3}[PH]/.test(String(pan).toUpperCase())) return t.rateIndividual
  return t.rate
}
export const panFromGstin = (gstin = '') => (gstin && gstin.length >= 12 ? gstin.slice(2, 12) : '')
export const COMPANY_STATE_CODE = '27'
export const isIntraState = (gstinOrState) => {
  if (!gstinOrState) return true
  if (/^\d{2}/.test(gstinOrState)) return gstinOrState.slice(0, 2) === COMPANY_STATE_CODE
  return gstinOrState === 'Maharashtra'
}
export const creditorsAccount = (vendor) => (vendor && (vendor.type === 'CHINA' || vendor.currency !== 'INR') ? '2101' : '2102')
export const PAY_MODES = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'CHEQUE', 'DD', 'SWIFT / TT', 'CASH']

/** payFrom: 'bk1' | 'bk2' | 'CASH' | 'PETTY' -> ledger code */
export const sourceLedger = (state, src) => {
  if (src === 'CASH') return '1230'
  if (src === 'PETTY') return '1231'
  return (state.bankAccounts || []).find((b) => b.id === src)?.ledgerId || '1220'
}
export const sourceName = (state, src) => {
  if (src === 'CASH') return 'Cash in Hand'
  if (src === 'PETTY') return 'Petty Cash'
  return (state.bankAccounts || []).find((b) => b.id === src)?.name || src || '—'
}

// ------------------------------------------------------------------ amounts
export const billPayable = (b) => round2((Number(b.amountINR) || 0) + (Number(b.gst) || 0) - (Number(b.tds) || 0))
export const expensePayable = (e) => round2((Number(e.amount) || 0) + (Number(e.gst) || 0) - (Number(e.tds) || 0))
export const noteTotal = (n) => round2((Number(n.amount) || 0) + (Number(n.gst) || 0))
export const splitGst = (gst, intra) => {
  if (!gst) return []
  if (intra) {
    const c = round2(gst / 2)
    return [['C', c], ['S', round2(gst - c)]]
  }
  return [['I', round2(gst)]]
}
export const cogsOf = (state, lines = []) => {
  let c = 0
  for (const l of lines) {
    if (l.cost != null) { c += l.cost * l.qty; continue }
    const p = (state.products || []).find((x) => x.id === l.productId)
    c += (p?.landedCost || 0) * (Number(l.qty) || 0)
  }
  return round2(c)
}

// ------------------------------------------------------------------ postings
/**
 * Returns [{vid, vno, vtype, date, account, dr, cr, partyType, partyId, narration, src}]
 * vtype: Sales | Receipt | Purchase | Payment | Journal | Contra | Credit Note | Debit Note
 */
export function buildPostings(state, opts = {}) {
  const start = opts.booksStart || state.accountsSettings?.booksStart || fyStart()
  const out = []
  const partners = new Map((state.partners || []).map((p) => [p.id, p]))
  const vendors = new Map((state.vendors || []).map((v) => [v.id, v]))
  const banks = new Map((state.bankAccounts || []).map((b) => [b.id, b]))
  const bankLedger = (id) => banks.get(id)?.ledgerId || '1220'
  const push = (meta, lines) => {
    for (const l of lines) {
      const dr = round2(l.dr || 0), cr = round2(l.cr || 0)
      if (!dr && !cr) continue
      out.push({ ...meta, account: l.account, dr, cr, partyType: l.partyType || null, partyId: l.partyId || null, line: l.note || '' })
    }
  }
  const gstLines = (gst, intra, side, kind) => splitGst(gst, intra).map(([h, a]) => ({
    account: kind === 'OUT' ? (h === 'C' ? '2201' : h === 'S' ? '2202' : '2203') : (h === 'C' ? '1240' : h === 'S' ? '1241' : '1242'),
    [side]: a,
  }))

  // 1. sales invoices + cost of goods sold
  for (const inv of state.invoices || []) {
    if (inv.date < start || inv.type === 'FOC' || inv.status === 'CANCELLED') continue
    const p = partners.get(inv.partnerId)
    const intra = isIntraState(p?.gstin || p?.state)
    const exp = inv.type === 'EXPORT'
    const gst = exp ? 0 : Number(inv.gst) || 0
    const ro = round2((Number(inv.total) || 0) - (Number(inv.subtotal) || 0) - gst)
    const meta = { vid: `inv:${inv.id}`, vno: inv.number, vtype: 'Sales', date: inv.date, narration: `Sales invoice ${inv.number} – ${p?.name || ''}`, src: { col: 'invoices', id: inv.id } }
    push(meta, [
      { account: '1210', dr: inv.total, partyType: 'DEALER', partyId: inv.partnerId },
      { account: exp ? '4002' : '4001', cr: inv.subtotal },
      ...gstLines(gst, intra, 'cr', 'OUT'),
      ro > 0 ? { account: '4099', cr: ro } : { account: '4099', dr: -ro },
    ])
    const cogs = cogsOf(state, inv.lines)
    push({ ...meta, vid: `cogs:${inv.id}`, vtype: 'Journal', narration: `Cost of goods sold at landed cost – ${inv.number}` }, [
      { account: '5001', dr: cogs }, { account: '1201', cr: cogs },
    ])
  }
  // 2. customer receipts
  for (const r of state.receipts || []) {
    if (r.date < start) continue
    const p = partners.get(r.partnerId)
    push({ vid: `rc:${r.id}`, vno: r.number, vtype: 'Receipt', date: r.date, narration: `Receipt ${r.mode || ''} ${r.ref || ''} – ${p?.name || ''}`.trim(), src: { col: 'receipts', id: r.id } }, [
      { account: bankLedger(r.bankId), dr: r.amount },
      { account: '1210', cr: r.amount, partyType: 'DEALER', partyId: r.partnerId },
    ])
  }
  // 3. vendor bills (booked once Boss-approved)
  for (const b of state.vendorBills || []) {
    if (!['APPROVED', 'PAID'].includes(b.status) || b.date < start) continue
    const v = vendors.get(b.vendorId)
    const intra = isIntraState(v?.gst || '27')
    push({ vid: `vb:${b.id}`, vno: b.number, vtype: 'Purchase', date: b.date, narration: `${v?.name || ''} bill ${b.vendorRef || ''}${b.description ? ` – ${b.description}` : ''}`, src: { col: 'vendorBills', id: b.id } }, [
      { account: billAccount(b, v), dr: b.amountINR },
      ...gstLines(Number(b.gst) || 0, intra, 'dr', 'IN'),
      { account: tdsAccount(b.tdsSection), cr: b.tds },
      { account: creditorsAccount(v), cr: billPayable(b), partyType: 'VENDOR', partyId: b.vendorId },
    ])
  }
  // 4. vendor payments
  for (const pm of state.vendorPayments || []) {
    if (pm.date < start) continue
    const v = vendors.get(pm.vendorId)
    const booked = Number(pm.bookedINR ?? pm.amountINR) || 0
    const paid = Number(pm.amountINR) || 0
    const diff = round2(paid - booked)
    push({ vid: `vp:${pm.id}`, vno: pm.number, vtype: 'Payment', date: pm.date, narration: `Payment to ${v?.name || ''} ${pm.mode || ''} ${pm.ref || ''}`.trim(), src: { col: 'vendorPayments', id: pm.id } }, [
      { account: creditorsAccount(v), dr: booked, partyType: 'VENDOR', partyId: pm.vendorId },
      diff > 0 ? { account: '4020', dr: diff } : { account: '4020', cr: -diff },
      { account: bankLedger(pm.bankId), cr: paid },
    ])
  }
  // 5. expenses
  for (const e of state.expenses || []) {
    if (!['APPROVED', 'PAID'].includes(e.status) || e.date < start) continue
    const meta = { vid: `ex:${e.id}`, vno: e.number, vtype: 'Journal', date: e.date, narration: `${e.category} – ${e.description}${e.payee ? ` (${e.payee})` : ''}`, src: { col: 'expenses', id: e.id } }
    push(meta, [
      { account: e.accountId || EXPENSE_CATEGORIES[e.category] || '5207', dr: e.amount },
      ...gstLines(Number(e.gst) || 0, true, 'dr', 'IN'),
      { account: tdsAccount(e.tdsSection), cr: e.tds },
      { account: '2220', cr: expensePayable(e) },
    ])
    if (e.status === 'PAID') {
      const d = (e.paidAt || e.date).slice(0, 10)
      push({ ...meta, vid: `exp:${e.id}`, vtype: 'Payment', date: d < start ? start : d, narration: `Paid ${e.category} – ${e.description}` }, [
        { account: '2220', dr: expensePayable(e) },
        { account: sourceLedger(state, e.payFrom || e.bankId || 'bk1'), cr: expensePayable(e) },
      ])
    }
  }
  // 6. manual journals & vouchers
  for (const j of state.journals || []) {
    if (j.status !== 'POSTED' || j.date < start) continue
    push({ vid: `jv:${j.id}`, vno: j.number, vtype: j.type === 'CONTRA' ? 'Contra' : j.type === 'PAYMENT' ? 'Payment' : j.type === 'RECEIPT' ? 'Receipt' : 'Journal', date: j.date, narration: j.narration || '', src: { col: 'journals', id: j.id } },
      (j.lines || []).map((l) => ({ account: l.accountId, dr: Number(l.dr) || 0, cr: Number(l.cr) || 0, partyType: l.partyType, partyId: l.partyId })))
  }
  // 7. credit / debit notes
  for (const n of state.notes || []) {
    if (n.status === 'CANCELLED' || (n.date || '') < start) continue
    const total = noteTotal(n)
    const meta = { vid: `nt:${n.id}`, vno: n.number, vtype: n.type === 'CREDIT' ? 'Credit Note' : 'Debit Note', date: n.date, narration: n.reason || '', src: { col: 'notes', id: n.id } }
    if (n.partnerId) {
      const p = partners.get(n.partnerId)
      const intra = isIntraState(p?.gstin || p?.state)
      if (n.type === 'CREDIT') push(meta, [{ account: n.accountId || '5105', dr: n.amount }, ...gstLines(Number(n.gst) || 0, intra, 'dr', 'OUT'), { account: '1210', cr: total, partyType: 'DEALER', partyId: n.partnerId }])
      else push(meta, [{ account: '1210', dr: total, partyType: 'DEALER', partyId: n.partnerId }, { account: n.accountId || '4010', cr: n.amount }, ...gstLines(Number(n.gst) || 0, intra, 'cr', 'OUT')])
    } else if (n.vendorId) {
      const v = vendors.get(n.vendorId)
      const intra = isIntraState(v?.gst || '27')
      const cred = creditorsAccount(v)
      const acct = n.accountId || (v?.type === 'CHINA' ? '1201' : n.source === 'SAFEX' ? '5104' : '4040')
      if (n.type === 'DEBIT' && n.source !== 'SAFEX') push(meta, [{ account: cred, dr: total, partyType: 'VENDOR', partyId: n.vendorId }, { account: acct, cr: n.amount }, ...gstLines(Number(n.gst) || 0, intra, 'cr', 'IN')])
      else push(meta, [{ account: acct, dr: n.amount }, ...gstLines(Number(n.gst) || 0, intra, 'dr', 'IN'), { account: cred, cr: total, partyType: 'VENDOR', partyId: n.vendorId }])
    }
  }
  // 8. loan EMIs
  for (const ln of state.loans || []) {
    for (const r of ln.schedule || []) {
      if (r.status !== 'PAID' || !r.paidOn || r.paidOn < start) continue
      push({ vid: `emi:${ln.id}:${r.n}`, vno: `EMI ${r.n}/${ln.tenureMonths}`, vtype: 'Payment', date: r.paidOn, narration: `EMI ${r.n} – ${ln.lender} ${ln.accountNo}`, src: { col: 'loans', id: ln.id } }, [
        { account: ln.ledgerId, dr: r.principal }, { account: '5211', dr: r.interest }, { account: bankLedger(ln.bankId), cr: round2(r.principal + r.interest) },
      ])
    }
  }
  // 9. customs duty + import IGST on finalised shipments
  for (const sh of state.shipments || []) {
    const lc = sh.landedCost
    if (!lc?.finalized) continue
    const d = (sh.ata || lc.finalizedAt || '').slice(0, 10)
    if (!d || d < start) continue
    const duty = Number(lc.duty) || 0, igst = Number(lc.igst) || 0
    push({ vid: `boe:${sh.id}`, vno: `BOE ${sh.number}`, vtype: 'Payment', date: d, narration: `Customs duty & import IGST via ICEGATE – ${sh.number} (${sh.containerNo})`, src: { col: 'shipments', id: sh.id } }, [
      { account: '1201', dr: duty }, { account: '1243', dr: igst }, { account: '1220', cr: duty + igst },
    ])
  }
  // 10. payroll runs (HR module) from go-live
  const gl = (state.accountsSettings?.goLive || goLiveDate()).slice(0, 7)
  for (const pr of state.payrollRuns || []) {
    if (!['APPROVED', 'PAID'].includes(pr.status) || pr.postedExpenses) continue
    const per = String(pr.period || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(per) || per < gl) continue
    const amt = Number(pr.totalGross || pr.totalNet) || 0
    const net = Number(pr.totalNet) || amt
    const d = monthEnd(per)
    push({ vid: `pr:${pr.id}`, vno: `Payroll ${pr.periodLabel || per}`, vtype: 'Journal', date: d, narration: `Salary for ${pr.periodLabel || per}`, src: { col: 'payrollRuns', id: pr.id } }, [
      { account: '5201', dr: amt }, { account: '2230', cr: net }, { account: '2220', cr: round2(amt - net) },
    ])
    if (pr.status === 'PAID') push({ vid: `prp:${pr.id}`, vno: `Salary ${pr.periodLabel || per}`, vtype: 'Payment', date: (pr.paidAt || d).slice(0, 10), narration: `Salary disbursed – ${pr.periodLabel || per}`, src: { col: 'payrollRuns', id: pr.id } }, [
      { account: '2230', dr: net }, { account: '1220', cr: net },
    ])
  }
  // 11. cash / petty cash book
  for (const c of state.cashEntries || []) {
    if (c.date < start) continue
    const book = c.book === 'PETTY' ? '1231' : '1230'
    push({ vid: `cb:${c.id}`, vno: c.number || 'Cash', vtype: c.type === 'IN' ? 'Receipt' : 'Payment', date: c.date, narration: c.narration || '', src: { col: 'cashEntries', id: c.id } },
      c.type === 'IN' ? [{ account: book, dr: c.amount }, { account: c.accountId, cr: c.amount }] : [{ account: c.accountId, dr: c.amount }, { account: book, cr: c.amount }])
  }
  return out
}

// ------------------------------------------------------------------ balances
const isPL = (a) => a.group === 'Income' || a.group === 'Expenses'
/** debit-positive signed opening */
export const signedOpening = (a) => (a.nature === 'CR' ? -(Number(a.opening) || 0) : Number(a.opening) || 0)

/**
 * Trial balance for period [from, to]. Income/expense accounts show period movement only; P&L before `from`
 * is carried into Reserves & Surplus. Returns { rows, totals, plBroughtForward }
 */
export function trialBalance(postings, chart, { from, to }) {
  const map = new Map(chart.map((a) => [a.id, { account: a, opening: isPL(a) ? 0 : signedOpening(a), dr: 0, cr: 0 }]))
  let plBF = 0
  for (const p of postings) {
    if (p.date > to) continue
    let r = map.get(p.account)
    if (!r) { r = { account: { id: p.account, code: p.account, name: `Ledger ${p.account}`, group: 'Assets', subgroup: 'Suspense', nature: 'DR' }, opening: 0, dr: 0, cr: 0 }; map.set(p.account, r) }
    if (p.date < from) {
      if (isPL(r.account)) plBF += p.dr - p.cr
      else r.opening += p.dr - p.cr
    } else { r.dr += p.dr; r.cr += p.cr }
  }
  const res = map.get('3002')
  if (res) res.opening += plBF
  const rows = [...map.values()].map((r) => ({ ...r, opening: round2(r.opening), dr: round2(r.dr), cr: round2(r.cr), closing: round2(r.opening + r.dr - r.cr) }))
  const totals = {
    dr: round2(rows.reduce((a, r) => a + (r.closing > 0 ? r.closing : 0), 0)),
    cr: round2(rows.reduce((a, r) => a + (r.closing < 0 ? -r.closing : 0), 0)),
  }
  return { rows, totals, plBroughtForward: round2(-plBF) }
}
/** closing balance (debit-positive) of one ledger as at date */
export function ledgerBalance(postings, chart, accountId, asOf = '9999-12-31') {
  const a = chart.find((x) => x.id === accountId)
  let b = a ? signedOpening(a) : 0
  for (const p of postings) if (p.account === accountId && p.date <= asOf) b += p.dr - p.cr
  return round2(b)
}
/** Profit & loss figures from TB rows */
export function profitAndLoss(tbRows) {
  const by = (pred) => tbRows.filter((r) => pred(r.account)).map((r) => ({ ...r, amount: r.account.group === 'Income' ? round2(r.cr - r.dr) : round2(r.dr - r.cr) })).filter((r) => Math.abs(r.amount) > 0.004)
  const sales = by((a) => a.subgroup === 'Sales Accounts')
  const otherIncome = by((a) => a.group === 'Income' && a.subgroup !== 'Sales Accounts')
  const cogs = by((a) => a.id === '5001')
  const direct = by((a) => a.subgroup === 'Direct Expenses' && a.id !== '5001')
  const indirect = by((a) => a.subgroup === 'Indirect Expenses' && !['5211', '5212'].includes(a.id))
  const finance = by((a) => a.id === '5211')
  const dep = by((a) => a.id === '5212')
  const s = (arr) => round2(arr.reduce((x, r) => x + r.amount, 0))
  const revenue = s(sales)
  const gross = round2(revenue - s(cogs) - s(direct))
  const ebitda = round2(gross + s(otherIncome) - s(indirect))
  const net = round2(ebitda - s(finance) - s(dep))
  return { sales, otherIncome, cogs, direct, indirect, finance, dep, revenue, cogsTotal: s(cogs), directTotal: s(direct), indirectTotal: s(indirect), otherIncomeTotal: s(otherIncome), financeTotal: s(finance), depTotal: s(dep), gross, ebitda, net }
}

// ------------------------------------------------------------------ party ledgers & ageing
export function partyStatement(postings, partyType, partyId, { from = '0000-01-01', to = '9999-12-31' } = {}) {
  let opening = 0
  const rows = []
  const ps = postings.filter((p) => p.partyType === partyType && p.partyId === partyId && p.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.vno.localeCompare(b.vno))
  for (const p of ps) {
    if (p.date < from) { opening += p.dr - p.cr; continue }
    rows.push(p)
  }
  let bal = opening
  const lines = rows.map((p) => { bal = round2(bal + p.dr - p.cr); return { ...p, balance: bal } })
  return { opening: round2(opening), lines, closing: round2(bal), dr: round2(rows.reduce((a, r) => a + r.dr, 0)), cr: round2(rows.reduce((a, r) => a + r.cr, 0)) }
}
export const BUCKETS = [
  { key: 'b0', label: '0–30 days', min: 0, max: 30 },
  { key: 'b1', label: '31–60 days', min: 31, max: 60 },
  { key: 'b2', label: '61–90 days', min: 61, max: 90 },
  { key: 'b3', label: '90+ days', min: 91, max: 99999 },
]
const bucketOf = (days) => BUCKETS.find((b) => days >= b.min && days <= b.max)?.key || 'b0'
/** FIFO ageing for each party: open debit items (receivables) or open credit items (payables) */
export function ageing(postings, partyType, asOf = today()) {
  const byParty = new Map()
  for (const p of postings) {
    if (p.partyType !== partyType || p.date > asOf) continue
    if (!byParty.has(p.partyId)) byParty.set(p.partyId, [])
    byParty.get(p.partyId).push(p)
  }
  const out = []
  for (const [partyId, ps] of byParty) {
    ps.sort((a, b) => a.date.localeCompare(b.date))
    // for receivables, "items" are debits; for payables, items are credits
    const itemSide = partyType === 'DEALER' ? 'dr' : 'cr'
    const setSide = partyType === 'DEALER' ? 'cr' : 'dr'
    let pool = ps.reduce((a, p) => a + p[setSide], 0)
    const open = []
    for (const p of ps) {
      if (!p[itemSide]) continue
      const take = Math.min(pool, p[itemSide])
      pool -= take
      const rem = round2(p[itemSide] - take)
      if (rem > 0.5) open.push({ ...p, open: rem, days: Math.max(0, Math.round((new Date(asOf) - new Date(p.date)) / 86400000)) })
    }
    const row = { partyId, b0: 0, b1: 0, b2: 0, b3: 0, total: 0, advance: round2(pool), items: open }
    for (const o of open) { row[bucketOf(o.days)] += o.open; row.total += o.open }
    for (const k of ['b0', 'b1', 'b2', 'b3', 'total']) row[k] = round2(row[k])
    if (row.total > 0.5 || row.advance > 0.5) out.push(row)
  }
  return out.sort((a, b) => b.total - a.total)
}

// ------------------------------------------------------------------ loans & depreciation helpers
export function emiSchedule({ principal, rate, tenureMonths, startDate, dayOfMonth }) {
  const r = rate / 1200
  const emi = round2((principal * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1))
  let bal = principal
  const rows = []
  const [y, m] = startDate.split('-').map(Number)
  for (let n = 1; n <= tenureMonths; n++) {
    const interest = round2(bal * r)
    let princ = round2(emi - interest)
    if (n === tenureMonths) princ = round2(bal)
    bal = round2(bal - princ)
    const d = new Date(Date.UTC(y, m - 1 + n, Math.min(dayOfMonth || 5, 28)))
    rows.push({ n, dueDate: d.toISOString().slice(0, 10), emi: round2(princ + interest), principal: princ, interest, balance: Math.max(0, bal), status: 'DUE', paidOn: null })
  }
  return { emi, rows }
}
export const loanOutstanding = (loan, asOf = '9999-12-31') => {
  const paid = (loan.schedule || []).filter((r) => r.status === 'PAID' && (r.paidOn || r.dueDate) <= asOf)
  return round2(loan.principal - paid.reduce((a, r) => a + r.principal, 0))
}
/** monthly depreciation for an asset given accumulated depreciation so far */
export const monthlyDep = (a, acc) => {
  const wdv = (Number(a.cost) || 0) - acc
  if (wdv <= (Number(a.salvage) || 0) + 0.5) return 0
  const m = a.method === 'WDV' ? (wdv * (Number(a.rate) || 0)) / 1200 : ((Number(a.cost) - (Number(a.salvage) || 0)) / ((Number(a.lifeYears) || 10) * 12))
  return round2(Math.min(m, wdv - (Number(a.salvage) || 0)))
}
/** projected schedule (yearly, by FY) from purchase for display */
export function depreciationSchedule(a, years = 6) {
  const rows = []
  let acc = 0
  let ym = a.purchaseDate.slice(0, 7)
  const startFy = fyStart(a.purchaseDate)
  let fy = startFy
  let row = { fy: fyLabel(fy), opening: round2(a.cost), dep: 0 }
  for (let i = 0; i < years * 12 + 12; i++) {
    const fyOf = fyStart(`${ym}-15`)
    if (fyOf !== fy) {
      row.closing = round2(a.cost - acc)
      rows.push(row)
      if (rows.length >= years) break
      fy = fyOf
      row = { fy: fyLabel(fy), opening: round2(a.cost - acc), dep: 0 }
    }
    const d = monthlyDep(a, acc)
    acc += d
    row.dep = round2(row.dep + d)
    ym = nextMonth(ym)
  }
  return rows
}
export const addMonthsISO = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10)
}
export { addDays }
