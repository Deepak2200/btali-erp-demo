import React, { useMemo, useState } from 'react'
import { Plus, AlertTriangle, CheckCircle2, Clock, MessageSquare } from 'lucide-react'
import { useStore, useLookup, useUser } from '../../store'
import { PageHeader, Grid, Stat, Button, Badge, StatusBadge, Modal, Drawer, FormGrid, Field, Input, Select, Textarea, FileUpload, AttachmentList, MediaGrid, DescriptionList, SectionTitle, Timeline, Combobox, Segmented, toast } from '../../components/ui'
import { ProductCell } from '../../components/business'
import DataTable from '../../components/DataTable'
import { fmtDate, fmtDateTime, timeAgo } from '../../lib/format'

const CAT = { DAMAGE_IN_TRANSIT: 'Damage', SHORTAGE: 'Shortage', MISLABEL: 'Mislabelling', GENERAL: 'Other' }
const ROUTE = { DAMAGE_IN_TRANSIT: 'Dispatch', SHORTAGE: 'Purchase', MISLABEL: 'Purchase', GENERAL: 'Dispatch' }

function NewComplaint({ onClose }) {
  const createTicket = useStore((s) => s.createTicket)
  const products = useStore((s) => s.products)
  const shipments = useStore((s) => s.shipments)
  const invoices = useStore((s) => s.invoices)
  const [f, setF] = useState({ category: 'DAMAGE_IN_TRANSIT', subject: '', description: '', productId: '', orderRef: '', barcode: '', priority: 'MEDIUM', attachments: [] })
  const refs = [...shipments.map((s) => ({ value: s.number, label: `${s.number} · ${s.containerNo}`, sub: 'Container' })), ...invoices.filter((i) => i.status === 'ISSUED' || (i.lr?.date && i.lr.date >= fmtDate(0) )).slice(0, 60).map((i) => ({ value: i.number, label: i.number, sub: 'Invoice' }))]
  const save = () => {
    if (!f.subject.trim()) return toast.error('Enter a short subject')
    if (!f.description.trim()) return toast.error('Describe the issue')
    const t = createTicket({ source: 'BTALI', ...f, productId: f.productId || null, barcode: f.barcode || null })
    toast.success(`${t.number} logged`, `Routed to ${ROUTE[f.category]} team`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Log complaint" subtitle="Damages, shortages or mislabelling observed at the warehouse"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Submit complaint</Button></>}>
      <Field label="Issue type"><Segmented value={f.category} onChange={(v) => setF({ ...f, category: v })} options={Object.entries(CAT).map(([key, label]) => ({ key, label }))} /></Field>
      <FormGrid cols={2} className="mt-4">
        <Field label="Subject" required className="md:col-span-2"><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="e.g. 4 cartons of BT-PW22 crushed at inward" /></Field>
        <Field label="Product"><Combobox value={f.productId} onChange={(v) => setF({ ...f, productId: v })} placeholder="Select product (optional)" options={products.map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: p.category }))} /></Field>
        <Field label="Container / invoice ref."><Combobox value={f.orderRef} onChange={(v) => setF({ ...f, orderRef: v })} placeholder="Select reference (optional)" options={refs} /></Field>
        <Field label="Barcode (optional)"><Input value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value.toUpperCase() })} className="font-mono" /></Field>
        <Field label="Priority"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} options={[{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' }]} /></Field>
      </FormGrid>
      <Field label="Description" required className="mt-4"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What was observed, quantity affected, where it is kept…" /></Field>
      <div className="mt-4">
        <FileUpload accept="image/*,video/*,application/pdf" compact label="Attach photos / videos" onFiles={(a) => setF({ ...f, attachments: [...f.attachments, ...a] })} />
        {f.attachments.length > 0 && <div className="mt-2"><AttachmentList items={f.attachments} onRemove={(a) => setF({ ...f, attachments: f.attachments.filter((x) => x.id !== a.id) })} /></div>}
      </div>
      <p className="text-xs text-slate-500 mt-3">Routed to the {ROUTE[f.category]} team{f.category === 'DAMAGE_IN_TRANSIT' ? ' and Service' : ''} for resolution.</p>
    </Modal>
  )
}

function ComplaintDrawer({ id, onClose }) {
  const t = useStore((s) => s.tickets.find((x) => x.id === id))
  const updateTicket = useStore((s) => s.updateTicket)
  const { user } = useLookup()
  const [note, setNote] = useState('')
  const media = (t.attachments || []).filter((a) => /image|video/.test(a.type || '') || /\.(png|jpe?g|mp4|mov)$/i.test(a.name))
  const docs = (t.attachments || []).filter((a) => !media.includes(a))
  return (
    <Drawer open onClose={onClose} title={`${t.number} · ${t.subject}`} subtitle={<span className="flex gap-2 items-center"><StatusBadge status={t.stage} /><Badge tone="amber">{CAT[t.category] || t.category.replace(/_/g, ' ').toLowerCase()}</Badge></span>}
      footer={<>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an update for the Btali team…" className="flex-1 min-w-[200px]" />
        <Button icon={MessageSquare} disabled={!note.trim()} onClick={() => { updateTicket(t.id, { note }); setNote(''); toast.success('Update added') }}>Post update</Button>
      </>}>
      <DescriptionList cols={2} items={[['Logged', fmtDateTime(t.createdAt)], ['Priority', t.priority], ['Reference', t.orderRef || '—'], ['Barcode', t.barcode || '—'], ['Assigned to', user(t.assigneeId)?.name || `${ROUTE[t.category] || 'Dispatch'} team`], ['Resolved', t.resolvedAt ? fmtDateTime(t.resolvedAt) : '—']]} />
      {t.productId && <div className="mt-4"><ProductCell id={t.productId} /></div>}
      <SectionTitle className="mt-5">Description</SectionTitle>
      <p className="text-sm text-slate-700 whitespace-pre-line">{t.description}</p>
      <SectionTitle className="mt-5">Photos & files</SectionTitle>
      {media.length ? <MediaGrid items={media} /> : null}
      {docs.length ? <div className="mt-2"><AttachmentList items={docs} /></div> : !media.length && <div className="text-sm text-slate-400">No attachments.</div>}
      <SectionTitle className="mt-5">Updates</SectionTitle>
      <Timeline items={[...t.updates].reverse().map((u) => ({ ...u, by: user(u.by)?.name }))} />
    </Drawer>
  )
}

export default function BtaliComplaints() {
  const tickets = useStore((s) => s.tickets)
  const [modal, setModal] = useState(false)
  const [open, setOpen] = useState(null)
  const rows = useMemo(() => tickets.filter((t) => t.source === 'BTALI').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [tickets])
  const openRows = rows.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.stage))
  return (
    <div>
      <PageHeader title="Complaints" subtitle="Log warehouse issues – routed to Btali Dispatch / Purchase as tickets" actions={<Button icon={Plus} onClick={() => setModal(true)}>Log complaint</Button>} />
      <Grid cols={4}>
        <Stat label="Open" value={openRows.length} icon={Clock} tone="amber" />
        <Stat label="High priority open" value={openRows.filter((t) => t.priority === 'HIGH').length} icon={AlertTriangle} tone="red" />
        <Stat label="Resolved" value={rows.length - openRows.length} icon={CheckCircle2} tone="green" />
        <Stat label="Total logged" value={rows.length} tone="ink" />
      </Grid>
      <div className="mt-4">
        <DataTable rows={rows} onRowClick={(t) => setOpen(t.id)} exportName="btali-complaints"
          filters={[{ key: 'category', label: 'types', options: Object.entries(CAT).map(([value, label]) => ({ value, label })) }, { key: 'stage', label: 'stages', options: ['LOGGED', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((v) => ({ value: v, label: v.replace(/_/g, ' ').toLowerCase() })) }]}
          columns={[
            { key: 'number', header: 'Ticket', render: (t) => <span className="font-mono text-xs">{t.number}</span> },
            { key: 'subject', header: 'Subject', render: (t) => <div className="max-w-sm"><div className="font-medium text-slate-800 truncate">{t.subject}</div><div className="text-[11px] text-slate-500">{t.orderRef || ''}</div></div> },
            { key: 'category', header: 'Type', value: (t) => CAT[t.category] || t.category, render: (t) => <Badge tone={t.category === 'SHORTAGE' ? 'red' : t.category === 'DAMAGE_IN_TRANSIT' ? 'amber' : 'violet'}>{CAT[t.category] || t.category.replace(/_/g, ' ').toLowerCase()}</Badge> },
            { key: 'priority', header: 'Priority', render: (t) => <StatusBadge status={t.priority} /> },
            { key: 'route', header: 'Routed to', value: (t) => ROUTE[t.category] || 'Dispatch' },
            { key: 'files', header: 'Files', align: 'right', value: (t) => t.attachments?.length || 0 },
            { key: 'createdAt', header: 'Logged', render: (t) => <span className="text-xs">{timeAgo(t.createdAt)}</span> },
            { key: 'stage', header: 'Status', render: (t) => <StatusBadge status={t.stage} /> },
          ]} />
      </div>
      {modal && <NewComplaint onClose={() => setModal(false)} />}
      {open && <ComplaintDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
