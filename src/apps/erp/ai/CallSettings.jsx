import React, { useEffect, useMemo, useState } from 'react'
import { Save, PlugZap, Plus, Trash2, Volume2, RefreshCw, ShieldCheck, Clock, Phone, Mic, IndianRupee, MessageCircle, Gauge, PhoneIncoming } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Button, Field, Input, Select, FormGrid, Switch, Badge, IconButton, Alert, toast, cx, Textarea } from '../../../components/ui'
import { fmtDate, fmtDateTime, fmtINR, sum, today, uid } from '../../../lib/format'
import { LANG } from './_shared'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PROVIDERS = ['Exotel', 'Knowlarity', 'Plivo', 'Twilio', 'Ozonetel']

const Section = ({ icon: I, title, sub: s, children, actions }) => (
  <Card title={<span className="inline-flex items-center gap-2"><I className="w-4 h-4 text-brand-600" />{title}</span>} subtitle={s} actions={actions}>{children}</Card>
)

export default function CallSettings() {
  const saved = useStore((s) => s.aiSettings)
  const calls = useStore((s) => s.aiCalls || [])
  const save = useStore((s) => s.aiSaveSettings)
  const [d, setD] = useState(saved)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  useEffect(() => { setD((x) => ({ ...x, counters: saved.counters, lastTestAt: saved.lastTestAt, dndLastSync: saved.dndLastSync })) }, [saved.counters, saved.lastTestAt, saved.dndLastSync])
  const dirty = useMemo(() => { const strip = ({ counters, ...r }) => JSON.stringify(r); return strip(d) !== strip(saved) }, [d, saved])
  const set = (patch) => setD((x) => ({ ...x, ...patch }))
  const sub = (k) => (patch) => setD((x) => ({ ...x, [k]: { ...x[k], ...patch } }))
  const monthCost = sum(calls.filter((c) => c.startedAt.slice(0, 7) === today().slice(0, 7)), (c) => c.cost)
  const doSave = () => {
    if (d.callingHours.from >= d.callingHours.to) { toast.error('Calling hours: start must be before end'); return }
    if (d.callingHours.from < '09:00' || d.callingHours.to > '21:00') { toast.error('TRAI rules allow promotional calls only between 9 AM and 9 PM'); return }
    const { counters, ...rest } = d
    save(rest)
    toast.success('Calling settings saved', 'Applied to all new calls and campaigns')
  }
  const test = () => {
    setTesting(true)
    setTimeout(() => { setTesting(false); save({ lastTestAt: new Date().toISOString(), providerStatus: 'CONNECTED' }); toast.success(`${d.provider} connected`, `Account ${d.providerAccount} · ${d.callerIds.filter((c) => c.active).length} caller IDs verified`) }, 1500)
  }
  const sync = () => {
    setSyncing(true)
    setTimeout(() => { setSyncing(false); save({ dndLastSync: today() }); toast.success('DND registry synced', 'NCPR preference list updated – blocked numbers will be skipped automatically') }, 1300)
  }
  const preview = () => {
    const synth = window.speechSynthesis
    if (!synth) { toast.error('Voice preview is not supported in this browser'); return }
    synth.cancel()
    const text = d.language === 'Hindi' ? 'Namaste! Main Btali International se bol rahi hoon. Kya aapke paas do minute hain?' : 'Hello! This is Btali International. Do you have two minutes to talk?'
    const u = new SpeechSynthesisUtterance(text)
    u.lang = d.language === 'Hindi' ? 'hi-IN' : 'en-IN'
    const male = /Kabir|Arjun/.test(d.voice)
    const v = synth.getVoices().find((x) => x.lang === u.lang) || synth.getVoices().find((x) => x.lang.startsWith('en-IN'))
    if (v) u.voice = v
    u.pitch = male ? 0.8 : 1.15
    u.rate = 0.95
    synth.speak(u)
    toast.info(`Playing ${d.voice.split(' (')[0]}`, text)
  }
  return (
    <div>
      <PageHeader title="Calling Settings" subtitle="Telephony, compliance, retry rules, voice and automation for the AI calling agent"
        actions={<Button icon={Save} disabled={!dirty} onClick={doSave}>{dirty ? 'Save changes' : 'All changes saved'}</Button>} />
      {dirty && <Alert tone="warn" className="mb-4" title="Unsaved changes">Click “Save changes” to apply them.</Alert>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section icon={PlugZap} title="Telephony provider" sub={saved.lastTestAt ? `Last verified ${fmtDateTime(saved.lastTestAt)}` : 'Not verified yet'} actions={<Button size="sm" variant="secondary" loading={testing} onClick={test}>Test connection</Button>}>
          <FormGrid>
            <Field label="Provider"><Select value={d.provider} onChange={(e) => set({ provider: e.target.value })} options={PROVIDERS} /></Field>
            <Field label="Account SID"><Input value={d.providerAccount} onChange={(e) => set({ providerAccount: e.target.value })} /></Field>
            <Field label="API key"><Input type="password" value={d.apiKeyMasked} onChange={(e) => set({ apiKeyMasked: e.target.value })} /></Field>
            <Field label="Status webhook"><Input value={d.webhookUrl} onChange={(e) => set({ webhookUrl: e.target.value })} /></Field>
            <Field label="Transfer to human (number)" hint="Used when a customer asks for a person"><Input value={d.transferNumber} onChange={(e) => set({ transferNumber: e.target.value })} /></Field>
          </FormGrid>
        </Section>

        <Section icon={Phone} title="Caller IDs" sub="Numbers shown to customers" actions={<Button size="sm" variant="secondary" icon={Plus} onClick={() => set({ callerIds: [...d.callerIds, { id: uid('cid'), number: '', label: '', active: true }] })}>Add</Button>}>
          <div className="space-y-2">
            {d.callerIds.map((c, i) => (
              <div key={c.id} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <Input className="sm:w-48" value={c.number} placeholder="+91 …" onChange={(e) => set({ callerIds: d.callerIds.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)) })} />
                <Input value={c.label} placeholder="Label" onChange={(e) => set({ callerIds: d.callerIds.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={c.active} onChange={(v) => set({ callerIds: d.callerIds.map((x, j) => (j === i ? { ...x, active: v } : x)) })} />
                  <IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => set({ callerIds: d.callerIds.filter((_, j) => j !== i) })} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section icon={Clock} title="Calling hours" sub="Outbound calls are placed only inside this window (IST)">
          <FormGrid>
            <Field label="From"><Input type="time" value={d.callingHours.from} onChange={(e) => sub('callingHours')({ from: e.target.value })} /></Field>
            <Field label="To"><Input type="time" value={d.callingHours.to} onChange={(e) => sub('callingHours')({ to: e.target.value })} /></Field>
          </FormGrid>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {DAYS.map((x) => { const on = d.callingHours.days.includes(x); return <button key={x} type="button" onClick={() => sub('callingHours')({ days: on ? d.callingHours.days.filter((y) => y !== x) : [...d.callingHours.days, x] })} className={cx('w-11 py-1.5 rounded-lg text-xs font-semibold border', on ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-slate-300 text-slate-500')}>{x}</button> })}
          </div>
        </Section>

        <Section icon={ShieldCheck} title="DND & compliance" sub={`NCPR registry last synced ${fmtDate(saved.dndLastSync)}`} actions={<Button size="sm" variant="secondary" icon={RefreshCw} loading={syncing} onClick={sync}>Sync now</Button>}>
          <div className="space-y-3">
            <Switch checked={d.dndCheck} onChange={(v) => set({ dndCheck: v })} label="Scrub every number against the NCPR / DND registry before dialing" />
            <Switch checked={d.recordCalls} onChange={(v) => set({ recordCalls: v })} label="Record calls (customer is informed in the opening line)" />
            <FormGrid>
              <Field label="Recording retention (days)"><Input type="number" value={d.recordingRetentionDays} onChange={(e) => set({ recordingRetentionDays: Number(e.target.value) })} /></Field>
              <Field label="Opt-out keyword on call">
                <Input value={d.optOutPhrase || 'call mat karo / do not call'} onChange={(e) => set({ optOutPhrase: e.target.value })} />
              </Field>
            </FormGrid>
          </div>
        </Section>

        <Section icon={Gauge} title="Retry rules & pace">
          <FormGrid>
            <Field label="Max attempts per lead"><Select value={d.maxAttempts} onChange={(e) => set({ maxAttempts: Number(e.target.value) })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} /></Field>
            <Field label="Gap between attempts"><Select value={d.retryGapMin} onChange={(e) => set({ retryGapMin: Number(e.target.value) })} options={[30, 60, 90, 120, 240, 1440].map((n) => ({ value: n, label: n >= 1440 ? 'Next day' : `${n} minutes` }))} /></Field>
            <Field label="Dialing pace"><Select value={d.pace} onChange={(e) => set({ pace: Number(e.target.value) })} options={[6, 12, 20, 30].map((n) => ({ value: n, label: `${n} calls / minute` }))} /></Field>
            <Field label="Concurrent lines"><Select value={d.concurrency} onChange={(e) => set({ concurrency: Number(e.target.value) })} options={[1, 2, 4, 8].map((n) => ({ value: n, label: String(n) }))} /></Field>
          </FormGrid>
        </Section>

        <Section icon={Mic} title="Voice & language" actions={<Button size="sm" variant="secondary" icon={Volume2} onClick={preview}>Preview voice</Button>}>
          <FormGrid>
            <Field label="AI voice"><Select value={d.voice} onChange={(e) => set({ voice: e.target.value })} options={d.voices} /></Field>
            <Field label="Default language"><Select value={d.language} onChange={(e) => set({ language: e.target.value })} options={LANG} /></Field>
          </FormGrid>
          <div className="text-xs text-slate-500 mt-3 mb-1.5">Languages the agent may switch to during a call</div>
          <div className="flex flex-wrap gap-1.5">{LANG.map((l) => { const on = d.languages.includes(l); return <Badge key={l} tone={on ? 'brand' : 'gray'} className="cursor-pointer"><button type="button" onClick={() => set({ languages: on ? d.languages.filter((x) => x !== l) : [...d.languages, l] })}>{on ? '✓ ' : ''}{l}</button></Badge> })}</div>
        </Section>

        <Section icon={PhoneIncoming} title="Inbound line (24×7)" sub="Time-based greetings for incoming calls">
          <div className="space-y-3">
            <Switch checked={d.inbound.enabled} onChange={(v) => sub('inbound')({ enabled: v })} label="AI answers inbound calls" />
            <Switch checked={d.inbound.missedCallFollowUp} onChange={(v) => sub('inbound')({ missedCallFollowUp: v })} label="Call back missed calls automatically" />
            <Field label="Morning greeting"><Input value={d.inbound.greetingMorning} onChange={(e) => sub('inbound')({ greetingMorning: e.target.value })} /></Field>
            <Field label="Afternoon greeting"><Input value={d.inbound.greetingAfternoon} onChange={(e) => sub('inbound')({ greetingAfternoon: e.target.value })} /></Field>
            <Field label="Evening greeting"><Input value={d.inbound.greetingEvening} onChange={(e) => sub('inbound')({ greetingEvening: e.target.value })} /></Field>
            <Field label="After-hours message"><Textarea rows={2} value={d.inbound.afterHoursMessage} onChange={(e) => sub('inbound')({ afterHoursMessage: e.target.value })} /></Field>
          </div>
        </Section>

        <Section icon={MessageCircle} title="Automation & lead scoring">
          <div className="space-y-3">
            <Switch checked={d.autoWhatsApp} onChange={(v) => set({ autoWhatsApp: v })} label="Send brochure on WhatsApp after interested / appointment calls" />
            <Switch checked={d.autoEmail} onChange={(v) => set({ autoEmail: v })} label="Email call summary to the assigned salesperson" />
            <FormGrid>
              <Field label="HOT from score"><Input type="number" value={d.scoring.hot} onChange={(e) => sub('scoring')({ hot: Number(e.target.value) })} /></Field>
              <Field label="WARM from score"><Input type="number" value={d.scoring.warm} onChange={(e) => sub('scoring')({ warm: Number(e.target.value) })} /></Field>
            </FormGrid>
          </div>
        </Section>

        <Section icon={IndianRupee} title="Usage & cost control" sub={`${fmtINR(monthCost)} used this month`}>
          <FormGrid>
            <Field label="Cost per connected minute (₹)"><Input type="number" step="0.1" value={d.costPerMin} onChange={(e) => set({ costPerMin: Number(e.target.value) })} /></Field>
            <Field label="Monthly budget (₹)"><Input type="number" value={d.monthlyBudget} onChange={(e) => set({ monthlyBudget: Number(e.target.value) })} /></Field>
          </FormGrid>
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${Math.min(100, (monthCost / (d.monthlyBudget || 1)) * 100)}%` }} /></div>
          <div className="text-xs text-slate-500 mt-1">{((monthCost / (d.monthlyBudget || 1)) * 100).toFixed(1)}% of budget · campaigns pause automatically at 100%</div>
        </Section>
      </div>
    </div>
  )
}
