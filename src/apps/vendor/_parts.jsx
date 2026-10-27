// Shared helpers for the Vendor Portal (all data scoped to the signed-in vendor).
import { useMemo } from 'react'
import { useStore, useUser } from '../../store'

export const VISIBLE = ['APPROVED', 'PI_RECEIVED', 'IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP', 'SHIPPED', 'RECEIVED', 'CLOSED']
export const OPEN = ['APPROVED', 'PI_RECEIVED', 'IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP']
export const PO_STEPS = [
  { key: 'APPROVED', label: 'PO issued' }, { key: 'PI_RECEIVED', label: 'PI sent' }, { key: 'IN_PRODUCTION', label: 'Production' },
  { key: 'QC_PENDING', label: 'QC review' }, { key: 'READY_TO_SHIP', label: 'Ready' }, { key: 'SHIPPED', label: 'Shipped' }, { key: 'RECEIVED', label: 'Delivered' },
]
export const poTotal = (po) => po.lines.reduce((a, l) => a + l.qty * l.rate, 0)
export const fmtUSD = (v, cur = 'USD') => `${cur === 'INR' ? '₹' : cur === 'CNY' ? '¥' : '$'}${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`

export const useVendorScope = () => {
  const user = useUser()
  const vendorId = user?.vendorId
  const pos = useStore((s) => s.purchaseOrders)
  const mine = useMemo(() => pos.filter((p) => p.vendorId === vendorId && VISIBLE.includes(p.status)).sort((a, b) => (a.date < b.date ? 1 : -1)), [pos, vendorId])
  return { user, vendorId, pos: mine }
}

/** What the vendor needs to do next on a PO. [{key, label, tab}] */
export const poActions = (po, { units = [], shipments = [], vendorDocs = [] } = {}) => {
  const out = []
  if ((po.status === 'APPROVED' && !po.pi) || po.pi?.status === 'REJECTED') out.push({ key: 'PI', label: po.pi?.status === 'REJECTED' ? 'Re-upload PI' : 'Upload PI', tab: 'pi' })
  const prod = ['IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP'].includes(po.status)
  const hasUnits = units.some((u) => u.poId === po.id)
  if (prod && hasUnits && !po.stickerConfirmed) out.push({ key: 'STICKER', label: 'Confirm stickers', tab: 'labels' })
  if (prod && !(po.deliverySchedule || []).length) out.push({ key: 'SCHEDULE', label: 'Declare schedule', tab: 'schedule' })
  if (po.status === 'IN_PRODUCTION' && (!(po.qc || []).length || (po.qc || []).some((q) => q.status === 'REJECTED'))) out.push({ key: 'QC', label: (po.qc || []).some((q) => q.status === 'REJECTED') ? 'Re-upload QC' : 'Upload QC', tab: 'qc' })
  if (po.status === 'READY_TO_SHIP' && (!po.packingList?.lines?.length || !po.commercialInvoice)) out.push({ key: 'PL', label: !po.packingList?.lines?.length ? 'Generate packing list' : 'Upload CI', tab: 'pl' })
  const sh = shipments.find((s) => s.id === po.shipmentId)
  const balancePaid = vendorDocs.some((d) => d.poId === po.id && d.docType === 'SWIFT' && /balance/i.test(d.title))
  if (po.status === 'SHIPPED' && sh && !sh.telexReleased && !po.telexUploadedAt && balancePaid) out.push({ key: 'TELEX', label: 'Upload Telex release', tab: 'finance' })
  return out
}

export const forwarderFor = (state, po) => {
  const rfq = (state.freightRfqs || []).find((r) => r.id === po.rfqId || (r.poIds || []).includes(po.id))
  const sh = state.shipments.find((s) => s.id === po.shipmentId)
  const id = rfq?.selectedForwarderId || sh?.forwarderId
  return { forwarder: state.vendors.find((v) => v.id === id) || null, rfq, shipment: sh, indian: state.vendors.find((v) => v.id === sh?.indianForwarderId) || null }
}
