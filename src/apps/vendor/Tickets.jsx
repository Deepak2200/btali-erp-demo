import React, { useMemo, useState } from 'react'
import { Plus, Factory, MessageSquareReply, Ticket, ShieldAlert } from 'lucide-react'
import { useStore } from '../../store'
import {
  PageHeader, Tabs, Card, Badge, StatusBadge, Button, Modal, Field, FormGrid, Input, Select, Textarea, FileUpload, AttachmentList, EmptyState, Drawer,
  DescriptionList, SectionTitle, Timeline, toast, Grid, Stat,
} from '../../components/ui'
import DataTable from '../../components/DataTable'
import { ProductCell } from '../../components/business'
import { fmtDate, fmtDateTime, timeAgo } from '../../lib/format'
import { RESPONSE_TYPES, CATEGORY_LABEL, escalatedAtOf } from '../../store/slices/service'
import { useVendorScope } from './_parts'

export default function VendorTickets() {
  const { vendorId, pos } = useVendorScope()
  const tickets = useStore((s) => s.tickets)
  const claims = useStore((s) => s.warrantyClaims)
  const [tab, setTab] = useState('esc')
  const [raise, setRaise] = useState(false)
  const [open, setOpen] = useState(null)

  const esc = useMemo(() => [
    ...tickets.filter((t) => t.vendorId === vendorId && t.escalatedToVendor).map((t) => ({ id: `t-${t.id}`, kind: 'TICKET', rec: t, ref: t.number, subject: t.subject, productId: t.productId, barcode: t.barcode, at: escalatedAtOf(t), awaiting: !t.vendorResponse && !['RESOLVED', 'CLOSED'].includes(t.stage), status: t.vendorResponse ? 'RESPONDED' : ['RESOLVED', 'CLOSED'].includes(t.stage) ? 'CLOSED' : 'AWAITING_VENDOR' })),
    ...claims.filter((c) => c.vendorClaim?.vendorId === vendorId).map((c) => ({ id: `c-${c.id}`, kind: 'CLAIM', rec: c, ref: c.number, subject: c.issue, productId: c.productId, barcode: c.barcode, at: c.vendorClaim.sentAt, awaiting: c.vendorClaim.status === 'AWAITING_VENDOR', status: c.vendorClaim.status })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)), [tickets, claims, vendorId])
  const mine = tickets.filter((t) => t.source === 'VENDOR' && t.vendorId === vendorId)

  return (
    <div>
      <PageHeader title="Tickets & Warranty" subtitle="Respond to Btali service escalations and warranty claims, and raise your own issues"
        actions={<Button icon={Plus} onClick={() => setRaise(true)}>Raise issue</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Awaiting your response" value={esc.filter((e) => e.awaiting).length} icon={ShieldAlert} tone="red" onClick={() => setTab('esc')} />
        <Stat label="Escalations (all)" value={esc.length} icon={Factory} tone="violet" />
        <Stat label="My open issues" value={mine.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.stage)).length} icon={Ticket} tone="amber" onClick={() => setTab('mine')} />
        <Stat label="My resolved issues" value={mine.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.stage)).length} icon={Ticket} tone="green" />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'esc', label: 'Btali escalations', count: esc.filter((e) => e.awaiting).length }, { key: 'mine', label: 'My issues', count: mine.length }]} />
      {tab === 'esc' ? (
        <DataTable rows={esc} onRowClick={(r) => setOpen(r)} exportName="btali-escalations" empty={<EmptyState icon={Factory} title="No escalations" message="Btali has not escalated any defect to you." />} columns={[
          { key: 'ref', header: 'Reference', render: (r) => <div><div className="font-mono text-xs font-semibold">{r.ref}</div><Badge tone={r.kind === 'CLAIM' ? 'brand' : 'ink'}>{r.kind === 'CLAIM' ? 'Warranty claim' : 'Service defect'}</Badge></div> },
          { key: 'subject', header: 'Issue', render: (r) => <div className="max-w-xs truncate">{r.subject}</div> },
          { key: 'product', header: 'Product', value: (r) => r.productId, render: (r) => (r.productId ? <ProductCell id={r.productId} sub={r.barcode || undefined} /> : '—') },
          { key: 'at', header: 'Escalated', render: (r) => <div>{fmtDate(r.at)}<div className="text-[11px] text-slate-400">{timeAgo(r.at)}</div></div> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} label={r.status === 'AWAITING_VENDOR' ? 'Awaiting your response' : undefined} /> },
          { key: 'act', header: '', sortable: false, export: false, render: (r) => r.awaiting && <Button size="sm" icon={MessageSquareReply} onClick={(e) => { e.stopPropagation(); setOpen({ ...r, respond: true }) }}>Respond</Button> },
        ]} />
      ) : (
        <DataTable rows={mine} onRowClick={(t) => setOpen({ kind: 'OWN', rec: t, ref: t.number })} exportName="my-issues" empty={<EmptyState icon={Ticket} title="No issues raised" action={<Button icon={Plus} onClick={() => setRaise(true)}>Raise issue</Button>} />} columns={[
          { key: 'number', header: 'Ticket', render: (t) => <span className="font-mono text-xs font-semibold">{t.number}</span> },
          { key: 'subject', header: 'Subject' }, { key: 'orderRef', header: 'PO' },
          { key: 'priority', header: 'Priority', render: (t) => <StatusBadge status={t.priority} /> },
          { key: 'createdAt', header: 'Raised', render: (t) => fmtDate(t.createdAt) },
          { key: 'stage', header: 'Status', render: (t) => <StatusBadge status={t.stage} /> },
        ]} />
      )}
      {open && <Detail item={open} onClose={() => setOpen(null)} />}
      <RaiseModal open={raise} onClose={() => setRaise(false)} vendorId={vendorId} pos={pos} />
    </div>
  )
}

function Detail({ item, onClose }) {
  const respond = useStore((s) => s.vndRespondToEscalation)
  const live = useStore((s) => (item.kind === 'CLAIM' ? s.warrantyClaims.find((c) => c.id === item.rec.id) : s.tickets.find((t) => t.id === item.rec.id)))
  const users = useStore((s) => s.users)
  const [f, setF] = useState({ type: 'REPLACEMENT', text: '' })
  const [docs, setDocs] = useState([])
  const rec = live || item.rec
  const isClaim = item.kind === 'CLAIM'
  const responded = isClaim ? !!rec.vendorClaim?.response : !!rec.vendorResponse
  const canRespond = item.kind !== 'OWN' && !responded && (isClaim ? rec.status === 'VENDOR_ESCALATED' : !['RESOLVED', 'CLOSED'].includes(rec.stage))
  const submit = () => {
    if (f.text.trim().length < 5) return toast.error('Describe your resolution')
    respond(isClaim ? 'CLAIM' : 'TICKET', rec.id, { type: f.type, text: f.text.trim(), docs })
    toast.success('Response sent to Btali Service')
    onClose()
  }
  const thread = isClaim ? (rec.timeline || []) : (rec.updates || []).map((u) => ({ ts: u.ts, text: u.text, by: users.find((x) => x.id === u.by)?.name }))
  return (
    <Drawer open onClose={onClose} title={`${item.ref} · ${isClaim ? rec.issue : rec.subject}`} subtitle={isClaim ? 'Warranty claim escalated by Btali' : item.kind === 'OWN' ? 'Issue raised by you' : 'Service defect escalated by Btali'}
      footer={canRespond && <Button icon={MessageSquareReply} onClick={submit}>Send response</Button>}>
      <DescriptionList items={[
        ['Product', rec.productId ? <ProductCell key="p" id={rec.productId} /> : '—'],
        ['Barcode', rec.barcode],
        ['Category', isClaim ? `Warranty ${rec.requestType?.toLowerCase()}` : CATEGORY_LABEL[rec.category]],
        ['Raised', fmtDateTime(rec.createdAt)],
        !isClaim && ['Description', rec.description],
        isClaim && ['Btali note', rec.vendorClaim?.note],
      ]} />
      {(rec.attachments || []).length > 0 && <div className="mt-4"><SectionTitle>Documents from Btali</SectionTitle><AttachmentList items={rec.attachments} /></div>}
      {responded && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
          <div className="font-semibold text-emerald-900">Your response</div>
          {isClaim ? <p className="mt-1">{rec.vendorClaim.response}</p> : <><Badge tone="green" className="mt-1">{RESPONSE_TYPES[rec.vendorResponse.type]}</Badge><p className="mt-1">{rec.vendorResponse.text}</p></>}
          {isClaim && rec.vendorClaim.status && <div className="mt-1"><StatusBadge status={rec.vendorClaim.status} /></div>}
        </div>
      )}
      {canRespond && (
        <div className="mt-5 rounded-xl border border-slate-200 p-3 space-y-3">
          <SectionTitle>Your resolution</SectionTitle>
          <Field label="Resolution type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={Object.entries(RESPONSE_TYPES).filter(([k]) => k !== 'REJECTED').map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="Details" required><Textarea rows={4} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder={f.type === 'CREDIT_NOTE' ? 'Credit note number, amount and the PO it will be adjusted against' : f.type === 'REPLACEMENT' ? 'Replacement qty and the shipment it will go with' : 'Repair steps / spare kit details'} /></Field>
          <FileUpload compact label="Upload credit note, test report or repair guide" onFiles={(a) => setDocs((x) => [...x, ...a])} />
          {docs.length > 0 && <AttachmentList dense items={docs} onRemove={(a) => setDocs((x) => x.filter((y) => y.id !== a.id))} />}
        </div>
      )}
      <div className="mt-5"><SectionTitle>History</SectionTitle><Timeline items={[...thread].reverse()} /></div>
    </Drawer>
  )
}

function RaiseModal({ open, onClose, vendorId, pos }) {
  const products = useStore((s) => s.products)
  const raise = useStore((s) => s.vndRaiseTicket)
  const [f, setF] = useState({ subject: '', orderRef: '', productId: '', priority: 'MEDIUM', description: '' })
  const [files, setFiles] = useState([])
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const submit = () => {
    if (!f.subject.trim() || !f.description.trim()) return toast.error('Subject and description are required')
    const t = raise({ vendorId, ...f, productId: f.productId || null, attachments: files })
    toast.success(`${t.number} raised`, 'Btali Purchase and Service have been notified.')
    setF({ subject: '', orderRef: '', productId: '', priority: 'MEDIUM', description: '' }); setFiles([])
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Raise an issue with Btali"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Submit</Button></>}>
      <FormGrid cols={2}>
        <Field label="Subject" required className="md:col-span-2"><Input value={f.subject} onChange={set('subject')} placeholder="e.g. Clarification needed on MRP sticker size" /></Field>
        <Field label="Purchase order"><Select value={f.orderRef} onChange={set('orderRef')} placeholder="Not order specific" options={pos.map((p) => p.number)} /></Field>
        <Field label="Product"><Select value={f.productId} onChange={set('productId')} placeholder="—" options={products.filter((p) => p.vendorIds?.includes(vendorId)).map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName || p.name}` }))} /></Field>
        <Field label="Priority"><Select value={f.priority} onChange={set('priority')} options={[{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' }]} /></Field>
        <Field label="Description" required className="md:col-span-2"><Textarea rows={4} value={f.description} onChange={set('description')} /></Field>
        <div className="md:col-span-2"><FileUpload compact onFiles={(a) => setFiles((x) => [...x, ...a])} />{files.length > 0 && <div className="mt-2"><AttachmentList dense items={files} /></div>}</div>
      </FormGrid>
    </Modal>
  )
}
