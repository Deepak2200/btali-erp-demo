import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RotateCcw, CheckCircle2, Gift, Percent, Wrench, XCircle } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Button, Badge, StatusBadge, Modal, Drawer, Field, FormGrid, Select, Textarea, Combobox, NumberInput, Segmented,
  FileUpload, AttachmentList, DescriptionList, Timeline, Alert, SectionTitle, Stepper, toast, prompt,
} from '../../../components/ui'
import { PartnerCell, ProductCell, BarsChart, ScanInput } from '../../../components/business'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtNum, fmtDate, daysAgo, sum } from '../../../lib/format'

const TYPES = { REPAIR: ['Repair', Wrench, 'blue'], REPLACEMENT: ['Replacement (FOC)', Gift, 'amber'], DISCOUNT: ['Discount / credit note', Percent, 'violet'] }
const STEPS = [{ key: 'LOGGED', label: 'Logged' }, { key: 'IN_PROCESS', label: 'In process' }, { key: 'CLOSED', label: 'Closed' }]

function LogReturnModal({ onClose, onDone }) {
  const s = useStore()
  const logReturn = useStore((x) => x.logReturn)
  const { partner } = useLookup()
  const invs = useMemo(() => s.invoices.filter((i) => i.status === 'DISPATCHED' && i.type === 'TAX' && i.date >= daysAgo(240)).sort((a, b) => (a.date < b.date ? 1 : -1)), [s.invoices])
  const [invoiceId, setInvoiceId] = useState('')
  const [qty, setQty] = useState({})
  const [codes, setCodes] = useState([])
  const [type, setType] = useState('REPLACEMENT')
  const [reason, setReason] = useState('')
  const [atts, setAtts] = useState([])
  const inv = invs.find((i) => i.id === invoiceId)
  const invUnits = s.units.filter((u) => u.invoiceId === invoiceId).map((u) => u.code)
  const onScan = (code) => {
    const u = s.units.find((x) => x.code === code)
    if (!u) return toast.error('Barcode not found', code)
    if (inv && !inv.lines.some((l) => l.productId === u.productId)) return toast.error('Product not on this invoice', code)
    if (codes.some((c) => c.code === code)) return
    setCodes([...codes, { code, productId: u.productId }])
    setQty((q) => ({ ...q, [u.productId]: Math.max(q[u.productId] || 0, codes.filter((c) => c.productId === u.productId).length + 1) }))
  }
  const submit = () => {
    const lines = (inv?.lines || []).filter((l) => qty[l.productId] > 0).map((l) => ({ productId: l.productId, qty: Math.min(qty[l.productId], l.qty), barcode: codes.filter((c) => c.productId === l.productId).map((c) => c.code).join(' ') }))
    if (!inv) return toast.error('Select the original invoice')
    if (!lines.length) return toast.error('Enter quantity for at least one item')
    if (!reason.trim()) return toast.error('Describe the defect / reason')
    const r = logReturn({ invoiceId, lines: lines.map((l) => ({ ...l, barcode: l.barcode.split(' ')[0] || '' })), type, reason: reason.trim(), attachments: atts })
    if (codes.length) useStore.getState().updateUnits(codes.map((c) => c.code), { status: 'RETURNED' }, 'Returned', r.number)
    toast.success(`Return ${r.number} logged`, 'Sales team notified to coordinate with the dealer')
    onDone(r.id)
  }
  return (
    <Modal open onClose={onClose} size="lg" title="Log defective / returned goods" subtitle="Tag to the original invoice – Sales is notified automatically"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={RotateCcw} onClick={submit}>Log return</Button></>}>
      <Field label="Original invoice" required>
        <Combobox value={invoiceId} onChange={(v) => { setInvoiceId(v); setQty({}); setCodes([]) }} placeholder="Search invoice or customer…"
          options={invs.map((i) => ({ value: i.id, label: `${i.number} – ${partner(i.partnerId)?.name}`, sub: `${fmtDate(i.date)} · ${i.lines.length} lines · ${fmtINR(i.total)}` }))} />
      </Field>
      {inv && (
        <>
          <SectionTitle className="mt-4">Items returned</SectionTitle>
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
            {inv.lines.map((l) => (
              <div key={l.productId} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0"><ProductCell id={l.productId} sub={`Invoiced ${l.qty} @ ${fmtINR(l.price)}`} /></div>
                <NumberInput min={0} max={l.qty} value={qty[l.productId] ?? ''} onChange={(v) => setQty({ ...qty, [l.productId]: v === '' ? 0 : Math.min(v, l.qty) })} className="w-24 text-right" placeholder="0" />
              </div>
            ))}
          </div>
          <Field label="Unit barcodes (optional)" className="mt-3" hint={codes.length ? codes.map((c) => c.code).join(', ') : 'Scan returned units for full traceability'}>
            <ScanInput autoFocus={false} onScan={onScan} suggestions={invUnits} />
          </Field>
        </>
      )}
      <Field label="Resolution type" className="mt-4">
        <Segmented value={type} onChange={setType} options={Object.entries(TYPES).map(([key, [label]]) => ({ key, label }))} />
      </Field>
      <FormGrid cols={1} className="mt-3">
        <Field label="Defect / reason" required><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Motor not starting, carton crushed in transit…" /></Field>
        <Field label="Photos / documents">
          {atts.length > 0 && <div className="mb-2"><AttachmentList items={atts} onRemove={(a) => setAtts(atts.filter((x) => x.id !== a.id))} /></div>}
          <FileUpload compact onFiles={(a) => setAtts([...atts, ...a])} label="Add photos of the defect" />
        </Field>
      </FormGrid>
    </Modal>
  )
}

function ReturnDrawer({ id, onClose }) {
  const r = useStore((s) => (s.returns || []).find((x) => x.id === id))
  const notes = useStore((s) => s.notes || [])
  const processReturn = useStore((s) => s.processReturn)
  const closeReturn = useStore((s) => s.closeReturn)
  const nav = useNavigate()
  const { partner } = useLookup()
  const [block, setBlock] = useState(null)
  if (!r) return null
  const [label, Icon, tone] = TYPES[r.type]
  const cn = notes.find((n) => n.number === r.creditNoteNo)
  const process = async () => {
    const remark = await prompt({ title: r.type === 'REPLACEMENT' ? 'Issue FOC replacement' : r.type === 'DISCOUNT' ? 'Raise credit note' : 'Send for repair', label: 'Remarks (optional)', confirmText: 'Proceed' })
    if (remark === null) return
    const res = processReturn(r.id, remark)
    if (!res.ok) { if (res.shortages) setBlock(res); else toast.error(res.error); return }
    toast.success(r.type === 'REPLACEMENT' ? `FOC invoice ${res.invoice.number} issued` : r.type === 'DISCOUNT' ? `Credit note ${res.number} raised` : 'Sent for repair', 'Sales & dealer notified')
  }
  const close = async () => {
    const remark = await prompt({ title: `Close ${r.number}`, label: 'Closing remark', required: true, placeholder: 'e.g. Dealer confirmed receipt of replacement' })
    if (!remark) return
    closeReturn(r.id, remark)
    toast.success('Return closed')
  }
  return (
    <Drawer open onClose={onClose} title={r.number} subtitle={<span className="flex items-center gap-2">{partner(r.partnerId)?.name} · <StatusBadge status={r.status} /></span>}
      footer={<>
        {r.status === 'LOGGED' && <Button icon={Icon} onClick={process}>{r.type === 'REPLACEMENT' ? 'Issue FOC replacement' : r.type === 'DISCOUNT' ? 'Raise credit note' : 'Send for repair'}</Button>}
        {r.status === 'IN_PROCESS' && <Button variant="success" icon={CheckCircle2} onClick={close}>Close return</Button>}
      </>}>
      <Stepper steps={STEPS} current={r.status} className="mb-5" />
      <DescriptionList cols={3} items={[
        ['Type', <Badge tone={tone}>{label}</Badge>], ['Original invoice', <button className="text-brand-600 hover:underline font-mono text-xs" onClick={() => nav(`/erp/dispatch/invoices?id=${r.invoiceId}`)}>{r.invoiceNo}</button>], ['Logged', fmtDate(r.date)],
        ['Value', fmtINR(r.value)], ['FOC invoice', r.focInvoiceNo || '—'], ['Credit note', r.creditNoteNo ? `${r.creditNoteNo}${cn ? ` · ${fmtINR(cn.total ?? cn.amount)}` : ''}` : '—'],
      ]} />
      <div className="mt-4 text-sm text-slate-700 bg-slate-50 rounded-lg p-3"><span className="font-medium">Reason:</span> {r.reason}</div>
      <SectionTitle className="mt-5">Items</SectionTitle>
      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
        {r.lines.map((l, i) => <div key={i} className="flex items-center justify-between px-3 py-2"><ProductCell id={l.productId} sub={l.barcode || undefined} /><span className="tabular-nums font-medium">× {fmtNum(l.qty)}</span></div>)}
      </div>
      {r.attachments?.length > 0 && <><SectionTitle className="mt-5">Attachments</SectionTitle><AttachmentList items={r.attachments} /></>}
      <SectionTitle className="mt-5">Activity</SectionTitle>
      <Timeline items={[...r.timeline].reverse()} />
      {block && (
        <Modal open size="sm" onClose={() => setBlock(null)} title="Insufficient stock for replacement" footer={<Button variant="danger" onClick={() => setBlock(null)}>Close</Button>}>
          <div className="flex gap-3"><XCircle className="w-7 h-7 text-red-600 shrink-0" />
            <ul className="space-y-1 text-sm flex-1">{block.shortages.map((x) => <li key={x.productId} className="border border-red-200 bg-red-50 rounded-lg p-2"><ProductCell id={x.productId} /><div className="text-xs text-red-700 mt-1">Need {x.need} · Available {x.have}</div></li>)}</ul>
          </div>
        </Modal>
      )}
    </Drawer>
  )
}

export default function Returns() {
  const returns = useStore((s) => s.returns || [])
  const { partner } = useLookup()
  const [logOpen, setLogOpen] = useState(false)
  const [openId, setOpenId] = useState(null)
  const recurrence = useMemo(() => {
    const m = {}
    for (const r of returns) m[r.partnerId] = (m[r.partnerId] || 0) + 1
    return Object.entries(m).map(([id, count]) => ({ label: partner(id)?.name || id, count })).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [returns]) // eslint-disable-line
  const repeatDealers = recurrence.filter((r) => r.count > 1).length
  return (
    <div className="space-y-5">
      <PageHeader title="FOC & Returns" subtitle="Defects, returns, free replacements and discount adjustments – traceable to the original invoice"
        actions={<Button icon={Plus} onClick={() => setLogOpen(true)}>Log return</Button>} />
      <Grid cols={4}>
        <Stat label="Logged vs resolved" value={`${returns.length} / ${returns.filter((r) => r.status === 'CLOSED').length}`} icon={RotateCcw} />
        <Stat label="Open" value={returns.filter((r) => r.status !== 'CLOSED').length} tone="amber" icon={Wrench} />
        <Stat label="FOC replacements issued" value={fmtINR(sum(returns.filter((r) => r.type === 'REPLACEMENT' && r.focInvoiceNo), (r) => r.value))} sub={`${returns.filter((r) => r.focInvoiceNo).length} FOC invoices`} tone="violet" icon={Gift} />
        <Stat label="Dealer issue recurrence" value={`${recurrence.length ? Math.round((repeatDealers / recurrence.length) * 100) : 0}%`} sub="dealers with repeat issues" tone="red" icon={Percent} />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <DataTable rows={returns} onRowClick={(r) => setOpenId(r.id)} exportName="returns-foc" initialSort={{ key: 'date', dir: 'desc' }}
            filters={[{ key: 'type', label: 'types', options: Object.entries(TYPES).map(([value, [label]]) => ({ value, label })) }, { key: 'status', label: 'statuses', options: [{ value: 'LOGGED', label: 'Logged' }, { value: 'IN_PROCESS', label: 'In process' }, { value: 'CLOSED', label: 'Closed' }] }]}
            columns={[
              { key: 'number', header: 'Return', render: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.number}</span> },
              { key: 'date', header: 'Date', render: (r) => <span className="whitespace-nowrap">{fmtDate(r.date)}</span> },
              { key: 'partner', header: 'Dealer', value: (r) => partner(r.partnerId)?.name, render: (r) => <PartnerCell id={r.partnerId} sub={r.invoiceNo} /> },
              { key: 'type', header: 'Type', render: (r) => <Badge tone={TYPES[r.type][2]}>{TYPES[r.type][0]}</Badge> },
              { key: 'qty', header: 'Qty', align: 'right', value: (r) => sum(r.lines, (l) => l.qty) },
              { key: 'value', header: 'Value', align: 'right', render: (r) => fmtINR(r.value) },
              { key: 'doc', header: 'FOC / CN', value: (r) => r.focInvoiceNo || r.creditNoteNo || '', render: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.focInvoiceNo || r.creditNoteNo || '—'}</span> },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} label={r.status === 'IN_PROCESS' ? 'In process' : undefined} /> },
            ]} />
        </div>
        <Card title="Recurrence by dealer" subtitle="Returns logged per dealer">
          {recurrence.length ? <BarsChart data={recurrence} layout="vertical" money={false} height={260} series={[{ key: 'count', label: 'Returns' }]} /> : <div className="text-sm text-slate-400">No returns yet.</div>}
          {repeatDealers > 0 && <Alert tone="warn" className="mt-3">{repeatDealers} dealer(s) with repeat issues – review product batch or handling.</Alert>}
        </Card>
      </div>
      {logOpen && <LogReturnModal onClose={() => setLogOpen(false)} onDone={(id) => { setLogOpen(false); setOpenId(id) }} />}
      {openId && <ReturnDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
