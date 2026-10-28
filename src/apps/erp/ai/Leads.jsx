import React, { useMemo, useRef, useState } from 'react'
import { Upload, Plus, UserPlus, Shuffle, PhoneCall, Download, Building2, Ban, Bot, Loader2, CalendarCheck, Users, Flame, Sun, Snowflake, XCircle } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Button, Drawer, Modal, Field, Input, Select, Textarea, FormGrid, DescriptionList, Badge, Switch, Tabs, toast, confirm, Alert, Card } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { UserName } from '../../../components/business'
import { LEAD_SOURCES, LEAD_STAGES, CALL_OUTCOMES } from '../../../store/slices/ai'
import { fmtDate, fmtDateTime, parseCSV, downloadText, timeAgo } from '../../../lib/format'
import { useAiRunners, OutcomeBadge, TempBadge, ScoreBar, StageBadge, STAGE_LABEL, CallDrawer, CallList, LANG } from './_shared'

const CATS = ['Pumps', 'Air Compressors', 'Vacuum Cleaners', 'Pressure Washers', 'Spraying Equipment', 'Spare Parts']
const REGIONS = ['North', 'South', 'East', 'West', 'Central']
const TYPES = { DEALER_PROSPECT: 'Dealer prospect', RETAILER: 'Retailer', END_CUSTOMER: 'End customer', INSTITUTIONAL: 'Institutional', EXISTING_DEALER: 'Existing dealer' }
const TEMPLATE = 'name,phone,company,city,state,region,interest,source,language,email,notes\nAshok Verma,98260 11223,Verma Hardware,Indore,Madhya Pradesh,Central,Pumps,IndiaMART,Hindi,ashok@vermahw.in,Wants openwell pumps\nK. Senthil,94430 55667,Senthil Agro,Salem,Tamil Nadu,South,Spraying Equipment,Trade Fair,English,,Sprayer dealership\n'

export function useExecs() {
  const users = useStore((s) => s.users)
  return users.filter((u) => u.role === 'SALES_EXEC')
}

function LeadForm({ open, onClose }) {
  const add = useStore((s) => s.aiAddLead)
  const execs = useExecs()
  const [f, setF] = useState({ name: '', phone: '', company: '', city: '', state: '', region: 'West', interest: 'Pumps', source: 'Website', language: 'Hindi', type: 'DEALER_PROSPECT', score: 50, assignedTo: '', email: '', notes: '' })
  const up = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e })
  const save = () => {
    if (!f.name.trim() || !/\d{10}/.test(f.phone.replace(/\D/g, ''))) { toast.error('Name and a 10-digit mobile number are required'); return }
    const l = add({ ...f, score: Number(f.score) || 0, assignedTo: f.assignedTo || null })
    toast.success(`Lead ${l.number} created`, `Assigned to ${execs.find((u) => u.id === l.assignedTo)?.name || '—'}`)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="New lead" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Create lead</Button></>}>
      <FormGrid>
        <Field label="Contact name" required><Input value={f.name} onChange={up('name')} /></Field>
        <Field label="Mobile" required><Input value={f.phone} onChange={up('phone')} placeholder="98XXX XXXXX" /></Field>
        <Field label="Business name"><Input value={f.company} onChange={up('company')} /></Field>
        <Field label="Email"><Input value={f.email} onChange={up('email')} /></Field>
        <Field label="City"><Input value={f.city} onChange={up('city')} /></Field>
        <Field label="State"><Input value={f.state} onChange={up('state')} /></Field>
        <Field label="Region"><Select value={f.region} onChange={up('region')} options={REGIONS} /></Field>
        <Field label="Product interest"><Select value={f.interest} onChange={up('interest')} options={CATS} /></Field>
        <Field label="Source"><Select value={f.source} onChange={up('source')} options={LEAD_SOURCES} /></Field>
        <Field label="Lead type"><Select value={f.type} onChange={up('type')} options={Object.entries(TYPES).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Preferred language"><Select value={f.language} onChange={up('language')} options={LANG} /></Field>
        <Field label="Initial score (0–100)"><Input type="number" min={0} max={100} value={f.score} onChange={up('score')} /></Field>
        <Field label="Assign to" hint="Blank = auto-assign by region (least loaded)"><Select value={f.assignedTo} onChange={up('assignedTo')} placeholder="Auto-assign" options={execs.map((u) => ({ value: u.id, label: u.name }))} /></Field>
      </FormGrid>
      <Field label="Notes" className="mt-4"><Textarea rows={2} value={f.notes} onChange={up('notes')} /></Field>
    </Modal>
  )
}

function ImportModal({ open, onClose }) {
  const importLeads = useStore((s) => s.aiImportLeads)
  const [rows, setRows] = useState(null)
  const [name, setName] = useState('')
  const ref = useRef(null)
  const read = async (file) => {
    if (!file) return
    const txt = await file.text()
    setRows(parseCSV(txt))
    setName(file.name)
  }
  const go = () => {
    const r = importLeads(rows)
    toast.success(`${r.added} leads imported`, r.dup ? `${r.dup} duplicates skipped` : 'Auto-assigned by region')
    setRows(null); onClose()
  }
  return (
    <Modal open={open} onClose={() => { setRows(null); onClose() }} title="Import leads (CSV / Excel export)" subtitle="Columns: name, phone, company, city, state, region, interest, source, language, email, notes"
      footer={<><Button variant="secondary" icon={Download} onClick={() => downloadText('btali-leads-template.csv', TEMPLATE, 'text/csv')}>Template</Button><Button disabled={!rows?.length} onClick={go}>Import {rows?.length || ''} rows</Button></>}>
      <div onClick={() => ref.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); read(e.dataTransfer.files[0]) }}
        className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30">
        <Upload className="w-6 h-6 mx-auto text-slate-400" />
        <div className="text-sm font-medium text-slate-700 mt-2">{name || 'Drop a .csv file here or click to choose'}</div>
        <div className="text-xs text-slate-500 mt-1">Save Excel sheets as CSV. Duplicate mobile numbers are skipped automatically.</div>
        <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => read(e.target.files[0])} />
      </div>
      {rows && (
        <div className="mt-4">
          <div className="text-xs text-slate-500 mb-2">Preview – first {Math.min(5, rows.length)} of {rows.length}</div>
          <div className="overflow-x-auto border rounded-lg"><table className="text-xs w-full"><thead className="bg-slate-50"><tr>{Object.keys(rows[0] || {}).slice(0, 7).map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 5).map((r, i) => <tr key={i} className="border-t">{Object.values(r).slice(0, 7).map((v, j) => <td key={j} className="px-2 py-1.5 whitespace-nowrap">{v}</td>)}</tr>)}</tbody></table></div>
        </div>
      )}
    </Modal>
  )
}

function ConvertModal({ lead, onClose }) {
  const convert = useStore((s) => s.aiConvertLead)
  const [f, setF] = useState({ gstin: '', pan: '', address: `${lead.company}, ${lead.city}`, tier: 'C' })
  const go = () => {
    if (f.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/i.test(f.gstin)) { toast.error('GSTIN format looks wrong', 'e.g. 27AAACB1234F1Z5'); return }
    const p = convert(lead.id, { gstin: f.gstin.toUpperCase(), pan: f.pan.toUpperCase() || f.gstin.slice(2, 12).toUpperCase(), address: f.address, tier: f.tier })
    toast.success('Sent for dealer onboarding approval', `${p.name} (${p.code}) – Sales Manager & Director notified`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Convert ${lead.company || lead.name} to dealer`} subtitle="Creates a dealer onboarding request for approval" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Building2} onClick={go}>Submit onboarding</Button></>}>
      <div className="space-y-3">
        <Field label="GSTIN"><Input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} placeholder="27AAACB1234F1Z5" /></Field>
        <Field label="PAN" hint="Derived from GSTIN when blank"><Input value={f.pan} onChange={(e) => setF({ ...f, pan: e.target.value })} /></Field>
        <Field label="Address"><Textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Tier"><Select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} options={['A', 'B', 'C']} /></Field>
      </div>
    </Modal>
  )
}

export function LeadDrawer({ leadId, onClose }) {
  const lead = useStore((s) => (s.aiLeads || []).find((l) => l.id === leadId))
  const calls = useStore((s) => (s.aiCalls || []).filter((c) => c.leadId === leadId))
  const appts = useStore((s) => (s.aiAppointments || []).filter((a) => a.leadId === leadId))
  const { aiSimulateCall, aiUpdateLead, aiAssignLeads } = useStore()
  const execs = useExecs()
  const [tab, setTab] = useState('calls')
  const [dialing, setDialing] = useState(false)
  const [callOpen, setCallOpen] = useState(null)
  const [convert, setConvert] = useState(false)
  if (!lead) return null
  const callNow = () => {
    if (lead.dnd) { toast.error('Number is on Do-Not-Call list'); return }
    setDialing(true)
    setTimeout(() => {
      const c = aiSimulateCall(lead.id, {})
      setDialing(false)
      toast.success(`AI call finished – ${CALL_OUTCOMES[c.outcome].label}`, c.summary)
      setCallOpen(c.id)
    }, 2600)
  }
  return (
    <Drawer open onClose={onClose} title={`${lead.name} · ${lead.company || ''}`} subtitle={`${lead.number} · ${lead.phone} · ${lead.city}, ${lead.state}`} width="max-w-3xl"
      footer={<>
        <Button variant="secondary" icon={XCircle} onClick={async () => { if (await confirm({ title: 'Mark lead as lost?', tone: 'danger', confirmText: 'Mark lost' })) { aiUpdateLead(lead.id, { stage: 'LOST' }); toast.info('Lead marked lost') } }} disabled={['LOST', 'CONVERTED'].includes(lead.stage)}>Mark lost</Button>
        <Button variant="secondary" icon={Building2} onClick={() => setConvert(true)} disabled={lead.stage === 'CONVERTED' || lead.type === 'EXISTING_DEALER'}>Convert to dealer</Button>
        <Button icon={dialing ? Loader2 : Bot} onClick={callNow} disabled={dialing}>{dialing ? 'AI is on the call…' : 'Call now with AI'}</Button>
      </>}>
      {dialing && <Alert tone="info" title={`Dialing ${lead.phone}…`} className="mb-4">The AI agent is speaking to {lead.name.split(' ')[0]} in {lead.language}. The transcript appears when the call ends.</Alert>}
      {lead.stage === 'CONVERTED' && <Alert tone="success" title="Converted" className="mb-4">Dealer onboarding submitted – pending approval in Sales → Dealer Onboarding.</Alert>}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <TempBadge t={lead.temperature} /><StageBadge stage={lead.stage} /><Badge tone="ink">{TYPES[lead.type] || lead.type}</Badge><Badge>{lead.source}</Badge>
        <div className="w-40"><ScoreBar score={lead.score} /></div>
      </div>
      <DescriptionList cols={3} items={[
        ['Product interest', lead.interest], ['Language', lead.language], ['Region', lead.region],
        ['Budget', lead.qualification?.budget], ['Requirement', lead.qualification?.requirement], ['Purchase timeline', lead.qualification?.timeline],
        ['Last call', lead.lastCalledAt ? `${fmtDateTime(lead.lastCalledAt)}` : 'Not called'], ['Last outcome', <OutcomeBadge outcome={lead.lastOutcome} />], ['Next follow-up', lead.nextFollowUp ? fmtDate(lead.nextFollowUp) : '—'],
        ['Email', lead.email], ['Created', fmtDate(lead.createdAt)], ['Campaign', lead.campaignId || '—'],
      ]} />
      <div className="grid sm:grid-cols-2 gap-3 mt-4 p-3 rounded-xl bg-slate-50">
        <Field label="Assigned salesperson"><Select value={lead.assignedTo || ''} onChange={(e) => { aiAssignLeads([lead.id], e.target.value); toast.success('Lead reassigned', execs.find((u) => u.id === e.target.value)?.name) }} options={execs.map((u) => ({ value: u.id, label: `${u.name} (${(u.regions || []).join('/')})` }))} /></Field>
        <div className="flex items-end pb-2"><Switch checked={lead.dnd} onChange={(v) => { aiUpdateLead(lead.id, { dnd: v }); toast.info(v ? 'Added to Do-Not-Call list' : 'Removed from Do-Not-Call list') }} label="Do Not Call (DND)" /></div>
      </div>
      <Tabs className="mt-4" value={tab} onChange={setTab} tabs={[{ key: 'calls', label: 'Call history', count: calls.length }, { key: 'appts', label: 'Appointments', count: appts.length }, { key: 'notes', label: 'Notes' }]} />
      <div className="pt-3">
        {tab === 'calls' && <CallList calls={calls} onOpen={setCallOpen} />}
        {tab === 'appts' && (appts.length ? appts.map((a) => (
          <div key={a.id} className="border rounded-lg p-3 mb-2 text-sm">
            <div className="flex justify-between"><span className="font-medium">{a.type === 'DEMO' ? 'Product demo' : 'Store visit'} · {fmtDateTime(a.at)}</span><Badge tone={a.status === 'COMPLETED' ? 'green' : a.status === 'MISSED' ? 'red' : 'violet'}>{a.status}</Badge></div>
            <div className="text-xs text-slate-500 mt-1">{a.location} · <UserName id={a.assignedTo} /></div>
            {a.feedback && <div className="text-xs mt-1.5 text-slate-700">“{a.feedback}”</div>}
          </div>)) : <div className="text-sm text-slate-400 py-4 text-center">No appointments.</div>)}
        {tab === 'notes' && <Textarea rows={5} defaultValue={lead.notes} onBlur={(e) => { if (e.target.value !== lead.notes) { aiUpdateLead(lead.id, { notes: e.target.value }); toast.success('Notes saved') } }} placeholder="Notes are saved when you click outside the box" />}
      </div>
      {callOpen && <CallDrawer callId={callOpen} onClose={() => setCallOpen(null)} />}
      {convert && <ConvertModal lead={lead} onClose={() => setConvert(false)} />}
    </Drawer>
  )
}

export default function Leads() {
  useAiRunners()
  const leads = useStore((s) => s.aiLeads || [])
  const { aiAssignLeads, aiAssignSequential, aiSimulateCall } = useStore()
  const execs = useExecs()
  const [open, setOpen] = useState(null)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [assign, setAssign] = useState(null)
  const [to, setTo] = useState('')
  const [temp, setTemp] = useState('ALL')
  const rows = useMemo(() => (temp === 'ALL' ? leads : leads.filter((l) => l.temperature === temp)), [leads, temp])
  const cnt = (t) => leads.filter((l) => l.temperature === t && !['CONVERTED', 'LOST'].includes(l.stage)).length

  const bulkCall = (sel, clear) => {
    const ok = sel.filter((l) => !l.dnd)
    ok.forEach((l, i) => setTimeout(() => aiSimulateCall(l.id, {}), 600 + i * 900))
    toast.success(`AI is calling ${ok.length} lead${ok.length > 1 ? 's' : ''}`, sel.length - ok.length ? `${sel.length - ok.length} DND numbers skipped` : 'Results appear in Call Logs')
    clear()
  }
  const cols = [
    { key: 'name', header: 'Lead', render: (l) => <div className="min-w-[170px]"><div className="font-medium text-slate-900">{l.name}</div><div className="text-[11px] text-slate-500">{l.company} · {l.number}</div></div>, value: (l) => `${l.name} ${l.company}` },
    { key: 'phone', header: 'Mobile', render: (l) => <span className="whitespace-nowrap">{l.phone}{l.dnd && <Badge tone="red" className="ml-1">DND</Badge>}</span> },
    { key: 'city', header: 'City', render: (l) => <div><div>{l.city}</div><div className="text-[11px] text-slate-500">{l.region}</div></div> },
    { key: 'source', header: 'Source' },
    { key: 'interest', header: 'Interest' },
    { key: 'score', header: 'Score', render: (l) => <ScoreBar score={l.score} /> },
    { key: 'temperature', header: 'Temp', render: (l) => <TempBadge t={l.temperature} /> },
    { key: 'stage', header: 'Stage', render: (l) => <StageBadge stage={l.stage} />, value: (l) => STAGE_LABEL[l.stage] },
    { key: 'assignedTo', header: 'Salesperson', render: (l) => <UserName id={l.assignedTo} />, value: (l) => execs.find((u) => u.id === l.assignedTo)?.name || '' },
    { key: 'lastOutcome', header: 'Last call', render: (l) => <div><OutcomeBadge outcome={l.lastOutcome} />{l.lastCalledAt && <div className="text-[11px] text-slate-400 mt-0.5">{timeAgo(l.lastCalledAt)}</div>}</div>, value: (l) => CALL_OUTCOMES[l.lastOutcome]?.label || '' },
    { key: 'nextFollowUp', header: 'Next follow-up', render: (l) => (l.nextFollowUp ? fmtDate(l.nextFollowUp) : '—') },
  ]
  return (
    <div>
      <PageHeader title="Leads" subtitle="Central lead database – scored and classified by the AI after every call"
        actions={<><Button variant="secondary" icon={Upload} onClick={() => setImporting(true)}>Import CSV</Button><Button icon={Plus} onClick={() => setAdding(true)}>New lead</Button></>} />
      <Grid cols={4}>
        <Stat label="Total leads" value={leads.length} sub={`${leads.filter((l) => l.stage === 'NEW').length} not yet called`} icon={Users} tone="ink" onClick={() => setTemp('ALL')} />
        <Stat label="Hot" value={cnt('HOT')} sub="score ≥ 70" icon={Flame} tone="red" onClick={() => setTemp('HOT')} />
        <Stat label="Warm" value={cnt('WARM')} sub="score 40–69" icon={Sun} tone="amber" onClick={() => setTemp('WARM')} />
        <Stat label="Cold" value={cnt('COLD')} sub="score < 40" icon={Snowflake} tone="blue" onClick={() => setTemp('COLD')} />
      </Grid>
      <div className="mt-4">
        <DataTable rows={rows} columns={cols} onRowClick={(l) => setOpen(l.id)} exportName="btali-ai-leads" pageSize={15} initialSort={{ key: 'score', dir: 'desc' }}
          filters={[
            { key: 'stage', label: 'stages', options: LEAD_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] })) },
            { key: 'source', label: 'sources', options: [...new Set(leads.map((l) => l.source))] },
            { key: 'region', label: 'regions', options: REGIONS },
          ]}
          toolbar={temp !== 'ALL' ? <Badge tone="brand">{temp} only <button className="ml-1" onClick={() => setTemp('ALL')}>×</button></Badge> : null}
          bulkActions={(sel, clear) => <>
            <Button size="sm" icon={Bot} onClick={() => bulkCall(sel, clear)}>Call with AI</Button>
            <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => { setAssign({ ids: sel.map((l) => l.id), clear }); setTo('') }}>Assign</Button>
            <Button size="sm" variant="secondary" icon={Shuffle} onClick={() => { aiAssignSequential(sel.map((l) => l.id)); toast.success(`${sel.length} leads distributed round-robin by region`); clear() }}>Round-robin</Button>
          </>} />
      </div>
      <LeadForm key={adding ? 'o' : 'c'} open={adding} onClose={() => setAdding(false)} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
      <Modal open={!!assign} onClose={() => setAssign(null)} title={`Assign ${assign?.ids.length || 0} lead(s)`} size="sm"
        footer={<><Button variant="secondary" onClick={() => setAssign(null)}>Cancel</Button><Button disabled={!to} onClick={() => { aiAssignLeads(assign.ids, to); toast.success('Leads assigned', `${execs.find((u) => u.id === to)?.name} notified by email & app`); assign.clear(); setAssign(null) }}>Assign</Button></>}>
        <Field label="Salesperson"><Select value={to} onChange={(e) => setTo(e.target.value)} placeholder="Choose…" options={execs.map((u) => ({ value: u.id, label: `${u.name} – ${(u.regions || []).join(', ')}` }))} /></Field>
      </Modal>
      {open && <LeadDrawer leadId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
