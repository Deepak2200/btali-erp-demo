import React, { useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Plus, Send, ArrowRightCircle, Clock, Printer, Pencil, CheckCircle2, FileSignature, IndianRupee, Factory } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Grid, Stat, Tabs, Button, StatusBadge, Badge, Modal, Drawer, Field, FormGrid, Input, Textarea, Combobox, Timeline,
  DescriptionList, Alert, confirm, prompt, toast, cx, SectionTitle,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PartnerCell, LineItemsEditor, OrderLines, PrintArea, DocHeader, UserName } from '../../../components/business'
import { quotePrice } from '../../../lib/pricing'
import { fmtINR, fmtDate, fmtPct, sum, today, addDays, round2, fmtMoney } from '../../../lib/format'
import { useScope, ScopeToggle, PricedSummary, LineStockCheck, partnerOptions } from './_shared'

const effectiveStatus = (q) => (['DRAFT', 'SENT'].includes(q.status) && q.validTill < today() ? 'EXPIRED' : q.status)

export default function Quotations() {
  const state = useStore()
  const quotations = state.quotations || []
  const { partner } = useLookup()
  const scope = useScope()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('ALL')
  const [editor, setEditor] = useState(null) // {quotation?} | {}
  const openId = params.get('open')
  const scoped = useMemo(() => quotations.filter((q) => scope.inScope(q.partnerId)).map((q) => ({ ...q, eff: effectiveStatus(q), partnerName: partner(q.partnerId)?.name })), [quotations, scope.mine]) // eslint-disable-line
  const tabs = ['ALL', 'DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED', 'EXPIRED']
  const rows = tab === 'ALL' ? scoped : scoped.filter((q) => q.eff === tab)
  const open = scoped.filter((q) => ['DRAFT', 'SENT', 'ACCEPTED'].includes(q.eff))
  const decided = scoped.filter((q) => ['CONVERTED', 'EXPIRED'].includes(q.eff))
  const conv = decided.length ? (scoped.filter((q) => q.eff === 'CONVERTED').length / decided.length) * 100 : 0

  return (
    <div>
      <PageHeader title="Quotations" subtitle="Quote dealers instantly with live prices, schemes, stock and – for Indian-vendor items – vendor rate & landed cost."
        actions={<><ScopeToggle scope={scope} /><Button icon={Plus} onClick={() => setEditor({})}>New quotation</Button></>} />
      <Grid cols={4} className="mb-5">
        <Stat label="Open quotations" value={open.length} sub={fmtINR(sum(open, (q) => q.total))} icon={FileSignature} />
        <Stat label="Sent, awaiting dealer" value={scoped.filter((q) => q.eff === 'SENT').length} icon={Send} tone="blue" />
        <Stat label="Accepted – ready to convert" value={scoped.filter((q) => q.eff === 'ACCEPTED').length} icon={CheckCircle2} tone="green" />
        <Stat label="Conversion rate" value={fmtPct(conv, 0)} sub="converted vs closed" icon={ArrowRightCircle} tone="violet" />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={tabs.map((t) => ({ key: t, label: t === 'ALL' ? 'All' : t[0] + t.slice(1).toLowerCase(), count: t === 'ALL' ? scoped.length : scoped.filter((q) => q.eff === t).length }))} />
      <DataTable rows={rows} onRowClick={(r) => setParams({ open: r.id })} exportName="quotations" initialSort={{ key: 'date', dir: 'desc' }}
        columns={[
          { key: 'number', header: 'Quotation', render: (r) => <span className="font-mono text-xs font-semibold">{r.number}</span> },
          { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'partnerName', header: 'Dealer', render: (r) => <PartnerCell id={r.partnerId} /> },
          { key: 'validTill', header: 'Valid till', render: (r) => <span className={cx(r.eff === 'EXPIRED' && 'text-red-600')}>{fmtDate(r.validTill)}</span> },
          { key: 'items', header: 'Items', align: 'right', value: (r) => r.lines.filter((l) => !l.free).length },
          { key: 'total', header: 'Total', align: 'right', render: (r) => <b>{fmtINR(r.total)}</b> },
          { key: 'eff', header: 'Status', render: (r) => <StatusBadge status={r.eff} /> },
        ]} />
      {editor && <QuotationEditor quotation={editor.quotation} initial={editor.initial} scope={scope} onClose={() => setEditor(null)} onSaved={(q) => { setEditor(null); setParams({ open: q.id }) }} />}
      {openId && <QuotationDrawer id={openId} onClose={() => setParams({})} onEdit={(q) => setEditor({ quotation: q })} onDuplicate={(q) => setEditor({ initial: { partnerId: q.partnerId, lines: q.lines.filter((l) => !l.free).map((l) => ({ productId: l.productId, qty: l.qty })) } })} />}
    </div>
  )
}

/** Cost insight: vendor rate & landed cost, highlighting Indian vendors so Sales can quote without asking Procurement. */
function CostInsight({ partnerId, lines }) {
  const state = useStore()
  const rows = lines.filter((l) => l.productId && Number(l.qty) > 0).map((l) => {
    const p = state.products.find((x) => x.id === l.productId)
    const v = state.vendors.find((x) => x.id === p.vendorId)
    const net = partnerId ? quotePrice(state, { productId: p.id, partnerId, qty: Number(l.qty) }).unitPrice : 0
    return { p, v, net, margin: net ? round2(((net - p.landedCost) / net) * 100) : 0 }
  })
  if (!rows.length) return null
  const target = state.settings.targetMarginPct || 12
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 text-[11px] uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-1.5"><IndianRupee className="w-3.5 h-3.5" />Cost & margin check</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-slate-400"><tr><th className="text-left px-3 py-1.5">Item</th><th className="text-left px-3">Vendor</th><th className="text-right px-3">Vendor rate</th><th className="text-right px-3">Landed cost</th><th className="text-right px-3">Quoted net</th><th className="text-right px-3">Margin</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ p, v, net, margin }) => (
              <tr key={p.id} className={v?.type === 'INDIA' ? 'bg-sky-50/50' : ''}>
                <td className="px-3 py-1.5"><div className="font-medium text-slate-800">{p.shortName}</div><div className="text-[11px] text-slate-400">{p.sku}</div></td>
                <td className="px-3 text-xs">{v?.type === 'INDIA' ? <Badge tone="blue"><Factory className="w-3 h-3" />India · {v.city}</Badge> : <span className="text-slate-500">Import · {v?.country}</span>}<div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[180px]">{v?.name}</div></td>
                <td className="px-3 text-right tabular-nums">{fmtMoney(p.vendorRate, p.currency)}</td>
                <td className="px-3 text-right tabular-nums">{fmtINR(p.landedCost)}</td>
                <td className="px-3 text-right tabular-nums">{fmtINR(net, true)}</td>
                <td className={cx('px-3 text-right tabular-nums font-semibold', margin < target ? 'text-red-600' : 'text-emerald-700')}>{fmtPct(margin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.some((r) => r.v?.type === 'INDIA') && <div className="px-3 py-2 text-xs text-sky-800 bg-sky-50 border-t border-sky-100">Indian-vendor items ship in ~{rows.find((r) => r.v?.type === 'INDIA').p.leadTimeDays} days on a back-to-back PO once the dealer pays – quote directly using these rates.</div>}
      {rows.some((r) => r.margin < target) && <div className="px-3 py-2 text-xs text-red-700 bg-red-50 border-t border-red-100">Some lines are below the {target}% target margin.</div>}
    </div>
  )
}

function QuotationEditor({ quotation, initial, scope, onClose, onSaved }) {
  const state = useStore()
  const createQuotation = useStore((s) => s.createQuotation)
  const updateQuotation = useStore((s) => s.updateQuotation)
  const sendQuotation = useStore((s) => s.sendQuotation)
  const base = quotation || initial || {}
  const [partnerId, setPartnerId] = useState(base.partnerId || '')
  const [lines, setLines] = useState(base.lines ? base.lines.filter((l) => !l.free).map((l) => ({ productId: l.productId, qty: l.qty })) : [{ productId: '', qty: 1 }])
  const [validTill, setValidTill] = useState(base.validTill || addDays(today(), 15))
  const [note, setNote] = useState(base.note || '')
  const save = (send) => {
    if (!partnerId) return toast.error('Select a dealer')
    const valid = lines.filter((l) => l.productId && Number(l.qty) > 0).map((l) => ({ productId: l.productId, qty: Number(l.qty) }))
    if (!valid.length) return toast.error('Add at least one item')
    const q = quotation ? updateQuotation(quotation.id, { partnerId, lines: valid, validTill, note }) : createQuotation({ partnerId, lines: valid, validTill, note })
    if (send) {
      sendQuotation(q.id)
      toast.success(`Quotation ${q.number} sent`, `Emailed to ${state.partners.find((p) => p.id === partnerId)?.email}`)
    } else toast.success(quotation ? 'Quotation updated' : `Quotation ${q.number} saved as draft`)
    onSaved(q)
  }
  return (
    <Modal open onClose={onClose} size="xl" title={quotation ? `Edit ${quotation.number}` : 'New quotation'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="secondary" onClick={() => save(false)}>Save draft</Button><Button icon={Send} onClick={() => save(true)}>Save & email dealer</Button></>}>
      <div className="space-y-4">
        <FormGrid cols={3}>
          <Field label="Dealer" required className="md:col-span-2"><Combobox options={partnerOptions(state.partners, (p) => p.type !== 'EXPORT' && scope.inScope(p.id))} value={partnerId} onChange={setPartnerId} placeholder="Search dealer…" /></Field>
          <Field label="Valid till"><Input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} /></Field>
        </FormGrid>
        <LineItemsEditor key={partnerId} lines={lines} onChange={setLines} mode="dealer" partnerId={partnerId} />
        <PricedSummary partnerId={partnerId} lines={lines} />
        <CostInsight partnerId={partnerId} lines={lines} />
        <LineStockCheck lines={lines} />
        <Field label="Terms / note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 100% advance, dispatch within 2 days of payment" /></Field>
      </div>
    </Modal>
  )
}

function QuotationDrawer({ id, onClose, onEdit, onDuplicate }) {
  const state = useStore()
  const navigate = useNavigate()
  const q = (state.quotations || []).find((x) => x.id === id)
  const sendQuotation = useStore((s) => s.sendQuotation)
  const setQuotationStatus = useStore((s) => s.setQuotationStatus)
  const convertQuotation = useStore((s) => s.convertQuotation)
  const [print, setPrint] = useState(false)
  if (!q) return null
  const p = state.partners.find((x) => x.id === q.partnerId)
  const eff = effectiveStatus(q)
  const so = q.soId && state.salesOrders.find((s) => s.id === q.soId)
  const schemes = (q.appliedSchemes || []).map((sid) => state.schemes.find((s) => s.id === sid)).filter(Boolean)
  const editable = ['DRAFT', 'SENT'].includes(q.status)
  const convert = async () => {
    if (!(await confirm({ title: `Convert ${q.number} to a sales order?`, message: `Prices are re-applied as of today. The order is confirmed immediately and the confirmation is emailed to ${p.email}.`, confirmText: 'Convert & confirm' }))) return
    const order = convertQuotation(q.id)
    toast.success(`Sales order ${order.number} created`, 'Confirmation emailed to dealer')
    navigate(`/erp/sales/orders/${order.id}`)
  }
  const expire = async () => {
    const r = await prompt({ title: 'Mark quotation expired', label: 'Reason (optional)', confirmText: 'Mark expired' })
    if (r === null) return
    setQuotationStatus(q.id, 'EXPIRED', r)
    toast.success('Quotation marked expired')
  }
  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={<span className="flex items-center gap-2">{q.number}<StatusBadge status={eff} /></span>} subtitle={`${p?.name} · ${fmtDate(q.date)} · valid till ${fmtDate(q.validTill)}`}
      footer={<>
        {editable && <Button variant="secondary" icon={Pencil} onClick={() => onEdit(q)}>Edit</Button>}
        <Button variant="secondary" onClick={() => onDuplicate(q)}>Duplicate</Button>
        <Button variant="secondary" icon={Printer} onClick={() => setPrint(true)}>Print</Button>
        {editable && eff !== 'EXPIRED' && <Button variant="secondary" icon={Clock} onClick={expire}>Mark expired</Button>}
        {q.status === 'SENT' && eff !== 'EXPIRED' && <Button variant="secondary" icon={CheckCircle2} onClick={() => { setQuotationStatus(q.id, 'ACCEPTED'); toast.success('Marked accepted') }}>Accepted</Button>}
        {editable && eff !== 'EXPIRED' && <Button variant={q.status === 'DRAFT' ? 'primary' : 'secondary'} icon={Send} onClick={() => { sendQuotation(q.id); toast.success('Quotation emailed', p.email) }}>{q.status === 'DRAFT' ? 'Send' : 'Resend'}</Button>}
        {['DRAFT', 'SENT', 'ACCEPTED'].includes(q.status) && <Button icon={ArrowRightCircle} onClick={convert}>Convert to order</Button>}
      </>}>
      <div className="space-y-4">
        {eff === 'EXPIRED' && q.status !== 'EXPIRED' && <Alert tone="warn" title="Validity has lapsed">Re-quote with today's prices using Duplicate, or mark it expired.</Alert>}
        {so && <Alert tone="success" title="Converted">Sales order <Link className="underline" to={`/erp/sales/orders/${so.id}`}>{so.number}</Link> · <StatusBadge status={so.status} /></Alert>}
        <DescriptionList cols={3} items={[['Dealer', p?.name], ['Prepared by', <UserName key="u" id={q.createdBy} />], ['Total', fmtINR(q.total)], q.note && ['Note', q.note]]} />
        <OrderLines lines={q.lines} subtotal={q.subtotal} gst={q.gst} total={q.total} />
        {schemes.length > 0 && <div className="flex flex-wrap gap-1.5 items-center text-xs text-slate-500">Schemes: {schemes.map((s) => <Badge key={s.id} tone="violet">{s.code}</Badge>)}</div>}
        <CostInsight partnerId={q.partnerId} lines={q.lines.filter((l) => !l.free)} />
        <div><SectionTitle>Activity</SectionTitle><Timeline items={[...(q.timeline || [])].reverse()} /></div>
      </div>
      <Modal open={print} onClose={() => setPrint(false)} size="lg" title={`Print ${q.number}`}>
        <PrintArea title={q.number}>
          <DocHeader title="Quotation" number={q.number} date={q.date} right={<div className="text-xs text-slate-500">Valid till {fmtDate(q.validTill)}</div>} />
          <div className="text-sm mb-4"><div className="text-[11px] uppercase text-slate-400">To</div><div className="font-semibold">{p?.name}</div><div className="text-slate-600">{p?.contact} · {p?.address}, {p?.city} · GSTIN {p?.gstin || '—'}</div></div>
          <OrderLines lines={q.lines} subtotal={q.subtotal} gst={q.gst} total={q.total} />
          {schemes.length > 0 && <div className="text-xs text-slate-500 mt-3">Schemes included: {schemes.map((s) => `${s.code} – ${s.name}`).join('; ')}</div>}
          <div className="text-xs text-slate-500 mt-6 space-y-1"><div>Terms: 100% advance payment. Prices ex-Starex Bhiwandi; freight as per transporter. GST extra as shown.</div>{q.note && <div>{q.note}</div>}</div>
        </PrintArea>
      </Modal>
    </Drawer>
  )
}
