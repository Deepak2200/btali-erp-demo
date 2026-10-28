import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, MessageCircle, Star, Ticket, ShoppingCart, ExternalLink } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Button, Badge, Avatar, Drawer, DescriptionList, StatusBadge, Tabs, Grid, Stat, EmptyState } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtDate, fmtDateTime, timeAgo, exportCSV } from '../../../lib/format'
import { ChatMessages, ConvBadge, CONV_STATUS, downloadTranscript, intentLabel, transcriptText, useWaRunners } from './_shared'

export default function WaHistory() {
  useWaRunners()
  const nav = useNavigate()
  const convs = useStore((s) => s.waConversations) || []
  const contacts = useStore((s) => s.waContacts) || []
  const users = useStore((s) => s.users)
  const [open, setOpen] = useState(null)
  const rows = useMemo(() => convs.map((c) => ({
    ...c, msgCount: c.messages.length, agent: users.find((u) => u.id === c.agentId)?.name || (c.messages.some((m) => m.from === 'agent') ? 'Sales team' : ''),
    intents: [...new Set(c.messages.filter((m) => m.intent && m.from === 'bot').map((m) => intentLabel(m.intent)))].join(', '),
    type: (contacts.find((x) => x.id === c.contactId) || {}).type || 'PROSPECT',
  })).sort((a, b) => b.lastAt.localeCompare(a.lastAt)), [convs, contacts, users])
  const cur = convs.find((c) => c.id === open)
  const withCsat = convs.filter((c) => c.csat)
  return (
    <div className="space-y-4">
      <PageHeader title="Chat History & Customers" subtitle="Every WhatsApp conversation with transcript, escalation reason, feedback and linked orders / tickets"
        actions={<Button variant="secondary" icon={Download} onClick={() => exportCSV('whatsapp-transcripts.csv', rows, [{ header: 'Customer', value: (r) => r.name }, { header: 'Phone', value: (r) => r.phone }, { header: 'City', value: (r) => r.city }, { header: 'Status', value: (r) => CONV_STATUS[r.status]?.label }, { header: 'Started', value: (r) => fmtDateTime(r.createdAt) }, { header: 'Last message', value: (r) => fmtDateTime(r.lastAt) }, { header: 'Agent', value: (r) => r.agent }, { header: 'Escalation', value: (r) => r.escalationReason || '' }, { header: 'CSAT', value: (r) => r.csat || '' }, { header: 'Transcript', value: (r) => transcriptText(r, users) }])}>Export transcripts</Button>} />
      <Grid cols={4}>
        <Stat label="Conversations" value={convs.length} icon={MessageCircle} tone="green" />
        <Stat label="Unique customers" value={new Set(convs.map((c) => c.phone)).size} icon={Star} tone="ink" />
        <Stat label="Escalated" value={convs.filter((c) => c.escalationReason).length} icon={ExternalLink} tone="amber" />
        <Stat label="Feedback received" value={withCsat.length} sub={withCsat.length ? `avg ${(withCsat.reduce((a, c) => a + c.csat, 0) / withCsat.length).toFixed(1)} / 5` : ''} icon={Star} tone="violet" />
      </Grid>
      <DataTable rows={rows} onRowClick={(r) => setOpen(r.id)} exportName="whatsapp-conversations" searchPlaceholder="Search customer, phone, intent…"
        filters={[{ key: 'status', label: 'statuses', options: Object.entries(CONV_STATUS).map(([value, v]) => ({ value, label: v.label })) }, { key: 'type', label: 'customer types', options: ['DEALER', 'FRANCHISE', 'RETAILER', 'PROSPECT', 'END_CUSTOMER'] }]}
        columns={[
          { key: 'name', header: 'Customer', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.name} size="sm" /><div className="min-w-0"><div className="font-medium text-slate-800">{r.name}</div><div className="text-[11px] text-slate-500">{r.phone} · {r.city}</div></div></div> },
          { key: 'status', header: 'Status', value: (r) => CONV_STATUS[r.status]?.label, render: (r) => <ConvBadge status={r.status} /> },
          { key: 'intents', header: 'Topics', render: (r) => <span className="text-xs text-slate-600 line-clamp-1 max-w-[220px] block">{r.intents || '—'}</span> },
          { key: 'msgCount', header: 'Messages', align: 'right' },
          { key: 'agent', header: 'Assigned executive', render: (r) => r.agent || <span className="text-slate-400">Bot only</span> },
          { key: 'escalationReason', header: 'Escalation', render: (r) => (r.escalationReason ? <Badge tone="amber">{r.escalationReason}</Badge> : '—') },
          { key: 'csat', header: 'CSAT', align: 'center', render: (r) => (r.csat ? <span className="text-amber-500">{'★'.repeat(r.csat)}<span className="text-slate-200">{'★'.repeat(5 - r.csat)}</span></span> : '—') },
          { key: 'lastAt', header: 'Last activity', value: (r) => r.lastAt, render: (r) => timeAgo(r.lastAt) },
        ]} />
      <Drawer open={!!cur} onClose={() => setOpen(null)} width="max-w-5xl" title={cur?.name} subtitle={cur && `${cur.phone}${cur.city ? ` · ${cur.city}` : ''}`}
        footer={cur && <><Button variant="secondary" icon={Download} onClick={() => downloadTranscript(cur, users)}>Download transcript</Button><Button icon={MessageCircle} onClick={() => nav(`/erp/whatsapp/inbox?c=${cur.id}`)}>Open in live inbox</Button></>}>
        {cur && <Profile conv={cur} />}
      </Drawer>
    </div>
  )
}

function Profile({ conv }) {
  const [tab, setTab] = useState('chat')
  const nav = useNavigate()
  const contacts = useStore((s) => s.waContacts) || []
  const partners = useStore((s) => s.partners)
  const salesOrders = useStore((s) => s.salesOrders)
  const tickets = useStore((s) => s.tickets)
  const leads = useStore((s) => s.aiLeads) || []
  const users = useStore((s) => s.users)
  const allConvs = useStore((s) => s.waConversations) || []
  const contact = contacts.find((c) => c.id === conv.contactId) || contacts.find((c) => c.phone === conv.phone)
  const partner = partners.find((p) => p.id === (conv.partnerId || contact?.partnerId))
  const orders = partner ? salesOrders.filter((s) => s.partnerId === partner.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10) : []
  const tks = tickets.filter((t) => (conv.ticketIds || []).includes(t.id) || (partner && t.partnerId === partner.id)).slice(0, 10)
  const lead = leads.find((l) => l.id === (conv.leadId || contact?.leadId)) || leads.find((l) => String(l.phone).replace(/\D/g, '').slice(-10) === String(conv.phone).replace(/\D/g, '').slice(-10))
  const others = allConvs.filter((c) => c.phone === conv.phone && c.id !== conv.id)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
      <div className="min-w-0">
        <Tabs value={tab} onChange={setTab} className="mb-3" tabs={[{ key: 'chat', label: 'Transcript', count: conv.messages.length }, { key: 'orders', label: 'Orders', count: orders.length }, { key: 'tickets', label: 'Tickets', count: tks.length }]} />
        {tab === 'chat' && <div className="rounded-xl overflow-hidden border border-slate-200"><ChatMessages conv={conv} className="max-h-[60vh]" /></div>}
        {tab === 'orders' && (orders.length ? (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {orders.map((s) => <li key={s.id} className="px-3 py-2.5 flex items-center gap-3 text-sm cursor-pointer hover:bg-slate-50" onClick={() => nav(`/erp/sales/orders/${s.id}`)}><ShoppingCart className="w-4 h-4 text-slate-400" /><span className="font-medium">{s.number}</span><span className="text-slate-500 text-xs">{fmtDate(s.date)}</span><span className="ml-auto tabular-nums">{fmtINR(s.total)}</span><StatusBadge status={s.status} /></li>)}
          </ul>
        ) : <EmptyState icon={ShoppingCart} title="No orders linked" message="This customer is not linked to a dealer account." />)}
        {tab === 'tickets' && (tks.length ? (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {tks.map((t) => <li key={t.id} className="px-3 py-2.5 flex items-center gap-3 text-sm"><Ticket className="w-4 h-4 text-slate-400 shrink-0" /><span className="font-medium shrink-0">{t.number}</span><span className="text-slate-600 truncate flex-1">{t.subject}</span><StatusBadge status={t.stage} /></li>)}
          </ul>
        ) : <EmptyState icon={Ticket} title="No service tickets" />)}
      </div>
      <div className="space-y-4">
        <Card title="Customer profile">
          <DescriptionList cols={1} items={[
            ['Name', conv.name], ['WhatsApp', conv.phone], ['City', conv.city || contact?.city], ['Customer type', contact?.type?.replace('_', ' ').toLowerCase()],
            ['Preferred language', conv.language || contact?.language], ['Tags', (contact?.tags || []).length ? <div className="flex gap-1 flex-wrap">{contact.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div> : '—'],
            ['Promotions', contact?.optOut ? <Badge tone="red">Opted out</Badge> : <Badge tone="green">Subscribed</Badge>],
            ['First contact', fmtDateTime(conv.createdAt)],
          ]} />
        </Card>
        <Card title="Conversation">
          <DescriptionList cols={1} items={[
            ['Status', <ConvBadge status={conv.status} />], ['Assigned executive', users.find((u) => u.id === conv.agentId)?.name || 'Btali Assistant'],
            ['Escalation reason', conv.escalationReason || '—'], ['Feedback', conv.csat ? `${conv.csat} / 5` : 'Not rated'],
            ['Resolved', conv.resolvedAt ? fmtDateTime(conv.resolvedAt) : '—'], others.length > 0 && ['Earlier chats', others.length],
          ]} />
        </Card>
        {partner && <Card title="Dealer account"><div className="text-sm font-medium">{partner.name}</div><div className="text-xs text-slate-500">{partner.code} · {partner.city} · Tier {partner.tier}</div><div className="text-xs text-slate-500 mt-1">Last order {partner.lastOrderDate ? fmtDate(partner.lastOrderDate) : '—'}</div></Card>}
        {lead && <Card title="Sales lead"><div className="text-sm font-medium">{lead.number} · {lead.company || lead.name}</div><div className="mt-1 flex gap-1.5"><StatusBadge status={lead.temperature} /><Badge>{lead.stage.toLowerCase()}</Badge><Badge tone="ink">Score {lead.score}</Badge></div></Card>}
      </div>
    </div>
  )
}
