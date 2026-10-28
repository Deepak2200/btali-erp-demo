import React, { useMemo, useState } from 'react'
import { Plus, HardDrive, TrendingDown, PlayCircle, Layers, Trash2 } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Button, Badge, StatusBadge, Card, Drawer, Modal, FormGrid, Field, Input, NumberInput, Select, KV, Alert, toast, confirm, Tabs, DescriptionList, AttachmentList, FileUpload } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtDate, today, round2, sum, monthLabel } from '../../../lib/format'
import { monthlyDep, depreciationSchedule, nextMonth } from './_books'

const CATS = [
  { label: 'Plant & Machinery', ledgerId: '1101', method: 'WDV', rate: 15, life: 15 },
  { label: 'Furniture & Fixtures', ledgerId: '1102', method: 'WDV', rate: 10, life: 10 },
  { label: 'Computers & IT Equipment', ledgerId: '1103', method: 'WDV', rate: 40, life: 3 },
  { label: 'Motor Vehicles', ledgerId: '1104', method: 'WDV', rate: 15, life: 8 },
  { label: 'Office Equipment', ledgerId: '1105', method: 'SLM', rate: 0, life: 5 },
]

export default function Assets() {
  const assets = useStore((s) => s.assets) || []
  const runs = useStore((s) => s.depRuns) || []
  const journals = useStore((s) => s.journals) || []
  const [tab, setTab] = useState('REG')
  const [open, setOpen] = useState(null)
  const [add, setAdd] = useState(false)
  const [run, setRun] = useState(false)
  const active = assets.filter((a) => a.status === 'ACTIVE')
  const gross = sum(active, (a) => a.cost), acc = sum(active, (a) => a.accumulatedDep || 0)
  const fyDep = sum(runs, (r) => r.amount ?? sum(Object.values(journals.find((j) => j.id === r.journalId)?.detail || {})))
  const last = runs.map((r) => r.period).sort().slice(-1)[0]
  return (
    <div>
      <PageHeader title="Fixed Assets" subtitle="Asset register, SLM / WDV depreciation schedules and automated monthly depreciation postings"
        actions={<><Button variant="secondary" icon={PlayCircle} onClick={() => setRun(true)}>Run depreciation</Button><Button icon={Plus} onClick={() => setAdd(true)}>Add asset</Button></>} />
      <Grid cols={4} className="mb-5">
        <Stat icon={HardDrive} label="Gross block" value={fmtINR(gross)} sub={`${active.length} active assets`} />
        <Stat icon={TrendingDown} tone="amber" label="Accumulated depreciation" value={fmtINR(acc)} />
        <Stat icon={Layers} tone="green" label="Net block (WDV)" value={fmtINR(gross - acc)} />
        <Stat icon={PlayCircle} tone="blue" label="Depreciation posted (FY)" value={fmtINR(fyDep)} sub={last ? `Last run: ${monthLabel(last)}` : 'No runs yet'} />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ key: 'REG', label: 'Asset register', count: assets.length }, { key: 'RUNS', label: 'Depreciation runs', count: runs.length }]} />
      {tab === 'REG' && (
        <DataTable rows={assets} onRowClick={(a) => setOpen(a.id)} exportName="fixed-asset-register" filters={[{ key: 'category', label: 'categories', options: CATS.map((c) => c.label) }]} columns={[
          { key: 'code', header: 'Code', render: (a) => <span className="font-mono text-xs">{a.code}</span> },
          { key: 'name', header: 'Asset', render: (a) => <div className="min-w-[180px]"><div className="font-medium text-slate-800">{a.name}</div><div className="text-[11px] text-slate-500">{a.category} · {a.location}</div></div> },
          { key: 'purchaseDate', header: 'Put to use', render: (a) => fmtDate(a.purchaseDate) },
          { key: 'method', header: 'Method', render: (a) => <Badge tone="ink">{a.method === 'WDV' ? `WDV ${a.rate}%` : `SLM ${a.lifeYears} yrs`}</Badge> },
          { key: 'cost', header: 'Cost', align: 'right', render: (a) => fmtINR(a.cost) },
          { key: 'accumulatedDep', header: 'Acc. dep.', align: 'right', render: (a) => fmtINR(a.accumulatedDep || 0) },
          { key: 'wdv', header: 'WDV', align: 'right', value: (a) => a.cost - (a.accumulatedDep || 0), render: (a) => <b>{fmtINR(a.cost - (a.accumulatedDep || 0))}</b> },
          { key: 'monthly', header: 'Next month dep.', align: 'right', value: (a) => (a.status === 'ACTIVE' ? monthlyDep(a, a.accumulatedDep || 0) : 0), render: (a) => (a.status === 'ACTIVE' ? fmtINR(monthlyDep(a, a.accumulatedDep || 0)) : '—') },
          { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
        ]} />
      )}
      {tab === 'RUNS' && (
        <DataTable rows={runs.slice().sort((a, b) => b.period.localeCompare(a.period)).map((r) => ({ ...r, id: r.period, j: journals.find((j) => j.id === r.journalId) }))} searchable={false} exportName="depreciation-runs" columns={[
          { key: 'period', header: 'Period', render: (r) => monthLabel(r.period) },
          { key: 'j', header: 'Journal', value: (r) => r.j?.number },
          { key: 'assets', header: 'Assets', align: 'right', value: (r) => Object.keys(r.j?.detail || {}).length },
          { key: 'amount', header: 'Depreciation', align: 'right', value: (r) => r.amount ?? sum(Object.values(r.j?.detail || {})), render: (r) => fmtINR(r.amount ?? sum(Object.values(r.j?.detail || {})), true) },
          { key: 'at', header: 'Posted', render: (r) => fmtDate(r.at) },
        ]} />
      )}
      {open && <AssetDrawer id={open} onClose={() => setOpen(null)} />}
      {add && <AssetForm onClose={() => setAdd(false)} />}
      {run && <RunModal assets={active} runs={runs} onClose={() => setRun(false)} />}
    </div>
  )
}

function RunModal({ assets, runs, onClose }) {
  const runDepreciation = useStore((s) => s.runDepreciation)
  const last = runs.map((r) => r.period).sort().slice(-1)[0]
  const [period, setPeriod] = useState(last ? nextMonth(last) : today().slice(0, 7))
  const done = runs.some((r) => r.period === period)
  const preview = assets.filter((a) => a.purchaseDate.slice(0, 7) <= period && (!a.lastDepPeriod || a.lastDepPeriod < period)).map((a) => ({ ...a, dep: monthlyDep(a, a.accumulatedDep || 0) })).filter((a) => a.dep > 0)
  const total = round2(sum(preview, (a) => a.dep))
  return (
    <Modal open onClose={onClose} title="Run depreciation" subtitle="Posts Dr Depreciation / Cr Accumulated Depreciation and updates each asset's WDV"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={PlayCircle} disabled={done || !preview.length || period > today().slice(0, 7)} onClick={() => { const r = runDepreciation(period); if (r.ok) { toast.success(`Depreciation posted for ${monthLabel(period)}`, `${r.journal.number} · ${fmtINR(r.amount, true)}`); onClose() } else toast.error(r.error) }}>Post {fmtINR(total, true)}</Button></>}>
      <Field label="Period" className="w-48 mb-3"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} max={today().slice(0, 7)} /></Field>
      {done && <Alert tone="warn" className="mb-3">Depreciation for {monthLabel(period)} has already been posted.</Alert>}
      {period > today().slice(0, 7) && <Alert tone="warn" className="mb-3">Future periods cannot be run.</Alert>}
      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-80 overflow-y-auto">
        {preview.map((a) => <div key={a.id} className="flex justify-between px-3 py-2 text-sm"><span>{a.code} · {a.name} <span className="text-xs text-slate-400">({a.method === 'WDV' ? `WDV ${a.rate}%` : `SLM ${a.lifeYears}y`})</span></span><span className="tabular-nums">{fmtINR(a.dep, true)}</span></div>)}
        {!preview.length && <div className="p-4 text-sm text-slate-500">No assets due for depreciation in this period.</div>}
      </div>
      <KV label="Total depreciation" value={fmtINR(total, true)} className="mt-2" />
    </Modal>
  )
}

function AssetDrawer({ id, onClose }) {
  const a = useStore((s) => (s.assets || []).find((x) => x.id === id))
  const journals = useStore((s) => s.journals) || []
  const banks = useStore((s) => s.bankAccounts) || []
  const disposeAsset = useStore((s) => s.disposeAsset)
  const [disp, setDisp] = useState(null)
  const sched = useMemo(() => (a ? depreciationSchedule(a, 6) : []), [a])
  if (!a) return null
  const posted = journals.filter((j) => j.detail?.[a.id]).sort((x, y) => y.date.localeCompare(x.date))
  return (
    <Drawer open onClose={onClose} title={`${a.code} · ${a.name}`} subtitle={<StatusBadge status={a.status} />} width="max-w-3xl"
      footer={a.status === 'ACTIVE' && <Button variant="secondary" icon={Trash2} onClick={() => setDisp({ amount: '', date: today(), payTo: 'bk1' })}>Sell / dispose</Button>}>
      <DescriptionList cols={3} items={[['Category', a.category], ['Location', a.location], ['Supplier', a.vendor], ['Put to use', fmtDate(a.purchaseDate)], ['Invoice', a.invoiceRef], ['Method', a.method === 'WDV' ? `Written down value @ ${a.rate}%` : `Straight line over ${a.lifeYears} years`], ['Cost', fmtINR(a.cost)], ['Salvage', fmtINR(a.salvage || 0)], ['WDV today', fmtINR(a.cost - (a.accumulatedDep || 0))]]} />
      <Card title="Depreciation schedule (projected, by FY)" className="mt-4" padded={false}>
        <table className="w-full text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-4 py-2">Financial year</th><th className="text-right px-3 py-2">Opening WDV</th><th className="text-right px-3 py-2">Depreciation</th><th className="text-right px-4 py-2">Closing WDV</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{sched.map((r) => <tr key={r.fy}><td className="px-4 py-2">{r.fy}</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(r.opening)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(r.dep)}</td><td className="px-4 py-2 text-right tabular-nums">{fmtINR(r.closing)}</td></tr>)}</tbody></table>
      </Card>
      <Card title="Depreciation posted this FY" className="mt-4" padded={false}>
        {posted.length ? <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">{posted.map((j) => <tr key={j.id}><td className="px-4 py-2">{j.period ? monthLabel(j.period) : fmtDate(j.date)}</td><td className="px-3 py-2 text-slate-500">{j.number}</td><td className="px-4 py-2 text-right tabular-nums">{fmtINR(j.detail[a.id], true)}</td></tr>)}</tbody></table> : <div className="p-4 text-sm text-slate-500">No runs yet.</div>}
      </Card>
      <div className="mt-4"><AttachmentList items={a.attachments || []} /></div>
      {disp && (
        <Modal open size="sm" onClose={() => setDisp(null)} title={`Dispose ${a.code}`} footer={<><Button variant="secondary" onClick={() => setDisp(null)}>Cancel</Button><Button variant="danger" onClick={async () => { if (!(await confirm({ title: 'Post disposal?', message: `Asset will be removed from the register and gain/loss on sale posted.`, tone: 'danger', confirmText: 'Dispose' }))) return; disposeAsset(a.id, disp); toast.success('Asset disposed', a.code); setDisp(null) }}>Dispose asset</Button></>}>
          <FormGrid cols={1}>
            <Field label="Sale value (₹)" hint={`WDV ${fmtINR(a.cost - (a.accumulatedDep || 0))}`}><NumberInput value={disp.amount} onChange={(v) => setDisp({ ...disp, amount: v })} /></Field>
            <Field label="Date"><Input type="date" value={disp.date} onChange={(e) => setDisp({ ...disp, date: e.target.value })} /></Field>
            <Field label="Proceeds received in"><Select value={disp.payTo} onChange={(e) => setDisp({ ...disp, payTo: e.target.value })} options={banks.map((b) => ({ value: b.id, label: b.name }))} /></Field>
          </FormGrid>
        </Modal>
      )}
    </Drawer>
  )
}

function AssetForm({ onClose }) {
  const createAsset = useStore((s) => s.createAsset)
  const banks = useStore((s) => s.bankAccounts) || []
  const [f, setF] = useState({ name: '', category: CATS[0].label, ledgerId: CATS[0].ledgerId, location: 'Turbhe HO', purchaseDate: today(), cost: '', method: CATS[0].method, rate: CATS[0].rate, lifeYears: CATS[0].life, salvage: 0, vendor: '', invoiceRef: '', attachments: [], payFrom: 'bk1' })
  const pick = (label) => { const c = CATS.find((x) => x.label === label); setF({ ...f, category: label, ledgerId: c.ledgerId, method: c.method, rate: c.rate, lifeYears: c.life }) }
  const save = () => {
    if (!f.name.trim() || !(Number(f.cost) > 0)) return toast.error('Asset name and cost are required')
    const { payFrom, ...data } = f
    const a = createAsset({ ...data, rate: Number(f.rate) || 0, lifeYears: Number(f.lifeYears) || 0, salvage: Number(f.salvage) || 0 }, { payFrom: payFrom === 'NONE' ? null : payFrom })
    toast.success('Asset capitalised', `${a.code} · ${fmtINR(a.cost)}`)
    onClose()
  }
  return (
    <Modal open size="lg" onClose={onClose} title="Add fixed asset" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Capitalise asset</Button></>}>
      <FormGrid cols={3}>
        <Field label="Asset name" required className="md:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Hand pallet trucks (4 nos)" /></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => pick(e.target.value)} options={CATS.map((c) => c.label)} /></Field>
        <Field label="Location"><Select value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} options={['Turbhe HO', 'Btali, Bhiwandi', 'Director', 'Field']} /></Field>
        <Field label="Put to use on"><Input type="date" value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} /></Field>
        <Field label="Cost (₹, excl. GST)" required><NumberInput value={f.cost} onChange={(v) => setF({ ...f, cost: v })} /></Field>
        <Field label="Method"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} options={[{ value: 'WDV', label: 'Written down value (WDV)' }, { value: 'SLM', label: 'Straight line (SLM)' }]} /></Field>
        {f.method === 'WDV' ? <Field label="WDV rate %"><NumberInput value={f.rate} onChange={(v) => setF({ ...f, rate: v })} /></Field> : <Field label="Useful life (years)"><NumberInput value={f.lifeYears} onChange={(v) => setF({ ...f, lifeYears: v })} /></Field>}
        <Field label="Salvage value (₹)"><NumberInput value={f.salvage} onChange={(v) => setF({ ...f, salvage: v })} /></Field>
        <Field label="Supplier"><Input value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} /></Field>
        <Field label="Invoice no."><Input value={f.invoiceRef} onChange={(e) => setF({ ...f, invoiceRef: e.target.value })} /></Field>
        <Field label="Payment"><Select value={f.payFrom} onChange={(e) => setF({ ...f, payFrom: e.target.value })} options={[...banks.map((b) => ({ value: b.id, label: `Paid from ${b.name}` })), { value: 'CREDIT', label: 'On credit (creditors)' }, { value: 'NONE', label: 'Already booked – register only' }]} /></Field>
        <div className="md:col-span-3"><FileUpload compact onFiles={(a) => setF({ ...f, attachments: [...f.attachments, ...a] })} label="Attach purchase invoice / photos" />{f.attachments.length > 0 && <div className="mt-2"><AttachmentList dense items={f.attachments} onRemove={(x) => setF({ ...f, attachments: f.attachments.filter((y) => y.id !== x.id) })} /></div>}</div>
      </FormGrid>
    </Modal>
  )
}
