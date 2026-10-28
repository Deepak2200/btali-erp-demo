import React, { useMemo, useState } from 'react'
import { Plus, Play, Pause, Square, Pencil, Trash2, CalendarClock, Download, Megaphone, PhoneCall, CalendarCheck, Users, Radio, BarChart3 } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Button, Modal, Drawer, Field, Input, Select, FormGrid, Badge, StatusBadge, Progress, EmptyState, Tabs, Alert, DescriptionList, toast, confirm, cx } from '../../../components/ui'
import { BarsChart } from '../../../components/business'
import { CAMPAIGN_TYPES, CALL_OUTCOMES, LEAD_SOURCES, LEAD_STAGES, fmtDur } from '../../../store/slices/ai'
import { fmtINR, fmtPct, fmtDateTime, sum, exportCSV, today, addDays } from '../../../lib/format'
import { useAiRunners, CallDrawer, CallList, STAGE_LABEL, LANG } from './_shared'

const CATS = ['Pumps', 'Air Compressors', 'Vacuum Cleaners', 'Pressure Washers', 'Spraying Equipment', 'Spare Parts']
const REGIONS = ['North', 'South', 'East', 'West', 'Central']

function Chips({ options, value = [], onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const k = typeof o === 'string' ? o : o.value
        const l = typeof o === 'string' ? o : o.label
        const on = value.includes(k)
        return <button key={k} type="button" onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])} className={cx('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors', on ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-300 hover:border-brand-300')}>{l}</button>
      })}
    </div>
  )
}

const blank = (settings) => ({
  name: '', type: 'ENQUIRY_FOLLOW_UP', scriptId: 'scr1', voice: settings.voice, language: settings.language || 'Hindi', callerId: settings.callerIds?.[0]?.id, pace: settings.pace || 12,
  audience: { temperatures: ['HOT', 'WARM'], sources: [], regions: [], stages: [], interests: [] },
  schedule: { mode: 'NOW', startAt: '', windowFrom: settings.callingHours?.from || '10:00', windowTo: settings.callingHours?.to || '19:00' },
  retry: { maxAttempts: settings.maxAttempts || 3, gapMinutes: settings.retryGapMin || 120, retryOn: ['NO_ANSWER'] },
})

function CampaignForm({ initial, onClose }) {
  const settings = useStore((s) => s.aiSettings)
  const scripts = useStore((s) => s.aiScripts)
  const audienceOf = useStore((s) => s.aiAudience)
  const leads = useStore((s) => s.aiLeads)
  const { aiSaveCampaign, aiStartCampaign, aiScheduleCampaign } = useStore()
  const [f, setF] = useState(() => initial || blank(settings))
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const aud = (k) => (v) => set({ audience: { ...f.audience, [k]: v } })
  const audience = useMemo(() => audienceOf(f.audience), [f.audience, leads]) // eslint-disable-line
  const dnd = leads.filter((l) => l.dnd).length
  const save = (launch) => {
    if (!f.name.trim()) { toast.error('Campaign name is required'); return }
    if (!audience.length) { toast.error('No leads match this audience'); return }
    if (f.schedule.mode === 'SCHEDULED' && launch && !f.schedule.startAt) { toast.error('Pick a start date & time'); return }
    const c = aiSaveCampaign(f)
    if (launch) {
      if (f.schedule.mode === 'NOW') { aiStartCampaign(c.id); toast.success('Campaign started', `AI is dialing ${audience.length} leads`) }
      else { aiScheduleCampaign(c.id, new Date(f.schedule.startAt).toISOString()); toast.success('Campaign scheduled', fmtDateTime(new Date(f.schedule.startAt).toISOString())) }
    } else toast.success('Campaign saved as draft')
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="lg" title={initial?.id ? `Edit ${initial.number}` : 'New calling campaign'} subtitle="Define who to call, what the AI says, when and how often"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="secondary" onClick={() => save(false)}>Save draft</Button>
        <Button icon={f.schedule.mode === 'NOW' ? Play : CalendarClock} onClick={() => save(true)}>{f.schedule.mode === 'NOW' ? 'Start now' : 'Schedule'}</Button>
      </>}>
      <div className="space-y-5">
        <FormGrid>
          <Field label="Campaign name" required><Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Rabi pump dealer drive – West" /></Field>
          <Field label="Campaign type"><Select value={f.type} onChange={(e) => set({ type: e.target.value, scriptId: e.target.value === 'PAYMENT_FOLLOW_UP' ? 'scr2' : f.scriptId })} options={Object.entries(CAMPAIGN_TYPES).map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="Script"><Select value={f.scriptId} onChange={(e) => set({ scriptId: e.target.value })} options={scripts.map((s) => ({ value: s.id, label: `${s.name} (v${s.version})` }))} /></Field>
          <Field label="Caller ID"><Select value={f.callerId} onChange={(e) => set({ callerId: e.target.value })} options={(settings.callerIds || []).filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.number} – ${c.label}` }))} /></Field>
          <Field label="AI voice"><Select value={f.voice} onChange={(e) => set({ voice: e.target.value })} options={settings.voices || []} /></Field>
          <Field label="Language"><Select value={f.language} onChange={(e) => set({ language: e.target.value })} options={LANG} /></Field>
        </FormGrid>
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Audience</h4><Badge tone="brand"><Users className="w-3 h-3" />{audience.length} leads match · {dnd} DND excluded</Badge></div>
          <Field label="Temperature"><Chips options={['HOT', 'WARM', 'COLD']} value={f.audience.temperatures} onChange={aud('temperatures')} /></Field>
          <Field label="Stage"><Chips options={LEAD_STAGES.filter((s) => s !== 'CONVERTED').map((s) => ({ value: s, label: STAGE_LABEL[s] }))} value={f.audience.stages} onChange={aud('stages')} /></Field>
          <Field label="Region"><Chips options={REGIONS} value={f.audience.regions} onChange={aud('regions')} /></Field>
          <Field label="Product interest"><Chips options={CATS} value={f.audience.interests} onChange={aud('interests')} /></Field>
          <Field label="Lead source"><Chips options={[...LEAD_SOURCES, 'ERP Receivables']} value={f.audience.sources} onChange={aud('sources')} /></Field>
        </div>
        <FormGrid cols={3}>
          <Field label="Start"><Select value={f.schedule.mode} onChange={(e) => set({ schedule: { ...f.schedule, mode: e.target.value } })} options={[{ value: 'NOW', label: 'Immediately' }, { value: 'SCHEDULED', label: 'At a scheduled time' }]} /></Field>
          {f.schedule.mode === 'SCHEDULED' && <Field label="Start at"><Input type="datetime-local" value={f.schedule.startAt} min={`${today()}T00:00`} onChange={(e) => set({ schedule: { ...f.schedule, startAt: e.target.value } })} /></Field>}
          <Field label="Calling window" hint="Calls only within these hours (IST)"><div className="flex gap-2"><Input type="time" value={f.schedule.windowFrom} onChange={(e) => set({ schedule: { ...f.schedule, windowFrom: e.target.value } })} /><Input type="time" value={f.schedule.windowTo} onChange={(e) => set({ schedule: { ...f.schedule, windowTo: e.target.value } })} /></div></Field>
          <Field label="Max attempts per lead"><Select value={f.retry.maxAttempts} onChange={(e) => set({ retry: { ...f.retry, maxAttempts: Number(e.target.value) } })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}` }))} /></Field>
          <Field label="Retry gap"><Select value={f.retry.gapMinutes} onChange={(e) => set({ retry: { ...f.retry, gapMinutes: Number(e.target.value) } })} options={[30, 60, 90, 120, 240, 1440].map((n) => ({ value: n, label: n >= 1440 ? 'Next day' : `${n} min` }))} /></Field>
          <Field label="Dialing pace"><Select value={f.pace} onChange={(e) => set({ pace: Number(e.target.value) })} options={[6, 12, 20, 30].map((n) => ({ value: n, label: `${n} calls / min` }))} /></Field>
        </FormGrid>
      </div>
    </Modal>
  )
}

function Results({ c, onClose }) {
  const calls = useStore((s) => (s.aiCalls || []).filter((k) => k.campaignId === c.id))
  const leads = useStore((s) => s.aiLeads)
  const [tab, setTab] = useState('summary')
  const [open, setOpen] = useState(null)
  const conn = calls.filter((k) => k.status === 'CONNECTED')
  const mix = Object.keys(CALL_OUTCOMES).map((k) => ({ label: CALL_OUTCOMES[k].label, calls: calls.filter((x) => x.outcome === k).length, color: CALL_OUTCOMES[k].color }))
  const exportIt = () => exportCSV(`${c.number}-results.csv`, calls, [
    { header: 'Call', key: 'number' }, { header: 'Date', value: (k) => fmtDateTime(k.startedAt) }, { header: 'Lead', value: (k) => leads.find((l) => l.id === k.leadId)?.name },
    { header: 'Company', value: (k) => leads.find((l) => l.id === k.leadId)?.company }, { header: 'Phone', value: (k) => leads.find((l) => l.id === k.leadId)?.phone },
    { header: 'Attempt', key: 'attempt' }, { header: 'Outcome', value: (k) => CALL_OUTCOMES[k.outcome]?.label }, { header: 'Duration', value: (k) => fmtDur(k.durationSec) },
    { header: 'Sentiment', key: 'sentiment' }, { header: 'Cost', key: 'cost' }, { header: 'Summary', key: 'summary' }, { header: 'Next action', key: 'nextAction' },
  ])
  return (
    <Drawer open onClose={onClose} title={c.name} subtitle={`${c.number} · ${CAMPAIGN_TYPES[c.type]}`} width="max-w-3xl" footer={<Button variant="secondary" icon={Download} onClick={exportIt}>Export results CSV</Button>}>
      <Grid cols={4}>
        <Stat label="Calls" value={calls.length} />
        <Stat label="Connected" value={fmtPct(calls.length ? (conn.length / calls.length) * 100 : 0)} tone="ink" />
        <Stat label="Appointments" value={calls.filter((k) => k.outcome === 'APPOINTMENT').length} tone="green" />
        <Stat label="Cost" value={fmtINR(sum(calls, (k) => k.cost))} tone="amber" />
      </Grid>
      <Tabs className="mt-4" value={tab} onChange={setTab} tabs={[{ key: 'summary', label: 'Outcomes' }, { key: 'calls', label: 'Calls', count: calls.length }, { key: 'setup', label: 'Setup' }]} />
      <div className="pt-3">
        {tab === 'summary' && <BarsChart data={mix} money={false} series={[{ key: 'calls', label: 'Calls' }]} height={240} />}
        {tab === 'calls' && <CallList calls={calls} onOpen={setOpen} showLead />}
        {tab === 'setup' && <DescriptionList items={[
          ['Status', <StatusBadge status={c.status} />], ['Voice', c.voice], ['Language', c.language], ['Pace', `${c.pace} calls/min`],
          ['Calling window', `${c.schedule?.windowFrom} – ${c.schedule?.windowTo}`], ['Retries', `${c.retry?.maxAttempts} attempts, ${c.retry?.gapMinutes} min gap`],
          ['Audience', Object.entries(c.audience || {}).filter(([, v]) => v?.length).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ') || 'All leads'],
          ['Started', c.startedAt ? fmtDateTime(c.startedAt) : '—'], ['Completed', c.completedAt ? fmtDateTime(c.completedAt) : c.stoppedAt ? `Stopped ${fmtDateTime(c.stoppedAt)}` : '—'], ['DND skipped', c.dndSkipped || 0],
        ]} />}
      </div>
      {open && <CallDrawer callId={open} onClose={() => setOpen(null)} />}
    </Drawer>
  )
}

function CampaignCard({ c, onEdit, onResults }) {
  const calls = useStore((s) => s.aiCalls || [])
  const leads = useStore((s) => s.aiLeads || [])
  const audienceOf = useStore((s) => s.aiAudience)
  const { aiStartCampaign, aiPauseCampaign, aiStopCampaign, aiDeleteCampaign } = useStore()
  const mine = calls.filter((k) => k.campaignId === c.id)
  const total = c.total || audienceOf(c.audience).length
  const remaining = (c.queue?.length || 0) + (c.current ? 1 : 0)
  const done = c.startedAt ? Math.max(0, total - remaining) : 0
  const cur = c.current && leads.find((l) => l.id === c.current.leadId)
  const last = mine[0]
  const stat = (label, v) => <div><div className="text-[11px] text-slate-500">{label}</div><div className="text-sm font-bold tabular-nums">{v}</div></div>
  return (
    <Card className={cx(c.status === 'RUNNING' && 'ring-2 ring-brand-300')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 truncate">{c.name}</div>
          <div className="text-xs text-slate-500">{c.number} · {CAMPAIGN_TYPES[c.type]} · {c.voice?.split(' (')[0]}</div>
        </div>
        <StatusBadge status={c.status} />
      </div>
      <Progress value={done} max={total || 1} showLabel className="mt-3" tone={c.status === 'COMPLETED' ? 'green' : c.status === 'PAUSED' || c.status === 'STOPPED' ? 'amber' : 'brand'} />
      <div className="text-[11px] text-slate-500 mt-1">{done} of {total} leads processed{c.retries ? ` · ${c.retries} retries` : ''}{c.status === 'SCHEDULED' && c.schedule?.startAt ? ` · starts ${fmtDateTime(c.schedule.startAt)}` : ''}</div>
      {c.status === 'RUNNING' && (
        <div className="mt-2 text-xs rounded-lg bg-brand-50 text-brand-800 px-2.5 py-2 space-y-1">
          <div className="flex items-center gap-1.5 font-medium"><Radio className="w-3.5 h-3.5 animate-pulse" />{cur ? `On call: ${cur.name} · ${cur.city}${c.current.attempt > 1 ? ` (retry ${c.current.attempt})` : ''}` : 'Dialing next lead…'}</div>
          {last && <div className="text-brand-700/80 truncate">Last: {leads.find((l) => l.id === last.leadId)?.name} → {CALL_OUTCOMES[last.outcome].label}</div>}
        </div>
      )}
      <div className="grid grid-cols-4 gap-2 mt-3">
        {stat('Calls', mine.length)}
        {stat('Connected', mine.filter((k) => k.status === 'CONNECTED').length)}
        {stat('Interested', mine.filter((k) => ['INTERESTED', 'APPOINTMENT', 'PROMISE_TO_PAY'].includes(k.outcome)).length)}
        {stat('Appts', mine.filter((k) => k.outcome === 'APPOINTMENT').length)}
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {['DRAFT', 'SCHEDULED'].includes(c.status) && <Button size="sm" icon={Play} onClick={() => { aiStartCampaign(c.id); toast.success('Campaign started', `${audienceOf(c.audience).length} leads queued`) }}>Start now</Button>}
        {c.status === 'RUNNING' && <Button size="sm" variant="secondary" icon={Pause} onClick={() => { aiPauseCampaign(c.id); toast.info('Campaign paused') }}>Pause</Button>}
        {c.status === 'PAUSED' && <Button size="sm" icon={Play} onClick={() => { aiStartCampaign(c.id); toast.success('Campaign resumed') }}>Resume</Button>}
        {['RUNNING', 'PAUSED'].includes(c.status) && <Button size="sm" variant="ghost" icon={Square} onClick={async () => { if (await confirm({ title: `Stop ${c.name}?`, message: `${remaining} queued leads will not be called. This cannot be resumed.`, tone: 'danger', confirmText: 'Stop campaign' })) { aiStopCampaign(c.id); toast.info('Campaign stopped') } }}>Stop</Button>}
        {['DRAFT', 'SCHEDULED'].includes(c.status) && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => onEdit(c)}>Edit</Button>}
        {c.startedAt && <Button size="sm" variant="secondary" icon={BarChart3} onClick={() => onResults(c)}>Results</Button>}
        {['DRAFT', 'STOPPED', 'COMPLETED'].includes(c.status) && <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600" onClick={async () => { if (await confirm({ title: 'Delete campaign?', message: 'Call records are kept in Call Logs.', tone: 'danger', confirmText: 'Delete' })) { aiDeleteCampaign(c.id); toast.success('Campaign deleted') } }} />}
      </div>
    </Card>
  )
}

export default function CallCampaigns() {
  useAiRunners()
  const campaigns = useStore((s) => s.aiCampaigns || [])
  const calls = useStore((s) => s.aiCalls || [])
  const [form, setForm] = useState(null)
  const [res, setRes] = useState(null)
  const [tab, setTab] = useState('ALL')
  const list = campaigns.filter((c) => tab === 'ALL' || (tab === 'ACTIVE' ? ['RUNNING', 'PAUSED', 'SCHEDULED'].includes(c.status) : tab === 'DRAFT' ? c.status === 'DRAFT' : ['COMPLETED', 'STOPPED'].includes(c.status)))
  const campCalls = calls.filter((k) => k.campaignId)
  return (
    <div>
      <PageHeader title="Call Campaigns" subtitle="Promotional, enquiry follow-up, reminder and payment campaigns run by the AI voice agent" actions={<Button icon={Plus} onClick={() => setForm('new')}>New campaign</Button>} />
      <Grid cols={4}>
        <Stat label="Running now" value={campaigns.filter((c) => c.status === 'RUNNING').length} sub={`${campaigns.filter((c) => c.status === 'PAUSED').length} paused`} icon={Radio} />
        <Stat label="Campaign calls" value={campCalls.length} sub={`${campCalls.filter((k) => k.status === 'CONNECTED').length} connected`} icon={PhoneCall} tone="ink" />
        <Stat label="Appointments booked" value={campCalls.filter((k) => k.outcome === 'APPOINTMENT').length} icon={CalendarCheck} tone="green" />
        <Stat label="Campaign spend" value={fmtINR(sum(campCalls, (k) => k.cost))} icon={Megaphone} tone="amber" />
      </Grid>
      <Tabs className="mt-5" value={tab} onChange={setTab} tabs={[{ key: 'ALL', label: 'All', count: campaigns.length }, { key: 'ACTIVE', label: 'Active & scheduled' }, { key: 'DRAFT', label: 'Drafts' }, { key: 'DONE', label: 'Completed' }]} />
      {list.length ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">{list.map((c) => <CampaignCard key={c.id} c={c} onEdit={setForm} onResults={setRes} />)}</div>
        : <Card className="mt-4"><EmptyState icon={Megaphone} title="No campaigns here" action={<Button onClick={() => setForm('new')}>Create campaign</Button>} /></Card>}
      {form && <CampaignForm initial={form === 'new' ? null : { ...form, schedule: { ...form.schedule, startAt: form.schedule?.startAt ? form.schedule.startAt.slice(0, 16) : '' } }} onClose={() => setForm(null)} />}
      {res && <Results c={res} onClose={() => setRes(null)} />}
    </div>
  )
}
