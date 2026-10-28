import React, { useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, PhoneCall, LayoutGrid, List, AlertTriangle, Clock, Factory, CheckCircle2, Inbox, UserPlus, CheckCheck, MessageSquarePlus, ShieldCheck, ExternalLink } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Badge, StatusBadge, Button, Kanban, Drawer, DescriptionList, Stepper, SectionTitle, Textarea, Checkbox, FileUpload,
  AttachmentList, Select, SearchInput, Segmented, Alert, toast, prompt, cx, Avatar,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, PartnerCell } from '../../../components/business'
import { fmtDate, fmtDateTime, timeAgo } from '../../../lib/format'
import { TICKET_STAGES, RESPONSE_TYPES, resolvedAtOf } from '../../../store/slices/service'
import {
  SlaChip, CATEGORY_LABEL, SOURCE_LABEL, CATEGORY_OPTIONS, SOURCE_OPTIONS, PRIORITY_OPTIONS, NewTicketModal, AssignModal, EscalateModal, ThreadItem,
  WarrantyCover, useWarrantyCheck, slaState, slaDue, sourceIcon, fmtHours,
} from './_parts'

export default function Tickets() {
  const tickets = useStore((s) => s.tickets)
  const users = useStore((s) => s.users)
  const updateTicket = useStore((s) => s.updateTicket)
  const { partner, user, product } = useLookup()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState('board')
  const [q, setQ] = useState('')
  const [fl, setFl] = useState({ category: '', source: '', priority: '', assignee: '', sla: '' })
  const [newOpen, setNewOpen] = useState(null)
  const openId = params.get('id')
  const open = (id) => setParams(id ? { id } : {})

  const assigneeLabel = (t) => (t.routedPartnerId ? partner(t.routedPartnerId)?.name : user(t.assigneeId)?.name) || 'Unassigned'
  const assigneeOptions = useMemo(() => {
    const set = new Map()
    tickets.forEach((t) => {
      if (t.routedPartnerId) set.set(`p:${t.routedPartnerId}`, partner(t.routedPartnerId)?.name)
      else if (t.assigneeId) set.set(`u:${t.assigneeId}`, user(t.assigneeId)?.name)
    })
    return [{ value: 'none', label: 'Unassigned' }, ...[...set].map(([value, label]) => ({ value, label: label || value }))]
  }, [tickets]) // eslint-disable-line

  const filtered = useMemo(() => tickets.filter((t) => {
    if (fl.category && t.category !== fl.category) return false
    if (fl.source && t.source !== fl.source) return false
    if (fl.priority && t.priority !== fl.priority) return false
    if (fl.assignee) {
      const k = t.routedPartnerId ? `p:${t.routedPartnerId}` : t.assigneeId ? `u:${t.assigneeId}` : 'none'
      if (k !== fl.assignee) return false
    }
    if (fl.sla === 'OVERDUE' && !slaState(t).overdue) return false
    if (fl.sla === 'OVERDUE' && slaState(t).done) return false
    if (q) {
      const s = q.toLowerCase()
      const hay = `${t.number} ${t.subject} ${t.barcode || ''} ${t.customer?.name || ''} ${t.customer?.phone || ''} ${partner(t.partnerId)?.name || ''} ${t.orderRef || ''}`.toLowerCase()
      if (!hay.includes(s)) return false
    }
    return true
  }), [tickets, fl, q]) // eslint-disable-line

  const openT = tickets.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.stage))
  const overdue = openT.filter((t) => slaState(t).overdue)
  const escalated = openT.filter((t) => t.escalatedToVendor)
  const resolved = tickets.filter((t) => resolvedAtOf(t))
  const avgRes = resolved.length ? Math.round(resolved.reduce((a, t) => a + (new Date(resolvedAtOf(t)) - new Date(t.createdAt)) / 3600000, 0) / resolved.length) : 0

  const move = (t, stage) => {
    updateTicket(t.id, { stage })
    toast.success(`${t.number} → ${TICKET_STAGES.find((s) => s.key === stage).label}`)
  }

  const cols = [
    { key: 'number', header: 'Ticket', render: (t) => <div><div className="font-mono text-xs font-semibold text-ink-800">{t.number}</div><div className="text-[11px] text-slate-400">{fmtDate(t.createdAt)}</div></div> },
    { key: 'subject', header: 'Subject', render: (t) => <div className="max-w-xs"><div className="text-sm text-slate-800 truncate">{t.subject}</div><div className="text-[11px] text-slate-500">{CATEGORY_LABEL[t.category]}</div></div> },
    { key: 'source', header: 'Source', value: (t) => SOURCE_LABEL[t.source] },
    { key: 'raisedBy', header: 'Raised by', value: (t) => t.customer?.name || partner(t.partnerId)?.name || (t.vendorId ? 'Vendor' : 'Btali'), render: (t) => <div className="text-sm">{t.customer?.name || partner(t.partnerId)?.name || (t.source === 'VENDOR' ? 'Vendor' : 'Btali team')}<div className="text-[11px] text-slate-400">{t.customer?.city || partner(t.partnerId)?.city || ''}</div></div> },
    { key: 'priority', header: 'Priority', render: (t) => <StatusBadge status={t.priority} /> },
    { key: 'stage', header: 'Stage', render: (t) => <StatusBadge status={t.stage} /> },
    { key: 'assignee', header: 'Assigned to', value: assigneeLabel },
    { key: 'sla', header: 'SLA', value: (t) => slaState(t).hoursLeft, render: (t) => <SlaChip t={t} /> },
  ]

  return (
    <div>
      <PageHeader title="Service Ticket Desk" subtitle="All service requests from dealers, franchise stores, website, toll-free, Btali and vendors"
        actions={<>
          <Button variant="secondary" icon={PhoneCall} onClick={() => setNewOpen('TOLL_FREE')}>Toll-free intake</Button>
          <Button icon={Plus} onClick={() => setNewOpen('INTERNAL')}>New ticket</Button>
        </>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Open tickets" value={openT.length} icon={Inbox} sub={`${openT.filter((t) => t.stage === 'LOGGED').length} not yet picked`} onClick={() => setFl({ category: '', source: '', priority: '', assignee: '', sla: '' })} />
        <Stat label="SLA overdue" value={overdue.length} icon={AlertTriangle} tone="red" sub="Click to filter" onClick={() => setFl((f) => ({ ...f, sla: f.sla ? '' : 'OVERDUE' }))} />
        <Stat label="With vendors" value={escalated.length} icon={Factory} tone="violet" sub="Escalated, open" />
        <Stat label="Avg. resolution" value={avgRes ? fmtHours(avgRes) : '—'} icon={Clock} tone="green" sub={`${resolved.length} resolved tickets`} />
      </Grid>

      <Card padded={false} className="mb-4">
        <div className="p-3 flex flex-col lg:flex-row gap-2 lg:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="Search number, subject, barcode, customer…" className="lg:w-72" />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-1">
            <Select value={fl.category} onChange={(e) => setFl({ ...fl, category: e.target.value })} placeholder="All categories" options={CATEGORY_OPTIONS} />
            <Select value={fl.source} onChange={(e) => setFl({ ...fl, source: e.target.value })} placeholder="All sources" options={SOURCE_OPTIONS} />
            <Select value={fl.priority} onChange={(e) => setFl({ ...fl, priority: e.target.value })} placeholder="All priorities" options={PRIORITY_OPTIONS} />
            <Select value={fl.assignee} onChange={(e) => setFl({ ...fl, assignee: e.target.value })} placeholder="All assignees" options={assigneeOptions} />
            <Select value={fl.sla} onChange={(e) => setFl({ ...fl, sla: e.target.value })} placeholder="Any SLA" options={[{ value: 'OVERDUE', label: 'Overdue only' }]} />
          </div>
          <Segmented value={view} onChange={setView} options={[{ key: 'board', label: <span className="inline-flex items-center gap-1"><LayoutGrid className="w-3.5 h-3.5" />Board</span> }, { key: 'list', label: <span className="inline-flex items-center gap-1"><List className="w-3.5 h-3.5" />List</span> }]} />
        </div>
      </Card>

      {view === 'board' ? (
        <Kanban columns={TICKET_STAGES} items={filtered} getColumn={(t) => t.stage} onMove={move}
          renderCard={(t) => {
            const SI = sourceIcon(t.source)
            return (
              <div onClick={() => open(t.id)} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] font-semibold text-ink-700">{t.number}</span>
                  {t.priority === 'HIGH' && <Badge tone="red">High</Badge>}
                  {t.escalatedToVendor && <Badge tone="violet">Vendor</Badge>}
                  <SI className="w-3.5 h-3.5 text-slate-400 ml-auto" title={SOURCE_LABEL[t.source]} />
                </div>
                <div className="text-sm text-slate-800 leading-snug line-clamp-2">{t.subject}</div>
                <div className="text-[11px] text-slate-500">{CATEGORY_LABEL[t.category]} · {t.customer?.city || partner(t.partnerId)?.city || SOURCE_LABEL[t.source]}</div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-slate-500 truncate flex items-center gap-1"><Avatar name={assigneeLabel(t)} size="sm" className="!w-5 !h-5 !text-[9px]" />{assigneeLabel(t)}</span>
                  <SlaChip t={t} />
                </div>
              </div>
            )
          }} />
      ) : (
        <DataTable columns={cols} rows={filtered} onRowClick={(t) => open(t.id)} searchable={false} exportName="service-tickets" initialSort={{ key: 'number', dir: 'desc' }} rowClass={(t) => (slaState(t).overdue && !slaState(t).done ? 'bg-red-50/40' : '')} />
      )}

      <TicketDrawer id={openId} onClose={() => open(null)} />
      <NewTicketModal open={!!newOpen} defaultSource={newOpen || 'INTERNAL'} onClose={() => setNewOpen(null)} onCreated={(t) => open(t.id)} />
    </div>
  )
}

function TicketDrawer({ id, onClose }) {
  const t = useStore((s) => s.tickets.find((x) => x.id === id))
  const claims = useStore((s) => s.warrantyClaims)
  const addUpdate = useStore((s) => s.svcAddTicketUpdate)
  const closeTicket = useStore((s) => s.svcCloseTicket)
  const updateTicket = useStore((s) => s.updateTicket)
  const { partner, user, vendor } = useLookup()
  const nav = useNavigate()
  const [note, setNote] = useState('')
  const [pub, setPub] = useState(false)
  const [files, setFiles] = useState([])
  const [modal, setModal] = useState(null)
  const wc = useWarrantyCheck(t?.barcode)
  if (!t) return null
  const claim = claims.find((c) => c.id === t.claimId)
  const done = t.stage === 'RESOLVED' || t.stage === 'CLOSED'
  const routed = partner(t.routedPartnerId)
  const send = () => {
    if (!note.trim()) return toast.error('Write an update first')
    addUpdate(t.id, { text: note, attachments: files, isPublic: pub })
    setNote(''); setFiles([]); setPub(false)
    toast.success('Update added', pub ? 'Customer notified by SMS.' : undefined)
  }
  const finish = async (stage) => {
    const r = await prompt({ title: stage === 'RESOLVED' ? 'Resolve ticket' : 'Close ticket', label: 'Resolution summary', placeholder: 'e.g. Capacitor replaced at site, pump working', required: true, confirmText: stage === 'RESOLVED' ? 'Mark resolved' : 'Close ticket' })
    if (!r) return
    closeTicket(t.id, { resolution: r, stage })
    toast.success(`${t.number} ${stage === 'RESOLVED' ? 'resolved' : 'closed'}`, t.customer?.phone ? 'Customer informed by SMS.' : 'Raised-by party notified.')
  }
  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={`${t.number} · ${t.subject}`}
      subtitle={<div className="flex flex-wrap gap-1.5 mt-1"><StatusBadge status={t.stage} /><StatusBadge status={t.priority} label={`${t.priority.toLowerCase()} priority`} /><Badge tone="ink">{CATEGORY_LABEL[t.category]}</Badge><Badge>{SOURCE_LABEL[t.source]}</Badge><SlaChip t={t} /></div>}
      footer={<>
        {!done && <Button variant="secondary" icon={UserPlus} onClick={() => setModal('assign')}>Assign / route</Button>}
        {!done && !t.escalatedToVendor && <Button variant="secondary" icon={Factory} onClick={() => setModal('escalate')}>Escalate to vendor</Button>}
        {!done && <Button variant="success" icon={CheckCircle2} onClick={() => finish('RESOLVED')}>Resolve</Button>}
        {t.stage !== 'CLOSED' && <Button variant="dark" icon={CheckCheck} onClick={() => finish('CLOSED')}>Close</Button>}
        {t.stage === 'CLOSED' && <Button variant="secondary" onClick={() => { updateTicket(t.id, { stage: 'IN_PROGRESS', note: 'Ticket re-opened' }); toast.info('Ticket re-opened') }}>Re-open</Button>}
      </>}>
      <Stepper steps={TICKET_STAGES} current={t.stage} className="mb-2" />
      {!done && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {TICKET_STAGES.filter((s) => s.key !== t.stage && s.key !== 'CLOSED' && s.key !== 'RESOLVED').map((s) => (
            <Button key={s.key} size="sm" variant="ghost" onClick={() => { updateTicket(t.id, { stage: s.key }); toast.success(`Moved to ${s.label}`) }}>Move to {s.label}</Button>
          ))}
        </div>
      )}
      <DescriptionList cols={3} items={[
        ['Raised by', t.customer?.name ? `${t.customer.name} (customer)` : partner(t.partnerId)?.name || (t.vendorId && t.source === 'VENDOR' ? vendor(t.vendorId)?.name : user(t.createdBy)?.name || 'Btali team')],
        ['Created', fmtDateTime(t.createdAt)],
        ['SLA due', `${fmtDateTime(slaDue(t))} (${t.slaHours} h)`],
        ['Assigned to', routed ? <span>{routed.name}<span className="block text-[11px] text-slate-500">{routed.type === 'FRANCHISE' ? 'Franchise' : 'Dealer'} · {routed.city} · {routed.phone}</span></span> : user(t.assigneeId)?.name || 'Unassigned'],
        ['Order / ref', t.orderRef],
        ['Resolved', resolvedAtOf(t) ? fmtDateTime(resolvedAtOf(t)) : null],
      ]} />
      {t.customer && (
        <div className="mt-4 rounded-xl bg-sky-50/60 border border-sky-100 p-3 text-sm">
          <div className="text-xs font-semibold text-sky-800 mb-1">Customer</div>
          <div className="text-slate-800">{t.customer.name} · {t.customer.phone}{t.customer.email ? ` · ${t.customer.email}` : ''}</div>
          <div className="text-slate-500 text-xs">{[t.customer.address, t.customer.city, t.customer.pincode].filter(Boolean).join(', ')}</div>
        </div>
      )}
      {t.description && t.description !== t.subject && <div className="mt-4"><SectionTitle>Description</SectionTitle><p className="text-sm text-slate-700 whitespace-pre-line">{t.description}</p></div>}

      {(t.productId || t.barcode) && (
        <div className="mt-5">
          <SectionTitle actions={t.barcode && <Button size="sm" variant="link" icon={ShieldCheck} onClick={() => nav(`/erp/service/warranties?q=${t.barcode}`)}>Warranty registry</Button>}>Product & warranty</SectionTitle>
          <div className="flex items-center justify-between gap-3 mb-2">
            <ProductCell id={t.productId || wc?.product?.id} sub={t.barcode ? `Barcode ${t.barcode}` : 'No barcode captured'} />
            {wc?.unit && <StatusBadge status={wc.unit.status} />}
          </div>
          {t.barcode && wc && <WarrantyCover result={wc} />}
        </div>
      )}
      {claim && (
        <Alert tone="info" className="mt-4" title={`Linked warranty claim ${claim.number}`} action={<Button size="sm" variant="secondary" iconRight={ExternalLink} onClick={() => nav(`/erp/service/claims?id=${claim.id}`)}>Open</Button>}>
          {claim.issue} · <StatusBadge status={claim.status} />
        </Alert>
      )}
      {t.escalatedToVendor && (
        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-900"><Factory className="w-4 h-4" />Escalated to {vendor(t.vendorId)?.name}</div>
          {t.vendorResponse ? (
            <div className="mt-2 text-sm">
              <Badge tone="green">{RESPONSE_TYPES[t.vendorResponse.type] || t.vendorResponse.type}</Badge>
              <p className="mt-1 text-slate-700">{t.vendorResponse.text}</p>
              <div className="text-[11px] text-slate-500">{fmtDateTime(t.vendorResponse.ts)}</div>
              {t.vendorResponse.docs?.length > 0 && <div className="mt-2"><AttachmentList dense items={t.vendorResponse.docs} /></div>}
            </div>
          ) : <div className="text-xs text-violet-800 mt-1">Awaiting vendor response · escalated {timeAgo(t.escalatedAt || t.updates.find((u) => /escalat/i.test(u.text))?.ts || t.createdAt)}</div>}
        </div>
      )}

      <div className="mt-5">
        <SectionTitle>Updates</SectionTitle>
        <ul className="space-y-3 mb-4">
          {t.updates.length === 0 && <li className="text-sm text-slate-400">No updates yet.</li>}
          {t.updates.map((u, i) => <ThreadItem key={i} u={u} />)}
        </ul>
        {t.stage !== 'CLOSED' && (
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note, diagnosis or action taken…" />
            <FileUpload compact label="Attach photos, videos or job sheet" onFiles={(a) => setFiles((x) => [...x, ...a])} />
            {files.length > 0 && <AttachmentList dense items={files} onRemove={(a) => setFiles((x) => x.filter((y) => y.id !== a.id))} />}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Checkbox label={t.customer?.phone ? 'Visible to customer (sends SMS)' : 'Visible on public tracking'} checked={pub} onChange={setPub} />
              <Button size="sm" icon={MessageSquarePlus} onClick={send}>Post update</Button>
            </div>
          </div>
        )}
      </div>
      <div className="mt-5">
        <SectionTitle>Attachments</SectionTitle>
        <AttachmentList items={t.attachments || []} />
      </div>
      {modal === 'assign' && <AssignModal key={t.id} ticket={t} open onClose={() => setModal(null)} />}
      {modal === 'escalate' && <EscalateModal key={t.id} ticket={t} open onClose={() => setModal(null)} />}
    </Drawer>
  )
}
