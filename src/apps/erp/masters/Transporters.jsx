import React, { useMemo, useState } from 'react'
import { Plus, Truck, Pencil, Trash2, Users, ShieldAlert, Route } from 'lucide-react'
import { PageHeader, Grid, Stat, Button, Card, Modal, FormGrid, Field, Input, Textarea, Checkbox, Badge, IconButton, Select, toast, confirm, Tabs } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PartnerCell } from '../../../components/business'
import { useStore } from '../../../store'
import { fmtNum, fmtINR, sum, daysAgo } from '../../../lib/format'

const REGIONS = ['North', 'South', 'East', 'West', 'Central']
const blank = () => ({ name: '', contact: '', phone: '', vehicleNo: '', isSafex: false, regions: [], note: '' })

export default function Transporters() {
  const transporters = useStore((s) => s.transporters)
  const partners = useStore((s) => s.partners)
  const invoices = useStore((s) => s.invoices)
  const upsertTransporter = useStore((s) => s.upsertTransporter)
  const removeTransporter = useStore((s) => s.removeTransporter)
  const setPartnerTransporter = useStore((s) => s.setPartnerTransporter)
  const [tab, setTab] = useState('transporters')
  const [f, setF] = useState(null)
  const set = (p) => setF((x) => ({ ...x, ...p }))

  const stats = useMemo(() => {
    const m = {}
    const from = daysAgo(90)
    for (const t of transporters) {
      const inv = invoices.filter((i) => i.transporterId === t.id && i.date >= from)
      m[t.id] = { customers: partners.filter((p) => p.transporterId === t.id).length, dispatches: inv.length, freight: sum(inv, (i) => i.freightCost || 0) }
    }
    return m
  }, [transporters, partners, invoices])

  const save = () => {
    if (!f.name.trim() || !f.phone.trim()) return toast.error('Name and phone are required')
    upsertTransporter(f)
    toast.success(f.id ? 'Transporter updated' : 'Transporter added', f.name)
    setF(null)
  }
  const remove = async (t) => {
    const n = stats[t.id]?.customers || 0
    const ok = await confirm({ title: `Remove ${t.name}?`, message: n ? `${n} customer(s) use this transporter as preferred. Their mapping will be cleared.` : 'This transporter will be removed from the master.', tone: 'danger', confirmText: 'Remove' })
    if (!ok) return
    removeTransporter(t.id)
    toast.success('Transporter removed')
  }

  const tCols = [
    { key: 'name', header: 'Transporter', render: (r) => <div><div className="font-medium text-slate-800 flex items-center gap-2">{r.name}{r.isSafex && <Badge tone="amber">Safex</Badge>}</div><div className="text-[11px] text-slate-500">{r.note || '—'}</div></div> },
    { key: 'contact', header: 'Contact', render: (r) => <div className="text-xs"><div>{r.contact}</div><div className="text-slate-500">{r.phone}</div></div> },
    { key: 'vehicleNo', header: 'Default vehicle', render: (r) => <span className="font-mono text-xs">{r.vehicleNo || '—'}</span> },
    { key: 'regions', header: 'Regions', value: (r) => (r.regions || []).join(', '), render: (r) => <div className="flex flex-wrap gap-1">{(r.regions || []).map((x) => <Badge key={x} tone="blue">{x}</Badge>)}</div> },
    { key: 'customers', header: 'Customers', align: 'right', value: (r) => stats[r.id]?.customers },
    { key: 'dispatches', header: 'Dispatches (90d)', align: 'right', value: (r) => stats[r.id]?.dispatches },
    { key: 'freight', header: 'Freight (90d)', align: 'right', value: (r) => stats[r.id]?.freight, render: (r) => fmtINR(stats[r.id]?.freight) },
    { key: 'x', header: '', sortable: false, export: false, render: (r) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><IconButton icon={Pencil} title="Edit" onClick={() => setF({ ...r, regions: [...(r.regions || [])] })} /><IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => remove(r)} /></div> },
  ]
  const custs = partners.filter((p) => p.type !== 'EXPORT' && p.status !== 'REJECTED')
  const tOpts = transporters.map((t) => ({ value: t.id, label: `${t.name}${t.isSafex ? ' (Safex)' : ''}` }))
  const mCols = [
    { key: 'name', header: 'Customer', render: (r) => <PartnerCell id={r.id} /> },
    { key: 'type', header: 'Type', render: (r) => <Badge tone={r.type === 'FRANCHISE' ? 'violet' : 'ink'}>{r.type === 'FRANCHISE' ? 'Franchise' : 'Dealer'}</Badge> },
    { key: 'region', header: 'Region' },
    { key: 'transporterId', header: 'Preferred transporter', value: (r) => transporters.find((t) => t.id === r.transporterId)?.name || '', render: (r) => (
      <div onClick={(e) => e.stopPropagation()} className="min-w-[220px]">
        <Select value={r.transporterId || ''} placeholder="Not mapped" options={tOpts} onChange={(e) => { setPartnerTransporter(r.id, e.target.value); toast.success('Preferred transporter updated', `${r.name} → ${transporters.find((t) => t.id === e.target.value)?.name || 'not mapped'}`) }} />
      </div>
    ) },
    { key: 'safex', header: 'Safex pickup', value: (r) => (r.safex ? 'Yes' : 'No'), render: (r) => (r.safex ? <Badge tone="amber">Debit note on pickup</Badge> : <span className="text-slate-400">—</span>) },
    { key: 'fit', header: 'Coverage', sortable: false, value: () => '', render: (r) => { const t = transporters.find((x) => x.id === r.transporterId); if (!t) return <Badge tone="red">Unmapped</Badge>; return (t.regions || []).includes(r.region) ? <Badge tone="green">In region</Badge> : <Badge tone="amber">Outside region</Badge> } },
  ]
  return (
    <div>
      <PageHeader title="Transport Master" subtitle="Transporters, Safex pickups and customer-wise preferred transporter mapping"
        actions={<Button icon={Plus} onClick={() => setF(blank())}>Add transporter</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Transporters" value={transporters.length} icon={Truck} />
        <Stat label="Safex (debit-note) partners" value={transporters.filter((t) => t.isSafex).length} icon={ShieldAlert} tone="amber" sub={`${custs.filter((p) => p.safex).length} customers use Safex`} />
        <Stat label="Customers mapped" value={`${custs.filter((p) => p.transporterId).length} / ${custs.length}`} icon={Users} tone="green" />
        <Stat label="Dispatches (90 days)" value={fmtNum(sum(Object.values(stats), (x) => x.dispatches))} icon={Route} tone="ink" />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ key: 'transporters', label: 'Transporters', count: transporters.length }, { key: 'mapping', label: 'Customer mapping', count: custs.length }]} />
      {tab === 'transporters'
        ? <DataTable rows={transporters} columns={tCols} onRowClick={(r) => setF({ ...r, regions: [...(r.regions || [])] })} exportName="btali-transporters" />
        : <DataTable rows={custs} columns={mCols} exportName="btali-customer-transporter-map" filters={[{ key: 'region', label: 'regions', options: REGIONS }, { key: 'transporterId', label: 'transporters', options: tOpts }]} pageSize={15} />}
      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? 'Edit transporter' : 'Add transporter'}
        footer={<><Button variant="secondary" onClick={() => setF(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {f && (
          <FormGrid>
            <Field label="Transporter name" required className="md:col-span-2"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Contact person"><Input value={f.contact} onChange={(e) => set({ contact: e.target.value })} /></Field>
            <Field label="Phone" required><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
            <Field label="Default vehicle no."><Input value={f.vehicleNo} onChange={(e) => set({ vehicleNo: e.target.value.toUpperCase() })} placeholder="MH04 AB 1234" /></Field>
            <div><div className="text-xs font-medium text-slate-600 mb-1">Safex</div><Checkbox className="mt-1" checked={f.isSafex} onChange={(v) => set({ isSafex: v })} label="Collects from warehouse – raise pickup debit note" /></div>
            <div className="md:col-span-2"><div className="text-xs font-medium text-slate-600 mb-1">Regions served</div>
              <div className="flex flex-wrap gap-3">{REGIONS.map((r) => <Checkbox key={r} label={r} checked={f.regions.includes(r)} onChange={(v) => set({ regions: v ? [...f.regions, r] : f.regions.filter((x) => x !== r) })} />)}</div>
            </div>
            <Field label="Note" className="md:col-span-2"><Textarea rows={2} value={f.note || ''} onChange={(e) => set({ note: e.target.value })} /></Field>
          </FormGrid>
        )}
      </Modal>
    </div>
  )
}
