import React, { useMemo, useState } from 'react'
import { Download, MessageCircle, Bot, Hand, Star, Timer, Ban } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Button, Segmented, StatusBadge, toast } from '../../../components/ui'
import { TrendChart, BarsChart, DonutChart } from '../../../components/business'
import DataTable from '../../../components/DataTable'
import { exportCSV, fmtNum, fmtPct, fmtDateTime } from '../../../lib/format'
import { waMetrics, fmtSecs, useWaRunners } from './_shared'

export default function WaAnalytics() {
  useWaRunners()
  const all = useStore((s) => s.waConversations) || []
  const camps = useStore((s) => s.waCampaigns) || []
  const contacts = useStore((s) => s.waContacts) || []
  const [range, setRange] = useState('14')
  const days = Number(range)
  const convs = useMemo(() => { const from = Date.now() - days * 86400000; return all.filter((c) => new Date(c.lastAt).getTime() >= from) }, [all, days])
  const m = useMemo(() => waMetrics(convs, days), [convs, days])
  const hourly = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ label: `${String(i).padStart(2, '0')}:00`, messages: 0 }))
    for (const c of convs) for (const x of c.messages) if (x.from === 'customer') h[new Date(x.ts).getHours()].messages++
    return h.filter((_, i) => i >= 6 && i <= 23)
  }, [convs])
  const reasons = useMemo(() => {
    const r = {}
    for (const c of convs) if (c.escalationReason) r[c.escalationReason] = (r[c.escalationReason] || 0) + 1
    return Object.entries(r).map(([name, value]) => ({ name, value }))
  }, [convs])
  const campRows = camps.filter((c) => c.stats).map((c) => ({ ...c, ...c.stats, deliveryRate: c.stats.targeted ? (c.stats.delivered / c.stats.targeted) * 100 : 0, readRate: c.stats.delivered ? (c.stats.read / c.stats.delivered) * 100 : 0, replyRate: c.stats.read ? (c.stats.replied / c.stats.read) * 100 : 0 }))

  const exportAll = () => {
    exportCSV(`whatsapp-daily-${days}d.csv`, m.daily, [{ header: 'Date', value: (d) => d.date }, { header: 'New conversations', value: (d) => d.conversations }, { header: 'Customer messages', value: (d) => d.inbound }, { header: 'Bot replies', value: (d) => d.bot }, { header: 'Agent replies', value: (d) => d.agent }])
    exportCSV(`whatsapp-intents-${days}d.csv`, m.intents, [{ header: 'Intent', value: (d) => d.label }, { header: 'Messages', value: (d) => d.value }])
    toast.success('Reports downloaded', 'Daily volume and intent CSVs')
  }
  return (
    <div className="space-y-4">
      <PageHeader title="WhatsApp Analytics" subtitle="Volumes, intents, customer satisfaction, response times and campaign performance"
        actions={<><Segmented value={range} onChange={setRange} options={[{ key: '7', label: '7 days' }, { key: '14', label: '14 days' }, { key: '30', label: '30 days' }]} /><Button variant="secondary" icon={Download} onClick={exportAll}>Export CSV</Button></>} />
      <Grid cols={6}>
        <Stat label="Conversations" value={fmtNum(m.total)} icon={MessageCircle} tone="green" />
        <Stat label="Bot resolution" value={fmtPct(m.botResolutionRate, 0)} icon={Bot} tone="blue" />
        <Stat label="Handover rate" value={fmtPct(m.handoverRate, 0)} icon={Hand} tone="amber" />
        <Stat label="CSAT" value={m.csatCount ? `${m.csat.toFixed(1)}/5` : '—'} sub={`${m.csatCount} ratings`} icon={Star} tone="violet" />
        <Stat label="Bot first reply" value={fmtSecs(m.firstResponseSec)} icon={Timer} tone="ink" />
        <Stat label="Opt-outs" value={contacts.filter((c) => c.optOut).length} icon={Ban} tone="red" />
      </Grid>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Daily volume" subtitle="Messages per day" className="xl:col-span-2">
          <TrendChart data={m.daily} money={false} type="line" series={[{ key: 'inbound', label: 'Customer' }, { key: 'bot', label: 'Bot' }, { key: 'agent', label: 'Agent' }, { key: 'conversations', label: 'New chats', dashed: true }]} height={260} />
        </Card>
        <Card title="Busiest hours" subtitle="Customer messages by hour of day">
          <BarsChart data={hourly} money={false} series={[{ key: 'messages', label: 'Messages' }]} height={260} />
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Intent distribution" actions={<Button size="sm" variant="ghost" icon={Download} onClick={() => exportCSV('whatsapp-intents.csv', m.intents, [{ header: 'Intent', value: (d) => d.label }, { header: 'Messages', value: (d) => d.value }])}>CSV</Button>}>
          <BarsChart data={m.intents.slice(0, 10)} money={false} layout="vertical" series={[{ key: 'value', label: 'Messages' }]} height={300} />
        </Card>
        <Card title="Customer satisfaction" subtitle="CSAT ratings collected after chats">
          <BarsChart data={m.csatDist.map((d) => ({ label: d.name, value: d.value }))} money={false} series={[{ key: 'value', label: 'Ratings' }]} height={200} />
          <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
            <div className="bg-slate-50 rounded-lg p-2.5"><div className="text-[11px] text-slate-500">Bot first reply</div><div className="font-bold">{fmtSecs(m.firstResponseSec)}</div></div>
            <div className="bg-slate-50 rounded-lg p-2.5"><div className="text-[11px] text-slate-500">Agent pick-up</div><div className="font-bold">{m.agentResponseSec ? fmtSecs(m.agentResponseSec) : '—'}</div></div>
          </div>
        </Card>
        <Card title="Escalation reasons">
          {reasons.length ? <DonutChart data={reasons} money={false} height={200} /> : <div className="text-sm text-slate-400 py-10 text-center">No escalations in this period</div>}
        </Card>
      </div>
      <Card title="Campaign performance" padded={false}>
        <DataTable rows={campRows} exportName="whatsapp-campaign-performance" searchable={false}
          columns={[
            { key: 'name', header: 'Campaign', render: (c) => <div><div className="font-medium">{c.name}</div><div className="text-[11px] text-slate-500">{c.number}</div></div> },
            { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
            { key: 'sentAt', header: 'Sent', render: (c) => (c.sentAt ? fmtDateTime(c.sentAt) : '—') },
            { key: 'targeted', header: 'Targeted', align: 'right' },
            { key: 'delivered', header: 'Delivered', align: 'right' },
            { key: 'read', header: 'Read', align: 'right' },
            { key: 'replied', header: 'Replied', align: 'right' },
            { key: 'failed', header: 'Failed', align: 'right' },
            { key: 'deliveryRate', header: 'Delivery %', align: 'right', render: (c) => fmtPct(c.deliveryRate, 0) },
            { key: 'readRate', header: 'Read %', align: 'right', render: (c) => fmtPct(c.readRate, 0) },
            { key: 'replyRate', header: 'Reply %', align: 'right', render: (c) => fmtPct(c.replyRate, 0) },
          ]} />
      </Card>
    </div>
  )
}
