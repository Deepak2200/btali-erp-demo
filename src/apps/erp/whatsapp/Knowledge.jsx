import React, { useMemo, useState } from 'react'
import { Plus, BookMarked, FlaskConical, HelpCircle, Trash2, Sparkles, Send, CheckCircle2, X } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Button, Badge, Drawer, Field, Input, Textarea, Select, FormGrid, Switch, FileUpload, AttachmentList, Grid, Stat, EmptyState, Progress, toast, confirm, cx } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { timeAgo, fmtNum } from '../../../lib/format'
import { waBotAnswer } from '../../../store/slices/ai'
import { intentLabel, Bubble, useWaRunners } from './_shared'

const CATS = ['Company', 'Products', 'Pricing', 'Orders', 'Policies', 'Warranty', 'Service', 'Dealership']

export default function WaKnowledge() {
  useWaRunners()
  const kb = useStore((s) => s.waKnowledge) || []
  const unanswered = useStore((s) => s.waUnanswered) || []
  const save = useStore((s) => s.waSaveKnowledge)
  const del = useStore((s) => s.waDeleteKnowledge)
  const resolveQ = useStore((s) => s.waResolveUnanswered)
  const dismissQ = useStore((s) => s.waDismissUnanswered)
  const users = useStore((s) => s.users)
  const [edit, setEdit] = useState(null)
  const open = unanswered.filter((u) => u.status === 'OPEN')

  const onSave = (data, fromQ) => {
    const k = save(data)
    if (fromQ) resolveQ(fromQ, k.id)
    toast.success(data.id ? 'Knowledge entry updated' : 'Knowledge entry added', 'Btali Assistant uses it immediately')
    setEdit(null)
  }
  const onDelete = async (k) => {
    if (!(await confirm({ title: 'Delete this entry?', message: k.question, tone: 'danger', confirmText: 'Delete' }))) return
    del(k.id)
    toast.success('Entry deleted')
    setEdit(null)
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Knowledge Base & FAQ" subtitle="Approved answers Btali Assistant uses on WhatsApp – company info, products, pricing guidelines, policies and FAQs"
        actions={<Button icon={Plus} onClick={() => setEdit({})}>Add FAQ</Button>} />
      <Grid cols={4}>
        <Stat label="Knowledge entries" value={kb.length} sub={`${kb.filter((k) => k.active !== false).length} active`} icon={BookMarked} tone="green" />
        <Stat label="Answers served" value={fmtNum(kb.reduce((a, k) => a + (k.hits || 0), 0))} icon={Sparkles} tone="blue" />
        <Stat label="Open questions" value={open.length} sub="the bot could not answer" icon={HelpCircle} tone="amber" />
        <Stat label="Categories" value={new Set(kb.map((k) => k.category)).size} icon={BookMarked} tone="ink" />
      </Grid>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <div className="min-w-0 space-y-4">
          <DataTable rows={kb} onRowClick={(k) => setEdit(k)} exportName="whatsapp-knowledge-base" searchPlaceholder="Search questions, keywords, answers…"
            filters={[{ key: 'category', label: 'categories', options: CATS }]}
            columns={[
              { key: 'question', header: 'Question', render: (k) => <div className="min-w-[220px]"><div className="font-medium text-slate-800">{k.question}</div><div className="text-[11px] text-slate-500 line-clamp-1">{k.answer}</div></div> },
              { key: 'intent', header: 'Intent', render: (k) => <span className="font-mono text-[11px]">{k.intent}</span> },
              { key: 'category', header: 'Category', render: (k) => <Badge tone="teal">{k.category}</Badge> },
              { key: 'keywords', header: 'Keywords', value: (k) => (k.keywords || []).join(', '), render: (k) => <div className="flex gap-1 flex-wrap max-w-[220px]">{(k.keywords || []).slice(0, 4).map((w) => <Badge key={w}>{w}</Badge>)}{(k.keywords || []).length > 4 && <Badge>+{k.keywords.length - 4}</Badge>}</div> },
              { key: 'hits', header: 'Used', align: 'right' },
              { key: 'active', header: 'Status', value: (k) => (k.active === false ? 'Inactive' : 'Active'), render: (k) => <Badge tone={k.active === false ? 'gray' : 'green'} dot>{k.active === false ? 'Inactive' : 'Active'}</Badge> },
              { key: 'updatedAt', header: 'Updated', render: (k) => <span className="text-xs">{timeAgo(k.updatedAt)}<br /><span className="text-slate-400">{users.find((u) => u.id === k.updatedBy)?.name.split(' ')[0]}</span></span> },
            ]} />
        </div>
        <div className="space-y-4">
          <TestBox />
          <Card title="Questions needing an answer" subtitle="Captured when the bot had no approved answer">
            {open.length === 0 ? <EmptyState icon={CheckCircle2} title="All questions answered" /> : (
              <ul className="space-y-2">
                {open.map((u) => (
                  <li key={u.id} className="border border-amber-200 bg-amber-50/50 rounded-lg p-2.5">
                    <div className="text-sm text-slate-800">“{u.question}”</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{u.name} · {timeAgo(u.ts)}</div>
                    <div className="flex gap-1.5 mt-2">
                      <Button size="sm" icon={Plus} onClick={() => setEdit({ question: u.question, _fromQ: u.id, keywords: u.question.toLowerCase().split(/\W+/).filter((w) => w.length > 3).slice(0, 4) })}>Create FAQ</Button>
                      <Button size="sm" variant="ghost" icon={X} onClick={() => { dismissQ(u.id); toast.success('Question dismissed') }}>Dismiss</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {edit && <Editor k={edit} onClose={() => setEdit(null)} onSave={onSave} onDelete={onDelete} />}
    </div>
  )
}

function TestBox() {
  const [text, setText] = useState('')
  const [res, setRes] = useState(null)
  const run = (t = text) => {
    if (!t.trim()) return
    const st = useStore.getState()
    setRes({ q: t, ...waBotAnswer(st, { id: 'test', name: 'Test user', messages: [], fallbacks: 0 }, t) })
  }
  const samples = ['What are your working hours?', 'Bank details for NEFT', 'BT-AC24 price', 'Delivery kitne din me hogi?', 'Do you export to Nepal?']
  const effects = { TICKET: 'Creates a service ticket', HANDOVER: 'Hands over to an executive', LEAD: 'Captures a sales lead', UNANSWERED: 'Logs an unanswered question', KB_HIT: 'Uses knowledge entry', ASK_CSAT: 'Asks for feedback', OPT_OUT: 'Updates opt-out' }
  return (
    <Card title={<span className="flex items-center gap-1.5"><FlaskConical className="w-4 h-4 text-violet-500" /> Test the bot</span>} subtitle="Dry run – nothing is sent or saved">
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} placeholder="Ask a customer question…" />
        <Button icon={Send} onClick={() => run()} disabled={!text.trim()} />
      </div>
      <div className="flex flex-wrap gap-1 mt-2">{samples.map((s) => <button key={s} type="button" onClick={() => { setText(s); run(s) }} className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:border-violet-400">{s}</button>)}</div>
      {res && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={res.intent === 'FALLBACK' ? 'red' : 'violet'}>{intentLabel(res.intent)}</Badge>
            <span className="text-xs text-slate-500">confidence</span>
            <Progress value={res.confidence * 100} tone={res.confidence > 0.7 ? 'green' : res.confidence > 0.4 ? 'amber' : 'red'} className="flex-1 min-w-[80px]" showLabel />
          </div>
          <div className="rounded-lg bg-[#efeae2] p-2">
            <Bubble m={{ id: 'q', from: 'customer', text: res.q, ts: new Date().toISOString() }} />
            {res.messages.map((m, i) => <Bubble key={i} m={{ id: `r${i}`, from: 'bot', ...m, text: m.text.replace('{{ticket}}', 'TKT-#####'), intent: res.intent, ts: new Date().toISOString(), status: 'read' }} products={useStore.getState().products} />)}
          </div>
          {res.effects.length > 0 && <div className="text-[11px] text-slate-500">Actions: {res.effects.map((e) => effects[e.type] || e.type).join(' · ')}</div>}
        </div>
      )}
    </Card>
  )
}

function Editor({ k, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ intent: '', category: 'Products', question: '', answer: '', active: true, attachment: null, ...k, keywordsText: (k.keywords || []).join(', '), quickText: (k.quickReplies || []).join(', ') })
  const set = (key, v) => setF((x) => ({ ...x, [key]: v }))
  const valid = f.question.trim() && f.answer.trim() && f.keywordsText.trim()
  const submit = () => {
    if (!valid) { toast.error('Question, answer and at least one keyword are required'); return }
    const { keywordsText, quickText, _fromQ, ...rest } = f
    onSave({ ...rest, intent: (f.intent || f.question).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30), keywords: keywordsText.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean), quickReplies: quickText.split(',').map((x) => x.trim()).filter(Boolean) }, _fromQ)
  }
  const preview = useMemo(() => f.answer, [f.answer])
  return (
    <Drawer open onClose={onClose} title={k.id ? 'Edit knowledge entry' : 'New knowledge entry'} subtitle={k.id ? `${k.intent} · used ${k.hits || 0} times` : 'Answers go live as soon as you save'}
      footer={<>{k.id && <Button variant="ghost" icon={Trash2} className="mr-auto text-red-600" onClick={() => onDelete(k)}>Delete</Button>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!valid}>Save entry</Button></>}>
      <div className="space-y-4">
        <Field label="Customer question" required><Input value={f.question} onChange={(e) => set('question', e.target.value)} placeholder="e.g. Do you offer EMI?" /></Field>
        <FormGrid>
          <Field label="Intent code" hint="Auto-generated from the question if empty"><Input value={f.intent} onChange={(e) => set('intent', e.target.value)} placeholder="EMI_OPTIONS" className="font-mono" /></Field>
          <Field label="Category"><Select value={f.category} onChange={(e) => set('category', e.target.value)} options={CATS} /></Field>
        </FormGrid>
        <Field label="Trigger keywords" required hint="Comma separated – Hindi / Hinglish variants help (e.g. emi, kist, installment)"><Input value={f.keywordsText} onChange={(e) => set('keywordsText', e.target.value)} /></Field>
        <Field label="Approved answer" required><Textarea rows={5} value={f.answer} onChange={(e) => set('answer', e.target.value)} /></Field>
        <Field label="Quick-reply buttons" hint="Comma separated, max 3 shown"><Input value={f.quickText} onChange={(e) => set('quickText', e.target.value)} placeholder="Talk to executive, Product prices" /></Field>
        <Field label="Attachment (brochure / PDF)">
          {f.attachment ? <AttachmentList items={[{ id: 'a', ...f.attachment }]} onRemove={() => set('attachment', null)} /> : <FileUpload compact multiple={false} onFiles={([a]) => set('attachment', a)} label="Upload document shared with this answer" />}
        </Field>
        <Switch checked={f.active !== false} onChange={(v) => set('active', v)} label="Active – the bot may use this answer" />
        {preview && (
          <div className={cx('rounded-lg bg-[#efeae2] p-2')}>
            <Bubble m={{ id: 'p', from: 'bot', text: preview, ts: new Date().toISOString(), status: 'read', attachment: f.attachment, quick: f.quickText.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3) }} />
          </div>
        )}
      </div>
    </Drawer>
  )
}
