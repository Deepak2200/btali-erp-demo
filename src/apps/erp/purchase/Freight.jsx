import React, { useMemo, useState } from 'react'
import { Plus, Send, Trash2, Pencil, CheckCircle2, XCircle, Ship, Clock, Scale, TrendingDown, Award, Zap, RotateCcw, Mail } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { useStore, useUser, useLookup } from '../../../store'
import {
  PageHeader, Card, Grid, Stat, Button, IconButton, StatusBadge, Badge, Tabs, Drawer, Modal, Field, FormGrid, Input, NumberInput, Select, Textarea,
  Checkbox, EmptyState, Alert, Timeline, DescriptionList, toast, confirm, prompt, cx,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { CHART_COLORS, UserName } from '../../../components/business'
import { fmtINR, fmtDate, fmtNum, fmtMoney, round2, sum, today, addDays, daysBetween } from '../../../lib/format'
import { rfqQuoteINR } from '../../../store/slices/procurement'

const CONTAINERS = ['20FT', '40FT', '40HC', 'LCL']
const CURRENCIES = ['USD', 'INR', 'CNY']

export default function Freight() {
  const rfqs = useStore((s) => s.freightRfqs) || []
  const fx = useStore((s) => s.settings.fx)
  const user = useUser()
  const { vendor } = useLookup()
  const [tab, setTab] = useState('rfqs')
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const open = rfqs.find((r) => r.id === openId)

  const stats = useMemo(() => {
    const approved = rfqs.filter((r) => r.status === 'APPROVED')
    const savings = approved.map((r) => {
      const tots = r.quotes.map((q) => rfqQuoteINR(q, fx))
      const sel = r.quotes.find((q) => q.id === r.selectedQuoteId)
      return tots.length && sel ? Math.max(...tots) - rfqQuoteINR(sel, fx) : 0
    })
    return { open: rfqs.filter((r) => r.status === 'OPEN').length, pending: rfqs.filter((r) => r.status === 'PENDING_APPROVAL').length, approved: approved.length, savings: sum(savings) }
  }, [rfqs, fx])

  const columns = [
    { key: 'number', header: 'RFQ', render: (r) => <div><div className="font-medium text-slate-800">{r.number}</div><div className="text-[11px] text-slate-500">{fmtDate(r.createdAt)}</div></div> },
    { key: 'route', header: 'Route', render: (r) => <div className="min-w-[180px]"><div>{r.route}</div><div className="text-[11px] text-slate-500">{r.containerType} · {r.poIds.length ? <PoNumbers ids={r.poIds} /> : 'No PO linked'}</div></div> },
    { key: 'quotes', header: 'Quotes', align: 'right', value: (r) => r.quotes.length },
    { key: 'best', header: 'Lowest (INR)', align: 'right', value: (r) => (r.quotes.length ? Math.min(...r.quotes.map((q) => rfqQuoteINR(q, fx))) : null), render: (r) => (r.quotes.length ? fmtINR(Math.min(...r.quotes.map((q) => rfqQuoteINR(q, fx)))) : '—') },
    { key: 'selected', header: 'Forwarder', value: (r) => vendor(r.selectedForwarderId || r.quotes.find((q) => q.id === r.recommendedQuoteId)?.forwarderId)?.name || '', render: (r) => {
      const fid = r.selectedForwarderId || r.quotes.find((q) => q.id === r.recommendedQuoteId)?.forwarderId
      return fid ? <div><div>{vendor(fid)?.name}</div><div className="text-[11px] text-slate-500">{r.selectedForwarderId ? 'Selected' : 'Recommended'}</div></div> : '—'
    } },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div>
      <PageHeader title="Freight Forwarder Comparison" subtitle="Log forwarder quotes, compare landed freight in INR and route the selection to the Director"
        actions={<Button icon={Plus} onClick={() => setCreating(true)}>New freight RFQ</Button>} />
      <Grid cols={4} className="mb-5">
        <Stat label="Open RFQs" value={stats.open} icon={Ship} tone="blue" sub="collecting quotes" />
        <Stat label="Awaiting Director" value={stats.pending} icon={Clock} tone="amber" sub="forwarder selections" />
        <Stat label="Approved selections" value={stats.approved} icon={CheckCircle2} tone="green" />
        <Stat label="Saved vs highest quote" value={fmtINR(stats.savings)} icon={TrendingDown} tone="brand" sub="across approved RFQs" />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'rfqs', label: 'Freight RFQs', count: rfqs.length }, { key: 'history', label: 'Historical rates' }]} />
      {tab === 'rfqs' ? (
        <DataTable columns={columns} rows={rfqs} onRowClick={(r) => setOpenId(r.id)} exportName="freight-rfqs" searchPlaceholder="Search RFQ, route…"
          filters={[{ key: 'status', label: 'statuses', options: ['OPEN', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'].map((s) => ({ value: s, label: s.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) })) }]} />
      ) : <RateHistory rfqs={rfqs} fx={fx} />}
      {open && <RfqDrawer rfq={open} onClose={() => setOpenId(null)} isAdmin={user?.role === 'ADMIN'} />}
      {creating && <CreateRfq onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id) }} />}
    </div>
  )
}

function PoNumbers({ ids }) {
  const pos = useStore((s) => s.purchaseOrders)
  return <>{ids.map((id) => pos.find((p) => p.id === id)?.number || id).join(', ')}</>
}

// ------------------------------------------------------------------ create
function CreateRfq({ onClose, onCreated }) {
  const pos = useStore((s) => s.purchaseOrders)
  const shipments = useStore((s) => s.shipments)
  const vendors = useStore((s) => s.vendors)
  const createRfq = useStore((s) => s.createRfq)
  const sendRfq = useStore((s) => s.sendRfqToForwarders)
  const eligible = pos.filter((p) => p.type === 'IMPORT' && ['APPROVED', 'PI_RECEIVED', 'IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP', 'SHIPPED'].includes(p.status))
  const forwarders = vendors.filter((v) => v.type === 'FORWARDER' && v.subtype !== 'DESTINATION')
  const [f, setF] = useState({ route: 'Ningbo → Nhava Sheva', poIds: [], shipmentId: '', containerType: '40HC', cargoReadyDate: addDays(today(), 10), notes: '', invite: forwarders.map((v) => v.id) })
  const togglePo = (id, v) => setF((s) => ({ ...s, poIds: v ? [...s.poIds, id] : s.poIds.filter((x) => x !== id) }))
  const save = () => {
    if (!f.route.trim() || (!f.poIds.length && !f.shipmentId)) return toast.error('Route and at least one PO or shipment are required')
    const r = createRfq({ ...f, shipmentId: f.shipmentId || null })
    if (f.invite.length) sendRfq(r.id, f.invite)
    toast.success(`${r.number} created`, f.invite.length ? `RFQ emailed to ${f.invite.length} forwarder(s)` : undefined)
    onCreated(r.id)
  }
  return (
    <Modal open onClose={onClose} title="New freight RFQ" subtitle="Request ocean freight quotes for one container" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Send} onClick={save}>Create & send RFQ</Button></>}>
      <FormGrid cols={3}>
        <Field label="Route" required className="md:col-span-2"><Input value={f.route} onChange={(e) => setF({ ...f, route: e.target.value })} placeholder="e.g. Ningbo → Nhava Sheva" /></Field>
        <Field label="Container type"><Select value={f.containerType} onChange={(e) => setF({ ...f, containerType: e.target.value })} options={CONTAINERS} /></Field>
        <Field label="Cargo ready date"><Input type="date" value={f.cargoReadyDate} onChange={(e) => setF({ ...f, cargoReadyDate: e.target.value })} /></Field>
        <Field label="Linked shipment (optional)" className="md:col-span-2"><Select value={f.shipmentId} onChange={(e) => setF({ ...f, shipmentId: e.target.value })} placeholder="None" options={shipments.filter((s) => s.status !== 'RECEIVED').map((s) => ({ value: s.id, label: `${s.number} · ${s.containerType} · ${s.status.replace('_', ' ')}` }))} /></Field>
      </FormGrid>
      <div className="mt-4">
        <div className="text-xs font-medium text-slate-600 mb-1">Purchase orders in this container</div>
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-52 overflow-y-auto">
          {eligible.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <Checkbox checked={f.poIds.includes(p.id)} onChange={(v) => togglePo(p.id, v)} label={<span><span className="font-medium">{p.number}</span> <span className="text-slate-500">· {vendors.find((v) => v.id === p.vendorId)?.name}</span></span>} />
              <StatusBadge status={p.status} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <div className="text-xs font-medium text-slate-600 mb-1">Email RFQ to forwarders</div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {forwarders.map((v) => <Checkbox key={v.id} checked={f.invite.includes(v.id)} onChange={(c) => setF((s) => ({ ...s, invite: c ? [...s.invite, v.id] : s.invite.filter((x) => x !== v.id) }))} label={v.name} />)}
        </div>
      </div>
      <Field label="Notes for forwarders" className="mt-4"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Cargo profile, weight, special handling…" /></Field>
    </Modal>
  )
}

// ------------------------------------------------------------------ RFQ drawer
function RfqDrawer({ rfq, onClose, isAdmin }) {
  const fx = useStore((s) => s.settings.fx)
  const vendors = useStore((s) => s.vendors)
  const pos = useStore((s) => s.purchaseOrders)
  const shipments = useStore((s) => s.shipments)
  const removeQuote = useStore((s) => s.removeRfqQuote)
  const submitRfq = useStore((s) => s.submitRfq)
  const approveFreight = useStore((s) => s.approveFreight)
  const reopenRfq = useStore((s) => s.reopenRfq)
  const sendRfq = useStore((s) => s.sendRfqToForwarders)
  const [quoteEdit, setQuoteEdit] = useState(null)
  const [pick, setPick] = useState(rfq.recommendedQuoteId)
  const v = (id) => vendors.find((x) => x.id === id)
  const editable = rfq.status === 'OPEN' || rfq.status === 'REJECTED'

  const rows = rfq.quotes.map((q) => ({ ...q, freightINR: round2(q.rate * (fx[q.currency] ?? 1)), extraINR: round2(sum(q.extraCharges || [], (c) => c.amount * (fx[c.currency || 'INR'] ?? 1))), totalINR: rfqQuoteINR(q, fx) }))
  const cheapest = rows.length ? rows.reduce((a, b) => (b.totalINR < a.totalINR ? b : a)).id : null
  const fastest = rows.length ? rows.reduce((a, b) => (b.transitDays < a.transitDays ? b : a)).id : null
  const mostFree = rows.length ? rows.reduce((a, b) => (b.freeDays > a.freeDays ? b : a)).id : null
  const shipment = shipments.find((s) => s.id === rfq.shipmentId)
  const notInvited = vendors.filter((x) => x.type === 'FORWARDER' && x.subtype !== 'DESTINATION' && !(rfq.invited || []).includes(x.id))

  const submit = async () => {
    if (!pick) return toast.error('Select the quote you recommend')
    const note = await prompt({ title: 'Recommend forwarder', label: 'Reason for recommendation', required: true, placeholder: 'e.g. lowest total cost with 21 free days', confirmText: 'Send for approval' })
    if (note == null) return
    submitRfq(rfq.id, pick, note)
    toast.success('Sent to Director for approval')
  }
  const decide = async (ok) => {
    const remark = ok ? await prompt({ title: 'Approve forwarder selection', label: 'Remark (optional)', confirmText: 'Approve' }) : await prompt({ title: 'Reject selection', label: 'Reason', required: true, tone: 'danger', confirmText: 'Reject' })
    if (remark == null) return
    approveFreight(rfq.id, ok, remark)
    ok ? toast.success('Forwarder approved', 'Linked to the PO(s)/shipment and vendor notified on the portal') : toast.warn('Selection rejected', 'Purchase has been notified')
  }

  const rec = rows.find((q) => q.id === rfq.recommendedQuoteId)
  return (
    <Drawer open onClose={onClose} width="max-w-5xl" title={`${rfq.number} · ${rfq.route}`} subtitle={<span className="inline-flex items-center gap-2"><StatusBadge status={rfq.status} /> {rfq.containerType} · created {fmtDate(rfq.createdAt)} by <UserName id={rfq.createdBy} /></span>}
      footer={<>
        {editable && rfq.status === 'REJECTED' && <Button variant="secondary" icon={RotateCcw} onClick={() => { reopenRfq(rfq.id); toast.success('RFQ re-opened') }}>Re-open</Button>}
        {rfq.status === 'OPEN' && <Button icon={Send} onClick={submit} disabled={!rows.length}>Recommend & submit for approval</Button>}
        {rfq.status === 'PENDING_APPROVAL' && isAdmin && <><Button variant="danger" icon={XCircle} onClick={() => decide(false)}>Reject</Button><Button variant="success" icon={CheckCircle2} onClick={() => decide(true)}>Approve selection</Button></>}
        {rfq.status === 'PENDING_APPROVAL' && !isAdmin && <span className="text-sm text-slate-500 self-center">Awaiting Director approval</span>}
      </>}>
      {rfq.status === 'APPROVED' && <Alert tone="success" className="mb-4" title={`${v(rfq.selectedForwarderId)?.name} selected`}>Approved by <UserName id={rfq.approvedBy} /> on {fmtDate(rfq.approvedAt)}. Linked to {rfq.poIds.length ? <PoNumbers ids={rfq.poIds} /> : 'the shipment'} and shown to the vendor on the Vendor Portal.</Alert>}
      {rfq.status === 'PENDING_APPROVAL' && rec && <Alert tone="warn" className="mb-4" title={`Recommended: ${v(rec.forwarderId)?.name} – ${fmtINR(rec.totalINR)}`}>{rfq.recommendationNote}</Alert>}
      {rfq.status === 'REJECTED' && <Alert tone="error" className="mb-4" title="Selection rejected">{rfq.decisionRemark}</Alert>}
      <DescriptionList cols={4} items={[
        ['Purchase orders', rfq.poIds.length ? <PoNumbers ids={rfq.poIds} /> : '—'],
        ['Shipment', shipment ? `${shipment.number} (${shipment.status.replace('_', ' ').toLowerCase()})` : (pos.find((p) => rfq.poIds.includes(p.id) && p.shipmentId) ? 'Linked via PO' : 'To be booked')],
        ['Cargo ready', fmtDate(rfq.cargoReadyDate)],
        ['RFQ sent to', (rfq.invited || []).map((id) => v(id)?.code).join(', ') || '—'],
      ]} />
      {rfq.notes && <p className="text-sm text-slate-600 mt-3">{rfq.notes}</p>}

      <div className="flex items-center justify-between mt-5 mb-2">
        <h4 className="text-sm font-semibold text-slate-900">Side-by-side comparison (INR @ USD {fx.USD})</h4>
        {editable && <div className="flex gap-2">
          {notInvited.length > 0 && <Button size="sm" variant="secondary" icon={Mail} onClick={() => { sendRfq(rfq.id, notInvited.map((x) => x.id)); toast.success(`RFQ emailed to ${notInvited.length} more forwarder(s)`) }}>Invite others</Button>}
          <Button size="sm" icon={Plus} onClick={() => setQuoteEdit({})}>Add quote</Button>
        </div>}
      </div>
      {!rows.length ? <Card><EmptyState icon={Scale} title="No quotes logged yet" message="Enter forwarder quotes as they arrive by email or phone." action={editable && <Button icon={Plus} onClick={() => setQuoteEdit({})}>Add first quote</Button>} /></Card> : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-3 py-2 text-[11px] uppercase text-slate-500 w-40" />
                {rows.map((q) => (
                  <th key={q.id} className={cx('px-3 py-2 text-left align-top min-w-[190px]', q.id === (rfq.selectedQuoteId || rfq.recommendedQuoteId) && 'bg-brand-50')}>
                    <div className="font-semibold text-slate-900">{v(q.forwarderId)?.name}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {q.id === cheapest && <Badge tone="green"><Award className="w-3 h-3" />Cheapest</Badge>}
                      {q.id === fastest && <Badge tone="blue"><Zap className="w-3 h-3" />Fastest</Badge>}
                      {q.id === mostFree && rows.length > 1 && <Badge tone="violet">Most free days</Badge>}
                      {q.id === rfq.selectedQuoteId && <Badge tone="brand">Selected</Badge>}
                      {!rfq.selectedQuoteId && q.id === rfq.recommendedQuoteId && <Badge tone="amber">Recommended</Badge>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <CompareRow label="Ocean freight" rows={rows} render={(q) => fmtMoney(q.rate, q.currency)} />
              <CompareRow label="Freight in INR" rows={rows} render={(q) => fmtINR(q.freightINR)} />
              <CompareRow label="Extra charges" rows={rows} render={(q) => (q.extraCharges || []).length ? <ul className="text-xs text-slate-600 space-y-0.5">{q.extraCharges.map((c, i) => <li key={i} className="flex justify-between gap-2"><span>{c.label}</span><span className="tabular-nums">{fmtMoney(c.amount, c.currency || 'INR')}</span></li>)}</ul> : '—'} />
              <CompareRow label="Total landed freight" rows={rows} strong render={(q) => <span className={cx('tabular-nums', q.id === cheapest && 'text-emerald-700')}>{fmtINR(q.totalINR)}</span>} />
              <CompareRow label="vs cheapest" rows={rows} render={(q) => { const c = rows.find((x) => x.id === cheapest); const d = q.totalINR - c.totalINR; return d ? <span className="text-red-600 tabular-nums">+{fmtINR(d)} ({((d / c.totalINR) * 100).toFixed(1)}%)</span> : <span className="text-emerald-700">—</span> }} />
              <CompareRow label="Transit time" rows={rows} render={(q) => <span className={cx(q.id === fastest && 'text-sky-700 font-medium')}>{q.transitDays} days</span>} />
              <CompareRow label="Free days (destination)" rows={rows} render={(q) => `${q.freeDays} days`} />
              <CompareRow label="Container" rows={rows} render={() => rfq.containerType} />
              <CompareRow label="Valid till" rows={rows} render={(q) => <span className={cx(q.validity && q.validity < today() && 'text-red-600')}>{fmtDate(q.validity)}{q.validity && q.validity < today() ? ' (expired)' : ''}</span>} />
              <CompareRow label="Remarks" rows={rows} render={(q) => <span className="text-xs text-slate-600">{q.remarks || '—'}</span>} />
              {(editable || rfq.status === 'OPEN') && (
                <tr>
                  <td className="px-3 py-2 text-xs text-slate-500">Action</td>
                  {rows.map((q) => (
                    <td key={q.id} className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {rfq.status === 'OPEN' && <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 mr-2 cursor-pointer"><input type="radio" name="rec" checked={pick === q.id} onChange={() => setPick(q.id)} className="accent-[#f2541f]" />Recommend</label>}
                        <IconButton icon={Pencil} title="Edit quote" onClick={() => setQuoteEdit(q)} />
                        <IconButton icon={Trash2} tone="danger" title="Remove quote" onClick={async () => { if (await confirm({ title: 'Remove this quote?', tone: 'danger', confirmText: 'Remove' })) { removeQuote(rfq.id, q.id); toast.success('Quote removed') } }} />
                      </div>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-slate-900 mb-3">Activity</h4>
        <Timeline items={[...(rfq.history || [])].reverse()} />
      </div>
      {quoteEdit && <QuoteModal rfq={rfq} quote={quoteEdit} onClose={() => setQuoteEdit(null)} />}
    </Drawer>
  )
}
function CompareRow({ label, rows, render, strong }) {
  return (
    <tr className={cx(strong && 'bg-slate-50 font-semibold')}>
      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{label}</td>
      {rows.map((q) => <td key={q.id} className="px-3 py-2 align-top">{render(q)}</td>)}
    </tr>
  )
}

function QuoteModal({ rfq, quote, onClose }) {
  const vendors = useStore((s) => s.vendors)
  const fx = useStore((s) => s.settings.fx)
  const addQuote = useStore((s) => s.addRfqQuote)
  const forwarders = vendors.filter((v) => v.type === 'FORWARDER' && v.subtype !== 'DESTINATION')
  const [q, setQ] = useState({ forwarderId: '', rate: '', currency: 'USD', transitDays: '', freeDays: 14, validity: addDays(today(), 14), remarks: '', extraCharges: [{ label: 'Destination THC', amount: '', currency: 'INR' }, { label: 'DO & documentation', amount: '', currency: 'INR' }], ...quote })
  const setC = (i, patch) => setQ((s) => ({ ...s, extraCharges: s.extraCharges.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))
  const save = () => {
    if (!q.forwarderId || !(q.rate > 0) || !(q.transitDays > 0)) return toast.error('Forwarder, rate and transit days are required')
    addQuote(rfq.id, { ...q, extraCharges: q.extraCharges.filter((c) => c.label && Number(c.amount) > 0).map((c) => ({ ...c, amount: Number(c.amount) })) })
    toast.success(quote.id ? 'Quote updated' : 'Quote added')
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={quote.id ? 'Edit forwarder quote' : 'Add forwarder quote'} subtitle={`${rfq.number} · ${rfq.route} · ${rfq.containerType}`} size="lg"
      footer={<><span className="mr-auto text-sm text-slate-600 self-center">Total ≈ <b>{fmtINR(rfqQuoteINR({ ...q, extraCharges: q.extraCharges.map((c) => ({ ...c, amount: Number(c.amount) || 0 })) }, fx))}</b></span><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save quote</Button></>}>
      <FormGrid cols={3}>
        <Field label="Forwarder" required className="md:col-span-3"><Select value={q.forwarderId} onChange={(e) => setQ({ ...q, forwarderId: e.target.value })} placeholder="Select forwarder" options={forwarders.map((v) => ({ value: v.id, label: `${v.name} (${v.city})` }))} /></Field>
        <Field label="Ocean freight rate" required><NumberInput min={0} value={q.rate} onChange={(v) => setQ({ ...q, rate: v })} /></Field>
        <Field label="Currency"><Select value={q.currency} onChange={(e) => setQ({ ...q, currency: e.target.value })} options={CURRENCIES} /></Field>
        <Field label="Valid till"><Input type="date" value={q.validity} onChange={(e) => setQ({ ...q, validity: e.target.value })} /></Field>
        <Field label="Transit days" required><NumberInput min={0} value={q.transitDays} onChange={(v) => setQ({ ...q, transitDays: v })} /></Field>
        <Field label="Free days at destination"><NumberInput min={0} value={q.freeDays} onChange={(v) => setQ({ ...q, freeDays: v })} /></Field>
      </FormGrid>
      <div className="mt-4">
        <div className="text-xs font-medium text-slate-600 mb-1">Extra charges breakdown</div>
        <div className="space-y-2">
          {q.extraCharges.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_90px_auto] gap-2 items-center">
              <Input value={c.label} onChange={(e) => setC(i, { label: e.target.value })} placeholder="Charge" />
              <NumberInput min={0} value={c.amount} onChange={(v) => setC(i, { amount: v })} placeholder="Amount" />
              <Select value={c.currency || 'INR'} onChange={(e) => setC(i, { currency: e.target.value })} options={CURRENCIES} />
              <IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => setQ((s) => ({ ...s, extraCharges: s.extraCharges.filter((_, j) => j !== i) }))} />
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => setQ((s) => ({ ...s, extraCharges: [...s.extraCharges, { label: '', amount: '', currency: 'INR' }] }))}>Add charge</Button>
        </div>
      </div>
      <Field label="Remarks" className="mt-3"><Textarea rows={2} value={q.remarks} onChange={(e) => setQ({ ...q, remarks: e.target.value })} placeholder="Sailing schedule, routing, conditions…" /></Field>
    </Modal>
  )
}

// ------------------------------------------------------------------ history
function RateHistory({ rfqs, fx }) {
  const vendors = useStore((s) => s.vendors)
  const all = rfqs.flatMap((r) => r.quotes.map((q) => ({ ...q, rfq: r.number, route: r.route, container: r.containerType, totalINR: rfqQuoteINR(q, fx), won: r.selectedQuoteId === q.id, date: (q.receivedAt || r.createdAt || '').slice(0, 10) })))
  const fwIds = [...new Set(all.map((q) => q.forwarderId))]
  const byRfq = rfqs.filter((r) => r.quotes.length).map((r) => ({ label: `${r.number.slice(-4)} · ${fmtDate(r.createdAt).slice(3)}`, date: r.createdAt, ...Object.fromEntries(r.quotes.map((q) => [q.forwarderId, Math.round(rfqQuoteINR(q, fx))])) })).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const summary = fwIds.map((id) => {
    const qs = all.filter((q) => q.forwarderId === id)
    return { id, name: vendors.find((v) => v.id === id)?.name, quotes: qs.length, won: qs.filter((q) => q.won).length, avg: sum(qs, (q) => q.totalINR) / qs.length, min: Math.min(...qs.map((q) => q.totalINR)), transit: sum(qs, (q) => q.transitDays) / qs.length, last: qs.map((q) => q.date).sort().pop() }
  })
  return (
    <div className="space-y-4">
      <Card title="Total landed freight per forwarder (INR)" subtitle="Every quote logged across RFQs – use it to benchmark the next negotiation">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={byRfq} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={64} domain={['auto', 'auto']} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
            <Tooltip formatter={(v, n) => [fmtINR(v), vendors.find((x) => x.id === n)?.name || n]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => vendors.find((x) => x.id === v)?.name || v} />
            {fwIds.map((id, i) => <Line key={id} type="monotone" dataKey={id} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} connectNulls dot={{ r: 3 }} />)}
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <DataTable rows={summary} searchable={false} exportName="forwarder-rate-summary" columns={[
        { key: 'name', header: 'Forwarder' },
        { key: 'quotes', header: 'Quotes', align: 'right' },
        { key: 'won', header: 'Won', align: 'right', render: (r) => `${r.won} (${r.quotes ? Math.round((r.won / r.quotes) * 100) : 0}%)` },
        { key: 'avg', header: 'Avg total', align: 'right', render: (r) => fmtINR(r.avg) },
        { key: 'min', header: 'Best quote', align: 'right', render: (r) => fmtINR(r.min) },
        { key: 'transit', header: 'Avg transit', align: 'right', render: (r) => `${r.transit.toFixed(1)} d` },
        { key: 'last', header: 'Last quoted', render: (r) => fmtDate(r.last) },
      ]} />
      <DataTable rows={all} rowKey="id" exportName="forwarder-quotes" searchPlaceholder="Search quotes…" pageSize={10} initialSort={{ key: 'date', dir: 'desc' }}
        filters={[{ key: 'forwarderId', label: 'forwarders', options: fwIds.map((id) => ({ value: id, label: vendors.find((v) => v.id === id)?.name })) }]}
        columns={[
          { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'rfq', header: 'RFQ' },
          { key: 'forwarder', header: 'Forwarder', value: (r) => vendors.find((v) => v.id === r.forwarderId)?.name },
          { key: 'route', header: 'Route' },
          { key: 'container', header: 'Cntr' },
          { key: 'rate', header: 'Rate', align: 'right', render: (r) => fmtMoney(r.rate, r.currency) },
          { key: 'transitDays', header: 'Transit', align: 'right', render: (r) => `${r.transitDays} d` },
          { key: 'totalINR', header: 'Total INR', align: 'right', render: (r) => fmtINR(r.totalINR) },
          { key: 'won', header: 'Result', value: (r) => (r.won ? 'Selected' : ''), render: (r) => (r.won ? <Badge tone="green">Selected</Badge> : '—') },
        ]} />
    </div>
  )
}
