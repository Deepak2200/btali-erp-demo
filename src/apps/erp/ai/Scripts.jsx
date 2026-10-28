import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Save, Copy, Trash2, PhoneCall, PhoneOff, Send, Bot, User, Building2, HelpCircle, Package, CalendarCheck, MessageSquareQuote, ShieldQuestion, ListOrdered, X, Sparkles } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Button, Field, Input, Textarea, Select, FormGrid, Badge, Tabs, Combobox, IconButton, toast, confirm, cx, Switch } from '../../../components/ui'
import { CAMPAIGN_TYPES } from '../../../store/slices/ai'
import { fmtINR, fmtDateTime, fmtDate, addDays, today } from '../../../lib/format'
import { UserName } from '../../../components/business'
import { LANG } from './_shared'

const VARS = ['{{customer_name}}', '{{company}}', '{{city}}', '{{product_interest}}', '{{salesperson}}', '{{appointment_time}}', '{{order_no}}', '{{amount_due}}']

const fill = (txt, ctx) => String(txt || '')
  .replace(/\{\{customer_name\}\}/g, ctx.first).replace(/\{\{company\}\}/g, ctx.company).replace(/\{\{city\}\}/g, ctx.city)
  .replace(/\{\{product_interest\}\}/g, ctx.interest).replace(/\{\{salesperson\}\}/g, ctx.sp).replace(/\{\{appointment_time\}\}/g, ctx.appt)
  .replace(/\{\{order_no\}\}/g, ctx.soNo).replace(/\{\{amount_due\}\}/g, ctx.amount)

/** Script-driven reply for the test-call simulator */
function scriptReply(script, products, sim, text) {
  const t = text.toLowerCase()
  const has = (arr) => (arr || []).some((k) => k && t.includes(String(k).toLowerCase()))
  const q = script.qualification || []
  const next = { ...sim }
  // capture answer to the pending qualification question
  if (sim.pendingQ != null && !/\?$/.test(text.trim())) next.answers = { ...sim.answers, [q[sim.pendingQ]?.key]: text }
  const askNext = (prefix = '') => {
    const idx = q.findIndex((x) => !next.answers[x.key])
    if (idx >= 0) { next.pendingQ = idx; return { text: `${prefix}${q[idx].question}`, tag: 'Qualification' } }
    next.pendingQ = null
    next.closing = true
    return { text: `${prefix}Dhanyavaad! ${script.closing?.siteVisit ? `Humare executive ${sim.ctx.sp} aapke yahan demo ke saath aa sakte hain – ${sim.ctx.appt} chalega?` : 'Kya main aapke liye callback schedule karun?'}`, tag: 'Closing' }
  }
  if (/\b(busy|baad me|later|time nahi|meeting)\b/.test(t)) { next.ended = true; return [next, { text: (script.objections || []).find((o) => has(o.keywords) && /busy|later|time/.test(o.keywords.join(' ')))?.response || 'Koi baat nahi, main callback schedule kar deti hoon. Dhanyavaad!', tag: 'Callback booked' }] }
  const obj = (script.objections || []).find((o) => has(o.keywords))
  if (obj) return [next, { text: obj.response, tag: `Objection: ${obj.objection}` }]
  const faq = (script.faqs || []).find((f) => has(f.keywords))
  if (faq) { const r = askNext(`${faq.a} `); return [next, { ...r, text: r.text, tag: `FAQ: ${faq.q}` }] }
  const prod = products.find((p) => (script.context?.productIds || []).includes(p.id) && t.includes((p.shortName || p.name).toLowerCase().split(' ')[0]))
  if (prod && /price|rate|kitna|cost/.test(t)) return [next, { text: `${prod.name} ka MRP ${fmtINR(prod.mrp)} hai. ${script.context?.pricing || ''}`, tag: 'Product context' }]
  if (sim.closing && /\b(haan|ha|yes|ok|okay|chalega|theek|sure|done)\b/.test(t)) { next.ended = true; next.booked = true; return [next, { text: `Confirmed – ${sim.ctx.appt}. ${script.closing?.nextAction || ''} Dhanyavaad ${sim.ctx.first} ji!`, tag: 'Appointment booked' }] }
  if (sim.closing && /\b(nahi|no|not)\b/.test(t)) { next.ended = true; return [next, { text: `Koi baat nahi. ${script.closing?.callback || ''} Dhanyavaad!`, tag: 'Callback offered' }] }
  if (/\b(not interested|nahi chahiye|no need|zaroorat nahi)\b/.test(t)) { next.ended = true; return [next, { text: 'Samajh sakti hoon. Kabhi zaroorat ho to WhatsApp 98200 11000 pe message kijiye. Dhanyavaad!', tag: 'Not interested' }] }
  if (sim.pendingQ != null || /\b(haan|ha|yes|ok|boliye|sure|bataiye|go ahead)\b/.test(t)) return [next, askNext(sim.pendingQ != null ? 'Noted. ' : '')]
  return [next, { text: 'Is par main aapko humari team se confirm karwa deti hoon. Kya main aage kuch details pooch sakti hoon?', tag: 'Unanswered – logged' }]
}

function TestCall({ script }) {
  const leads = useStore((s) => s.aiLeads)
  const products = useStore((s) => s.products)
  const users = useStore((s) => s.users)
  const [leadId, setLeadId] = useState(leads[0]?.id)
  const [sim, setSim] = useState(null)
  const [txt, setTxt] = useState('')
  const [secs, setSecs] = useState(0)
  const box = useRef(null)
  useEffect(() => { if (!sim || sim.ended) return; const h = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(h) }, [!!sim, sim?.ended]) // eslint-disable-line
  useEffect(() => { box.current?.scrollTo({ top: 99999, behavior: 'smooth' }) }, [sim?.msgs.length, sim?.typing])
  useEffect(() => { setSim(null) }, [script.id])
  const start = () => {
    const l = leads.find((x) => x.id === leadId)
    const ctx = { first: l.name.split(' ')[0], company: l.company, city: l.city, interest: l.interest.toLowerCase(), sp: users.find((u) => u.id === l.assignedTo)?.name.split(' ')[0] || 'Rohit', appt: `${fmtDate(addDays(today(), 1))}, 11:30 AM`, soNo: l.soNo || 'SO/26-27/0012', amount: fmtINR(l.amountDue || 48500) }
    setSecs(0)
    setSim({ ctx, answers: {}, pendingQ: null, msgs: [{ who: 'AI', text: fill(script.greeting, ctx), tag: 'Greeting' }], typing: false })
  }
  const send = (val) => {
    const v = (val ?? txt).trim()
    if (!v || !sim || sim.ended) return
    setTxt('')
    const withMsg = { ...sim, msgs: [...sim.msgs, { who: 'CUSTOMER', text: v }], typing: true }
    setSim(withMsg)
    setTimeout(() => {
      const [next, reply] = scriptReply(script, products, withMsg, v)
      setSim({ ...next, typing: false, msgs: [...withMsg.msgs, { who: 'AI', text: fill(reply.text, withMsg.ctx), tag: reply.tag }] })
    }, 700)
  }
  const suggestions = sim?.closing ? ['Haan chalega', 'Nahi, abhi nahi'] : ['Haan boliye', 'Warranty kitni hai?', 'Price kya hai?', 'Humare paas already Crompton hai', 'Abhi busy hoon']
  return (
    <Card title="Test call" subtitle="Talk to the AI agent exactly as a customer would" actions={sim && !sim.ended ? <Badge tone="green" dot>Live {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</Badge> : null}>
      {!sim ? (
        <div className="space-y-3">
          <Field label="Call as lead (fills script variables)"><Combobox value={leadId} onChange={setLeadId} options={leads.map((l) => ({ value: l.id, label: `${l.name} – ${l.company}`, sub: `${l.city} · ${l.interest}` }))} /></Field>
          <Button icon={PhoneCall} className="w-full" onClick={start}>Start test call</Button>
        </div>
      ) : (
        <div>
          <div ref={box} className="h-[380px] overflow-y-auto space-y-2 bg-slate-50 rounded-xl p-3">
            {sim.msgs.map((m, i) => (
              <div key={i} className={cx('flex gap-2', m.who === 'AI' ? '' : 'flex-row-reverse')}>
                <div className={cx('w-7 h-7 rounded-full flex items-center justify-center shrink-0', m.who === 'AI' ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-600')}>{m.who === 'AI' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}</div>
                <div className={cx('max-w-[82%] rounded-2xl px-3 py-2 text-sm', m.who === 'AI' ? 'bg-white border border-slate-200' : 'bg-brand-500 text-white')}>
                  {m.tag && <div className="text-[10px] font-semibold text-brand-600 mb-0.5 flex items-center gap-1"><Sparkles className="w-3 h-3" />{m.tag}</div>}
                  {m.text}
                </div>
              </div>
            ))}
            {sim.typing && <div className="text-xs text-slate-400 pl-9">AI is speaking…</div>}
            {sim.ended && <div className="text-center text-xs text-slate-500 py-2">Call ended · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}{sim.booked ? ' · appointment booked' : ''}</div>}
          </div>
          {Object.keys(sim.answers).length > 0 && (
            <div className="mt-2 text-xs rounded-lg bg-emerald-50 border border-emerald-200 p-2">
              <div className="font-semibold text-emerald-800 mb-1">Captured answers</div>
              {Object.entries(sim.answers).map(([k, v]) => <div key={k}><span className="text-slate-500">{k}:</span> {v}</div>)}
            </div>
          )}
          {!sim.ended && <div className="flex flex-wrap gap-1.5 mt-2">{suggestions.map((s) => <button key={s} type="button" onClick={() => send(s)} className="text-xs px-2 py-1 rounded-full border border-slate-300 hover:border-brand-400 hover:bg-brand-50">{s}</button>)}</div>}
          <div className="flex gap-2 mt-2">
            <Input value={txt} disabled={sim.ended} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={sim.ended ? 'Call ended' : 'Speak as the customer…'} />
            {!sim.ended ? <><IconButton icon={Send} title="Send" onClick={() => send()} /><IconButton icon={PhoneOff} tone="danger" title="Hang up" onClick={() => setSim({ ...sim, ended: true })} /></>
              : <Button size="sm" onClick={start}>Call again</Button>}
          </div>
        </div>
      )}
    </Card>
  )
}

function ListEditor({ items, onChange, fields, addLabel }) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-3 relative">
          <IconButton icon={X} title="Remove" className="absolute top-2 right-2" onClick={() => onChange(items.filter((_, j) => j !== i))} />
          <div className="space-y-2 pr-8">
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.area ? <Textarea rows={2} value={f.list ? (it[f.key] || []).join(', ') : it[f.key] || ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: f.list ? e.target.value.split(',').map((s) => s.trim()) : e.target.value } : x)))} />
                  : <Input value={f.list ? (it[f.key] || []).join(', ') : it[f.key] || ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: f.list ? e.target.value.split(',').map((s) => s.trim()) : e.target.value } : x)))} />}
              </Field>
            ))}
          </div>
        </div>
      ))}
      <Button size="sm" variant="secondary" icon={Plus} onClick={() => onChange([...items, Object.fromEntries(fields.map((f) => [f.key, f.list ? [] : '']))])}>{addLabel}</Button>
    </div>
  )
}

const NEW_SCRIPT = { name: 'New script', purpose: 'PROMOTIONAL', language: 'Hindi', active: true, greeting: 'Namaste {{customer_name}} ji, main Aarohi Btali International se bol rahi hoon.', about: { profile: '', contact: '', locations: '', hours: '' }, qualification: [{ key: 'budget', question: 'Aapka budget kitna hai?' }], context: { productIds: [], pricing: '', paymentPlans: '', offers: '' }, closing: { siteVisit: '', callback: '', nextAction: '' }, faqs: [], objections: [], flow: [] }

export default function Scripts() {
  const scripts = useStore((s) => s.aiScripts || [])
  const products = useStore((s) => s.products)
  const settings = useStore((s) => s.aiSettings)
  const { aiSaveScript, aiDeleteScript } = useStore()
  const [sel, setSel] = useState(scripts[0]?.id)
  const cur = scripts.find((s) => s.id === sel) || scripts[0]
  const [draft, setDraft] = useState(cur)
  const [tab, setTab] = useState('about')
  useEffect(() => { setDraft(cur) }, [cur?.id, cur?.version]) // eslint-disable-line
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(cur), [draft, cur])
  if (!draft) return null
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const sub = (k) => (patch) => setDraft((d) => ({ ...d, [k]: { ...d[k], ...patch } }))
  const save = () => { const s = aiSaveScript(draft); toast.success(`Script saved – version ${s.version}`, 'The AI agent uses it from the next call') }
  const insertVar = (v) => set({ greeting: `${draft.greeting} ${v}` })
  const tabs = [
    { key: 'about', label: 'About the business' }, { key: 'qual', label: 'Qualification', count: draft.qualification?.length }, { key: 'context', label: 'Products & pricing' },
    { key: 'closing', label: 'Meeting & closing' }, { key: 'faq', label: 'FAQs', count: draft.faqs?.length }, { key: 'obj', label: 'Objections', count: draft.objections?.length }, { key: 'flow', label: 'Call flow', count: draft.flow?.length },
  ]
  return (
    <div>
      <PageHeader title="Business Info & Scripts" subtitle="What the AI agent knows and says – edit, version and test before going live"
        actions={<>
          <Button variant="secondary" icon={Plus} onClick={() => { const s = aiSaveScript({ ...NEW_SCRIPT, voice: settings.voice }); setSel(s.id); toast.success('Script created') }}>New script</Button>
          <Button icon={Save} disabled={!dirty} onClick={save}>Save{dirty ? ' changes' : 'd'}</Button>
        </>} />
      <div className="flex gap-2 flex-wrap mb-4">
        {scripts.map((s) => (
          <button key={s.id} type="button" onClick={async () => { if (dirty && !(await confirm({ title: 'Discard unsaved changes?', confirmText: 'Discard' }))) return; setSel(s.id) }}
            className={cx('text-left rounded-xl border px-3 py-2 min-w-[220px]', s.id === cur.id ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300')}>
            <div className="text-sm font-semibold text-slate-900">{s.name}</div>
            <div className="text-[11px] text-slate-500">v{s.version} · {CAMPAIGN_TYPES[s.purpose] || s.purpose} · {s.active ? 'active' : 'inactive'}</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <Card title="Script settings" subtitle={<span>Last saved {fmtDateTime(cur.updatedAt)} by <UserName id={cur.updatedBy} /></span>}
            actions={<>
              <IconButton icon={Copy} title="Duplicate" onClick={() => { const { id: _omit, ...rest } = draft; const s = aiSaveScript({ ...rest, name: `${draft.name} (copy)`, version: 1 }); setSel(s.id); toast.success('Script duplicated') }} />
              <IconButton icon={Trash2} tone="danger" title="Delete" onClick={async () => { if (scripts.length < 2) { toast.error('At least one script is required'); return } if (await confirm({ title: `Delete ${cur.name}?`, tone: 'danger', confirmText: 'Delete' })) { aiDeleteScript(cur.id); setSel(scripts.find((s) => s.id !== cur.id)?.id); toast.success('Script deleted') } }} />
            </>}>
            <FormGrid cols={3}>
              <Field label="Script name"><Input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Purpose"><Select value={draft.purpose} onChange={(e) => set({ purpose: e.target.value })} options={Object.entries(CAMPAIGN_TYPES).map(([value, label]) => ({ value, label }))} /></Field>
              <Field label="Language"><Select value={draft.language} onChange={(e) => set({ language: e.target.value })} options={LANG} /></Field>
            </FormGrid>
            <Field label="Opening line" className="mt-4" hint="Variables are filled from the lead record at call time"><Textarea rows={2} value={draft.greeting} onChange={(e) => set({ greeting: e.target.value })} /></Field>
            <div className="flex flex-wrap gap-1.5 mt-2">{VARS.map((v) => <button key={v} type="button" onClick={() => insertVar(v)} className="text-[11px] font-mono px-2 py-0.5 rounded bg-ink-50 text-ink-700 hover:bg-ink-100">{v}</button>)}</div>
            <div className="mt-3"><Switch checked={draft.active} onChange={(v) => set({ active: v })} label="Active – available for campaigns" /></div>
          </Card>
          <Card padded={false}>
            <Tabs className="px-3 pt-1" value={tab} onChange={setTab} tabs={tabs} />
            <div className="p-4">
              {tab === 'about' && <div className="space-y-3">
                <Field label={<span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />Company profile</span>}><Textarea rows={3} value={draft.about?.profile} onChange={(e) => sub('about')({ profile: e.target.value })} /></Field>
                <FormGrid>
                  <Field label="Contact details"><Textarea rows={2} value={draft.about?.contact} onChange={(e) => sub('about')({ contact: e.target.value })} /></Field>
                  <Field label="Locations"><Textarea rows={2} value={draft.about?.locations} onChange={(e) => sub('about')({ locations: e.target.value })} /></Field>
                </FormGrid>
                <Field label="Working hours"><Input value={draft.about?.hours} onChange={(e) => sub('about')({ hours: e.target.value })} /></Field>
              </div>}
              {tab === 'qual' && <ListEditor items={draft.qualification || []} onChange={(v) => set({ qualification: v })} addLabel="Add question" fields={[{ key: 'key', label: 'Field captured (e.g. budget, timeline)' }, { key: 'question', label: 'Question the AI asks', area: true }]} />}
              {tab === 'context' && <div className="space-y-3">
                <Field label={<span className="inline-flex items-center gap-1"><Package className="w-3.5 h-3.5" />Products the AI may pitch</span>}>
                  <div className="flex flex-wrap gap-1.5">{(draft.context?.productIds || []).map((id) => { const p = products.find((x) => x.id === id); return <Badge key={id} tone="ink">{p?.sku} · {fmtINR(p?.mrp)}<button className="ml-1" onClick={() => sub('context')({ productIds: draft.context.productIds.filter((x) => x !== id) })}>×</button></Badge> })}</div>
                  <Combobox className="mt-2 max-w-sm" value="" placeholder="Add product…" onChange={(v) => sub('context')({ productIds: [...new Set([...(draft.context?.productIds || []), v])] })} options={products.filter((p) => p.type === 'FG').map((p) => ({ value: p.id, label: p.name, sub: `${p.sku} · MRP ${fmtINR(p.mrp)}` }))} />
                </Field>
                <Field label="Pricing guidelines"><Textarea rows={2} value={draft.context?.pricing} onChange={(e) => sub('context')({ pricing: e.target.value })} /></Field>
                <Field label="Payment plans"><Textarea rows={2} value={draft.context?.paymentPlans} onChange={(e) => sub('context')({ paymentPlans: e.target.value })} /></Field>
                <Field label="Current offers"><Textarea rows={2} value={draft.context?.offers} onChange={(e) => sub('context')({ offers: e.target.value })} /></Field>
              </div>}
              {tab === 'closing' && <div className="space-y-3">
                <Field label={<span className="inline-flex items-center gap-1"><CalendarCheck className="w-3.5 h-3.5" />Site visit / demo booking</span>}><Textarea rows={2} value={draft.closing?.siteVisit} onChange={(e) => sub('closing')({ siteVisit: e.target.value })} /></Field>
                <Field label="Sales callback"><Textarea rows={2} value={draft.closing?.callback} onChange={(e) => sub('closing')({ callback: e.target.value })} /></Field>
                <Field label="Desired next action"><Textarea rows={2} value={draft.closing?.nextAction} onChange={(e) => sub('closing')({ nextAction: e.target.value })} /></Field>
              </div>}
              {tab === 'faq' && <ListEditor items={draft.faqs || []} onChange={(v) => set({ faqs: v })} addLabel="Add FAQ" fields={[{ key: 'q', label: 'Question' }, { key: 'a', label: 'Approved answer', area: true }, { key: 'keywords', label: 'Trigger keywords (comma separated)', list: true }]} />}
              {tab === 'obj' && <ListEditor items={draft.objections || []} onChange={(v) => set({ objections: v })} addLabel="Add objection" fields={[{ key: 'objection', label: 'Objection' }, { key: 'keywords', label: 'Trigger keywords (comma separated)', list: true }, { key: 'response', label: 'Response', area: true }]} />}
              {tab === 'flow' && <div>
                <ol className="space-y-2 mb-3">{(draft.flow || []).map((s, i) => <li key={i} className="flex gap-3 items-start"><span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-1">{i + 1}</span><div className="flex-1 text-sm"><div className="font-medium">{s.title}</div><div className="text-slate-500 text-xs">{s.text}</div></div></li>)}</ol>
                <ListEditor items={draft.flow || []} onChange={(v) => set({ flow: v })} addLabel="Add step" fields={[{ key: 'title', label: 'Step' }, { key: 'text', label: 'Instruction', area: true }]} />
              </div>}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <TestCall script={draft} />
          <Card title="Knowledge coverage">
            {[[HelpCircle, 'FAQs', draft.faqs?.length], [ShieldQuestion, 'Objection responses', draft.objections?.length], [MessageSquareQuote, 'Qualification questions', draft.qualification?.length], [Package, 'Products in context', draft.context?.productIds?.length], [ListOrdered, 'Call-flow steps', draft.flow?.length]].map(([I, l, n]) => (
              <div key={l} className="flex items-center justify-between py-1.5 text-sm"><span className="flex items-center gap-2 text-slate-600"><I className="w-4 h-4" />{l}</span><span className="font-semibold tabular-nums">{n || 0}</span></div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
