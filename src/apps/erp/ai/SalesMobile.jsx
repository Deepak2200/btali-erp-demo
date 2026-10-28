import React, { useEffect, useMemo, useState } from 'react'
import { Home, Users, ShoppingCart, MapPin, Phone, PhoneOff, Mic, MicOff, Volume2, ChevronLeft, Flame, CalendarCheck, Clock, CheckCircle2, AlertTriangle, Bot, Plus, Minus, Trash2, Navigation, Bell, Wifi, BatteryFull, Signal, Search, MessageCircle, RotateCcw } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import { PageHeader, Select, Badge, toast, cx, Card } from '../../../components/ui'
import { CALL_OUTCOMES, fmtDur } from '../../../store/slices/ai'
import { priceOrder } from '../../../lib/pricing'
import { fmtINR, fmtDate, fmtDateTime, timeAgo, today } from '../../../lib/format'
import { useAiRunners, TempBadge, OutcomeBadge } from './_shared'

const time = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

function Screen({ title, onBack, right, children }) {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-ink-900 text-white px-4 pt-2 pb-3 flex items-center gap-2 shrink-0">
        {onBack && <button type="button" onClick={onBack} className="-ml-1 p-1 rounded hover:bg-white/10"><ChevronLeft className="w-5 h-5" /></button>}
        <div className="font-semibold text-[15px] flex-1 truncate">{title}</div>
        {right}
      </div>
      <div className="flex-1 overflow-y-auto bg-slate-50">{children}</div>
    </div>
  )
}
const Sec = ({ title, children, action }) => (
  <div className="px-3 pt-3">
    <div className="flex items-center justify-between mb-1.5"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</div>{action}</div>
    {children}
  </div>
)
const Tile = ({ children, onClick, className }) => <div onClick={onClick} className={cx('bg-white rounded-xl border border-slate-200 p-3 mb-2', onClick && 'active:bg-slate-50 cursor-pointer', className)}>{children}</div>

function CallScreen({ lead, onEnd }) {
  const [secs, setSecs] = useState(0)
  const [phase, setPhase] = useState('ringing')
  const [mute, setMute] = useState(false)
  useEffect(() => { const t = setTimeout(() => setPhase('live'), 2200); return () => clearTimeout(t) }, [])
  useEffect(() => { if (phase !== 'live') return; const h = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(h) }, [phase])
  return (
    <div className="h-full bg-gradient-to-b from-ink-900 to-ink-950 text-white flex flex-col items-center pt-14 pb-10 px-6">
      <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold">{lead.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</div>
      <div className="text-xl font-semibold mt-4 text-center">{lead.name}</div>
      <div className="text-sm text-white/60">{lead.phone} · {lead.city}</div>
      <div className="mt-2 text-sm text-white/80">{phase === 'ringing' ? 'Ringing…' : fmtDur(secs) || '0:00'}</div>
      <div className="mt-6 w-full rounded-xl bg-white/10 p-3 text-xs space-y-1">
        <div className="font-semibold text-white/90 flex items-center gap-1"><Bot className="w-3.5 h-3.5" />AI brief</div>
        <div className="text-white/70">Interest: {lead.interest} · Score {lead.score}</div>
        <div className="text-white/70">Budget: {lead.qualification?.budget || '—'}</div>
        <div className="text-white/70">Last: {CALL_OUTCOMES[lead.lastOutcome]?.label || 'Not called'}</div>
      </div>
      <div className="flex-1" />
      <div className="flex gap-6 items-center">
        <button type="button" onClick={() => setMute((m) => !m)} className={cx('w-12 h-12 rounded-full flex items-center justify-center', mute ? 'bg-white text-ink-900' : 'bg-white/15')}>{mute ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}</button>
        <button type="button" onClick={() => onEnd(phase === 'live' ? secs : 0)} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center"><PhoneOff className="w-7 h-7" /></button>
        <button type="button" className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center"><Volume2 className="w-5 h-5" /></button>
      </div>
    </div>
  )
}

function OutcomeSheet({ lead, secs, onDone }) {
  const log = useStore((s) => s.aiLogManualCall)
  const user = useUser()
  const [o, setO] = useState(secs ? 'INTERESTED' : 'NO_ANSWER')
  const [notes, setNotes] = useState('')
  const opts = secs ? ['APPOINTMENT', 'INTERESTED', 'CALLBACK', 'PROMISE_TO_PAY', 'NOT_INTERESTED'] : ['NO_ANSWER']
  return (
    <Screen title="Log call outcome">
      <div className="p-3">
        <Tile><div className="text-sm font-semibold">{lead.name}</div><div className="text-xs text-slate-500">{secs ? `Talked ${fmtDur(secs)}` : 'Not connected'}</div></Tile>
        <div className="grid grid-cols-2 gap-2">{opts.map((k) => <button key={k} type="button" onClick={() => setO(k)} className={cx('rounded-xl border px-2 py-2.5 text-xs font-semibold', o === k ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-slate-200 text-slate-700')}>{CALL_OUTCOMES[k].label}</button>)}</div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notes (what did the customer say?)" className="mt-3 w-full rounded-xl border border-slate-300 p-2.5 text-sm" />
        <button type="button" onClick={() => { const c = log(lead.id, { outcome: o, notes, durationSec: secs, by: user?.id }); toast.success(`Call logged – ${CALL_OUTCOMES[o].label}`, o === 'APPOINTMENT' ? 'Appointment added for tomorrow 11:00 AM' : `Lead score ${c.scoreDelta >= 0 ? '+' : ''}${c.scoreDelta}`); onDone() }} className="mt-3 w-full rounded-xl bg-brand-500 text-white font-semibold py-3">Save</button>
      </div>
    </Screen>
  )
}

function LeadView({ lead, onBack, onCall }) {
  const calls = useStore((s) => (s.aiCalls || []).filter((c) => c.leadId === lead.id).slice(0, 5))
  return (
    <Screen title={lead.name} onBack={onBack}>
      <div className="p-3">
        <Tile>
          <div className="flex items-start justify-between"><div><div className="font-semibold">{lead.company}</div><div className="text-xs text-slate-500">{lead.city}, {lead.state}</div></div><TempBadge t={lead.temperature} /></div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={onCall} className="flex-1 rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5"><Phone className="w-4 h-4" />Call</button>
            <a href={`https://wa.me/91${lead.phone.replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noreferrer" className="flex-1 rounded-xl bg-[#25D366] text-white py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5"><MessageCircle className="w-4 h-4" />WhatsApp</a>
          </div>
        </Tile>
        <Sec title="Qualification answers (from AI)">
          <Tile className="space-y-1.5 text-sm">
            <div><span className="text-slate-500 text-xs block">Budget</span>{lead.qualification?.budget || '—'}</div>
            <div><span className="text-slate-500 text-xs block">Product requirement</span>{lead.qualification?.requirement || '—'}</div>
            <div><span className="text-slate-500 text-xs block">Purchase timeline</span>{lead.qualification?.timeline || '—'}</div>
          </Tile>
        </Sec>
        <Sec title="Recent calls">
          {calls.length ? calls.map((c) => <Tile key={c.id}><div className="flex justify-between items-center"><span className="text-xs text-slate-500">{timeAgo(c.startedAt)} · {c.handledBy === 'AI' ? 'AI' : 'You'}</span><OutcomeBadge outcome={c.outcome} /></div><div className="text-xs text-slate-700 mt-1.5">{c.summary}</div></Tile>) : <div className="text-xs text-slate-400 px-1">No calls yet</div>}
        </Sec>
      </div>
    </Screen>
  )
}

function ApptCard({ a, lead, onOpen }) {
  const { aiUpdateAppointment, aiRetriggerFollowUp, aiCheckIn } = useStore()
  const [fb, setFb] = useState(null)
  const past = new Date(a.at) < new Date()
  const checkIn = () => {
    const done = (lat, lng) => { aiCheckIn({ leadId: a.leadId, appointmentId: a.id, note: `Visit: ${lead.company}`, lat, lng }); toast.success('Checked in', `${lead.company} · ${time(new Date().toISOString())}${lat ? ` · ${lat.toFixed(4)}, ${lng.toFixed(4)}` : ''}`) }
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => done(p.coords.latitude, p.coords.longitude), () => done(null, null), { timeout: 3000 })
    else done(null, null)
  }
  return (
    <Tile>
      <div className="flex justify-between items-start gap-2" onClick={onOpen}>
        <div className="min-w-0"><div className="text-sm font-semibold truncate">{lead?.name}</div><div className="text-xs text-slate-500 truncate">{a.location}</div></div>
        <div className="text-right shrink-0"><div className="text-sm font-bold">{time(a.at)}</div><div className="text-[10px] text-slate-500">{a.at.slice(0, 10) === today() ? 'Today' : fmtDate(a.at)}</div></div>
      </div>
      <div className="flex gap-1.5 mt-2 flex-wrap">
        <Badge tone={a.type === 'DEMO' ? 'violet' : 'blue'}>{a.type === 'DEMO' ? 'Demo' : 'Store visit'}</Badge>
        {a.checkedInAt && <Badge tone="green">Checked in {time(a.checkedInAt)}</Badge>}
        {a.status !== 'SCHEDULED' && <Badge tone={a.status === 'COMPLETED' ? 'green' : 'red'}>{a.status === 'COMPLETED' ? 'Attended' : 'Missed'}</Badge>}
      </div>
      {a.status === 'SCHEDULED' && !fb && (
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          {!a.checkedInAt ? <button type="button" onClick={checkIn} className="rounded-lg bg-ink-900 text-white text-xs font-semibold py-2 flex items-center justify-center gap-1"><Navigation className="w-3.5 h-3.5" />Check in</button>
            : <button type="button" onClick={() => setFb({ status: 'COMPLETED', text: '' })} className="rounded-lg bg-emerald-600 text-white text-xs font-semibold py-2">Submit feedback</button>}
          <button type="button" onClick={() => setFb({ status: 'MISSED', text: '' })} className="rounded-lg border border-slate-300 text-xs font-semibold py-2">Mark missed</button>
        </div>
      )}
      {fb && (
        <div className="mt-2.5">
          <textarea autoFocus rows={2} value={fb.text} onChange={(e) => setFb({ ...fb, text: e.target.value })} placeholder={fb.status === 'COMPLETED' ? 'Meeting feedback & next step' : 'Reason customer was not available'} className="w-full rounded-lg border border-slate-300 p-2 text-xs" />
          <div className="flex gap-2 mt-1.5">
            <button type="button" onClick={() => setFb(null)} className="flex-1 rounded-lg border border-slate-300 text-xs py-2">Cancel</button>
            <button type="button" disabled={!fb.text.trim()} onClick={() => { aiUpdateAppointment(a.id, { status: fb.status, feedback: fb.text, attendance: fb.status === 'COMPLETED' ? 'ATTENDED' : 'NO_SHOW' }); toast.success(fb.status === 'COMPLETED' ? 'Feedback saved' : 'Marked as missed', fb.status === 'COMPLETED' ? 'Lead score +10' : 'You can trigger an AI follow-up'); setFb(null) }} className="flex-1 rounded-lg bg-brand-500 text-white text-xs font-semibold py-2 disabled:opacity-50">Save</button>
          </div>
        </div>
      )}
      {a.status === 'MISSED' && !a.followUpTriggeredAt && <button type="button" onClick={() => { const c = aiRetriggerFollowUp(a.id); toast.success('AI follow-up call placed', `${CALL_OUTCOMES[c.outcome].label} – ${c.summary}`) }} className="mt-2 w-full rounded-lg bg-brand-50 text-brand-700 text-xs font-semibold py-2 flex items-center justify-center gap-1"><RotateCcw className="w-3.5 h-3.5" />Trigger AI follow-up call</button>}
      {a.followUpTriggeredAt && <div className="text-[11px] text-slate-500 mt-1.5">AI follow-up placed {timeAgo(a.followUpTriggeredAt)}</div>}
      {a.feedback && a.status !== 'SCHEDULED' && <div className="text-xs text-slate-600 mt-2 italic">“{a.feedback}”</div>}
    </Tile>
  )
}

function OrderScreen({ userId }) {
  const partners = useStore((s) => s.partners)
  const products = useStore((s) => s.products)
  const createSalesOrder = useStore((s) => s.createSalesOrder)
  const mine = partners.filter((p) => p.salespersonId === userId && p.status === 'ACTIVE')
  const [pid, setPid] = useState(mine[0]?.id || '')
  const [lines, setLines] = useState([])
  const [q, setQ] = useState('')
  const [done, setDone] = useState(null)
  const priced = useMemo(() => (pid && lines.length ? priceOrder(useStore.getState(), pid, lines) : null), [pid, lines])
  const add = (p) => { setLines((l) => (l.some((x) => x.productId === p.id) ? l.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + 1 } : x)) : [...l, { productId: p.id, qty: p.type === 'SPARE' ? 10 : 2 }])); setQ('') }
  const list = q ? products.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : []
  if (done) return (
    <div className="p-6 text-center">
      <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
      <div className="font-bold text-lg mt-3">Order {done.number}</div>
      <div className="text-sm text-slate-500">{fmtINR(done.total)} · confirmation emailed to dealer</div>
      <button type="button" onClick={() => { setDone(null); setLines([]) }} className="mt-5 rounded-xl bg-brand-500 text-white font-semibold px-5 py-2.5">New order</button>
    </div>
  )
  return (
    <div className="p-3">
      <select value={pid} onChange={(e) => setPid(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm">{mine.map((p) => <option key={p.id} value={p.id}>{p.name} – {p.city}</option>)}</select>
      <div className="relative mt-2">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add product (name or SKU)" className="w-full rounded-xl border border-slate-300 pl-9 p-2.5 text-sm" />
        {list.length > 0 && <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg">{list.map((p) => <button key={p.id} type="button" onClick={() => add(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-0"><div className="truncate">{p.name}</div><div className="text-[11px] text-slate-500">{p.sku} · MRP {fmtINR(p.mrp)}</div></button>)}</div>}
      </div>
      <div className="mt-3 space-y-2">
        {lines.map((l) => { const p = products.find((x) => x.id === l.productId); const pl = priced?.lines.find((x) => x.productId === l.productId && !x.free); return (
          <Tile key={l.productId} className="!mb-0">
            <div className="flex justify-between gap-2"><div className="text-sm font-medium truncate">{p.shortName || p.name}</div><button type="button" onClick={() => setLines(lines.filter((x) => x.productId !== l.productId))}><Trash2 className="w-4 h-4 text-slate-400" /></button></div>
            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-2"><button type="button" onClick={() => setLines(lines.map((x) => (x.productId === l.productId ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} className="w-7 h-7 rounded-lg border flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button><span className="w-8 text-center font-semibold tabular-nums">{l.qty}</span><button type="button" onClick={() => setLines(lines.map((x) => (x.productId === l.productId ? { ...x, qty: x.qty + 1 } : x)))} className="w-7 h-7 rounded-lg border flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button></div>
              <div className="text-right"><div className="text-sm font-semibold">{fmtINR(pl?.amount)}</div><div className="text-[10px] text-slate-500">@ {fmtINR(pl?.price)} · {pl?.discountPct}% off</div></div>
            </div>
          </Tile>) })}
        {priced?.lines.filter((x) => x.free).map((x) => <div key={`f${x.productId}`} className="text-xs text-emerald-700 px-1">+ {x.qty} × {products.find((p) => p.id === x.productId)?.shortName} free (scheme)</div>)}
      </div>
      {!lines.length && <div className="text-center text-xs text-slate-400 py-8">Search and add products to build the order</div>}
      {priced && (
        <div className="mt-3 rounded-xl bg-white border p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{fmtINR(priced.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">GST</span><span>{fmtINR(priced.gst)}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span>{fmtINR(priced.total)}</span></div>
          <button type="button" onClick={() => { const so = createSalesOrder({ partnerId: pid, lines, source: 'SALES', salespersonId: userId, note: 'Captured on Sales Mobile App' }); setDone(so); toast.success(`Sales order ${so.number} created`, `${fmtINR(so.total)} · confirmation emailed`) }} className="mt-2 w-full rounded-xl bg-brand-500 text-white font-semibold py-3">Place order</button>
        </div>
      )}
    </div>
  )
}

function VisitScreen({ userId }) {
  const partners = useStore((s) => s.partners)
  const visits = useStore((s) => (s.aiVisits || []).filter((v) => v.userId === userId))
  const aiCheckIn = useStore((s) => s.aiCheckIn)
  const mine = partners.filter((p) => p.salespersonId === userId)
  const [pid, setPid] = useState(mine[0]?.id || '')
  const [note, setNote] = useState('')
  const go = () => {
    const p = mine.find((x) => x.id === pid)
    const done = (lat, lng) => { aiCheckIn({ partnerId: pid, note: note || `Visit: ${p.name}`, lat, lng, userId }); setNote(''); toast.success('Visit checked in', `${p.name}, ${p.city}`) }
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((x) => done(x.coords.latitude, x.coords.longitude), () => done(null, null), { timeout: 3000 })
    else done(null, null)
  }
  return (
    <div className="p-3">
      <Tile>
        <div className="text-sm font-semibold mb-2 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-brand-600" />Check in at a dealer</div>
        <select value={pid} onChange={(e) => setPid(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm">{mine.map((p) => <option key={p.id} value={p.id}>{p.name} – {p.city}</option>)}</select>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Purpose / notes" className="mt-2 w-full rounded-xl border border-slate-300 p-2.5 text-sm" />
        <button type="button" onClick={go} disabled={!pid} className="mt-2 w-full rounded-xl bg-ink-900 text-white font-semibold py-2.5 flex items-center justify-center gap-1.5"><Navigation className="w-4 h-4" />Check in with GPS</button>
      </Tile>
      <Sec title={`My visits (${visits.length})`}>
        {visits.length ? visits.slice(0, 10).map((v) => <Tile key={v.id}><div className="text-sm font-medium">{v.note}</div><div className="text-[11px] text-slate-500">{fmtDateTime(v.ts)}{v.lat ? ` · ${v.lat.toFixed(3)}, ${v.lng.toFixed(3)}` : ''}</div></Tile>) : <div className="text-xs text-slate-400 px-1">No visits logged yet</div>}
      </Sec>
    </div>
  )
}

function PhoneFrame({ userId }) {
  const leads = useStore((s) => (s.aiLeads || []).filter((l) => l.assignedTo === userId))
  const appts = useStore((s) => (s.aiAppointments || []).filter((a) => a.assignedTo === userId))
  const calls = useStore((s) => s.aiCalls || [])
  const users = useStore((s) => s.users)
  const me = users.find((u) => u.id === userId)
  const [tab, setTab] = useState('home')
  const [leadId, setLeadId] = useState(null)
  const [call, setCall] = useState(null)
  const [log, setLog] = useState(null)
  const [now, setNow] = useState(new Date())
  useEffect(() => { const h = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(h) }, [])
  useEffect(() => { setLeadId(null); setCall(null); setLog(null); setTab('home') }, [userId])
  const lead = leads.find((l) => l.id === leadId)
  const toCall = leads.filter((l) => !['CONVERTED', 'LOST'].includes(l.stage) && !l.dnd && (!l.nextFollowUp || l.nextFollowUp <= today())).sort((a, b) => b.score - a.score)
  const upcoming = appts.filter((a) => a.status === 'SCHEDULED').sort((a, b) => a.at.localeCompare(b.at))
  const todayAppts = upcoming.filter((a) => a.at.slice(0, 10) === today())
  const pendingFb = appts.filter((a) => a.status === 'SCHEDULED' && new Date(a.at) < now)
  const myCallsToday = calls.filter((c) => c.handledBy === userId && c.startedAt.slice(0, 10) === today()).length
  const startCall = (l) => setCall(l)
  let body
  if (log) body = <OutcomeSheet lead={log.lead} secs={log.secs} onDone={() => { setLog(null); setCall(null) }} />
  else if (call) body = <CallScreen lead={call} onEnd={(secs) => setLog({ lead: call, secs })} />
  else if (lead) body = <LeadView lead={lead} onBack={() => setLeadId(null)} onCall={() => startCall(lead)} />
  else if (tab === 'home') body = (
    <Screen title={`Hi ${me?.name.split(' ')[0]} 👋`} right={<Bell className="w-5 h-5" />}>
      <div className="grid grid-cols-3 gap-2 px-3 pt-3">
        {[['To call', toCall.length], ['Visits today', todayAppts.length], ['My calls', myCallsToday]].map(([l, v]) => <div key={l} className="bg-white rounded-xl border p-2 text-center"><div className="text-lg font-bold">{v}</div><div className="text-[10px] text-slate-500">{l}</div></div>)}
      </div>
      {pendingFb.length > 0 && <div className="mx-3 mt-3 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{pendingFb.length} appointment{pendingFb.length > 1 ? 's need' : ' needs'} your feedback</div>}
      <Sec title="Today's appointments">
        {todayAppts.length ? todayAppts.map((a) => <ApptCard key={a.id} a={a} lead={leads.find((l) => l.id === a.leadId) || {}} onOpen={() => setLeadId(a.leadId)} />) : <div className="text-xs text-slate-400 px-1 pb-2">No appointments today</div>}
      </Sec>
      <Sec title="Hot leads to call" action={<button type="button" className="text-[11px] text-brand-600 font-semibold" onClick={() => setTab('leads')}>All</button>}>
        {toCall.slice(0, 4).map((l) => (
          <Tile key={l.id} onClick={() => setLeadId(l.id)}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{l.name}</div><div className="text-[11px] text-slate-500 truncate">{l.company} · {l.city}</div></div>
              <TempBadge t={l.temperature} />
              <button type="button" onClick={(e) => { e.stopPropagation(); startCall(l) }} className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0"><Phone className="w-4 h-4" /></button>
            </div>
          </Tile>
        ))}
      </Sec>
    </Screen>
  )
  else if (tab === 'leads') body = (
    <Screen title={`My leads (${leads.length})`}>
      <div className="pt-2">
        {[...leads].sort((a, b) => b.score - a.score).map((l) => (
          <div key={l.id} onClick={() => setLeadId(l.id)} className="mx-3 mb-2 bg-white rounded-xl border p-3 flex items-center gap-2 cursor-pointer">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate flex items-center gap-1">{l.temperature === 'HOT' && <Flame className="w-3.5 h-3.5 text-red-500" />}{l.name}</div>
              <div className="text-[11px] text-slate-500 truncate">{l.company} · {l.city}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{l.nextFollowUp ? `Follow-up ${fmtDate(l.nextFollowUp)}` : 'New lead'}</div>
            </div>
            <div className="text-right"><div className="text-sm font-bold tabular-nums">{l.score}</div><OutcomeBadge outcome={l.lastOutcome} /></div>
          </div>
        ))}
      </div>
    </Screen>
  )
  else if (tab === 'appts') body = (
    <Screen title="Appointments">
      <Sec title="Upcoming">{upcoming.length ? upcoming.map((a) => <ApptCard key={a.id} a={a} lead={leads.find((l) => l.id === a.leadId) || {}} onOpen={() => setLeadId(a.leadId)} />) : <div className="text-xs text-slate-400 px-1">Nothing scheduled</div>}</Sec>
      <Sec title="Past">{appts.filter((a) => a.status !== 'SCHEDULED').map((a) => <ApptCard key={a.id} a={a} lead={leads.find((l) => l.id === a.leadId) || {}} onOpen={() => setLeadId(a.leadId)} />)}</Sec>
    </Screen>
  )
  else if (tab === 'order') body = <Screen title="Quick order"><OrderScreen userId={userId} /></Screen>
  else body = <Screen title="Visits"><VisitScreen userId={userId} /></Screen>

  const NAV = [['home', Home, 'Home'], ['leads', Users, 'Leads'], ['appts', CalendarCheck, 'Visits'], ['order', ShoppingCart, 'Order'], ['visit', MapPin, 'Check-in']]
  return (
    <div className="mx-auto w-full max-w-[380px] rounded-[2.6rem] bg-ink-950 p-3 shadow-2xl">
      <div className="rounded-[2rem] overflow-hidden bg-white h-[740px] max-h-[80vh] min-h-[600px] flex flex-col relative">
        <div className="bg-ink-900 text-white text-[11px] px-5 pt-2.5 pb-1 flex items-center justify-between shrink-0">
          <span className="font-semibold">{now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
          <div className="w-20 h-5 bg-ink-950 rounded-full absolute left-1/2 -translate-x-1/2 top-1.5" />
          <span className="flex items-center gap-1"><Signal className="w-3 h-3" /><Wifi className="w-3 h-3" /><BatteryFull className="w-3.5 h-3.5" /></span>
        </div>
        <div className="flex-1 min-h-0">{body}</div>
        {!call && !log && (
          <div className="border-t bg-white grid grid-cols-5 shrink-0">
            {NAV.map(([k, I, l]) => (
              <button key={k} type="button" onClick={() => { setTab(k); setLeadId(null) }} className={cx('py-2 flex flex-col items-center gap-0.5 text-[10px] font-medium', tab === k && !leadId ? 'text-brand-600' : 'text-slate-500')}>
                <I className="w-5 h-5" />{l}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SalesMobile() {
  useAiRunners()
  const user = useUser()
  const users = useStore((s) => s.users)
  const execs = users.filter((u) => u.role === 'SALES_EXEC')
  const isExec = user?.role === 'SALES_EXEC'
  const [as, setAs] = useState(isExec ? user.id : 'u5')
  const appts = useStore((s) => s.aiAppointments || [])
  const leads = useStore((s) => s.aiLeads || [])
  const uid = isExec ? user.id : as
  return (
    <div>
      <PageHeader title="Sales Mobile App" subtitle="Assigned leads, AI-booked appointments, click-to-call, quick orders and GPS check-ins for the field team"
        actions={!isExec && <Select value={as} onChange={(e) => setAs(e.target.value)} options={execs.map((u) => ({ value: u.id, label: `View as ${u.name}` }))} />} />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px_1fr] gap-6 items-start">
        <div className="hidden lg:block space-y-3">
          <Card title="How the field team uses it">
            <ol className="text-sm text-slate-600 space-y-2 list-decimal pl-4">
              <li>AI calls leads and books store visits / demos straight into the salesperson's calendar.</li>
              <li>Each appointment shows the customer's answers to the three qualification questions.</li>
              <li>At the visit: GPS check-in, then attended / missed feedback.</li>
              <li>Missed visit? One tap triggers an AI follow-up call to rebook.</li>
              <li>Capture orders on the spot – priced with dealer discounts & live schemes.</li>
            </ol>
          </Card>
        </div>
        <PhoneFrame userId={uid} />
        <div className="hidden lg:block space-y-3">
          <Card title="Team today">
            {execs.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className={cx(u.id === uid && 'font-semibold text-brand-700')}>{u.name}</span>
                <span className="text-xs text-slate-500">{appts.filter((a) => a.assignedTo === u.id && a.status === 'SCHEDULED').length} visits · {leads.filter((l) => l.assignedTo === u.id && l.temperature === 'HOT').length} hot</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
