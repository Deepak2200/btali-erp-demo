import React, { useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Ship, Plus, CalendarDays, LayoutList, Columns3, AlertTriangle, Anchor, CheckCircle2, Circle, Calculator, PackageCheck, ChevronLeft, ChevronRight, Clock, FileUp } from 'lucide-react'
import { useStore, useLookup, useUser } from '../../../store'
import { PageHeader, Card, Button, Segmented, Grid, Stat, Badge, StatusBadge, Drawer, Modal, Field, FormGrid, Input, NumberInput, Select, Checkbox, Switch, Alert, AttachmentList, FileUpload, EmptyState, DescriptionList, Kanban, Textarea, toast, confirm, cx, SectionTitle } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtDate, fmtNum, fmtMoney, today, addDays, daysBetween, sum, round2, fmtDateTime } from '../../../lib/format'
import { shipmentAlerts, poValueINR, CONTAINERS, PoLink } from './_purchaseKit'

const STATUSES = [
  { key: 'BOOKED', label: 'Booked', tone: 'gray' },
  { key: 'IN_TRANSIT', label: 'In transit', tone: 'blue' },
  { key: 'AT_PORT', label: 'At port', tone: 'violet' },
  { key: 'CLEARED', label: 'Cleared', tone: 'teal' },
  { key: 'RECEIVED', label: 'Received', tone: 'green' },
]
const SHIP_DOCS = ['CI', 'PL', 'BL', 'BOE', 'IGM', 'CAN', 'INSURANCE', 'TELEX', 'COO', 'SWIFT', 'CHA']

export default function Shipments() {
  const [sp, setSp] = useSearchParams()
  const s = useStore()
  const user = useUser()
  const { vendor } = useLookup()
  const canEdit = ['PURCHASE', 'ADMIN'].includes(user?.role)
  const [view, setView] = useState('list')
  const openId = sp.get('id')
  const creating = sp.get('create') === '1'
  const setParam = (patch) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }) }

  const rows = useMemo(() => s.shipments.map((sh) => ({ ...sh, alertsNow: shipmentAlerts(sh, s.settings), pos: s.purchaseOrders.filter((p) => sh.poIds.includes(p.id)) })), [s.shipments, s.purchaseOrders, s.settings])
  const active = rows.filter((r) => r.status !== 'RECEIVED')
  const ready = s.purchaseOrders.filter((p) => p.status === 'READY_TO_SHIP')

  const columns = [
    { key: 'number', header: 'Shipment', render: (r) => <div><div className="font-mono font-medium text-brand-700 whitespace-nowrap">{r.number}</div><div className="text-[11px] text-slate-500">{r.containerNo} · {r.containerType}</div></div>, value: (r) => `${r.number} ${r.containerNo}` },
    { key: 'vendor', header: 'Vendor / POs', value: (r) => vendor(r.vendorId)?.name, render: (r) => <div className="min-w-0"><div className="text-sm truncate max-w-[200px]">{vendor(r.vendorId)?.name}</div><div className="text-[11px] text-slate-500">{r.pos.map((p) => p.number).join(', ')}</div></div> },
    { key: 'etd', header: 'ETD', render: (r) => fmtDate(r.etd) },
    { key: 'eta', header: 'ETA', render: (r) => { const d = daysBetween(today(), r.eta); return <div><div className="whitespace-nowrap">{fmtDate(r.eta)}</div>{r.status !== 'RECEIVED' && <div className={cx('text-[11px]', d < 0 ? 'text-red-600' : d <= 3 ? 'text-amber-600' : 'text-slate-500')}>{d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : `in ${d}d`}</div>}</div> } },
    { key: 'blNo', header: 'BL no.' },
    { key: 'telex', header: 'Telex', value: (r) => (r.telexReleased ? 'Yes' : 'No'), render: (r) => (r.telexReleased ? <Badge tone="green">Released</Badge> : <Badge tone="gray">Pending</Badge>) },
    { key: 'alerts', header: 'Alerts', value: (r) => r.alertsNow.length, render: (r) => (r.alertsNow.length ? <Badge tone={r.alertsNow.some((a) => a.tone === 'red') ? 'red' : 'amber'}><AlertTriangle className="w-3 h-3" />{r.alertsNow.length}</Badge> : '—') },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div>
      <PageHeader title="Import Shipments & ETA" subtitle="Live container board for Purchase, Sales, Dispatch, Accounts and Starex"
        actions={<>
          <Segmented value={view} onChange={setView} options={[{ key: 'list', label: <span className="inline-flex items-center gap-1"><LayoutList className="w-4 h-4" />List</span> }, { key: 'board', label: <span className="inline-flex items-center gap-1"><Columns3 className="w-4 h-4" />Board</span> }, { key: 'calendar', label: <span className="inline-flex items-center gap-1"><CalendarDays className="w-4 h-4" />ETA calendar</span> }]} />
          {canEdit && <Button icon={Plus} onClick={() => setParam({ create: '1' })}>Create shipment</Button>}
        </>} />
      <Grid cols={4}>
        <Stat label="Containers en route" value={active.length} sub={`${fmtNum(sum(active, (r) => sum(r.pos, (p) => sum(p.lines, (l) => l.qty))))} units`} icon={Ship} />
        <Stat label="Arriving in 7 days" value={active.filter((r) => { const d = daysBetween(today(), r.eta); return d >= 0 && d <= 7 }).length} icon={Clock} tone="amber" />
        <Stat label="At port / clearance" value={active.filter((r) => ['AT_PORT', 'CLEARED'].includes(r.status)).length} sub={`${active.filter((r) => !r.telexReleased && r.status === 'AT_PORT').length} awaiting telex`} icon={Anchor} tone="violet" />
        <Stat label="POs ready to ship" value={ready.length} sub={ready.length ? 'Book a container' : 'None pending'} icon={PackageCheck} tone="green" onClick={canEdit && ready.length ? () => setParam({ create: '1' }) : undefined} />
      </Grid>

      {active.some((r) => r.alertsNow.length) && (
        <div className="mt-4 space-y-2">
          {active.filter((r) => r.alertsNow.length).map((r) => (
            <Alert key={r.id} tone={r.alertsNow.some((a) => a.tone === 'red') ? 'error' : 'warn'} title={`${r.containerNo} · ${r.number}`} action={<Button size="sm" variant="secondary" onClick={() => setParam({ id: r.id })}>Open</Button>}>{r.alertsNow.map((a) => a.text).join(' · ')}</Alert>
          ))}
        </div>
      )}

      <div className="mt-4">
        {view === 'list' && <DataTable columns={columns} rows={rows} onRowClick={(r) => setParam({ id: r.id })} exportName="shipments" initialSort={{ key: 'eta', dir: 'desc' }} filters={[{ key: 'status', label: 'statuses', options: STATUSES.map((x) => ({ value: x.key, label: x.label })) }]} />}
        {view === 'board' && (
          <Kanban columns={STATUSES} items={rows} getColumn={(r) => r.status} renderCard={(r) => (
            <button type="button" className="text-left w-full" onClick={() => setParam({ id: r.id })}>
              <div className="flex justify-between items-center"><span className="font-mono text-sm font-semibold">{r.containerNo}</span><Badge tone="gray">{r.containerType}</Badge></div>
              <div className="text-xs text-slate-500 mt-0.5">{r.number} · {vendor(r.vendorId)?.name.split(' ').slice(0, 2).join(' ')}</div>
              <div className="text-xs mt-1.5 flex justify-between"><span>ETA <b>{fmtDate(r.eta)}</b></span>{r.telexReleased && <Badge tone="green">Telex</Badge>}</div>
              <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${(r.milestones.filter((m) => m.done).length / r.milestones.length) * 100}%` }} /></div>
              {r.alertsNow.length > 0 && <div className="text-[11px] text-amber-700 mt-1.5">{r.alertsNow[0].text}</div>}
            </button>
          )} />
        )}
        {view === 'calendar' && <EtaCalendar rows={rows} onOpen={(id) => setParam({ id })} />}
      </div>

      {openId && <ShipmentDrawer id={openId} onClose={() => setParam({ id: '' })} canEdit={canEdit} canTelex={canEdit || ['ACCOUNTS', 'FINANCE_HEAD'].includes(user?.role)} />}
      {creating && <CreateShipment preselect={(sp.get('pos') || '').split(',').filter(Boolean)} planId={sp.get('plan')} onClose={() => setParam({ create: '', pos: '', plan: '' })} onCreated={(sh) => setParam({ create: '', pos: '', plan: '', id: sh.id })} />}
    </div>
  )
}

function EtaCalendar({ rows, onOpen }) {
  const [offset, setOffset] = useState(0)
  const base = new Date()
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1)
  const label = first.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const startPad = (first.getDay() + 6) % 7
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const iso = (d) => `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  return (
    <Card title={label} actions={<div className="flex gap-1"><Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => setOffset(offset - 1)} /><Button size="sm" variant="secondary" onClick={() => setOffset(0)}>Today</Button><Button size="sm" variant="ghost" icon={ChevronRight} onClick={() => setOffset(offset + 1)} /></div>}>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-1 min-w-[640px]">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="text-[11px] font-semibold text-slate-500 uppercase text-center py-1">{d}</div>)}
          {cells.map((d, i) => {
            const date = d && iso(d)
            const list = d ? rows.filter((r) => r.eta === date || r.ata === date) : []
            return (
              <div key={i} className={cx('min-h-[84px] rounded-lg border p-1.5', d ? 'border-slate-200 bg-white' : 'border-transparent', date === today() && 'ring-2 ring-brand-300')}>
                {d && <div className="text-[11px] text-slate-400 mb-1">{d}</div>}
                {list.map((r) => (
                  <button key={r.id} type="button" onClick={() => onOpen(r.id)} className={cx('block w-full text-left text-[11px] rounded px-1.5 py-1 mb-1 truncate', r.status === 'RECEIVED' ? 'bg-emerald-50 text-emerald-700' : r.alertsNow.some((a) => a.tone === 'red') ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700')}>
                    <Ship className="w-3 h-3 inline mr-0.5" />{r.containerNo}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

function ShipmentDrawer({ id, onClose, canEdit, canTelex }) {
  const s = useStore()
  const { vendor, user } = useLookup()
  const sh = s.shipments.find((x) => x.id === id)
  const [edit, setEdit] = useState(null) // milestone key being marked
  const [mdate, setMdate] = useState(today())
  const [eta, setEta] = useState(null)
  const [docType, setDocType] = useState('BL')
  if (!sh) return null
  const pos = s.purchaseOrders.filter((p) => sh.poIds.includes(p.id))
  const alerts = shipmentAlerts(sh, s.settings)
  const docs = pos.flatMap((p) => (p.docs || []).filter((d) => SHIP_DOCS.includes(d.docType)).map((d) => ({ ...d, name: d.name })))
  const units = s.units.filter((u) => sh.poIds.includes(u.poId))
  const doneCount = sh.milestones.filter((m) => m.done).length

  const markDone = (key) => {
    s.updateShipmentMilestone(sh.id, key, { done: true, date: mdate })
    setEdit(null)
    toast.success('Milestone updated', sh.milestones.find((m) => m.key === key)?.label)
  }
  const undo = async (m) => {
    if (!(await confirm({ title: 'Reopen milestone?', message: m.label }))) return
    s.updateShipmentMilestone(sh.id, m.key, { done: false })
  }
  const saveEta = () => {
    s.changeShipmentEta(sh.id, eta.date, eta.reason)
    setEta(null)
    toast.success('ETA updated', 'Sales, Dispatch, Accounts & Starex notified')
  }

  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={`${sh.containerNo} · ${sh.containerType}`} subtitle={<span className="flex items-center gap-2">{sh.number} <StatusBadge status={sh.status} /></span>}
      footer={<>
        <Link to="/erp/purchase/landed-cost" className="mr-auto"><Button variant="secondary" icon={Calculator}>Landed cost</Button></Link>
        <Link to="/erp/purchase/inward"><Button variant={['AT_PORT', 'CLEARED'].includes(sh.status) ? 'primary' : 'secondary'} icon={PackageCheck}>{sh.status === 'RECEIVED' ? 'View inward' : 'Record inward'}</Button></Link>
      </>}>
      <div className="space-y-5">
        {alerts.length > 0 && <div className="space-y-1.5">{alerts.map((a) => <Alert key={a.key} tone={a.tone === 'red' ? 'error' : 'warn'}>{a.text}</Alert>)}</div>}
        <DescriptionList cols={3} items={[
          ['Supplier', vendor(sh.vendorId)?.name], ['China forwarder', vendor(sh.forwarderId)?.name], ['Indian forwarder', vendor(sh.indianForwarderId)?.name],
          ['CHA', vendor(sh.chaId)?.name], ['BL no.', sh.blNo || '—'], ['Freight', sh.freight?.rate ? fmtMoney(sh.freight.rate, sh.freight.currency) : '—'],
          ['ETD', fmtDate(sh.etd)], ['ETA', <span key="e">{fmtDate(sh.eta)}{sh.originalEta && sh.originalEta !== sh.eta && <span className="text-xs text-slate-400 line-through ml-1">{fmtDate(sh.originalEta)}</span>}</span>], ['ATA', sh.ata ? fmtDate(sh.ata) : '—'],
        ]} />
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <Switch checked={sh.telexReleased} onChange={(v) => { if (!canTelex) return toast.error('Only Purchase / Accounts can update telex status'); s.setTelexRelease(sh.id, v); toast.success(v ? 'Telex release recorded' : 'Telex release reverted', v ? 'Forwarder emailed to issue DO' : undefined) }} label={<span className="text-sm font-medium">Telex release received</span>} />
          {canEdit && sh.status !== 'RECEIVED' && <Button size="sm" variant="secondary" icon={CalendarDays} className="ml-auto" onClick={() => setEta({ date: sh.eta, reason: '' })}>Change ETA</Button>}
        </div>
        {eta && (
          <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-3 space-y-3">
            <FormGrid>
              <Field label="New ETA"><Input type="date" value={eta.date} onChange={(e) => setEta({ ...eta, date: e.target.value })} /></Field>
              <Field label="Reason" required><Input value={eta.reason} onChange={(e) => setEta({ ...eta, reason: e.target.value })} placeholder="e.g. Vessel rolled over at Ningbo" /></Field>
            </FormGrid>
            <div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={() => setEta(null)}>Cancel</Button><Button size="sm" disabled={!eta.reason.trim() || eta.date === sh.eta} onClick={saveEta}>Save & notify</Button></div>
          </div>
        )}

        <div>
          <SectionTitle>Milestones · {doneCount}/{sh.milestones.length}</SectionTitle>
          <ol className="relative border-l-2 border-slate-200 ml-2 space-y-3">
            {sh.milestones.map((m) => (
              <li key={m.key} className="ml-4">
                <span className={cx('absolute -left-[9px] w-4 h-4 rounded-full flex items-center justify-center', m.done ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-slate-300')}>{m.done && <CheckCircle2 className="w-3 h-3" />}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx('text-sm', m.done ? 'text-slate-800 font-medium' : 'text-slate-600')}>{m.label}</span>
                  <span className="text-[11px] text-slate-400">{m.done ? `done ${fmtDate(m.date)}` : `planned ${fmtDate(m.planned)}`}</span>
                  {!m.done && m.planned < today() && sh.status !== 'RECEIVED' && <Badge tone="red">Overdue</Badge>}
                  {canEdit && m.key !== 'INWARD' && sh.status !== 'RECEIVED' && (m.done
                    ? <button className="text-[11px] text-slate-400 hover:text-slate-700 ml-auto" onClick={() => undo(m)}>Reopen</button>
                    : edit === m.key
                      ? <span className="ml-auto flex items-center gap-1"><Input type="date" value={mdate} onChange={(e) => setMdate(e.target.value)} className="!py-1 !w-36 text-xs" /><Button size="sm" onClick={() => markDone(m.key)}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>×</Button></span>
                      : <Button size="sm" variant="soft" className="ml-auto" onClick={() => { setEdit(m.key); setMdate(today()) }}>Mark done</Button>)}
                  {m.key === 'INWARD' && !m.done && <Link to="/erp/purchase/inward" className="text-[11px] text-brand-600 hover:underline ml-auto">Via Inward & GRN →</Link>}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <SectionTitle>Linked purchase orders</SectionTitle>
          <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            {pos.map((p) => <li key={p.id} className="px-3 py-2 flex items-center gap-3 text-sm"><PoLink po={p} /><span className="text-slate-500 flex-1 truncate">{p.lines.length} lines · {fmtNum(sum(p.lines, (l) => l.qty))} units</span><span className="tabular-nums">{fmtMoney(sum(p.lines, (l) => l.qty * l.rate), p.currency)}</span><StatusBadge status={p.status} /></li>)}
          </ul>
          <div className="text-xs text-slate-500 mt-1.5">{fmtNum(units.length)} barcoded units · {fmtNum(units.filter((u) => u.status === 'IN_TRANSIT').length)} in transit</div>
        </div>

        <div>
          <SectionTitle>Shipping documents</SectionTitle>
          <AttachmentList items={docs} empty="No shipping documents yet (BL, CAN, IGM, BOE, insurance, telex)." dense />
          {canEdit && pos[0] && (
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <div className="sm:w-40"><Select value={docType} onChange={(e) => setDocType(e.target.value)} options={SHIP_DOCS} /></div>
              <div className="flex-1"><FileUpload compact onFiles={(atts) => { s.addPODocs(pos[0].id, atts, docType); toast.success(`${docType} uploaded`, `Filed in ${pos[0].number} locker`) }} label={`Upload ${docType}`} /></div>
            </div>
          )}
        </div>

        {sh.log?.length > 0 && (
          <div>
            <SectionTitle>Change log</SectionTitle>
            <ul className="text-xs text-slate-600 space-y-1">{[...(sh.log || [])].reverse().map((l, i) => <li key={i}>{fmtDateTime(l.ts)} · {user(l.by)?.name || ''} – {l.text}</li>)}</ul>
          </div>
        )}
      </div>
    </Drawer>
  )
}

function CreateShipment({ preselect, planId, onClose, onCreated }) {
  const s = useStore()
  const ready = s.purchaseOrders.filter((p) => p.status === 'READY_TO_SHIP')
  const fws = s.vendors.filter((v) => v.type === 'FORWARDER')
  const [f, setF] = useState({
    poIds: preselect.length ? preselect.filter((id) => ready.some((p) => p.id === id)) : ready.map((p) => p.id).slice(0, 1),
    containerNo: '', containerType: '40HC', blNo: '', forwarderId: 'fw1', indianForwarderId: 'fw3', chaId: 'cha1', etd: addDays(today(), 3), eta: addDays(today(), 31), freightRate: 1850, freightCurrency: 'USD',
  })
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const sel = ready.filter((p) => f.poIds.includes(p.id))
  const cbm = sum(sel, (p) => sum(p.lines, (l) => l.qty * (s.products.find((x) => x.id === l.productId)?.cbm || 0)))
  const cap = CONTAINERS[f.containerType]
  const valid = f.poIds.length && /^[A-Z]{4}\s?\d{6}\s?\d$/i.test(f.containerNo.trim()) && f.etd && f.eta && f.eta > f.etd
  const save = () => {
    const sh = s.createShipment({ ...f, containerNo: f.containerNo.toUpperCase().replace(/^([A-Z]{4})\s?(\d{6})\s?(\d)$/, '$1 $2 $3'), planId })
    toast.success(`${sh.number} created`, 'Sales, Dispatch, Starex & Accounts notified')
    onCreated(sh)
  }
  return (
    <Modal open onClose={onClose} size="lg" title="Create shipment" subtitle="Book a container for QC-released purchase orders"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Ship} disabled={!valid} onClick={save}>Create & notify</Button></>}>
      {ready.length === 0 ? <EmptyState icon={PackageCheck} title="No POs ready to ship" message="POs appear here after QC is approved and released." /> : (
        <div className="space-y-4">
          <div>
            <SectionTitle>Purchase orders (ready to ship)</SectionTitle>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {ready.map((p) => (
                <div key={p.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                  <Checkbox checked={f.poIds.includes(p.id)} onChange={(v) => set('poIds', v ? [...f.poIds, p.id] : f.poIds.filter((x) => x !== p.id))} label={<span className="font-mono">{p.number}</span>} />
                  <span className="text-slate-500 flex-1 truncate">{s.vendors.find((v) => v.id === p.vendorId)?.name}</span>
                  <span className="tabular-nums text-xs text-slate-500">{fmtNum(round2(sum(p.lines, (l) => l.qty * (s.products.find((x) => x.id === l.productId)?.cbm || 0))))} cbm</span>
                </div>
              ))}
            </div>
            {sel.length > 0 && <div className={cx('text-xs mt-1.5', cbm > cap.cbm ? 'text-red-600' : 'text-slate-500')}>{fmtNum(round2(cbm))} cbm of {cap.cbm} cbm ({Math.round((cbm / cap.cbm) * 100)}% of a {f.containerType}){cbm > cap.cbm ? ' – exceeds capacity, plan more containers' : ''}</div>}
          </div>
          <FormGrid cols={3}>
            <Field label="Container no." required hint="e.g. TGHU 884120 3"><Input value={f.containerNo} onChange={(e) => set('containerNo', e.target.value)} placeholder="ABCD 123456 7" /></Field>
            <Field label="Container type"><Select value={f.containerType} onChange={(e) => set('containerType', e.target.value)} options={Object.entries(CONTAINERS).map(([k, v]) => ({ value: k, label: `${k} – ${v.label}` }))} /></Field>
            <Field label="BL no."><Input value={f.blNo} onChange={(e) => set('blNo', e.target.value)} placeholder="OLS26…" /></Field>
            <Field label="China forwarder"><Select value={f.forwarderId} onChange={(e) => set('forwarderId', e.target.value)} options={fws.filter((v) => v.subtype === 'CHINA').map((v) => ({ value: v.id, label: v.name }))} /></Field>
            <Field label="Indian forwarder"><Select value={f.indianForwarderId} onChange={(e) => set('indianForwarderId', e.target.value)} options={fws.filter((v) => v.subtype === 'INDIA').map((v) => ({ value: v.id, label: v.name }))} /></Field>
            <Field label="CHA"><Select value={f.chaId} onChange={(e) => set('chaId', e.target.value)} options={s.vendors.filter((v) => v.type === 'CHA').map((v) => ({ value: v.id, label: v.name }))} /></Field>
            <Field label="ETD (origin)" required><Input type="date" value={f.etd} onChange={(e) => set('etd', e.target.value)} /></Field>
            <Field label="ETA Nhava Sheva" required error={f.eta <= f.etd ? 'ETA must be after ETD' : null}><Input type="date" value={f.eta} onChange={(e) => set('eta', e.target.value)} /></Field>
            <Field label="Ocean freight (USD)"><NumberInput value={f.freightRate} onChange={(v) => set('freightRate', v)} /></Field>
          </FormGrid>
          {f.containerNo && !/^[A-Z]{4}\s?\d{6}\s?\d$/i.test(f.containerNo.trim()) && <div className="text-xs text-red-600">Container number must be 4 letters + 7 digits (ISO 6346).</div>}
        </div>
      )}
    </Modal>
  )
}
