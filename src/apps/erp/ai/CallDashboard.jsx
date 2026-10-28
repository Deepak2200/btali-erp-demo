import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneCall, PhoneForwarded, Timer, ThumbsUp, CalendarCheck, IndianRupee, Play, Pause, Square, Radio, Megaphone, Flame, HelpCircle } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Button, Progress, Badge, StatusBadge, EmptyState, Segmented, confirm, toast } from '../../../components/ui'
import { BarsChart, DonutChart } from '../../../components/business'
import { CALL_OUTCOMES, fmtDur } from '../../../store/slices/ai'
import { fmtINR, fmtPct, today, daysAgo, sum, timeAgo } from '../../../lib/format'
import { useAiRunners, CallDrawer, CallList, TempBadge, OutcomeBadge } from './_shared'

export function LiveCampaign({ c, compact }) {
  const leads = useStore((s) => s.aiLeads)
  const calls = useStore((s) => s.aiCalls)
  const { aiStartCampaign, aiPauseCampaign, aiStopCampaign } = useStore()
  const mine = calls.filter((k) => k.campaignId === c.id)
  const done = Math.max(0, (c.total || 0) - (c.queue?.length || 0) - (c.current ? 1 : 0))
  const cur = c.current && leads.find((l) => l.id === c.current.leadId)
  const conn = mine.filter((k) => k.status === 'CONNECTED').length
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{c.name}</div>
          <div className="text-[11px] text-slate-500">{c.number} · {mine.length} calls · {conn} connected · {mine.filter((k) => k.outcome === 'APPOINTMENT').length} appointments</div>
        </div>
        <StatusBadge status={c.status} />
      </div>
      <Progress value={done} max={c.total || 1} showLabel className="mt-2" tone={c.status === 'RUNNING' ? 'brand' : 'amber'} />
      {c.status === 'RUNNING' && (
        <div className="mt-2 text-xs flex items-center gap-2 text-brand-700 bg-brand-50 rounded-lg px-2 py-1.5">
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          {cur ? <span className="truncate">Dialing {cur.name} ({cur.company}, {cur.city}){c.current.attempt > 1 ? ` · retry ${c.current.attempt}` : ''}…</span> : <span>Queueing next lead…</span>}
        </div>
      )}
      {!compact && (
        <div className="flex gap-2 mt-3">
          {c.status === 'RUNNING' ? <Button size="sm" variant="secondary" icon={Pause} onClick={() => { aiPauseCampaign(c.id); toast.info('Campaign paused', c.name) }}>Pause</Button>
            : <Button size="sm" icon={Play} onClick={() => { aiStartCampaign(c.id); toast.success('Campaign resumed', `${c.queue?.length || 0} leads in queue`) }}>Resume</Button>}
          <Button size="sm" variant="ghost" icon={Square} onClick={async () => { if (await confirm({ title: 'Stop campaign?', message: `${c.queue?.length || 0} queued leads will not be called.`, tone: 'danger', confirmText: 'Stop' })) { aiStopCampaign(c.id); toast.info('Campaign stopped') } }}>Stop</Button>
        </div>
      )}
    </div>
  )
}

export default function CallDashboard() {
  useAiRunners()
  const nav = useNavigate()
  const calls = useStore((s) => s.aiCalls || [])
  const leads = useStore((s) => s.aiLeads || [])
  const campaigns = useStore((s) => s.aiCampaigns || [])
  const appts = useStore((s) => s.aiAppointments || [])
  const settings = useStore((s) => s.aiSettings || {})
  const [range, setRange] = useState('today')
  const [open, setOpen] = useState(null)

  const from = range === 'today' ? today() : range === '7d' ? daysAgo(6) : daysAgo(29)
  const inRange = useMemo(() => calls.filter((c) => c.startedAt.slice(0, 10) >= from), [calls, from])
  const conn = inRange.filter((c) => c.status === 'CONNECTED')
  const interested = conn.filter((c) => ['INTERESTED', 'APPOINTMENT'].includes(c.outcome))
  const apptCount = inRange.filter((c) => c.outcome === 'APPOINTMENT').length
  const cost = sum(inRange, (c) => c.cost)
  const monthCost = sum(calls.filter((c) => c.startedAt.slice(0, 7) === today().slice(0, 7)), (c) => c.cost)

  const hourly = useMemo(() => {
    const h = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 9}:00`, connected: 0, missed: 0 }))
    for (const c of inRange) {
      const hr = new Date(c.startedAt).getHours()
      const row = h[Math.min(11, Math.max(0, hr - 9))]
      if (c.status === 'CONNECTED') row.connected++; else row.missed++
    }
    return h
  }, [inRange])
  const funnel = [
    { label: 'Leads in database', v: leads.length },
    { label: 'Attempted', v: leads.filter((l) => l.attempts > 0).length },
    { label: 'Connected', v: leads.filter((l) => calls.some((c) => c.leadId === l.id && c.status === 'CONNECTED')).length },
    { label: 'Interested / qualified', v: leads.filter((l) => ['QUALIFIED', 'APPOINTMENT', 'CONVERTED'].includes(l.stage)).length },
    { label: 'Appointment booked', v: leads.filter((l) => ['APPOINTMENT', 'CONVERTED'].includes(l.stage) || appts.some((a) => a.leadId === l.id)).length },
    { label: 'Converted to dealer', v: leads.filter((l) => l.stage === 'CONVERTED').length },
  ]
  const outcomeMix = Object.keys(CALL_OUTCOMES).map((k) => ({ name: CALL_OUTCOMES[k].label, value: inRange.filter((c) => c.outcome === k).length })).filter((x) => x.value)
  const live = campaigns.filter((c) => ['RUNNING', 'PAUSED'].includes(c.status))
  const hot = leads.filter((l) => l.temperature === 'HOT' && !['CONVERTED', 'LOST'].includes(l.stage)).sort((a, b) => b.score - a.score).slice(0, 6)
  const unanswered = calls.filter((c) => c.unanswered?.length).slice(0, 4)

  return (
    <div>
      <PageHeader title="AI Calling Dashboard" subtitle={`Voice agent ${settings.voice?.split(' (')[0] || ''} · ${settings.provider || ''} · calling hours ${settings.callingHours?.from}–${settings.callingHours?.to}`}
        actions={<>
          <Segmented size="sm" value={range} onChange={setRange} options={[{ key: 'today', label: 'Today' }, { key: '7d', label: '7 days' }, { key: '30d', label: '30 days' }]} />
          <Button icon={Megaphone} onClick={() => nav('/erp/ai-calling/campaigns')}>Campaigns</Button>
        </>} />
      <Grid cols={6}>
        <Stat label={range === 'today' ? 'Calls today' : 'Calls'} value={inRange.length} sub={`${inRange.filter((c) => c.direction === 'INBOUND').length} inbound`} icon={PhoneCall} />
        <Stat label="Connect rate" value={fmtPct(inRange.length ? (conn.length / inRange.length) * 100 : 0)} sub={`${conn.length} connected`} icon={PhoneForwarded} tone="ink" />
        <Stat label="Avg duration" value={fmtDur(conn.length ? sum(conn, (c) => c.durationSec) / conn.length : 0)} sub="connected calls" icon={Timer} tone="blue" />
        <Stat label="Interested" value={fmtPct(conn.length ? (interested.length / conn.length) * 100 : 0)} sub={`${interested.length} of connected`} icon={ThumbsUp} tone="green" />
        <Stat label="Appointments" value={apptCount} sub={`${appts.filter((a) => a.status === 'SCHEDULED').length} upcoming`} icon={CalendarCheck} tone="violet" />
        <Stat label="Call cost" value={fmtINR(cost)} sub={`${fmtINR(monthCost)} of ${fmtINR(settings.monthlyBudget)} this month`} icon={IndianRupee} tone="amber" />
      </Grid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <Card title="Live campaigns" subtitle="Dialer keeps running while you work elsewhere" className="xl:col-span-1" actions={<Button size="sm" variant="link" onClick={() => nav('/erp/ai-calling/campaigns')}>All</Button>}>
          {live.length ? <div className="space-y-3">{live.map((c) => <LiveCampaign key={c.id} c={c} />)}</div>
            : <EmptyState icon={Megaphone} title="No campaign running" action={<Button size="sm" onClick={() => nav('/erp/ai-calling/campaigns')}>Start a campaign</Button>} />}
        </Card>
        <Card title="Calls by hour" subtitle={range === 'today' ? 'Today' : `Since ${from}`} className="xl:col-span-2">
          <BarsChart data={hourly} money={false} stacked series={[{ key: 'connected', label: 'Connected', color: '#0d9488' }, { key: 'missed', label: 'Not answered', color: '#cbd5e1' }]} height={250} />
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <Card title="Lead funnel" subtitle="All AI calling leads">
          <div className="space-y-2.5">
            {funnel.map((f, i) => (
              <div key={f.label}>
                <div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{f.label}</span><span className="font-semibold tabular-nums">{f.v}{i > 0 && funnel[0].v ? <span className="text-slate-400 font-normal"> · {fmtPct((f.v / funnel[0].v) * 100, 0)}</span> : null}</span></div>
                <div className="h-6 bg-slate-100 rounded-md overflow-hidden"><div className="h-full rounded-md" style={{ width: `${funnel[0].v ? Math.max(3, (f.v / funnel[0].v) * 100) : 0}%`, background: ['#2f416b', '#3d5488', '#0284c7', '#0d9488', '#f59e0b', '#f2541f'][i] }} /></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Call outcomes">
          {outcomeMix.length ? <DonutChart data={outcomeMix} money={false} height={210} /> : <EmptyState title="No calls in this period" />}
        </Card>
        <Card title="Hot leads" subtitle="Highest scores – call or visit first" actions={<Button size="sm" variant="link" onClick={() => nav('/erp/ai-calling/leads')}>Leads</Button>}>
          <ul className="divide-y divide-slate-100">
            {hot.map((l) => (
              <li key={l.id} className="py-2 flex items-center gap-2">
                <Flame className="w-4 h-4 text-red-500 shrink-0" />
                <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{l.name}</div><div className="text-[11px] text-slate-500 truncate">{l.company} · {l.city}</div></div>
                <div className="text-right"><div className="text-sm font-bold tabular-nums">{l.score}</div><OutcomeBadge outcome={l.lastOutcome} /></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <Card title="Latest calls" className="xl:col-span-2" actions={<Button size="sm" variant="link" onClick={() => nav('/erp/ai-calling/calls')}>Call logs</Button>}>
          <CallList calls={calls.slice(0, 8)} onOpen={setOpen} showLead />
        </Card>
        <Card title="Questions the AI could not answer" subtitle="Add them to the script FAQs">
          {unanswered.length ? <ul className="space-y-2">{unanswered.map((c) => (
            <li key={c.id} className="flex gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded-lg p-1" onClick={() => setOpen(c.id)}>
              <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /><div><div className="text-slate-800">“{c.unanswered[0]}”</div><div className="text-[11px] text-slate-500">{c.number} · {timeAgo(c.startedAt)}</div></div>
            </li>))}</ul> : <EmptyState title="All questions answered" />}
          <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => nav('/erp/ai-calling/scripts')}>Open script FAQs</Button>
        </Card>
      </div>
      {open && <CallDrawer callId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
