import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ship, Save, PackageCheck, Users, Boxes, CalendarDays } from 'lucide-react'
import { useStore, useLookup } from '../../store'
import { PageHeader, Grid, Stat, Card, Button, StatusBadge, Badge, Drawer, DescriptionList, SectionTitle, AttachmentList, FormGrid, Field, Input, NumberInput, Textarea, Segmented, Stepper, toast } from '../../components/ui'
import { ProductCell } from '../../components/business'
import DataTable from '../../components/DataTable'
import { fmtNum, fmtDate, today, daysBetween, sum, round2, makeAttachment } from '../../lib/format'

const CAP = { '20FT': 33, '40FT': 67, '40HC': 76 }

export const shipmentLines = (sh, purchaseOrders, products) =>
  purchaseOrders.filter((p) => sh.poIds.includes(p.id)).flatMap((po) => po.lines.map((l) => {
    const pr = products.find((x) => x.id === l.productId)
    const cartons = pr?.type === 'SPARE' ? Math.ceil(l.qty / (pr.cartonQty || 1)) : l.qty
    return { poId: po.id, poNumber: po.number, productId: l.productId, qty: l.qty, cartons, cbm: round2((pr?.cbm || 0) * l.qty), weight: round2((pr?.weightKg || 0) * l.qty) }
  }))

export const shipmentDocs = (sh, purchaseOrders) => {
  const pos = purchaseOrders.filter((p) => sh.poIds.includes(p.id))
  const docs = []
  docs.push({ ...makeAttachment(`BL-${sh.blNo || sh.number}.pdf`), id: `bl_${sh.id}`, docType: 'Bill of Lading', size: 84000 })
  for (const po of pos) {
    docs.push({ ...makeAttachment(`Packing-List-${po.number.replace(/\//g, '-')}.pdf`), id: `pl_${po.id}`, docType: 'Packing list', size: 56000 })
    if (po.commercialInvoice) docs.push({ ...po.commercialInvoice, docType: 'Commercial invoice' })
    for (const d of po.docs || []) if (!['PI', 'PI_STAMPED'].includes(d.docType)) docs.push(d)
  }
  return docs
}

function PlanDrawer({ id, onClose }) {
  const nav = useNavigate()
  const sh = useStore((s) => s.shipments.find((x) => x.id === id))
  const purchaseOrders = useStore((s) => s.purchaseOrders)
  const products = useStore((s) => s.products)
  const save = useStore((s) => s.saveContainerPlan)
  const { vendor } = useLookup()
  const lines = useMemo(() => shipmentLines(sh, purchaseOrders, products), [sh, purchaseOrders, products])
  const docs = useMemo(() => shipmentDocs(sh, purchaseOrders), [sh, purchaseOrders])
  const totCbm = sum(lines, (l) => l.cbm), totWt = sum(lines, (l) => l.weight), totCtn = sum(lines, (l) => l.cartons)
  const [f, setF] = useState(() => ({ bay: '', manpower: Math.max(4, Math.ceil(totCtn / 120)), spaceCbm: Math.ceil(totCbm * 1.15), unloadDate: sh.eta > today() ? sh.eta : today(), forklift: true, notes: '', ...(sh.starexPlan || {}) }))
  const current = sh.milestones.filter((m) => m.done).slice(-1)[0]?.key || sh.milestones[0]?.key
  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={`${sh.number} · ${sh.containerNo}`} subtitle={<span className="flex items-center gap-2">{vendor(sh.vendorId)?.name} <StatusBadge status={sh.status} /></span>}
      footer={<>
        {sh.status !== 'RECEIVED' && <Button variant="secondary" icon={PackageCheck} onClick={() => nav(`/starex/inward?shipment=${sh.id}`)}>Start inward</Button>}
        <Button icon={Save} onClick={() => { if (!f.bay.trim()) return toast.error('Enter the bay / gala allotted'); save(sh.id, f); toast.success('Warehouse plan saved', 'Purchase & Dispatch notified') }}>Save plan</Button>
      </>}>
      <Stepper steps={sh.milestones.map((m) => ({ key: m.key, label: m.label }))} current={current} className="mb-4" />
      <DescriptionList cols={3} items={[
        ['Container', `${sh.containerNo} (${sh.containerType})`], ['BL number', sh.blNo], ['ETD', fmtDate(sh.etd)],
        ['ETA Nhava Sheva', fmtDate(sh.eta)], ['ATA', fmtDate(sh.ata)], ['Telex release', sh.telexReleased ? 'Released' : 'Awaited'],
        ['Cartons', fmtNum(totCtn)], ['Volume', `${fmtNum(totCbm)} CBM of ${CAP[sh.containerType] || 67}`], ['Gross weight', `${fmtNum(totWt)} kg`],
      ]} />
      <SectionTitle className="mt-5">Documents</SectionTitle>
      <AttachmentList items={docs} />
      <SectionTitle className="mt-5">Packing list</SectionTitle>
      <div className="border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Product</th><th className="text-left px-3 py-2">PO</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Cartons</th><th className="text-right px-3 py-2">CBM</th><th className="text-right px-3 py-2">Kg</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l, i) => (
              <tr key={i}><td className="px-3 py-2"><ProductCell id={l.productId} /></td><td className="px-3 py-2 text-xs font-mono">{l.poNumber}</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.qty)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.cartons)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.cbm)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.weight)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <SectionTitle className="mt-5">Space & manpower plan</SectionTitle>
      <FormGrid cols={3}>
        <Field label="Bay / gala allotted" required><Input value={f.bay} onChange={(e) => setF({ ...f, bay: e.target.value })} placeholder="e.g. Gala 16, Bay B" /></Field>
        <Field label="Space to reserve (CBM)"><NumberInput value={f.spaceCbm} onChange={(v) => setF({ ...f, spaceCbm: v })} /></Field>
        <Field label="Loaders required"><NumberInput value={f.manpower} onChange={(v) => setF({ ...f, manpower: v })} /></Field>
        <Field label="Planned unloading date"><Input type="date" value={f.unloadDate} onChange={(e) => setF({ ...f, unloadDate: e.target.value })} /></Field>
        <Field label="Forklift"><Segmented value={f.forklift ? 'Y' : 'N'} onChange={(v) => setF({ ...f, forklift: v === 'Y' })} options={[{ key: 'Y', label: 'Required' }, { key: 'N', label: 'Not needed' }]} /></Field>
      </FormGrid>
      <Field label="Notes" className="mt-3"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Stacking limits, fragile cartons, shift timing…" /></Field>
      {sh.starexPlan?.updatedAt && <div className="text-[11px] text-slate-400 mt-2">Last saved {fmtDate(sh.starexPlan.updatedAt)}</div>}
    </Drawer>
  )
}

export default function Containers() {
  const shipments = useStore((s) => s.shipments)
  const purchaseOrders = useStore((s) => s.purchaseOrders)
  const products = useStore((s) => s.products)
  const { vendor } = useLookup()
  const [open, setOpen] = useState(null)
  const [view, setView] = useState('UPCOMING')
  const t = today()
  const rows = useMemo(() => shipments.map((s) => {
    const lines = shipmentLines(s, purchaseOrders, products)
    return { ...s, cbm: sum(lines, (l) => l.cbm), cartons: sum(lines, (l) => l.cartons), days: daysBetween(t, s.eta) }
  }).filter((s) => (view === 'UPCOMING' ? s.status !== 'RECEIVED' : s.status === 'RECEIVED')).sort((a, b) => (a.eta < b.eta ? -1 : 1)), [shipments, purchaseOrders, products, view, t])
  const upcoming = shipments.filter((s) => s.status !== 'RECEIVED')
  const in7 = upcoming.filter((s) => daysBetween(t, s.eta) <= 7)
  const allLines = upcoming.flatMap((s) => shipmentLines(s, purchaseOrders, products))
  return (
    <div>
      <PageHeader title="Upcoming containers" subtitle="Container schedule shared by Btali Purchase & Accounts – plan bay space and manpower" />
      <Grid cols={4}>
        <Stat label="Containers on the way" value={upcoming.length} icon={Ship} tone="ink" />
        <Stat label="Arriving within 7 days" value={in7.length} icon={CalendarDays} tone="amber" />
        <Stat label="Space to plan" value={`${fmtNum(Math.round(sum(allLines, (l) => l.cbm)))} CBM`} icon={Boxes} tone="brand" />
        <Stat label="Plans saved" value={`${upcoming.filter((s) => s.starexPlan).length} / ${upcoming.length}`} icon={Users} tone="green" />
      </Grid>
      <div className="mt-4 mb-3"><Segmented value={view} onChange={setView} options={[{ key: 'UPCOMING', label: 'Upcoming' }, { key: 'RECEIVED', label: 'Received' }]} /></div>
      <DataTable rows={rows} onRowClick={(r) => setOpen(r.id)} exportName="starex-containers"
        columns={[
          { key: 'number', header: 'Shipment', render: (r) => <div><div className="font-medium text-slate-800">{r.number}</div><div className="text-[11px] font-mono text-slate-500">{r.containerNo}</div></div> },
          { key: 'vendor', header: 'Supplier', value: (r) => vendor(r.vendorId)?.name },
          { key: 'containerType', header: 'Type' },
          { key: 'blNo', header: 'BL no.' },
          { key: 'eta', header: 'ETA', render: (r) => <div><div>{fmtDate(r.eta)}</div>{r.status !== 'RECEIVED' && <div className={r.days < 0 ? 'text-[11px] text-red-600' : 'text-[11px] text-slate-500'}>{r.days < 0 ? `${-r.days}d past ETA` : r.days === 0 ? 'today' : `in ${r.days}d`}</div>}</div> },
          { key: 'cartons', header: 'Cartons', align: 'right', render: (r) => fmtNum(r.cartons) },
          { key: 'cbm', header: 'CBM', align: 'right', render: (r) => fmtNum(r.cbm) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'plan', header: 'Warehouse plan', value: (r) => r.starexPlan?.bay || '', render: (r) => r.starexPlan ? <Badge tone="green">{r.starexPlan.bay} · {r.starexPlan.manpower} loaders</Badge> : r.status === 'RECEIVED' ? <span className="text-xs text-slate-500">{r.inward?.grnNo}</span> : <Badge tone="amber">Plan pending</Badge> },
        ]} />
      {open && <PlanDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
