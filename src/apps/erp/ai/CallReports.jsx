import React, { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Button, Tabs, Segmented, Grid, Stat } from '../../../components/ui'
import { BarsChart, TrendChart } from '../../../components/business'
import { CALL_OUTCOMES, fmtDur } from '../../../store/slices/ai'
import { fmtINR, fmtPct, sum, exportCSV, daysAgo, fmtDate, addDays, today } from '../../../lib/format'
import { useAiRunners } from './_shared'

const agg = (calls, keyFn, labelFn) => {
  const m = new Map()
  for (const c of calls) {
    const k = keyFn(c)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(c)
  }
  return [...m.entries()].map(([k, list]) => {
    const conn = list.filter((c) => c.status === 'CONNECTED')
    const o = (x) => list.filter((c) => c.outcome === x).length
    return {
      key: k, label: labelFn(k), attempted: list.length, answered: conn.length, unreachable: o('NO_ANSWER'), connectRate: list.length ? (conn.length / list.length) * 100 : 0,
      interested: o('INTERESTED'), appointments: o('APPOINTMENT'), callbacks: o('CALLBACK'), promises: o('PROMISE_TO_PAY'), notInterested: o('NOT_INTERESTED'),
      transfers: list.filter((c) => c.unanswered?.length).length, talk: sum(conn, (c) => c.durationSec), avgDur: conn.length ? sum(conn, (c) => c.durationSec) / conn.length : 0, cost: sum(list, (c) => c.cost),
      conversion: conn.length ? ((o('APPOINTMENT') + o('INTERESTED')) / conn.length) * 100 : 0,
    }
  })
}
const COLS = [
  ['label', 'Group'], ['attempted', 'Attempted'], ['answered', 'Answered'], ['unreachable', 'Unreachable'], ['connectRate', 'Connect %'], ['interested', 'Interested'], ['appointments', 'Appointments'],
  ['callbacks', 'Callbacks'], ['promises', 'Promises to pay'], ['notInterested', 'Not interested'], ['transfers', 'Transfer requests'], ['avgDur', 'Avg talk'], ['conversion', 'Conversion %'], ['cost', 'Cost'],
]
const fmtCell = (k, v) => (k === 'connectRate' || k === 'conversion' ? fmtPct(v) : k === 'avgDur' ? fmtDur(v) : k === 'cost' ? fmtINR(v) : v)

export default function CallReports() {
  useAiRunners()
  const calls = useStore((s) => s.aiCalls || [])
  const leads = useStore((s) => s.aiLeads || [])
  const campaigns = useStore((s) => s.aiCampaigns || [])
  const users = useStore((s) => s.users)
  const [by, setBy] = useState('campaign')
  const [range, setRange] = useState('30')
  const leadOf = useMemo(() => Object.fromEntries(leads.map((l) => [l.id, l])), [leads])
  const from = daysAgo(Number(range) - 1)
  const inRange = calls.filter((c) => c.startedAt.slice(0, 10) >= from)
  const rows = useMemo(() => {
    const r = by === 'campaign' ? agg(inRange, (c) => c.campaignId || (c.direction === 'INBOUND' ? 'INBOUND' : 'ADHOC'), (k) => campaigns.find((x) => x.id === k)?.name || (k === 'INBOUND' ? 'Inbound calls' : 'One-off / manual calls'))
      : by === 'outcome' ? agg(inRange, (c) => c.outcome, (k) => CALL_OUTCOMES[k]?.label || k)
        : by === 'salesperson' ? agg(inRange, (c) => leadOf[c.leadId]?.assignedTo || '—', (k) => users.find((u) => u.id === k)?.name || 'Unassigned')
          : by === 'source' ? agg(inRange, (c) => leadOf[c.leadId]?.source || '—', (k) => k)
            : agg(inRange, (c) => c.startedAt.slice(0, 10), (k) => fmtDate(k)).sort((a, b) => a.key.localeCompare(b.key))
    return by === 'day' ? r : r.sort((a, b) => b.attempted - a.attempted)
  }, [inRange, by, campaigns, users, leadOf]) // eslint-disable-line
  const total = agg(inRange, () => 'all', () => 'Total')[0]
  const daily = useMemo(() => {
    const out = []
    for (let d = from; d <= today(); d = addDays(d, 1)) {
      const l = inRange.filter((c) => c.startedAt.slice(0, 10) === d)
      out.push({ label: fmtDate(d).slice(0, 6), attempted: l.length, answered: l.filter((c) => c.status === 'CONNECTED').length })
    }
    return out
  }, [inRange, from])
  const csv = () => exportCSV(`btali-calling-report-by-${by}.csv`, total ? [...rows, total] : rows, COLS.map(([k, h]) => ({ header: h, value: (r) => (typeof r[k] === 'number' && !['attempted', 'answered'].includes(k) ? Math.round(r[k] * 100) / 100 : r[k]) })))
  const callsCsv = () => exportCSV('btali-call-register.csv', inRange, [
    { header: 'Call', key: 'number' }, { header: 'Date', value: (c) => c.startedAt.slice(0, 16).replace('T', ' ') }, { header: 'Lead', value: (c) => leadOf[c.leadId]?.name }, { header: 'Company', value: (c) => leadOf[c.leadId]?.company },
    { header: 'Phone', value: (c) => leadOf[c.leadId]?.phone }, { header: 'Campaign', value: (c) => campaigns.find((x) => x.id === c.campaignId)?.name || '' }, { header: 'Direction', key: 'direction' }, { header: 'Outcome', value: (c) => CALL_OUTCOMES[c.outcome]?.label },
    { header: 'Duration (s)', key: 'durationSec' }, { header: 'Sentiment', key: 'sentiment' }, { header: 'Cost', key: 'cost' }, { header: 'Summary', key: 'summary' }, { header: 'Next action', key: 'nextAction' },
  ])
  return (
    <div>
      <PageHeader title="Calling Reports" subtitle="Attempted & answered calls, unreachable contacts, callbacks, promises to pay, transfer requests and cost"
        actions={<>
          <Segmented size="sm" value={range} onChange={setRange} options={[{ key: '7', label: '7 days' }, { key: '30', label: '30 days' }, { key: '90', label: '90 days' }]} />
          <Button variant="secondary" icon={Download} onClick={callsCsv}>Call register CSV</Button>
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>PDF</Button>
        </>} />
      <Grid cols={6}>
        <Stat label="Attempted" value={total?.attempted || 0} />
        <Stat label="Answered" value={total?.answered || 0} sub={fmtPct(total?.connectRate || 0)} tone="ink" />
        <Stat label="Unreachable" value={total?.unreachable || 0} tone="red" />
        <Stat label="Appointments" value={total?.appointments || 0} tone="green" />
        <Stat label="Promises to pay" value={total?.promises || 0} tone="violet" />
        <Stat label="Cost" value={fmtINR(total?.cost || 0)} tone="amber" />
      </Grid>
      <Card title="Daily call volume" className="mt-4"><TrendChart data={daily} money={false} series={[{ key: 'attempted', label: 'Attempted' }, { key: 'answered', label: 'Answered' }]} height={220} /></Card>
      <Card className="mt-4" padded={false}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 pt-3">
          <Tabs value={by} onChange={setBy} tabs={[{ key: 'campaign', label: 'By campaign' }, { key: 'outcome', label: 'By outcome' }, { key: 'salesperson', label: 'By salesperson' }, { key: 'source', label: 'By lead source' }, { key: 'day', label: 'By day' }]} />
          <Button size="sm" variant="secondary" icon={Download} onClick={csv} className="mb-2 no-print">Export CSV</Button>
        </div>
        {by !== 'day' && <div className="px-4 pt-3"><BarsChart data={rows.slice(0, 10)} xKey="label" money={false} layout="vertical" stacked height={Math.max(160, rows.slice(0, 10).length * 34)} series={[{ key: 'appointments', label: 'Appointments', color: '#059669' }, { key: 'interested', label: 'Interested', color: '#0d9488' }, { key: 'callbacks', label: 'Callbacks', color: '#0284c7' }, { key: 'promises', label: 'Promise to pay', color: '#7c3aed' }, { key: 'notInterested', label: 'Not interested', color: '#dc2626' }, { key: 'unreachable', label: 'Unreachable', color: '#cbd5e1' }]} /></div>}
        <div className="overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase text-slate-500 border-b">{COLS.map(([k, h]) => <th key={k} className={k === 'label' ? 'text-left py-2 pr-3' : 'text-right py-2 px-2 whitespace-nowrap'}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.key} className="border-b border-slate-100">{COLS.map(([k]) => <td key={k} className={k === 'label' ? 'py-2 pr-3 font-medium whitespace-nowrap' : 'py-2 px-2 text-right tabular-nums'}>{fmtCell(k, r[k])}</td>)}</tr>)}
              {total && <tr className="font-semibold bg-slate-50">{COLS.map(([k]) => <td key={k} className={k === 'label' ? 'py-2 pr-3' : 'py-2 px-2 text-right tabular-nums'}>{fmtCell(k, total[k])}</td>)}</tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
