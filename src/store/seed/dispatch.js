// Module seed for "dispatch": returns & FOC register and Btali MIS uploads (with reconciliation results).
import { daysAgo, addDays, makeAttachment, round2, fmtDate } from '../../lib/format'
import { buildMisRows, matchMisRows } from '../slices/dispatch'

const iso = (d, h = 10) => `${d}T${String(h).padStart(2, '0')}:15:00.000Z`

export const dispatchSeed = (core) => {
  const hist = core.invoices.filter((i) => i.history && i.status === 'DISPATCHED').sort((a, b) => (a.date < b.date ? 1 : -1))
  const pickInv = (minAge, skip = 0) => hist.filter((i) => i.date <= daysAgo(minAge))[skip]
  const mkReturn = (n, inv, type, reason, status, lineIdx, qty, extra = {}) => {
    if (!inv) return null
    const l = inv.lines[Math.min(lineIdx, inv.lines.length - 1)]
    const q = Math.min(qty, l.qty)
    const date = addDays(inv.date, 6)
    const timeline = [{ ts: iso(date), text: `Logged against ${inv.number} – ${type.toLowerCase()} requested` }]
    if (status !== 'LOGGED') timeline.push({ ts: iso(addDays(date, 1), 15), text: extra.processText || 'Processing started' })
    if (status === 'CLOSED') timeline.push({ ts: iso(addDays(date, 4), 12), text: 'Closed – dealer confirmed' })
    return {
      id: `ret${n}`, number: `RET/26-27/${String(n).padStart(4, '0')}`, invoiceId: inv.id, invoiceNo: inv.number, partnerId: inv.partnerId,
      lines: [{ productId: l.productId, qty: q, barcode: '' }], type, reason, status, focInvoiceNo: null, date, value: round2(q * l.price),
      attachments: [makeAttachment(`return-${n}-photo.jpg`)], createdBy: 'u8', timeline, ...extra,
    }
  }
  const returns = [
    mkReturn(1, pickInv(40, 0), 'REPLACEMENT', 'Motor burnt on first start – dealer returned unit', 'CLOSED', 0, 1, { focInvoiceNo: 'FOC/26-27/0001', processText: 'FOC replacement invoice FOC/26-27/0001 issued', closedAt: iso(daysAgo(30)) }),
    mkReturn(2, pickInv(25, 1), 'DISCOUNT', 'Carton damaged in transit – dealer accepted with discount', 'CLOSED', 0, 2, { creditNoteNo: 'CN/26-27/0001', processText: 'Credit note CN/26-27/0001 raised' }),
    mkReturn(3, pickInv(12, 0), 'REPAIR', 'Pressure switch faulty – sent back for repair', 'IN_PROCESS', 0, 1, { processText: 'Sent for repair to service centre' }),
    mkReturn(4, pickInv(6, 2), 'REPLACEMENT', 'Wrong model supplied (mislabelled carton)', 'LOGGED', 0, 2),
  ].filter(Boolean)

  const state = { products: core.products, invoices: core.invoices, partners: core.partners, transporters: core.transporters }
  // weekly truck report: previous Monday–Saturday window
  const wFrom = daysAgo(20), wTo = daysAgo(7)
  const weeklyRows = buildMisRows(state, wFrom, wTo, { inject: true, seed: 1 })
  const weeklyResults = matchMisRows(state, weeklyRows)
  // monthly MIS: 30 days ending 15 days ago
  const mFrom = daysAgo(45), mTo = daysAgo(15)
  const monthlyRows = buildMisRows(state, mFrom, mTo, { inject: true, seed: 2 })
  const monthlyResults = matchMisRows(state, monthlyRows).map((r, i, arr) => {
    const firstBad = arr.findIndex((x) => x.status !== 'MATCH')
    return i === firstBad ? { ...r, resolved: true, resolution: 'Btali issued credit for the excess in next bill', resolvedBy: 'u8', resolvedAt: iso(daysAgo(10)) } : r
  })
  const misUploads = [
    { id: 'mis1', source: 'BTALI', kind: 'WEEKLY_TRUCK', period: `${fmtDate(wFrom)} – ${fmtDate(wTo)}`, fileName: `Btali-Truck-Report-${wTo}.csv`, file: makeAttachment(`Btali-Truck-Report-${wTo}.csv`), rows: weeklyRows, results: weeklyResults, uploadedBy: 'u17', uploadedAt: iso(daysAgo(5), 11), status: weeklyResults.some((r) => r.status !== 'MATCH') ? 'OPEN' : 'MATCHED' },
    { id: 'mis2', source: 'BTALI', kind: 'MONTHLY_MIS', period: `${fmtDate(mFrom)} – ${fmtDate(mTo)}`, fileName: `Btali-MIS-${mTo.slice(0, 7)}.csv`, file: makeAttachment(`Btali-MIS-${mTo.slice(0, 7)}.csv`), rows: monthlyRows, results: monthlyResults, uploadedBy: 'u17', uploadedAt: iso(daysAgo(12), 16), status: 'OPEN' },
  ]
  return { returns, misUploads, dispatchSchedules: [] }
}
