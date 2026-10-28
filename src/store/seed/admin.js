// Module seed for "admin". Receives the core seed (read-only) and returns NEW collections only.
import { daysAgo, fmtINR, makeAttachment } from '../../lib/format'

const iso = (d, h = 11, m = 20) => `${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
const fileOf = (no) => makeAttachment(`${no.replace(/\//g, '-')}.pdf`)

/** Historical communication log (messages sent before the current session). Shown with live `emails` in Admin → Communication Log. */
const buildArchive = (core) => {
  const out = []
  const partner = (id) => core.partners.find((p) => p.id === id)
  const tr = (id) => core.transporters.find((t) => t.id === id)
  const recent = core.invoices.filter((i) => i.date >= daysAgo(21)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 18)
  let k = 0
  for (const inv of recent) {
    const p = partner(inv.partnerId)
    if (!p) continue
    const t = tr(inv.transporterId)
    out.push({ id: `ema_${++k}`, ts: iso(inv.date, 11, k % 60), to: p.email, cc: '', subject: `Invoice ${inv.number} – Btali International`, body: `Dear ${p.contact},\n\nPlease find attached invoice ${inv.number} for ${fmtINR(inv.total)}. Goods will be dispatched via ${t?.name || 'transporter'}.\n\nRegards,\nBtali Dispatch`, attachments: [fileOf(inv.number)], ref: inv.number, kind: 'EMAIL', status: 'SENT', by: 'u8' })
    out.push({ id: `ema_${++k}`, ts: iso(inv.date, 11, (k + 3) % 60), to: 'ops@btali3pl.in', cc: '', subject: `Dispatch request ${inv.number}`, body: `Please prepare ${inv.lines.length} line(s) for ${p.name} via ${t?.name || 'transporter'}.`, attachments: [], ref: inv.number, kind: 'BTALI_PUSH', status: 'SENT', by: 'u8' })
    if (inv.lr) {
      out.push({ id: `ema_${++k}`, ts: iso(inv.lr.date || inv.date, 16, k % 60), to: p.email, cc: '', subject: `Dispatched: ${inv.number} – LR ${inv.lr.number}`, body: `Dear ${p.contact},\n\nGoods against invoice ${inv.number} have been dispatched. LR No. ${inv.lr.number} attached.\n\nRegards,\nBtali Dispatch`, attachments: [makeAttachment(`LR-${inv.lr.number}.pdf`)], ref: inv.number, kind: 'EMAIL', status: 'SENT', by: 'u8' })
      out.push({ id: `ema_${++k}`, ts: iso(inv.lr.date || inv.date, 16, (k + 5) % 60), to: p.phone, cc: '', subject: 'Dispatch SMS', body: `BTALI: Your order against invoice ${inv.number} is dispatched. LR ${inv.lr.number} via ${t?.name || 'transporter'}.`, attachments: [], ref: inv.number, kind: 'SMS', status: 'SENT', by: 'u8' })
    }
  }
  for (const so of core.salesOrders.filter((s) => !s.history && s.status !== 'PENDING_REVIEW' && s.status !== 'CANCELLED').slice(0, 10)) {
    const p = partner(so.partnerId)
    if (!p) continue
    out.push({ id: `ema_${++k}`, ts: iso(so.date, 10, k % 60), to: p.email, cc: '', subject: `Order ${so.number} confirmed – Btali International`, body: `Dear ${p.contact},\n\nYour order ${so.number} for ${fmtINR(so.total)} is confirmed. Please remit the advance to proceed with invoicing.\n\nRegards,\nBtali Sales`, attachments: [fileOf(so.number)], ref: so.number, kind: 'EMAIL', status: 'SENT', by: so.salespersonId || 'u4' })
    if (so.paymentStatus !== 'PAID') out.push({ id: `ema_${++k}`, ts: iso(daysAgo(1), 9, k % 60), to: p.phone, cc: '', subject: 'Payment reminder (WhatsApp)', body: `Namaste ${p.contact}, a gentle reminder that advance of ${fmtINR(so.total - (so.paidAmount || 0))} for order ${so.number} is pending. Pay via NEFT to HDFC A/c of Btali International. – Team Btali`, attachments: [], ref: so.number, kind: 'WHATSAPP', status: 'SENT', by: 'u9' })
  }
  for (const po of core.purchaseOrders.filter((x) => x.approvedAt && x.status !== 'PENDING_APPROVAL')) {
    const v = core.vendors.find((x) => x.id === po.vendorId)
    if (!v) continue
    out.push({ id: `ema_${++k}`, ts: po.approvedAt, to: v.email, cc: 'arjun@btali.in', subject: `Purchase Order ${po.number} – Btali International`, body: `Dear ${v.contact},\n\nPlease find attached PO ${po.number}. Kindly upload your Proforma Invoice on the Btali Vendor Portal.\n\nRegards,\nBtali Purchase`, attachments: [fileOf(po.number)], ref: po.number, kind: 'EMAIL', status: 'SENT', by: 'u1' })
  }
  return out.sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
}

export const adminSeed = (core) => ({
  importLogs: [
    { id: 'imp1', ts: iso(daysAgo(62), 10), entity: 'PRODUCTS', fileName: 'Btali-Item-Master-Tally.csv', total: 40, imported: 40, updated: 0, failed: 0, userId: 'u1', status: 'COMPLETED', note: 'Initial item master migrated from Tally' },
    { id: 'imp2', ts: iso(daysAgo(61), 15), entity: 'DEALERS', fileName: 'Dealer-Master-Sheet.csv', total: 23, imported: 22, updated: 0, failed: 1, userId: 'u1', status: 'COMPLETED', note: '1 row skipped – missing GSTIN' },
    { id: 'imp3', ts: iso(daysAgo(60), 12), entity: 'OPENING_STOCK', fileName: 'Btali-Closing-Stock-31-Aug.csv', total: 40, imported: 0, updated: 40, failed: 0, userId: 'u9', status: 'COMPLETED', note: 'Opening stock at Btali Bhiwandi' },
    { id: 'imp4', ts: iso(daysAgo(59), 17), entity: 'LEDGERS', fileName: 'Tally-Ledger-Opening-Balances.csv', total: 48, imported: 48, updated: 0, failed: 0, userId: 'u9', status: 'COMPLETED', note: 'Ledger opening balances as on 01-Apr' },
  ],
  ledgerOpenings: [],
  emailArchive: buildArchive(core),
})
