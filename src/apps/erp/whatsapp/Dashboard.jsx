import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Bot, Hand, Star, Timer, Megaphone, ArrowRight, Inbox as InboxIcon, BookOpen, HelpCircle } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Button, Avatar, Badge, Progress, StatusBadge, EmptyState } from '../../../components/ui'
import { TrendChart, BarsChart, DonutChart } from '../../../components/business'
import { fmtNum, fmtPct, timeAgo, fmtDate } from '../../../lib/format'
import { waMetrics, fmtSecs, ConvBadge, useWaRunners, useCampaignTotals } from './_shared'

export default function WaDashboard() {
  useWaRunners()
  const nav = useNavigate()
  const convs = useStore((s) => s.waConversations) || []
  const camps = useStore((s) => s.waCampaigns) || []
  const unanswered = useStore((s) => s.waUnanswered) || []
  const contacts = useStore((s) => s.waContacts) || []
  const m = useMemo(() => waMetrics(convs), [convs])
  const tot = useCampaignTotals()
  const waiting = convs.filter((c) => c.status === 'WAITING_AGENT' || (c.status !== 'RESOLVED' && c.unread))
  const live = camps.filter((c) => ['SENDING', 'SCHEDULED', 'PENDING_APPROVAL'].includes(c.status))
  const funnel = [
    { label: 'Sent', value: tot.sent }, { label: 'Delivered', value: tot.delivered }, { label: 'Read', value: tot.read }, { label: 'Replied', value: tot.replied },
  ]
  return (
    <div className="space-y-5">
      <PageHeader title="WhatsApp Dashboard" subtitle="Btali Assistant – inbound enquiries, handovers and outbound campaigns"
        actions={<><Button variant="secondary" icon={BookOpen} onClick={() => nav('/erp/whatsapp/knowledge')}>Knowledge base</Button><Button icon={InboxIcon} onClick={() => nav('/erp/whatsapp/inbox')}>Open live inbox</Button></>} />
      <Grid cols={5}>
        <Stat label="Conversations" value={fmtNum(m.total)} sub={`${m.open} open · ${m.waiting} need agent`} icon={MessageCircle} tone="green" onClick={() => nav('/erp/whatsapp/inbox')} />
        <Stat label="Bot resolution rate" value={fmtPct(m.botResolutionRate, 0)} sub={`${m.botResolved}/${m.resolved} resolved by bot`} icon={Bot} tone="blue" />
        <Stat label="Handover rate" value={fmtPct(m.handoverRate, 0)} sub="escalated to an executive" icon={Hand} tone="amber" />
        <Stat label="Avg CSAT" value={m.csatCount ? `${m.csat.toFixed(1)} / 5` : '—'} sub={`${m.csatCount} ratings`} icon={Star} tone="violet" />
        <Stat label="First response" value={fmtSecs(m.firstResponseSec)} sub={`agent pick-up ${m.agentResponseSec ? fmtSecs(m.agentResponseSec) : '—'}`} icon={Timer} tone="ink" />
      </Grid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Message volume – last 14 days" subtitle="Inbound customer messages vs bot and agent replies" className="xl:col-span-2">
          <TrendChart data={m.daily} money={false} series={[{ key: 'inbound', label: 'Customer' }, { key: 'bot', label: 'Bot replies' }, { key: 'agent', label: 'Agent replies' }]} height={250} />
        </Card>
        <Card title="Needs attention" subtitle="Handover requests and unread chats" actions={<Button size="sm" variant="link" iconRight={ArrowRight} onClick={() => nav('/erp/whatsapp/inbox')}>Inbox</Button>}>
          {waiting.length === 0 ? <EmptyState title="All caught up" message="No customer is waiting for an executive." /> : (
            <ul className="divide-y divide-slate-100 -my-2">
              {waiting.slice(0, 6).map((c) => (
                <li key={c.id} className="py-2.5 flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded" onClick={() => nav(`/erp/whatsapp/inbox?c=${c.id}`)}>
                  <Avatar name={c.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                    <div className="text-xs text-slate-500 truncate">{c.escalationReason || c.messages[c.messages.length - 1]?.text}</div>
                  </div>
                  <div className="text-right shrink-0"><ConvBadge status={c.status} /><div className="text-[10px] text-slate-400 mt-0.5">{timeAgo(c.lastAt)}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Top intents" subtitle="What customers ask Btali Assistant">
          <BarsChart data={m.intents.slice(0, 8)} money={false} layout="vertical" series={[{ key: 'value', label: 'Messages' }]} height={260} />
        </Card>
        <Card title="Conversation status">
          <DonutChart data={m.status} money={false} height={200} />
        </Card>
        <Card title="Campaign performance" subtitle={`${camps.filter((c) => c.status === 'SENT').length} broadcasts sent · ${contacts.filter((c) => c.optOut).length} opt-outs`}>
          <div className="space-y-3">
            {funnel.map((f, i) => (
              <div key={f.label}>
                <div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{f.label}</span><span className="font-semibold tabular-nums">{fmtNum(f.value)}{i > 0 && funnel[0].value ? <span className="text-slate-400 font-normal"> · {fmtPct((f.value / funnel[0].value) * 100, 0)}</span> : null}</span></div>
                <Progress value={f.value} max={funnel[0].value || 1} tone={['ink', 'blue', 'green', 'brand'][i]} />
              </div>
            ))}
            <div className="text-xs text-slate-500 pt-1">{tot.failed} failed · {tot.optedOut} opted out after campaigns</div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Campaign pipeline" actions={<Button size="sm" variant="link" iconRight={ArrowRight} onClick={() => nav('/erp/whatsapp/campaigns')}>Campaigns</Button>}>
          {live.length === 0 ? <EmptyState icon={Megaphone} title="No campaigns in the pipeline" /> : (
            <ul className="divide-y divide-slate-100 -my-2">
              {live.map((c) => (
                <li key={c.id} className="py-2.5 flex items-center gap-3">
                  <Megaphone className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-800 truncate">{c.name}</div><div className="text-xs text-slate-500">{c.number}{c.scheduledAt ? ` · ${fmtDate(c.scheduledAt)} ${new Date(c.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}</div></div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Questions the bot could not answer" subtitle="Add them to the knowledge base to improve resolution" actions={<Button size="sm" variant="link" iconRight={ArrowRight} onClick={() => nav('/erp/whatsapp/knowledge')}>Review</Button>}>
          {unanswered.filter((u) => u.status === 'OPEN').length === 0 ? <EmptyState icon={HelpCircle} title="Nothing pending" /> : (
            <ul className="divide-y divide-slate-100 -my-2">
              {unanswered.filter((u) => u.status === 'OPEN').slice(0, 5).map((u) => (
                <li key={u.id} className="py-2.5 flex items-start gap-2.5"><HelpCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /><div className="min-w-0 flex-1"><div className="text-sm text-slate-800">“{u.question}”</div><div className="text-xs text-slate-500">{u.name} · {timeAgo(u.ts)}</div></div><Badge tone="amber">Open</Badge></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
