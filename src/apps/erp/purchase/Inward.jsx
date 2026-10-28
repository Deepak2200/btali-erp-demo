import React, { useMemo, useState } from 'react'
import { PackageCheck, Ship, AlertTriangle, Timer, ClipboardCheck, Link2 } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Card, Grid, Stat, Button, StatusBadge, Badge, Tabs, Modal, Drawer, Field, Select, Textarea, NumberInput, FileUpload, AttachmentList, MediaGrid,
  Alert, EmptyState, DescriptionList, toast, confirm, cx,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, UserName } from '../../../components/business'
import { fmtDate, fmtNum, fmtPct, daysBetween, sum, today } from '../../../lib/format'

const expectedLines = (sh, pos) => {
  const m = new Map()
  for (const po of pos.filter((p) => sh.poIds.includes(p.id))) for (const l of po.lines) m.set(l.productId, (m.get(l.productId) || 0) + l.qty)
  return [...m.entries()].map(([productId, expected]) => ({ productId, expected }))
}
const inwardLines = (sh, pos) => sh.inward?.lines?.length ? sh.inward.lines : expectedLines(sh, pos).map((l) => {
  const d = sh.inward?.discrepancies?.find((x) => x.productId === l.productId)
  return { ...l, received: d ? d.received : l.expected }
})
const arrival = (sh) => sh.ata || sh.milestones?.find((m) => m.key === 'ARRIVED' && m.done)?.date || sh.eta

export default function Inward() {
  const shipments = useStore((s) => s.shipments)
  const pos = useStore((s) => s.purchaseOrders)
  const { vendor } = useLookup()
  const [tab, setTab] = useState('awaiting')
  const [recording, setRecording] = useState(null)
  const [view, setView] = useState(null)
  const [settle, setSettle] = useState(null)
  const awaiting = shipments.filter((s) => ['IN_TRANSIT', 'AT_PORT', 'CLEARED'].includes(s.status))
  const received = shipments.filter((s) => s.status === 'RECEIVED' && s.inward)

  const discs = useMemo(() => received.flatMap((s) => (s.inward.discrepancies || []).map((d, index) => ({ ...d, id: `${s.id}-${index}`, index, shipmentId: s.id, shipment: s.number, grnNo: s.inward.grnNo, date: s.inward.date, vendorId: s.vendorId, qty: Math.abs(d.received - d.expected) }))), [received])
  const leadTimes = received.map((s) => Math.max(0, daysBetween(arrival(s), s.inward.date)))
  const expQty = sum(received, (s) => sum(inwardLines(s, pos), (l) => l.expected))
  const discQty = sum(discs, (d) => d.qty)

  return (
    <div>
      <PageHeader title="Inward & Discrepancies" subtitle="Record Btali inward against each container, log short / excess receipts and settle them against the vendor's next order" />
      <Grid cols={4} className="mb-5">
        <Stat label="Awaiting GRN" value={awaiting.length} icon={Ship} tone="blue" sub={`${awaiting.filter((s) => s.status !== 'IN_TRANSIT').length} at port / cleared`} />
        <Stat label="Open discrepancies" value={discs.filter((d) => !d.settled).length} icon={AlertTriangle} tone="amber" sub={`${discs.length} logged`} />
        <Stat label="Inward discrepancy %" value={fmtPct(expQty ? (discQty / expQty) * 100 : 0, 2)} icon={ClipboardCheck} tone="violet" sub={`${fmtNum(discQty)} of ${fmtNum(expQty)} pcs`} />
        <Stat label="Avg GRN lead time" value={leadTimes.length ? `${(sum(leadTimes) / leadTimes.length).toFixed(1)} days` : '—'} icon={Timer} tone="green" sub="port arrival → GRN" />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'awaiting', label: 'Awaiting inward', count: awaiting.length }, { key: 'received', label: 'Received (GRN)', count: received.length }, { key: 'disc', label: 'Discrepancy log', count: discs.filter((d) => !d.settled).length }]} />

      {tab === 'awaiting' && (awaiting.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {awaiting.map((s) => {
            const lines = expectedLines(s, pos)
            return (
              <Card key={s.id} title={s.number} subtitle={`${s.containerNo} · ${s.containerType} · ${vendor(s.vendorId)?.name}`} actions={<StatusBadge status={s.status} />}>
                <DescriptionList cols={2} items={[['ETA', fmtDate(s.eta)], ['Telex', s.telexReleased ? 'Released' : 'Pending'], ['Lines', `${lines.length} products`], ['Expected qty', fmtNum(sum(lines, (l) => l.expected))]]} />
                <div className="mt-3 text-xs text-slate-500">{s.milestones?.filter((m) => m.done).pop()?.label || 'Booked'}</div>
                <Button className="w-full mt-3" icon={PackageCheck} variant={s.status === 'IN_TRANSIT' ? 'secondary' : 'primary'} onClick={() => setRecording(s)}>Record inward</Button>
              </Card>
            )
          })}
        </div>
      ) : <Card><EmptyState icon={PackageCheck} title="No containers awaiting inward" /></Card>)}

      {tab === 'received' && (
        <DataTable rows={received} onRowClick={setView} exportName="grn-register" initialSort={{ key: 'grn', dir: 'desc' }}
          columns={[
            { key: 'grn', header: 'GRN', value: (s) => s.inward.grnNo, render: (s) => <span className="font-medium">{s.inward.grnNo}</span> },
            { key: 'number', header: 'Shipment', render: (s) => <div><div>{s.number}</div><div className="text-[11px] text-slate-500">{s.containerNo}</div></div> },
            { key: 'vendor', header: 'Vendor', value: (s) => vendor(s.vendorId)?.name },
            { key: 'arrived', header: 'Arrived', value: (s) => arrival(s), render: (s) => fmtDate(arrival(s)) },
            { key: 'date', header: 'GRN date', value: (s) => s.inward.date, render: (s) => fmtDate(s.inward.date) },
            { key: 'lead', header: 'Lead time', align: 'right', value: (s) => daysBetween(arrival(s), s.inward.date), render: (s) => `${Math.max(0, daysBetween(arrival(s), s.inward.date))} d` },
            { key: 'qty', header: 'Received', align: 'right', value: (s) => sum(inwardLines(s, pos), (l) => l.received), render: (s) => fmtNum(sum(inwardLines(s, pos), (l) => l.received)) },
            { key: 'disc', header: 'Discrepancies', value: (s) => s.inward.discrepancies?.length || 0, render: (s) => (s.inward.discrepancies?.length ? <Badge tone={s.inward.discrepancies.every((d) => d.settled) ? 'green' : 'amber'}>{s.inward.discrepancies.length}{s.inward.discrepancies.every((d) => d.settled) ? ' settled' : ' open'}</Badge> : <Badge tone="green">Clean</Badge>) },
          ]} />
      )}

      {tab === 'disc' && (
        <DataTable rows={discs} exportName="inward-discrepancies" initialSort={{ key: 'date', dir: 'desc' }}
          filters={[{ key: 'type', label: 'types', options: ['SHORT', 'EXCESS'] }, { key: 'state', label: 'states', value: (d) => (d.settled ? 'Settled' : 'Open'), options: ['Open', 'Settled'] }]}
          columns={[
            { key: 'grnNo', header: 'GRN', render: (d) => <div><div className="font-medium">{d.grnNo}</div><div className="text-[11px] text-slate-500">{d.shipment} · {fmtDate(d.date)}</div></div> },
            { key: 'product', header: 'Product', value: (d) => d.productId, render: (d) => <ProductCell id={d.productId} /> },
            { key: 'vendor', header: 'Vendor', value: (d) => vendor(d.vendorId)?.name },
            { key: 'expected', header: 'Expected', align: 'right' },
            { key: 'received', header: 'Received', align: 'right' },
            { key: 'type', header: 'Type', render: (d) => <StatusBadge status={d.type} label={`${d.type === 'SHORT' ? 'Short' : 'Excess'} ${d.qty}`} /> },
            { key: 'note', header: 'Note', render: (d) => <span className="text-xs text-slate-600">{d.settled ? d.settleNote || d.note : d.note || '—'}</span> },
            { key: 'action', header: '', sortable: false, render: (d) => (d.settled ? <SettledTag d={d} /> : <Button size="sm" variant="soft" icon={Link2} onClick={(e) => { e.stopPropagation(); setSettle(d) }}>Settle vs next PO</Button>) },
          ]} />
      )}

      {recording && <RecordInward sh={recording} onClose={() => setRecording(null)} />}
      {view && <GrnDrawer sh={shipments.find((s) => s.id === view.id)} onClose={() => setView(null)} onSettle={setSettle} />}
      {settle && <SettleModal d={settle} onClose={() => setSettle(null)} />}
    </div>
  )
}

function SettledTag({ d }) {
  const po = useStore((s) => s.purchaseOrders.find((p) => p.id === d.settledPoId))
  return <Badge tone="green">Settled · {po?.number || 'next PO'}</Badge>
}

function RecordInward({ sh, onClose }) {
  const pos = useStore((s) => s.purchaseOrders)
  const receiveShipment = useStore((s) => s.receiveShipment)
  const [lines, setLines] = useState(expectedLines(sh, pos).map((l) => ({ ...l, received: l.expected })))
  const [media, setMedia] = useState([])
  const [remarks, setRemarks] = useState('')
  const diff = lines.filter((l) => l.received !== l.expected)
  const save = async () => {
    if (lines.some((l) => l.received === '' || l.received < 0)) return toast.error('Enter received quantity for every line')
    const ok = await confirm({ title: `Post GRN for ${sh.number}?`, message: `${fmtNum(sum(lines, (l) => l.received))} pcs will be added to Btali stock and barcoded units marked in warehouse.${diff.length ? `\n${diff.length} discrepancy line(s) will raise a ticket for Purchase.` : ''}`, confirmText: 'Post GRN' })
    if (!ok) return
    const r = receiveShipment(sh.id, { lines: lines.map((l) => ({ ...l, received: Number(l.received) })), qcMedia: media.map((m) => ({ ...m, docType: 'QC' })), remarks })
    toast.success(`${r.grnNo} posted`, r.discrepancies.length ? `${r.discrepancies.length} discrepancy(ies) logged` : 'Received in full')
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="lg" title={`Record inward – ${sh.number}`} subtitle={`${sh.containerNo} · expected vs received at Btali Bhiwandi`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={PackageCheck} onClick={save}>Post GRN</Button></>}>
      {sh.status === 'IN_TRANSIT' && <Alert tone="warn" className="mb-3">This container is still marked in transit. Posting the GRN will close all pending milestones.</Alert>}
      <div className="border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Expected</th><th className="text-right px-3 py-2 w-32">Received</th><th className="text-right px-3 py-2">Diff</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l, i) => {
              const d = (Number(l.received) || 0) - l.expected
              return (
                <tr key={l.productId}>
                  <td className="px-3 py-2"><ProductCell id={l.productId} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.expected)}</td>
                  <td className="px-3 py-2"><NumberInput min={0} value={l.received} onChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, received: v } : x)))} className="text-right" /></td>
                  <td className={cx('px-3 py-2 text-right tabular-nums font-medium', d < 0 ? 'text-red-600' : d > 0 ? 'text-violet-600' : 'text-slate-400')}>{d > 0 ? `+${d}` : d || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Inward QC photos</div>
          <FileUpload compact accept="image/*,video/*" onFiles={(a) => setMedia((m) => [...m, ...a])} label="Add photos / videos" />
          {media.length > 0 && <div className="mt-2"><AttachmentList dense items={media} onRemove={(a) => setMedia((m) => m.filter((x) => x.id !== a.id))} /></div>}
        </div>
        <Field label="Remarks"><Textarea rows={4} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Carton condition, seal number, shortages…" /></Field>
      </div>
    </Modal>
  )
}

function GrnDrawer({ sh, onClose, onSettle }) {
  const pos = useStore((s) => s.purchaseOrders)
  const lines = inwardLines(sh, pos)
  return (
    <Drawer open onClose={onClose} title={`${sh.inward.grnNo} · ${sh.number}`} subtitle={`${sh.containerNo} · received ${fmtDate(sh.inward.date)}`}>
      <DescriptionList cols={3} items={[['Arrived', fmtDate(arrival(sh))], ['GRN date', fmtDate(sh.inward.date)], ['Received by', <UserName id={sh.inward.receivedBy} fallback="Btali desk" />], ['Telex', sh.telexReleased ? 'Released' : 'Pending'], ['Landed cost', sh.landedCost?.finalized ? 'Finalised' : 'Pending'], ['Remarks', sh.inward.remarks || '—']]} />
      <h4 className="text-sm font-semibold mt-5 mb-2">Expected vs received</h4>
      <div className="border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Expected</th><th className="text-right px-3 py-2">Received</th><th className="text-right px-3 py-2">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => {
              const d = sh.inward.discrepancies?.findIndex((x) => x.productId === l.productId)
              const disc = d >= 0 ? sh.inward.discrepancies[d] : null
              return (
                <tr key={l.productId}>
                  <td className="px-3 py-2"><ProductCell id={l.productId} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.expected)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.received)}</td>
                  <td className="px-3 py-2 text-right">{disc ? (disc.settled ? <Badge tone="green">Settled</Badge> : <Button size="sm" variant="soft" onClick={() => onSettle({ ...disc, index: d, shipmentId: sh.id, shipment: sh.number, vendorId: sh.vendorId, qty: Math.abs(disc.received - disc.expected) })}>{disc.type === 'SHORT' ? 'Short' : 'Excess'} – settle</Button>) : <Badge tone="green">OK</Badge>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sh.inward.qcMedia?.length > 0 && <><h4 className="text-sm font-semibold mt-5 mb-2">Inward QC media</h4><MediaGrid items={sh.inward.qcMedia} /></>}
    </Drawer>
  )
}

function SettleModal({ d, onClose }) {
  const pos = useStore((s) => s.purchaseOrders)
  const settleDiscrepancy = useStore((s) => s.settleDiscrepancy)
  const { product, vendor } = useLookup()
  const open = pos.filter((p) => p.vendorId === d.vendorId && !['RECEIVED', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(p.status))
  const [poId, setPoId] = useState(open[0]?.id || '')
  const [note, setNote] = useState(d.type === 'SHORT' ? `Vendor to ship ${d.qty} pcs free of cost with this order` : `Deduct ${d.qty} pcs from this order quantity`)
  const save = () => {
    if (!poId) return toast.error('Select the vendor PO to settle against')
    settleDiscrepancy(d.shipmentId, d.index, { poId, note })
    toast.success('Discrepancy settled', 'Note added to the vendor PO and vendor notified')
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="sm" title="Settle against next PO" subtitle={`${d.shipment} · ${product(d.productId)?.sku} · ${d.type === 'SHORT' ? 'short' : 'excess'} ${d.qty} pcs`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!open.length}>Settle</Button></>}>
      {open.length ? (
        <>
          <Field label={`Open PO with ${vendor(d.vendorId)?.name}`} className="mb-3"><Select value={poId} onChange={(e) => setPoId(e.target.value)} options={open.map((p) => ({ value: p.id, label: `${p.number} · ${p.status.replace(/_/g, ' ').toLowerCase()}` }))} /></Field>
          <Field label="Settlement note"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </>
      ) : <Alert tone="warn">No open purchase order with {vendor(d.vendorId)?.name}. Raise the next PO first, then settle this discrepancy against it.</Alert>}
    </Modal>
  )
}
