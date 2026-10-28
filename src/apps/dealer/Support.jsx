import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Headphones, Send, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Button, StatusBadge, Drawer, Modal, Field, Input, Select, Textarea, Combobox, FormGrid, FileUpload, AttachmentList, Stepper, Grid, Stat, Avatar, SectionTitle, Alert, EmptyState, toast, confirm } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { fmtDate, fmtDateTime, timeAgo, titleCase } from '../../lib/format'
import { usePortal } from './_portal'

const CATS = [
  { value: 'PRODUCT_DEFECT', label: 'Product defect / complaint' },
  { value: 'INSTALLATION', label: 'Installation / service visit' },
  { value: 'SPARE_REQUIREMENT', label: 'Spare part requirement' },
  { value: 'DAMAGE_IN_TRANSIT', label: 'Damaged in transit' },
  { value: 'SHORTAGE', label: 'Short supply' },
  { value: 'GENERAL', label: 'General / accounts query' },
]
const STAGES = [{ key: 'LOGGED', label: 'Logged' }, { key: 'UNDER_REVIEW', label: 'Under review' }, { key: 'IN_PROGRESS', label: 'In progress' }, { key: 'RESOLVED', label: 'Resolved' }, { key: 'CLOSED', label: 'Closed' }]
const catLabel = (c) => CATS.find((x) => x.value === c)?.label || titleCase(c || '')

export default function Support() {
  const [sp, setSp] = useSearchParams()
  const { partnerId, partner, isFranchise } = usePortal()
  const allTickets = useStore((s) => s.tickets)
  const products = useStore((s) => s.products)
  const tickets = useMemo(() => allTickets.filter((t) => t.partnerId === partnerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [allTickets, partnerId])
  const [newOpen, setNewOpen] = useState(false)
  const openId = sp.get('t')
  const setOpen = (id) => { const n = new URLSearchParams(sp); if (id) n.set('t', id); else n.delete('t'); setSp(n, { replace: true }) }
  const sel = tickets.find((t) => t.id === openId)
  const open = tickets.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.stage))
  const overdue = open.filter((t) => (Date.now() - new Date(t.createdAt).getTime()) / 3600000 > (t.slaHours || 72))

  return (
    <div>
      <PageHeader title={isFranchise ? 'Service requests' : 'Complaints & service'} subtitle="Raise product complaints, service visits and spare requirements – track every update here"
        actions={<Button icon={Plus} onClick={() => setNewOpen(true)}>Raise a request</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat icon={Headphones} tone="amber" label="Open" value={open.length} />
        <Stat icon={AlertTriangle} tone={overdue.length ? 'red' : 'green'} label="Past SLA" value={overdue.length} />
        <Stat icon={CheckCircle2} tone="green" label="Resolved" value={tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.stage)).length} />
        <Stat icon={Clock} tone="ink" label="Total raised" value={tickets.length} />
      </Grid>
      <DataTable rows={tickets} onRowClick={(t) => setOpen(t.id)} exportName={`Tickets-${partner?.code}`} initialSort={{ key: 'createdAt', dir: 'desc' }}
        filters={[{ key: 'stage', label: 'stages', options: STAGES.map((s) => ({ value: s.key, label: s.label })) }, { key: 'category', label: 'types', options: CATS }]}
        empty={<EmptyState icon={Headphones} title="No requests yet" message="Raise a complaint or service request and track it here." action={<Button onClick={() => setNewOpen(true)}>Raise a request</Button>} />}
        columns={[
          { key: 'number', header: 'Ticket', render: (t) => <span className="font-mono font-medium">{t.number}</span> },
          { key: 'subject', header: 'Subject', render: (t) => <div className="max-w-[320px]"><div className="truncate text-slate-800">{t.subject}</div><div className="text-[11px] text-slate-500">{catLabel(t.category)}{t.productId ? ` · ${products.find((p) => p.id === t.productId)?.shortName}` : ''}</div></div> },
          { key: 'createdAt', header: 'Raised', render: (t) => fmtDate(t.createdAt) },
          { key: 'priority', header: 'Priority', render: (t) => <StatusBadge status={t.priority} /> },
          { key: 'updated', header: 'Last update', value: (t) => t.updates?.at(-1)?.ts || t.createdAt, render: (t) => <span className="text-xs text-slate-500">{timeAgo(t.updates?.at(-1)?.ts || t.createdAt)}</span> },
          { key: 'stage', header: 'Status', render: (t) => <StatusBadge status={t.stage} /> },
        ]} />
      <NewTicket open={newOpen} onClose={() => setNewOpen(false)} onCreated={(t) => setOpen(t.id)} />
      {sel && <TicketDrawer t={sel} onClose={() => setOpen(null)} />}
    </div>
  )
}

function NewTicket({ open, onClose, onCreated }) {
  const { partnerId, isFranchise } = usePortal()
  const products = useStore((s) => s.products)
  const invoices = useStore((s) => s.invoices)
  const salesOrders = useStore((s) => s.salesOrders)
  const createTicket = useStore((s) => s.createTicket)
  const blank = { category: 'PRODUCT_DEFECT', productId: '', barcode: '', orderRef: '', priority: 'MEDIUM', subject: '', description: '', custName: '', custPhone: '', custCity: '' }
  const [f, setF] = useState(blank)
  const [files, setFiles] = useState([])
  React.useEffect(() => { if (open) { setF(blank); setFiles([]) } }, [open]) // eslint-disable-line
  const myInv = invoices.filter((i) => i.partnerId === partnerId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
  const mySO = salesOrders.filter((o) => o.partnerId === partnerId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
  const refOptions = [...mySO.map((o) => ({ value: o.number, label: `Order ${o.number} · ${fmtDate(o.date)}` })), ...myInv.map((i) => ({ value: i.number, label: `Invoice ${i.number} · ${fmtDate(i.date)}` }))]
  const valid = f.subject.trim() && f.description.trim()
  const submit = () => {
    const t = createTicket({
      source: isFranchise ? 'FRANCHISE' : 'DEALER', category: f.category, subject: f.subject.trim(), description: f.description.trim(), partnerId, productId: f.productId || null,
      barcode: f.barcode.trim().toUpperCase() || null, orderRef: f.orderRef || null, priority: f.priority, attachments: files,
      customer: f.custName ? { name: f.custName, phone: f.custPhone, city: f.custCity } : null,
    })
    toast.success(`Ticket ${t.number} raised`, 'Btali Service has been notified')
    onClose(); onCreated?.(t)
  }
  return (
    <Modal open={open} onClose={onClose} title="Raise a request" subtitle="Link the product, barcode or invoice so our team can act faster"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Send} disabled={!valid} onClick={submit}>Submit</Button></>}>
      <FormGrid>
        <Field label="Request type" required><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={CATS} /></Field>
        <Field label="Priority"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} options={[{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High – customer waiting' }]} /></Field>
        <Field label="Product"><Combobox options={products.map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: p.category }))} value={f.productId} onChange={(v) => setF({ ...f, productId: v })} placeholder="Select product…" /></Field>
        <Field label="Product barcode" hint="From the unit sticker, if available"><Input value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })} className="font-mono uppercase" placeholder="e.g. PUMP001013" /></Field>
        <Field label="Related order / invoice"><Select value={f.orderRef} onChange={(e) => setF({ ...f, orderRef: e.target.value })} placeholder="—" options={refOptions} /></Field>
        <Field label="Subject" required><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder={f.category === 'SPARE_REQUIREMENT' ? 'e.g. Need 20 mechanical seals' : 'e.g. Motor humming, not starting'} /></Field>
        <Field label="Details" required className="md:col-span-2"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What happened, when, and what the customer needs" /></Field>
        {['PRODUCT_DEFECT', 'INSTALLATION'].includes(f.category) && <>
          <Field label="End customer name"><Input value={f.custName} onChange={(e) => setF({ ...f, custName: e.target.value })} /></Field>
          <Field label="Customer phone"><Input value={f.custPhone} onChange={(e) => setF({ ...f, custPhone: e.target.value })} inputMode="tel" /></Field>
        </>}
      </FormGrid>
      <div className="mt-4">
        <SectionTitle>Photos / videos / documents</SectionTitle>
        <FileUpload compact onFiles={(a) => setFiles((s) => [...s, ...a])} label="Upload images, videos or PDFs" />
        {files.length > 0 && <div className="mt-2"><AttachmentList items={files} onRemove={(a) => setFiles((s) => s.filter((x) => x.id !== a.id))} /></div>}
      </div>
    </Modal>
  )
}

function TicketDrawer({ t, onClose }) {
  const user = useStore((s) => s.users.find((u) => u.id === s.session.userId))
  const users = useStore((s) => s.users)
  const product = useStore((s) => s.products.find((p) => p.id === t.productId))
  const updateTicket = useStore((s) => s.updateTicket)
  const notify = useStore((s) => s.notify)
  const [note, setNote] = useState('')
  const [files, setFiles] = useState([])
  const send = () => {
    updateTicket(t.id, { note: note.trim() || `Added ${files.length} attachment(s)`, attachments: [...(t.attachments || []), ...files] })
    notify({ title: `Update on ${t.number}`, body: `${user?.name}: ${note.trim().slice(0, 80) || 'new attachment'}`, link: '/erp/service/tickets', roles: ['SERVICE'], userIds: t.assigneeId ? [t.assigneeId] : [] })
    setNote(''); setFiles([])
    toast.success('Update sent', 'Btali Service has been notified')
  }
  const close = async () => {
    if (!(await confirm({ title: 'Close this ticket?', message: 'Confirm the issue is resolved to your satisfaction.', confirmText: 'Close ticket' }))) return
    updateTicket(t.id, { stage: 'CLOSED', note: 'Resolution confirmed by partner – closed' })
    toast.success('Ticket closed', t.number)
  }
  const reopen = () => { updateTicket(t.id, { stage: 'UNDER_REVIEW', note: 'Reopened by partner – issue persists' }); notify({ title: `${t.number} reopened`, body: t.subject, link: '/erp/service/tickets', roles: ['SERVICE'] }); toast.success('Ticket reopened', t.number) }
  const who = (id) => users.find((u) => u.id === id)
  return (
    <Drawer open onClose={onClose} title={`${t.number} · ${t.subject}`} subtitle={`${catLabel(t.category)} · raised ${fmtDateTime(t.createdAt)}`}
      footer={<>{t.stage === 'RESOLVED' && <Button variant="success" icon={CheckCircle2} onClick={close}>Confirm & close</Button>}{['RESOLVED', 'CLOSED'].includes(t.stage) && <Button variant="secondary" onClick={reopen}>Reopen</Button>}</>}>
      <div className="space-y-5">
        <Stepper steps={STAGES} current={t.stage} />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-[11px] uppercase text-slate-400 font-semibold">Product</div>{product ? `${product.shortName} (${product.sku})` : '—'}</div>
          <div><div className="text-[11px] uppercase text-slate-400 font-semibold">Barcode</div><span className="font-mono">{t.barcode || '—'}</span></div>
          <div><div className="text-[11px] uppercase text-slate-400 font-semibold">Reference</div><span className="font-mono">{t.orderRef || '—'}</span></div>
          <div><div className="text-[11px] uppercase text-slate-400 font-semibold">Assigned to</div>{who(t.assigneeId)?.name || 'Btali Service desk'}</div>
          <div><div className="text-[11px] uppercase text-slate-400 font-semibold">Priority</div><StatusBadge status={t.priority} /></div>
          <div><div className="text-[11px] uppercase text-slate-400 font-semibold">SLA</div>{t.slaHours || 72} hours</div>
        </div>
        {['RESOLVED', 'CLOSED'].includes(t.stage) && (() => {
          const ups = [...(t.updates || [])].reverse()
          const res = ups.find((u) => ['RESOLVED', 'CLOSED'].includes(u.stage)) || ups.find((u) => u.by && u.by !== t.createdBy)
          return <Alert tone="success" title={`Resolution by Btali${t.resolvedAt ? ` · ${fmtDate(t.resolvedAt)}` : ''}`}>{t.resolution || res?.text || 'Issue resolved by the Btali Service team.'}</Alert>
        })()}
        {t.escalatedToVendor && <Alert tone="info" title="Escalated to manufacturer">Btali has escalated this issue to the factory for a resolution.</Alert>}
        {t.description && t.description !== t.subject && <div className="text-sm text-slate-700 whitespace-pre-line bg-slate-50 rounded-lg p-3">{t.description}</div>}
        {(t.attachments || []).length > 0 && <div><SectionTitle>Attachments</SectionTitle><AttachmentList items={t.attachments} /></div>}
        <div>
          <SectionTitle>Conversation</SectionTitle>
          <div className="space-y-3">
            {[{ ts: t.createdAt, by: t.createdBy, text: 'Request raised' }, ...(t.updates || [])].map((u, i) => {
              const w = who(u.by)
              const mine = w?.partnerId && w.partnerId === user?.partnerId
              return (
                <div key={i} className={`flex gap-2 ${mine ? 'flex-row-reverse text-right' : ''}`}>
                  <Avatar name={w?.name || 'Btali'} size="sm" />
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${mine ? 'bg-brand-50 text-brand-900' : 'bg-slate-100 text-slate-800'}`}>
                    <div className="whitespace-pre-line">{u.text}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{w?.name || 'Btali Service'} · {fmtDateTime(u.ts)}{u.stage ? ` · ${titleCase(u.stage)}` : ''}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        {t.stage !== 'CLOSED' && (
          <div className="border border-slate-200 rounded-xl p-3 space-y-2">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a comment for Btali Service…" />
            {files.length > 0 && <AttachmentList items={files} dense onRemove={(a) => setFiles((s) => s.filter((x) => x.id !== a.id))} />}
            <div className="flex justify-between items-center gap-2">
              <div className="w-48"><FileUpload compact onFiles={(a) => setFiles((s) => [...s, ...a])} label="Attach" /></div>
              <Button icon={Send} disabled={!note.trim() && !files.length} onClick={send}>Send</Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}
