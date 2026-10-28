// Shared building blocks for the AI Calling Bot screens.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Bot, User, Headphones, PhoneCall, PhoneOff, PhoneIncoming, PhoneOutgoing, Sparkles, ListChecks, Download, MessageCircle, Flame, Snowflake, Sun } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import { Badge, StatusBadge, Button, Drawer, DescriptionList, Card, Avatar, Field, Input, Select, Textarea, Modal, FormGrid, toast, cx, EmptyState, Tabs } from '../../../components/ui'
import { UserName } from '../../../components/business'
import { CALL_OUTCOMES, fmtDur } from '../../../store/slices/ai'
import { fmtDateTime, fmtDate, timeAgo, fmtINR, downloadText, today, addDays } from '../../../lib/format'

export const useAiRunners = () => {
  const resume = useStore((s) => s.aiResumeRunners)
  useEffect(() => { resume?.() }, [resume])
}
export const OutcomeBadge = ({ outcome }) => (outcome ? <Badge tone={CALL_OUTCOMES[outcome]?.tone} dot>{CALL_OUTCOMES[outcome]?.label || outcome}</Badge> : <span className="text-slate-400 text-xs">—</span>)
export const TempBadge = ({ t }) => {
  const I = t === 'HOT' ? Flame : t === 'WARM' ? Sun : Snowflake
  return <Badge tone={t === 'HOT' ? 'red' : t === 'WARM' ? 'amber' : 'blue'}><I className="w-3 h-3" />{t}</Badge>
}
export const SentimentBadge = ({ s, score }) => (s ? <Badge tone={s === 'POSITIVE' ? 'green' : s === 'NEGATIVE' ? 'red' : 'gray'}>{s === 'POSITIVE' ? '😊' : s === 'NEGATIVE' ? '😟' : '😐'} {s.toLowerCase()}{score != null ? ` ${score > 0 ? '+' : ''}${score.toFixed(2)}` : ''}</Badge> : <span className="text-slate-400 text-xs">—</span>)
export const ScoreBar = ({ score }) => (
  <div className="flex items-center gap-2 min-w-[90px]">
    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={cx('h-full rounded-full', score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-amber-500' : 'bg-sky-500')} style={{ width: `${score}%` }} /></div>
    <span className="text-xs tabular-nums font-semibold text-slate-700 w-6 text-right">{score}</span>
  </div>
)
export const STAGE_LABEL = { NEW: 'New', CONTACTED: 'Contacted', QUALIFIED: 'Qualified', APPOINTMENT: 'Appointment', CONVERTED: 'Converted', LOST: 'Lost' }
export const StageBadge = ({ stage }) => <Badge tone={{ NEW: 'gray', CONTACTED: 'blue', QUALIFIED: 'teal', APPOINTMENT: 'violet', CONVERTED: 'green', LOST: 'red' }[stage]}>{STAGE_LABEL[stage] || stage}</Badge>
export const LANG = ['Hindi', 'English', 'Marathi', 'Gujarati', 'Tamil']

/** Recording playback bar + synced transcript */
export function TranscriptPlayer({ call }) {
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const ref = useRef(null)
  const dur = call.durationSec || 0
  useEffect(() => { setPos(0); setPlaying(false) }, [call.id])
  useEffect(() => {
    if (!playing) return
    const h = setInterval(() => setPos((p) => { if (p + 0.25 * speed >= dur) { setPlaying(false); return dur } return p + 0.25 * speed }), 250)
    return () => clearInterval(h)
  }, [playing, speed, dur])
  const activeIdx = call.transcript.reduce((a, l, i) => (l.t <= pos ? i : a), -1)
  useEffect(() => { ref.current?.querySelector(`[data-i="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [activeIdx])
  const bars = useMemo(() => Array.from({ length: 64 }, (_, i) => 20 + Math.abs(Math.sin(i * 1.7 + (call.number?.length || 3)) * 70) * (0.5 + ((i * 37) % 11) / 20)), [call.id]) // eslint-disable-line
  if (!dur) return <EmptyState icon={PhoneOff} title="Call not connected" message={call.summary} />
  return (
    <div>
      <div className="rounded-xl bg-ink-900 text-white p-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { if (pos >= dur) setPos(0); setPlaying((p) => !p) }} className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center shrink-0" aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-end gap-[2px] h-8 cursor-pointer" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos(Math.round(((e.clientX - r.left) / r.width) * dur)) }}>
              {bars.map((h, i) => <div key={i} className={cx('flex-1 rounded-sm', i / bars.length <= pos / dur ? 'bg-brand-400' : 'bg-white/25')} style={{ height: `${Math.min(100, h)}%` }} />)}
            </div>
            <div className="flex justify-between text-[11px] text-white/60 mt-1 tabular-nums"><span>{fmtDur(pos)}</span><span>{call.recording}</span><span>{fmtDur(dur)}</span></div>
          </div>
          <button type="button" onClick={() => setSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))} className="text-xs font-semibold px-2 py-1 rounded bg-white/10 hover:bg-white/20 shrink-0">{speed}×</button>
        </div>
      </div>
      <div ref={ref} className="mt-3 space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {call.transcript.map((l, i) => {
          const ai = l.who === 'AI'
          return (
            <div key={i} data-i={i} onClick={() => setPos(l.t)} className={cx('flex gap-2 cursor-pointer', ai ? '' : 'flex-row-reverse')}>
              <div className={cx('w-7 h-7 rounded-full flex items-center justify-center shrink-0', ai ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-600')}>{ai ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}</div>
              <div className={cx('max-w-[80%] rounded-2xl px-3 py-2 text-sm transition-colors', ai ? 'bg-brand-50 text-slate-800 rounded-tl-sm' : 'bg-slate-100 text-slate-800 rounded-tr-sm', i === activeIdx && playing && 'ring-2 ring-brand-400')}>
                <div className="text-[10px] font-semibold text-slate-400 mb-0.5">{ai ? 'AI agent' : 'Customer'} · {fmtDur(l.t)}</div>
                {l.text}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const transcriptText = (call, lead) => [`Btali International – call ${call.number}`, `Lead: ${lead?.name || ''} (${lead?.company || ''}) ${lead?.phone || ''}`, `Date: ${fmtDateTime(call.startedAt)} · Duration ${fmtDur(call.durationSec)} · Outcome: ${CALL_OUTCOMES[call.outcome]?.label}`, '', `AI summary: ${call.summary}`, `Next action: ${call.nextAction}`, '', ...call.transcript.map((l) => `[${fmtDur(l.t)}] ${l.who === 'AI' ? 'AI agent' : 'Customer'}: ${l.text}`)].join('\n')

/** Call detail drawer used by Call Logs, Leads, Dashboard */
export function CallDrawer({ callId, onClose }) {
  const call = useStore((s) => (s.aiCalls || []).find((c) => c.id === callId))
  const lead = useStore((s) => (s.aiLeads || []).find((l) => l.id === call?.leadId))
  const campaign = useStore((s) => (s.aiCampaigns || []).find((c) => c.id === call?.campaignId))
  const createFollowUp = useStore((s) => s.aiCreateFollowUp)
  const hasTasks = useStore((s) => Array.isArray(s.tasks))
  const users = useStore((s) => s.users)
  const [fu, setFu] = useState(null)
  if (!call) return null
  const submit = () => {
    const id = createFollowUp(call.id, fu)
    toast.success(id ? 'Follow-up task created' : 'Follow-up reminder sent', `${lead?.name} · due ${fmtDate(fu.dueDate)}`)
    setFu(null)
  }
  return (
    <Drawer open onClose={onClose} title={`${call.number} · ${lead?.name || ''}`} subtitle={<span className="flex items-center gap-2 flex-wrap">{call.direction === 'INBOUND' ? <PhoneIncoming className="w-3.5 h-3.5" /> : <PhoneOutgoing className="w-3.5 h-3.5" />}{fmtDateTime(call.startedAt)} · {lead?.company} · {lead?.phone}</span>} width="max-w-3xl"
      footer={<>
        <Button variant="secondary" icon={Download} onClick={() => downloadText(`${call.number}-transcript.txt`, transcriptText(call, lead))} disabled={!call.transcript.length}>Transcript</Button>
        {call.taskId ? <Badge tone="green">Follow-up {call.taskId === 'NOTIFIED' ? 'reminder sent' : 'task created'}</Badge>
          : <Button icon={ListChecks} onClick={() => setFu({ title: `Follow up ${lead?.name} – ${call.nextAction}`, dueDate: lead?.nextFollowUp && lead.nextFollowUp >= today() ? lead.nextFollowUp : addDays(today(), 1), assigneeId: lead?.assignedTo || 'u5', notes: call.summary })}>Create follow-up</Button>}
      </>}>
      <div className="flex flex-wrap gap-2 mb-4">
        <OutcomeBadge outcome={call.outcome} />
        <SentimentBadge s={call.sentiment} score={call.sentiment ? call.sentimentScore : null} />
        <Badge tone="gray">{call.language}</Badge>
        <Badge tone="ink">{call.handledBy === 'AI' ? `AI voice: ${call.voice.split(' (')[0]}` : 'Sales executive'}</Badge>
        {call.scoreDelta ? <Badge tone={call.scoreDelta > 0 ? 'green' : 'red'}>Lead score {call.scoreDelta > 0 ? '+' : ''}{call.scoreDelta}</Badge> : null}
      </div>
      <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-3 mb-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 mb-1"><Sparkles className="w-3.5 h-3.5" />AI summary</div>
        <p className="text-sm text-slate-800">{call.summary}</p>
        <div className="text-sm mt-2"><span className="font-semibold text-slate-700">Next action: </span>{call.nextAction}</div>
        {call.followUps?.length > 0 && <div className="text-xs text-emerald-700 mt-1.5 flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />Sent automatically: {call.followUps.join(', ')}</div>}
        {call.unanswered?.length > 0 && <div className="text-xs text-amber-700 mt-1">Unanswered question: “{call.unanswered.join('”, “')}”</div>}
      </div>
      <DescriptionList cols={4} items={[['Duration', fmtDur(call.durationSec)], ['Ring time', `${call.ringSec || 0}s`], ['Attempt', call.attempt], ['Cost', fmtINR(call.cost, true)], ['Campaign', campaign?.name || (call.direction === 'INBOUND' ? 'Inbound line' : 'Manual')], ['Salesperson', <UserName id={lead?.assignedTo} />], ['Lead score now', lead?.score], ['Status', <StatusBadge status={call.status} />]]} />
      <div className="mt-5"><h4 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-1.5"><Headphones className="w-4 h-4" />Recording & transcript</h4><TranscriptPlayer call={call} /></div>
      <Modal open={!!fu} onClose={() => setFu(null)} title="Create follow-up" subtitle={hasTasks ? 'Adds a task to Sales Tasks for the salesperson' : 'Sends a reminder to the salesperson'} size="sm"
        footer={<><Button variant="secondary" onClick={() => setFu(null)}>Cancel</Button><Button onClick={submit} disabled={!fu?.title}>Create</Button></>}>
        {fu && <div className="space-y-3">
          <Field label="Title" required><Input value={fu.title} onChange={(e) => setFu({ ...fu, title: e.target.value })} /></Field>
          <FormGrid>
            <Field label="Due date"><Input type="date" value={fu.dueDate} onChange={(e) => setFu({ ...fu, dueDate: e.target.value })} /></Field>
            <Field label="Assign to"><Select value={fu.assigneeId} onChange={(e) => setFu({ ...fu, assigneeId: e.target.value })} options={users.filter((u) => ['SALES_EXEC', 'SALES_MANAGER'].includes(u.role)).map((u) => ({ value: u.id, label: u.name }))} /></Field>
          </FormGrid>
          <Field label="Notes"><Textarea rows={3} value={fu.notes} onChange={(e) => setFu({ ...fu, notes: e.target.value })} /></Field>
        </div>}
      </Modal>
    </Drawer>
  )
}

/** Compact call list (lead drawer, dashboard) */
export function CallList({ calls, onOpen, showLead }) {
  const leads = useStore((s) => s.aiLeads)
  if (!calls.length) return <div className="text-sm text-slate-400 py-4 text-center">No calls yet.</div>
  return (
    <ul className="divide-y divide-slate-100">
      {calls.map((c) => {
        const l = showLead && leads.find((x) => x.id === c.leadId)
        return (
          <li key={c.id} onClick={() => onOpen(c.id)} className="py-2.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50 px-1 rounded-lg">
            <div className={cx('w-8 h-8 rounded-full flex items-center justify-center shrink-0', c.status === 'CONNECTED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400')}>{c.status === 'CONNECTED' ? <PhoneCall className="w-4 h-4" /> : <PhoneOff className="w-4 h-4" />}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-800 truncate">{l ? `${l.name} · ${l.company}` : c.summary}</div>
              <div className="text-[11px] text-slate-500">{c.number} · {timeAgo(c.startedAt)} · {fmtDur(c.durationSec)}</div>
            </div>
            <OutcomeBadge outcome={c.outcome} />
          </li>
        )
      })}
    </ul>
  )
}

export { Avatar, Card, Tabs, useUser }
