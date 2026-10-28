import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PhoneCall, PhoneIncoming, PhoneOutgoing, Timer, Smile, Frown, HelpCircle } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Badge, Segmented } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { UserName } from '../../../components/business'
import { CALL_OUTCOMES, fmtDur } from '../../../store/slices/ai'
import { fmtDateTime, fmtINR, fmtPct, sum, today, daysAgo } from '../../../lib/format'
import { useAiRunners, CallDrawer, OutcomeBadge, SentimentBadge } from './_shared'

export default function CallLogs() {
  useAiRunners()
  const calls = useStore((s) => s.aiCalls || [])
  const leads = useStore((s) => s.aiLeads || [])
  const campaigns = useStore((s) => s.aiCampaigns || [])
  const users = useStore((s) => s.users)
  const [params, setParams] = useSearchParams()
  const open = params.get('call')
  const [range, setRange] = useState('all')
  const leadOf = useMemo(() => Object.fromEntries(leads.map((l) => [l.id, l])), [leads])
  const rows = useMemo(() => {
    const from = range === 'today' ? today() : range === '7d' ? daysAgo(6) : ''
    return calls.filter((c) => !from || c.startedAt.slice(0, 10) >= from).map((c) => ({ ...c, lead: leadOf[c.leadId] }))
  }, [calls, leadOf, range])
  const conn = rows.filter((c) => c.status === 'CONNECTED')
  const cols = [
    { key: 'startedAt', header: 'When', render: (c) => <div className="whitespace-nowrap"><div>{fmtDateTime(c.startedAt)}</div><div className="text-[11px] text-slate-500">{c.number}</div></div> },
    { key: 'direction', header: '', sortable: false, render: (c) => (c.direction === 'INBOUND' ? <PhoneIncoming className="w-4 h-4 text-sky-600" /> : <PhoneOutgoing className="w-4 h-4 text-slate-400" />), value: (c) => c.direction },
    { key: 'lead', header: 'Lead', render: (c) => <div className="min-w-[160px]"><div className="font-medium">{c.lead?.name}</div><div className="text-[11px] text-slate-500">{c.lead?.company} · {c.lead?.city}</div></div>, value: (c) => `${c.lead?.name || ''} ${c.lead?.company || ''}` },
    { key: 'campaign', header: 'Campaign', render: (c) => <span className="text-xs inline-block min-w-[120px]">{campaigns.find((x) => x.id === c.campaignId)?.name || (c.direction === 'INBOUND' ? 'Inbound line' : c.handledBy === 'AI' ? 'One-off AI call' : 'Manual (mobile)')}</span>, value: (c) => campaigns.find((x) => x.id === c.campaignId)?.name || '' },
    { key: 'durationSec', header: 'Duration', align: 'right', render: (c) => <span className="tabular-nums">{fmtDur(c.durationSec)}</span> },
    { key: 'outcome', header: 'Outcome', render: (c) => <OutcomeBadge outcome={c.outcome} />, value: (c) => CALL_OUTCOMES[c.outcome]?.label },
    { key: 'sentiment', header: 'Sentiment', render: (c) => <SentimentBadge s={c.sentiment} /> },
    { key: 'summary', header: 'AI summary', render: (c) => <div className="text-xs text-slate-600 min-w-[240px] max-w-[320px] line-clamp-2">{c.summary}</div> },
    { key: 'nextAction', header: 'Next action', render: (c) => <div className="text-xs max-w-[200px]">{c.nextAction}{c.taskId && <Badge tone="green" className="ml-1">task</Badge>}</div> },
    { key: 'salesperson', header: 'Salesperson', render: (c) => <UserName id={c.lead?.assignedTo} />, value: (c) => users.find((u) => u.id === c.lead?.assignedTo)?.name || '' },
    { key: 'cost', header: 'Cost', align: 'right', render: (c) => fmtINR(c.cost, true) },
  ]
  return (
    <div>
      <PageHeader title="Call Logs" subtitle="Every AI and manual call with recording, transcript, AI summary, sentiment and next action"
        actions={<Segmented size="sm" value={range} onChange={setRange} options={[{ key: 'today', label: 'Today' }, { key: '7d', label: '7 days' }, { key: 'all', label: 'All' }]} />} />
      <Grid cols={6}>
        <Stat label="Calls" value={rows.length} icon={PhoneCall} />
        <Stat label="Connected" value={fmtPct(rows.length ? (conn.length / rows.length) * 100 : 0)} icon={PhoneOutgoing} tone="ink" />
        <Stat label="Avg talk time" value={fmtDur(conn.length ? sum(conn, (c) => c.durationSec) / conn.length : 0)} icon={Timer} tone="blue" />
        <Stat label="Positive" value={rows.filter((c) => c.sentiment === 'POSITIVE').length} icon={Smile} tone="green" />
        <Stat label="Negative" value={rows.filter((c) => c.sentiment === 'NEGATIVE').length} icon={Frown} tone="red" />
        <Stat label="Unanswered Qs" value={rows.filter((c) => c.unanswered?.length).length} icon={HelpCircle} tone="amber" />
      </Grid>
      <div className="mt-4">
        <DataTable rows={rows} columns={cols} onRowClick={(c) => setParams({ call: c.id })} exportName="btali-ai-call-logs" pageSize={15}
          filters={[
            { key: 'outcome', label: 'outcomes', options: Object.entries(CALL_OUTCOMES).map(([value, o]) => ({ value, label: o.label })) },
            { key: 'direction', label: 'directions', options: [{ value: 'OUTBOUND', label: 'Outbound' }, { value: 'INBOUND', label: 'Inbound' }] },
            { key: 'sentiment', label: 'sentiments', options: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] },
            { key: 'campaignId', label: 'campaigns', options: campaigns.map((c) => ({ value: c.id, label: c.name })) },
          ]} />
      </div>
      {open && <CallDrawer callId={open} onClose={() => setParams({})} />}
    </div>
  )
}
