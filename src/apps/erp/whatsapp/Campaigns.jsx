import React, { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Send, CheckCircle2, XCircle, Pencil, Trash2, Upload, Download, Users, Megaphone, Copy, CalendarClock, FileText, Ban, UserPlus } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import { PageHeader, Tabs, Card, Button, Badge, StatusBadge, Modal, Drawer, Field, Input, Select, Combobox, FormGrid, Switch, FileUpload, AttachmentList, Progress, Timeline, Alert, Grid, Stat, EmptyState, DescriptionList, toast, confirm, prompt, cx } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtNum, fmtPct, fmtDateTime, timeAgo, downloadText, parseCSV, titleCase } from '../../../lib/format'
import { PhonePreview, fillVars, useWaRunners } from './_shared'

const TYPES = { PROMOTION: 'Promotion / launch', FESTIVAL: 'Festival greeting & offer', FOLLOW_UP: 'Enquiry follow-up', REMINDER: 'Reminder', UPDATE: 'Order / service update' }
const CONTACT_TYPES = ['DEALER', 'FRANCHISE', 'RETAILER', 'PROSPECT', 'END_CUSTOMER']
export const TEMPLATES = [
  { name: 'btali_diwali_offer_v2', category: 'MARKETING', language: 'Hindi', body: 'Namaste {{name}} ji! 🪔 Diwali Dhamaka is live – extra 5% on pressure washers & compressors and Buy 10 sprayers Get 1 FREE till 15 Nov. Reply ORDER to book.', buttons: ['Place order', 'Talk to sales'], type: 'FESTIVAL' },
  { name: 'btali_product_launch_v1', category: 'MARKETING', language: 'Hindi', body: 'Namaste {{name}} ji 🌾 Naya Btali product launch! Intro price for {{city}} dealers. Reply YES for price list.', buttons: ['Get price list', 'Talk to sales'], type: 'PROMOTION' },
  { name: 'btali_carwash_promo_v1', category: 'MARKETING', language: 'English', body: 'Hi {{name}} 🚗 Upgrade your car wash with Btali pressure washers – 150 bar, copper motor, 12-month warranty. Festive price valid this week only.', buttons: ['Book demo', 'Price'], type: 'PROMOTION' },
  { name: 'btali_enquiry_followup_v1', category: 'MARKETING', language: 'English', body: 'Hi {{name}}, thanks for your enquiry with Btali International. Our catalogue is attached – reply with the model you like and we will share the best price for {{city}}.', buttons: ['Talk to sales'], type: 'FOLLOW_UP' },
  { name: 'btali_service_camp_v1', category: 'UTILITY', language: 'Hindi', body: 'Namaste {{name}} ji, Btali free service camp this Sunday 10 AM – 5 PM. Bring your pump / sprayer for a free check-up. 🔧', buttons: ['Get directions'], type: 'REMINDER' },
  { name: 'btali_site_visit_reminder', category: 'UTILITY', language: 'English', body: 'Hi {{name}}, a reminder that our sales executive will visit you tomorrow for the product demo. Reply 1 to confirm or 2 to reschedule.', buttons: ['Confirm', 'Reschedule'], type: 'REMINDER' },
]
const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const segmentFilter = (contacts, seg = {}) => contacts.filter((c) =>
  (!seg.types?.length || seg.types.includes(c.type)) && (!seg.tags?.length || seg.tags.some((t) => (c.tags || []).includes(t))) &&
  (!seg.cities?.length || seg.cities.includes(c.city)) && (!seg.languages?.length || seg.languages.includes(c.language)))
export const segmentText = (seg = {}) => [seg.types?.length && seg.types.map((t) => titleCase(t)).join(', '), seg.tags?.length && `Tags: ${seg.tags.join(', ')}`, seg.cities?.length && `Cities: ${seg.cities.join(', ')}`, seg.languages?.length && seg.languages.join(', ')].filter(Boolean).join(' · ') || 'All contacts'

function Chips({ options, value = [], onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o)
        return <button key={o} type="button" onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
          className={cx('text-xs px-2.5 py-1 rounded-full border transition-colors', on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 text-slate-600 hover:border-emerald-400')}>{titleCase(o)}</button>
      })}
    </div>
  )
}

export default function WaCampaigns() {
  useWaRunners()
  const [tab, setTab] = useState('campaigns')
  const [builder, setBuilder] = useState(null)
  const camps = useStore((s) => s.waCampaigns) || []
  const contacts = useStore((s) => s.waContacts) || []
  return (
    <div className="space-y-4">
      <PageHeader title="Campaigns & Contacts" subtitle="Personalised WhatsApp broadcasts with approval workflow, segments and opt-out management"
        actions={<Button icon={Plus} onClick={() => setBuilder({})}>New campaign</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'campaigns', label: 'Campaigns', count: camps.length }, { key: 'contacts', label: 'Contacts & segments', count: contacts.length }, { key: 'templates', label: 'Message templates', count: TEMPLATES.length }]} />
      {tab === 'campaigns' && <CampaignList onEdit={setBuilder} />}
      {tab === 'contacts' && <Contacts />}
      {tab === 'templates' && <Templates onUse={(t) => setBuilder({ templateName: t.name, category: t.category, language: t.language, message: t.body, buttons: t.buttons, type: t.type })} />}
      {builder && <Builder initial={builder} onClose={() => setBuilder(null)} />}
    </div>
  )
}

// ------------------------------------------------------------------ campaigns
function CampaignList({ onEdit }) {
  const user = useUser()
  const nav = useNavigate()
  const camps = useStore((s) => s.waCampaigns) || []
  const contacts = useStore((s) => s.waContacts) || []
  const users = useStore((s) => s.users)
  const submit = useStore((s) => s.waSubmitCampaign)
  const approve = useStore((s) => s.approveWaCampaign)
  const sendNow = useStore((s) => s.waSendCampaign)
  const del = useStore((s) => s.waDeleteCampaign)
  const save = useStore((s) => s.waSaveCampaign)
  const [open, setOpen] = useState(null)
  const canApprove = ['ADMIN', 'SALES_MANAGER'].includes(user?.role)
  const sorted = [...camps].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  const recips = (c) => segmentFilter(contacts, c.segment).filter((x) => !x.optOut).length
  const pending = camps.filter((c) => c.status === 'PENDING_APPROVAL')

  const act = {
    submit: (c) => { submit(c.id); toast.success('Submitted for approval', 'Director and Sales Manager have been notified') },
    approve: async (c) => { if (!(await confirm({ title: `Approve "${c.name}"?`, message: `${recips(c)} recipients will receive this message${c.scheduledAt ? ` on ${fmtDateTime(c.scheduledAt)}` : ' once you send it'}.`, confirmText: 'Approve' }))) return; approve(c.id, true, ''); toast.success('Campaign approved') },
    reject: async (c) => { const r = await prompt({ title: `Reject "${c.name}"`, label: 'Reason for rejection', required: true, tone: 'danger', confirmText: 'Reject' }); if (r == null) return; approve(c.id, false, r); toast.success('Campaign rejected', 'The creator has been notified by email') },
    send: async (c) => { if (!(await confirm({ title: 'Send broadcast now?', message: `${recips(c)} contacts will receive "${c.name}". Opted-out contacts are excluded automatically.`, confirmText: 'Send now' }))) return; if (sendNow(c.id)) toast.success('Broadcast started', 'Delivery stats update live') },
    del: async (c) => { if (!(await confirm({ title: 'Delete campaign?', message: c.name, tone: 'danger', confirmText: 'Delete' }))) return; del(c.id); setOpen(null); toast.success('Campaign deleted') },
    dup: (c) => { const n = save({ name: `${c.name} (copy)`, type: c.type, category: c.category, templateName: c.templateName, language: c.language, segment: c.segment, message: c.message, attachment: c.attachment, buttons: c.buttons, productId: c.productId }); toast.success('Campaign duplicated', n.number) },
    edit: (c) => { if (c.status === 'REJECTED') save({ id: c.id, status: 'DRAFT' }); onEdit(c) },
  }
  const actions = (c, size = 'sm') => (
    <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
      {['DRAFT', 'REJECTED'].includes(c.status) && <Button size={size} variant="secondary" icon={Pencil} onClick={() => act.edit(c)}>Edit</Button>}
      {c.status === 'DRAFT' && <Button size={size} icon={Send} onClick={() => act.submit(c)}>Submit for approval</Button>}
      {c.status === 'PENDING_APPROVAL' && canApprove && <><Button size={size} variant="success" icon={CheckCircle2} onClick={() => act.approve(c)}>Approve</Button><Button size={size} variant="danger" icon={XCircle} onClick={() => act.reject(c)}>Reject</Button></>}
      {c.status === 'PENDING_APPROVAL' && !canApprove && <Badge tone="amber">Awaiting Sales Manager / Director</Badge>}
      {['APPROVED', 'SCHEDULED'].includes(c.status) && <><Button size={size} icon={Send} onClick={() => act.send(c)}>Send now</Button><Button size={size} variant="secondary" icon={CalendarClock} onClick={() => nav('/erp/whatsapp/scheduler')}>{c.status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}</Button></>}
      {c.status === 'SENT' && <Button size={size} variant="secondary" icon={Copy} onClick={() => act.dup(c)}>Duplicate</Button>}
      {['DRAFT', 'REJECTED'].includes(c.status) && <Button size={size} variant="ghost" icon={Trash2} onClick={() => act.del(c)} />}
    </div>
  )
  const cur = camps.find((c) => c.id === open)
  return (
    <>
      {pending.length > 0 && canApprove && <Alert tone="warn" title={`${pending.length} campaign${pending.length > 1 ? 's' : ''} awaiting your approval`}>Review the message, audience and schedule before releasing the broadcast.</Alert>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sorted.length === 0 && <Card className="lg:col-span-2"><EmptyState icon={Megaphone} title="No campaigns yet" /></Card>}
        {sorted.map((c) => {
          const s = c.stats
          return (
            <div key={c.id} onClick={() => setOpen(c.id)} className="bg-white rounded-xl border border-slate-200 shadow-card p-4 cursor-pointer hover:border-emerald-300 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-400">{c.number} · {TYPES[c.type] || c.type} · {c.templateName}</div>
                  <div className="font-semibold text-slate-900 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{segmentText(c.segment)} · {s ? s.targeted : recips(c)} recipients</div>
                </div>
                <StatusBadge status={c.status} label={c.status === 'SENDING' ? 'Sending…' : undefined} />
              </div>
              <p className="text-sm text-slate-600 mt-2 line-clamp-2">{c.message}</p>
              {s && (
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {[['Sent', s.sent, 'ink'], ['Delivered', s.delivered, 'blue'], ['Read', s.read, 'green'], ['Replied', s.replied, 'brand']].map(([l, v, t]) => (
                    <div key={l}><div className="text-[10px] uppercase text-slate-400">{l}</div><div className="text-sm font-bold tabular-nums">{fmtNum(v)}</div><Progress value={v} max={s.targeted || 1} tone={t} /></div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
                <div className="text-[11px] text-slate-400">{c.scheduledAt && c.status !== 'SENT' ? `Scheduled ${fmtDateTime(c.scheduledAt)}` : c.sentAt ? `Sent ${fmtDateTime(c.sentAt)}` : `Created ${timeAgo(c.createdAt)}`}{c.remark ? ` · “${c.remark}”` : ''}</div>
                {actions(c)}
              </div>
            </div>
          )
        })}
      </div>
      <Drawer open={!!cur} onClose={() => setOpen(null)} title={cur?.name} subtitle={cur && `${cur.number} · ${TYPES[cur.type] || cur.type}`} footer={cur && actions(cur, 'md')}>
        {cur && (
          <div className="space-y-5">
            <div className="flex gap-6 flex-col md:flex-row">
              <PhonePreview text={fillVars(cur.message, contacts.find((x) => segmentFilter([x], cur.segment).length) || {})} attachment={cur.attachment} buttons={cur.buttons} product={useStore.getState().products.find((p) => p.id === cur.productId)} />
              <div className="flex-1 min-w-0 space-y-4">
                <DescriptionList cols={1} items={[
                  ['Status', <StatusBadge status={cur.status} />], ['Template', `${cur.templateName} (${cur.category}, ${cur.language})`], ['Audience', segmentText(cur.segment)],
                  ['Recipients', cur.stats ? `${cur.stats.targeted} (${cur.stats.excludedOptOut || 0} opted-out excluded)` : `${recips(cur)} after opt-out exclusion`],
                  ['Schedule', cur.scheduledAt ? fmtDateTime(cur.scheduledAt) : 'Send manually after approval'], ['Created by', users.find((u) => u.id === cur.createdBy)?.name],
                  cur.approvedBy && ['Approved / reviewed by', `${users.find((u) => u.id === cur.approvedBy)?.name} · ${fmtDateTime(cur.approvedAt)}`],
                ]} />
                {cur.stats && (
                  <div className="space-y-2">
                    {[['Delivered', cur.stats.delivered, 'blue'], ['Read', cur.stats.read, 'green'], ['Replied', cur.stats.replied, 'brand'], ['Failed', cur.stats.failed, 'red']].map(([l, v, t]) => (
                      <div key={l}><div className="flex justify-between text-xs"><span>{l}</span><span className="tabular-nums font-semibold">{v} · {fmtPct(cur.stats.targeted ? (v / cur.stats.targeted) * 100 : 0, 0)}</span></div><Progress value={v} max={cur.stats.targeted || 1} tone={t} /></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div><div className="text-sm font-semibold mb-2">History</div><Timeline items={[...(cur.history || [])].reverse()} /></div>
          </div>
        )}
      </Drawer>
    </>
  )
}

// ------------------------------------------------------------------ builder
function Builder({ initial, onClose }) {
  const contacts = useStore((s) => s.waContacts) || []
  const products = useStore((s) => s.products)
  const save = useStore((s) => s.waSaveCampaign)
  const submit = useStore((s) => s.waSubmitCampaign)
  const ta = useRef(null)
  const [f, setF] = useState({ name: '', type: 'PROMOTION', category: 'MARKETING', templateName: 'btali_product_launch_v1', language: 'Hindi', segment: { types: [], tags: [], cities: [], languages: [] }, message: '', attachment: null, buttons: ['', ''], productId: '', scheduledAt: '', ...initial, scheduledAt: toLocalInput(initial.scheduledAt), buttons: [...(initial.buttons || []), '', ''].slice(0, 2) })
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const seg = (k, v) => setF((x) => ({ ...x, segment: { ...x.segment, [k]: v } }))
  const tags = useMemo(() => [...new Set(contacts.flatMap((c) => c.tags || []))].sort(), [contacts])
  const cities = useMemo(() => [...new Set(contacts.map((c) => c.city).filter(Boolean))].sort(), [contacts])
  const matched = segmentFilter(contacts, f.segment)
  const recips = matched.filter((c) => !c.optOut)
  const insert = (v) => {
    const el = ta.current
    const pos = el ? el.selectionStart : f.message.length
    set('message', f.message.slice(0, pos) + v + f.message.slice(pos))
  }
  const valid = f.name.trim() && f.message.trim() && recips.length > 0
  const doSave = (andSubmit) => {
    if (!valid) { toast.error('Complete the campaign', 'Name, message and at least one recipient are required'); return }
    const data = { ...f, buttons: f.buttons.filter(Boolean), productId: f.productId || null, scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null }
    const c = save(data)
    if (andSubmit) { submit(c.id); toast.success('Campaign submitted for approval', `${recips.length} recipients`) }
    else toast.success(initial.id ? 'Campaign updated' : 'Campaign saved as draft', c.number)
    onClose()
  }
  const sample = recips[0] || {}
  return (
    <Modal open onClose={onClose} size="xl" title={initial.id ? `Edit ${initial.number}` : 'New WhatsApp campaign'} subtitle="Messages go out through approved WhatsApp Business templates"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="secondary" onClick={() => doSave(false)}>Save draft</Button><Button icon={Send} onClick={() => doSave(true)} disabled={!valid}>Save & submit for approval</Button></>}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-5">
          <FormGrid>
            <Field label="Campaign name" required><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Rabi season sprayer launch" /></Field>
            <Field label="Campaign type"><Select value={f.type} onChange={(e) => set('type', e.target.value)} options={Object.entries(TYPES).map(([value, label]) => ({ value, label }))} /></Field>
            <Field label="Template"><Select value={f.templateName} onChange={(e) => { const t = TEMPLATES.find((x) => x.name === e.target.value); setF((x) => ({ ...x, templateName: e.target.value, category: t?.category || x.category, language: t?.language || x.language, message: x.message || t?.body || '' })) }} options={TEMPLATES.map((t) => ({ value: t.name, label: `${t.name} · ${t.category}` }))} /></Field>
            <Field label="Language"><Select value={f.language} onChange={(e) => set('language', e.target.value)} options={['Hindi', 'English', 'Marathi', 'Gujarati', 'Tamil']} /></Field>
          </FormGrid>
          <div className="border border-slate-200 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold flex items-center gap-1.5"><Users className="w-4 h-4" /> Audience segment</div>
              <Badge tone="green">{recips.length} recipients{matched.length - recips.length ? ` · ${matched.length - recips.length} opted-out excluded` : ''}</Badge></div>
            <Field label="Contact type"><Chips options={CONTACT_TYPES} value={f.segment.types} onChange={(v) => seg('types', v)} /></Field>
            <Field label="Interest tags"><Chips options={tags} value={f.segment.tags} onChange={(v) => seg('tags', v)} /></Field>
            <Field label="Cities"><Combobox value="" onChange={(v) => !f.segment.cities.includes(v) && seg('cities', [...f.segment.cities, v])} options={cities.filter((c) => !f.segment.cities.includes(c)).map((c) => ({ value: c, label: c }))} placeholder="Add city…" /></Field>
            {f.segment.cities.length > 0 && <div className="flex gap-1.5 flex-wrap">{f.segment.cities.map((c) => <button key={c} type="button" onClick={() => seg('cities', f.segment.cities.filter((x) => x !== c))} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 hover:bg-red-50">{c} ×</button>)}</div>}
            <Field label="Language"><Chips options={['Hindi', 'English']} value={f.segment.languages} onChange={(v) => seg('languages', v)} /></Field>
          </div>
          <Field label="Message" required hint="Variables are personalised per contact">
            <div className="flex gap-1.5 mb-1.5">{['{{name}}', '{{city}}', '{{business}}'].map((v) => <button key={v} type="button" onClick={() => insert(v)} className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">+ {v}</button>)}</div>
            <textarea ref={ta} rows={4} value={f.message} onChange={(e) => set('message', e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </Field>
          <FormGrid>
            <Field label="Button 1"><Input value={f.buttons[0]} onChange={(e) => set('buttons', [e.target.value, f.buttons[1]])} placeholder="e.g. Get price list" /></Field>
            <Field label="Button 2"><Input value={f.buttons[1]} onChange={(e) => set('buttons', [f.buttons[0], e.target.value])} placeholder="e.g. Talk to sales" /></Field>
            <Field label="Featured product (optional)"><Combobox value={f.productId} onChange={(v) => set('productId', v)} options={[{ value: '', label: 'None' }, ...products.filter((p) => p.type === 'FG').map((p) => ({ value: p.id, label: p.name, sub: p.sku }))]} /></Field>
            <Field label="Schedule (optional)" hint="Leave empty to send manually after approval"><Input type="datetime-local" value={f.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} /></Field>
          </FormGrid>
          <Field label="Attachment (brochure / PDF / image)">
            {f.attachment ? <AttachmentList items={[{ id: 'a', ...f.attachment }]} onRemove={() => set('attachment', null)} /> : <FileUpload compact multiple={false} onFiles={([a]) => set('attachment', a)} label="Upload brochure, leaflet or image" />}
          </Field>
        </div>
        <div className="lg:sticky lg:top-0 self-start">
          <div className="text-xs font-semibold text-slate-500 mb-2 text-center">Preview for {sample.name || 'recipient'}</div>
          <PhonePreview text={fillVars(f.message, sample)} attachment={f.attachment} buttons={f.buttons} product={products.find((p) => p.id === f.productId)} />
        </div>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ contacts
function Contacts() {
  const contacts = useStore((s) => s.waContacts) || []
  const toggle = useStore((s) => s.waToggleOptOut)
  const importC = useStore((s) => s.waImportContacts)
  const saveC = useStore((s) => s.waSaveContact)
  const delC = useStore((s) => s.waDeleteContact)
  const [edit, setEdit] = useState(null)
  const file = useRef(null)
  const tagCounts = useMemo(() => {
    const m = {}
    for (const c of contacts) for (const t of c.tags || []) m[t] = (m[t] || 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [contacts])
  const onFile = async (e) => {
    const fl = e.target.files?.[0]
    e.target.value = ''
    if (!fl) return
    const rows = parseCSV(await fl.text())
    if (!rows.length) { toast.error('No rows found', 'Use the CSV template with name, phone columns'); return }
    const r = importC(rows)
    toast.success(`${r.added} contacts imported`, `${r.dup} duplicates skipped`)
  }
  const template = () => downloadText('whatsapp-contacts-template.csv', 'name,phone,city,state,type,tags,language\nRamesh Patil,9822012345,Sangli,Maharashtra,RETAILER,Pumps;Sprayers,Hindi\nAnand Rao,9845098765,Hubli,Karnataka,PROSPECT,Pressure Washers,English\n', 'text/csv')
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat label="Contacts" value={fmtNum(contacts.length)} icon={Users} tone="green" />
        <Stat label="Dealers & franchise" value={fmtNum(contacts.filter((c) => ['DEALER', 'FRANCHISE'].includes(c.type)).length)} icon={UserPlus} tone="ink" />
        <Stat label="Prospects & customers" value={fmtNum(contacts.filter((c) => !['DEALER', 'FRANCHISE'].includes(c.type)).length)} icon={Megaphone} tone="blue" />
        <Stat label="Opted out" value={fmtNum(contacts.filter((c) => c.optOut).length)} sub="excluded from promotions" icon={Ban} tone="red" />
      </Grid>
      <Card title="Segments by interest tag">
        <div className="flex flex-wrap gap-2">{tagCounts.map(([t, n]) => <Badge key={t} tone="teal">{t} · {n}</Badge>)}</div>
      </Card>
      <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      <DataTable rows={contacts} exportName="whatsapp-contacts" searchPlaceholder="Search contacts…"
        filters={[{ key: 'type', label: 'types', options: CONTACT_TYPES.map((t) => ({ value: t, label: titleCase(t) })) }, { key: 'optOut', label: 'opt-out status', options: [{ value: 'true', label: 'Opted out' }, { value: 'false', label: 'Subscribed' }] }]}
        toolbar={<><Button size="sm" variant="ghost" icon={FileText} onClick={template}>CSV template</Button><Button size="sm" variant="secondary" icon={Upload} onClick={() => file.current?.click()}>Import CSV</Button><Button size="sm" icon={Plus} onClick={() => setEdit({})}>Add contact</Button></>}
        columns={[
          { key: 'name', header: 'Name', render: (c) => <div><div className="font-medium text-slate-800">{c.name}</div><div className="text-[11px] text-slate-500">{c.business || c.source}</div></div> },
          { key: 'phone', header: 'WhatsApp' },
          { key: 'city', header: 'City' },
          { key: 'type', header: 'Type', render: (c) => <Badge tone={c.type === 'DEALER' ? 'ink' : c.type === 'PROSPECT' ? 'amber' : 'gray'}>{titleCase(c.type)}</Badge> },
          { key: 'tags', header: 'Tags', value: (c) => (c.tags || []).join(', '), render: (c) => <div className="flex gap-1 flex-wrap">{(c.tags || []).map((t) => <Badge key={t}>{t}</Badge>)}</div> },
          { key: 'language', header: 'Language' },
          { key: 'lastMessageAt', header: 'Last message', render: (c) => (c.lastMessageAt ? timeAgo(c.lastMessageAt) : '—') },
          { key: 'optOut', header: 'Subscribed', value: (c) => (c.optOut ? 'Opted out' : 'Subscribed'), render: (c) => <span onClick={(e) => e.stopPropagation()}><Switch checked={!c.optOut} onChange={() => { toggle(c.id); toast.success(c.optOut ? `${c.name} re-subscribed` : `${c.name} opted out`, c.optOut ? '' : 'Excluded from future promotional campaigns') }} /></span> },
        ]}
        onRowClick={(c) => setEdit(c)} />
      {edit && <ContactModal c={edit} onClose={() => setEdit(null)} onSave={(d) => { saveC(d); toast.success(d.id ? 'Contact updated' : 'Contact added'); setEdit(null) }} onDelete={async () => { if (await confirm({ title: 'Delete contact?', message: edit.name, tone: 'danger', confirmText: 'Delete' })) { delC(edit.id); toast.success('Contact deleted'); setEdit(null) } }} />}
    </div>
  )
}
function ContactModal({ c, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ name: '', phone: '', city: '', business: '', type: 'PROSPECT', language: 'Hindi', ...c, tagsText: (c.tags || []).join(', ') })
  const ok = f.name.trim() && f.phone.replace(/\D/g, '').length >= 10
  return (
    <Modal open onClose={onClose} title={c.id ? 'Edit contact' : 'Add contact'} size="sm"
      footer={<>{c.id && <Button variant="ghost" icon={Trash2} onClick={onDelete} className="mr-auto text-red-600">Delete</Button>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!ok} onClick={() => { const { tagsText, ...rest } = f; onSave({ ...rest, tags: tagsText.split(',').map((x) => x.trim()).filter(Boolean) }) }}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="WhatsApp number" required><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <FormGrid><Field label="City"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field><Field label="Business"><Input value={f.business} onChange={(e) => setF({ ...f, business: e.target.value })} /></Field></FormGrid>
        <FormGrid><Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={CONTACT_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} /></Field><Field label="Language"><Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} options={['Hindi', 'English', 'Marathi', 'Gujarati', 'Tamil']} /></Field></FormGrid>
        <Field label="Tags" hint="Comma separated, e.g. Pumps, Sprayers"><Input value={f.tagsText} onChange={(e) => setF({ ...f, tagsText: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ templates
function Templates({ onUse }) {
  const camps = useStore((s) => s.waCampaigns) || []
  return (
    <DataTable rows={TEMPLATES.map((t) => ({ ...t, id: t.name, used: camps.filter((c) => c.templateName === t.name).length }))} exportName="whatsapp-templates"
      columns={[
        { key: 'name', header: 'Template', render: (t) => <span className="font-mono text-xs">{t.name}</span> },
        { key: 'category', header: 'Category', render: (t) => <Badge tone={t.category === 'MARKETING' ? 'violet' : 'blue'}>{t.category}</Badge> },
        { key: 'language', header: 'Language' },
        { key: 'body', header: 'Body', className: 'max-w-md', render: (t) => <span className="text-xs text-slate-600 line-clamp-2">{t.body}</span> },
        { key: 'status', header: 'Meta status', value: () => 'APPROVED', render: () => <StatusBadge status="APPROVED" /> },
        { key: 'used', header: 'Used in', align: 'right', render: (t) => `${t.used} campaign${t.used === 1 ? '' : 's'}` },
        { key: 'act', header: '', sortable: false, export: false, render: (t) => <Button size="sm" variant="soft" onClick={() => onUse(t)}>Use template</Button> },
      ]} />
  )
}
