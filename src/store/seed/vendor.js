// Module seed for "vendor". Returns NEW collections (vendorProfiles, vendorDocs).
// It also adds two in-production orders (with Btali-issued barcodes) for the portal vendors so scan-to-pack has live work.
import { daysAgo, addDays, today, makeAttachment } from '../../lib/format'

const iso = (d, h = 10) => `${d}T${String(h).padStart(2, '0')}:20:00.000Z`

const PROFILES = {
  v1: { address: 'No. 88 Binhai 2nd Road, Hangzhou Bay New Zone, Ningbo, Zhejiang 315336, China', website: 'www.hailongpump.cn', established: '2006', employees: '320', capacity: '45,000 pumps / month', licence: '91330201MA2H4X7Q3K',
    contacts: [{ name: 'Li Wei', role: 'Export Manager', email: 'liwei@hailongpump.cn', phone: '+86 574 8811 2201' }, { name: 'Wu Jing', role: 'QC Manager', email: 'qc@hailongpump.cn', phone: '+86 574 8811 2240' }, { name: 'Sun Lei', role: 'Accounts', email: 'finance@hailongpump.cn', phone: '+86 574 8811 2209' }],
    bankDetails: { beneficiary: 'Ningbo Hailong Pump Co., Ltd.', bankName: 'Bank of China, Ningbo Branch', account: '3587 5812 0044', swift: 'BKCHCNBJ92A', bankAddress: '139 Yaohang Street, Ningbo, China', currency: 'USD' },
    certificates: [makeAttachment('ISO-9001-2015-Hailong.pdf', { docType: 'ISO 9001', expiry: addDays(today(), 410) }), makeAttachment('CE-Declaration-MB-Series.pdf', { docType: 'CE', expiry: addDays(today(), 220) }), makeAttachment('BIS-Registration-IS-9079.pdf', { docType: 'BIS', expiry: addDays(today(), 25) })] },
  v4: { address: 'Building 6, Xinqian Industrial Park, Taizhou, Zhejiang 318000, China', website: 'www.aquajet-cleaning.com', established: '2011', employees: '210', capacity: '18,000 washers / month', licence: '91331000MA28G21L6P',
    contacts: [{ name: 'Zhang Min', role: 'Sales Director', email: 'zhang@aquajet.cn', phone: '+86 576 8890 1123' }, { name: 'Huang Rui', role: 'After-sales Engineer', email: 'service@aquajet.cn', phone: '+86 576 8890 1150' }],
    bankDetails: { beneficiary: 'Zhejiang Aquajet Cleaning Machinery Co., Ltd.', bankName: 'Agricultural Bank of China, Taizhou', account: '1921 0101 0400 8877', swift: 'ABOCCNBJ110', bankAddress: '81 Shifu Avenue, Taizhou, China', currency: 'USD' },
    certificates: [makeAttachment('ISO-9001-Aquajet.pdf', { docType: 'ISO 9001', expiry: addDays(today(), 300) }), makeAttachment('CE-GS-Pressure-Washers.pdf', { docType: 'CE / GS', expiry: addDays(today(), 520) })] },
}

export const vendorSeed = (core) => {
  const product = (id) => core.products.find((p) => p.id === id)
  const extraPOs = [
    { id: 'po13', number: 'PO/26-27/0103', vendorId: 'v1', date: daysAgo(24), lines: [['p1', 24], ['p2', 30], ['p27', 300]], pi: 'NHP-PI-0926-84', sched: addDays(today(), 6) },
    { id: 'po14', number: 'PO/26-27/0104', vendorId: 'v4', date: daysAgo(21), lines: [['p16', 20], ['p19', 12], ['p33', 150]], pi: 'ZAQ-PI-0926-31', sched: addDays(today(), 9) },
  ]
  const series = core.settings.barcodeSeries
  for (const x of extraPOs) {
    if (core.purchaseOrders.some((p) => p.id === x.id)) continue
    const lines = x.lines.map(([pid, qty]) => ({ productId: pid, qty, rate: product(pid).vendorRate, mrp: product(pid).mrp }))
    core.purchaseOrders.push({
      id: x.id, number: x.number, type: 'IMPORT', vendorId: x.vendorId, date: x.date, status: 'IN_PRODUCTION', currency: 'USD', lines,
      paymentTerms: core.vendors.find((v) => v.id === x.vendorId)?.paymentTerms, createdBy: 'u3', approvedBy: 'u1', approvedAt: iso(addDays(x.date, 1)), source: 'REORDER_ALERT', note: '',
      pi: { number: x.pi, amount: lines.reduce((a, l) => a + l.qty * l.rate, 0), file: makeAttachment(`PI-${x.pi}.pdf`), uploadedAt: iso(addDays(x.date, 3)), status: 'APPROVED', approvedAt: iso(addDays(x.date, 4)), stampedFile: makeAttachment(`PI-${x.pi}-STAMPED.pdf`, { docType: 'PI_STAMPED' }) },
      mrpConfirmed: true, labelsSent: true, barcodesGenerated: true, barcodesAt: iso(addDays(x.date, 5)), stickerConfirmed: false,
      deliverySchedule: [{ id: `ds-${x.id}`, date: x.sched, qty: lines.reduce((a, l) => a + l.qty, 0), note: 'Full lot', declaredAt: iso(addDays(x.date, 6)) }],
      qc: [], improvements: [], docs: [makeAttachment(`PI-${x.pi}.pdf`, { docType: 'PI' }), makeAttachment(`PI-${x.pi}-STAMPED.pdf`, { docType: 'PI_STAMPED' }), makeAttachment(`MRP-Stickers-${x.number.slice(-4)}.pdf`, { docType: 'MRP_LABELS' })],
      requiresCustomerPayment: false, linkedSoId: null, customerPaid: false, exportOrderId: null,
      timeline: [{ ts: iso(x.date), text: 'PO created (reorder cycle)' }, { ts: iso(addDays(x.date, 1)), text: 'Approved; sent to vendor' }, { ts: iso(addDays(x.date, 4)), text: 'PI digitally approved – stamped copy shared with vendor' }, { ts: iso(addDays(x.date, 5)), text: 'MRP labels & barcodes shared on Vendor Portal' }],
    })
    for (const l of lines) {
      const p = product(l.productId)
      const cfg = series[p.category]
      const n = p.type === 'SPARE' ? Math.ceil(l.qty / (p.cartonQty || 1)) : l.qty
      for (let i = 0; i < n; i++) {
        const code = `${cfg.prefix}${String(cfg.next++).padStart(6, '0')}`
        core.units.push({ code, productId: p.id, poId: x.id, vendorId: x.vendorId, status: 'GENERATED', locationId: 'VENDOR', partnerId: null, invoiceId: null, packQty: p.type === 'SPARE' ? p.cartonQty : 1, history: [{ ts: iso(addDays(x.date, 5)), event: 'Barcode generated', ref: x.number }] })
      }
    }
  }

  const vendorProfiles = Object.entries(PROFILES).map(([vendorId, p]) => ({ id: `vp-${vendorId}`, vendorId, ...p, updatedAt: iso(daysAgo(40)) }))
  const vendorDocs = [
    { id: 'vd1', vendorId: 'v1', poId: 'po6', docType: 'SWIFT', title: 'Advance 30% – PO/26-27/0094', amount: 3420, currency: 'USD', date: daysAgo(52), ref: 'HDFCN26082211874', file: makeAttachment('SWIFT-Advance-PO0094.pdf', { docType: 'SWIFT' }), direction: 'TO_VENDOR' },
    { id: 'vd2', vendorId: 'v1', poId: 'po13', docType: 'SWIFT', title: 'Advance 30% – PO/26-27/0103', amount: 690, currency: 'USD', date: daysAgo(18), ref: 'HDFCN26100890113', file: makeAttachment('SWIFT-Advance-PO0103.pdf', { docType: 'SWIFT' }), direction: 'TO_VENDOR' },
    { id: 'vd3', vendorId: 'v1', poId: null, docType: 'SWIFT', title: 'Balance 70% – PO/25-26/0049', amount: 9870, currency: 'USD', date: daysAgo(70), ref: 'HDFCN26081701552', file: makeAttachment('SWIFT-Balance-PO0049.pdf', { docType: 'SWIFT' }), direction: 'TO_VENDOR' },
    { id: 'vd4', vendorId: 'v4', poId: 'po7', docType: 'SWIFT', title: 'Advance 30% – PO/26-27/0088', amount: 5394, currency: 'USD', date: daysAgo(74), ref: 'HDFCN26080400877', file: makeAttachment('SWIFT-Advance-PO0088.pdf', { docType: 'SWIFT' }), direction: 'TO_VENDOR' },
    { id: 'vd5', vendorId: 'v4', poId: 'po7', docType: 'SWIFT', title: 'Balance 70% – PO/26-27/0088', amount: 12586, currency: 'USD', date: daysAgo(6), ref: 'HDFCN26102011420', file: makeAttachment('SWIFT-Balance-PO0088.pdf', { docType: 'SWIFT' }), direction: 'TO_VENDOR', note: 'Please release Telex for SH/26-27/0024' },
    { id: 'vd6', vendorId: 'v4', poId: 'po14', docType: 'SWIFT', title: 'Advance 30% – PO/26-27/0104', amount: 503, currency: 'USD', date: daysAgo(15), ref: 'HDFCN26101102291', file: makeAttachment('SWIFT-Advance-PO0104.pdf', { docType: 'SWIFT' }), direction: 'TO_VENDOR' },
  ]
  return { vendorProfiles, vendorDocs }
}
