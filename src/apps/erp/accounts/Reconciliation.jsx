import React, { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileSearch, AlertTriangle, CheckCircle2, Plus, Pencil, Trash2, Mail, ClipboardCheck, Download, Ship, IndianRupee, FilePlus2 } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Grid, Stat, Tabs, Button, Badge, StatusBadge, Drawer, Modal, FormGrid, Field, Input, NumberInput, Select, Textarea, Alert, toast, confirm, IconButton, EmptyState, Timeline, Card, AttachmentList } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtDate, fmtDateTime, today, addDays, daysBetween, sum, parseCSV, downloadText, uid, nowISO, makeAttachment } from '../../../lib/format'
import { billPayable } from './_books'

const WW_STATUS = { OPEN: ['Open', 'amber'], RAISED_WITH_VENDOR: ['Raised with vendor', 'blue'], RESOLVED: ['Resolved', 'green'], WRITTEN_OFF: ['Written off', 'gray'] }
const WW_CAT = { RATE_MISMATCH: 'Rate mismatch', QTY_MISMATCH: 'Quantity mismatch', DUPLICATE: 'Duplicate billing', NOT_ORDERED: 'Not ordered / cancelled', GST_ERROR: 'GST error', OTHER: 'Other' }
const SOURCES = { STAREX: 'lg1', SAFEX: 'lg2', GAF: 'fw3', SHIV_SAI: 'lg3' }
const SRC_LABEL = { STAREX: 'Starex 3PL', SAFEX: 'Safex', GAF: 'GAF Logistics', SHIV_SAI: 'Shiv Sai' }

export default function Reconciliation() {
  const mis = useStore((s) => s.misUploads) || []
  const ww = useStore((s) => s.wrongWorkings) || []
  const [tab, setTab] = useState('MIS')
  const [openMis, setOpenMis] = useState(null)
  const [upload, setUpload] = useState(false)
  const [wwEdit, setWwEdit] = useState(null)
  const gafDue = useGafReminders()
  const openIssues = mis.reduce((a, u) => a + (u.results || []).filter((r) => r.status !== 'MATCH' && !r.resolved && !r.review).length, 0)
  const wwOpen = ww.filter((w) => ['OPEN', 'RAISED_WITH_VENDOR'].includes(w.status))
  return (
    <div>
      <PageHeader title="Logistics Reconciliation" subtitle="Starex · Safex · GAF Logistics · Shiv Sai – MIS uploads checked inside the ERP, billing errors tracked to recovery"
        actions={<><Button variant="secondary" icon={Plus} onClick={() => setWwEdit({})}>Log billing error</Button><Button icon={Upload} onClick={() => setUpload(true)}>Upload MIS file</Button></>} />
      <Grid cols={4} className="mb-5">
        <Stat icon={FileSearch} label="MIS files uploaded" value={mis.length} sub={`${mis.filter((u) => u.status !== 'MATCHED' && !u.accountsReviewed).length} awaiting Accounts review`} onClick={() => setTab('MIS')} />
        <Stat icon={AlertTriangle} tone="red" label="Unreviewed mismatches" value={openIssues} onClick={() => setTab('MIS')} />
        <Stat icon={ClipboardCheck} tone="amber" label="Wrong workings open" value={wwOpen.length} sub={fmtINR(sum(wwOpen, (w) => w.difference - (w.recoveredAmount || 0)))} onClick={() => setTab('WW')} />
        <Stat icon={IndianRupee} tone="green" label="Billing errors recovered" value={fmtINR(sum(ww, (w) => w.recoveredAmount || 0))} sub={`of ${fmtINR(sum(ww, (w) => w.difference))} caught`} onClick={() => setTab('WW')} />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ key: 'MIS', label: 'MIS uploads', count: mis.length }, { key: 'WW', label: 'Wrong Workings Tracker', count: ww.length }, { key: 'GAF', label: 'GAF invoice due (15 days post arrival)', count: gafDue.filter((g) => g.state !== 'RECEIVED').length }, { key: 'BILLS', label: 'Logistics bills check' }]} />
      {tab === 'MIS' && (
        <DataTable rows={mis} onRowClick={(u) => setOpenMis(u.id)} exportName="mis-uploads"
          empty={<EmptyState icon={FileSearch} title="No MIS files yet" message="Upload the weekly truck report or monthly MIS from Starex / Safex / GAF to reconcile it against ERP invoices." action={<Button icon={Upload} onClick={() => setUpload(true)}>Upload MIS file</Button>} />}
          columns={[
            { key: 'source', header: 'Source', render: (u) => <Badge tone="ink">{SRC_LABEL[u.source] || u.source}</Badge> },
            { key: 'kind', header: 'Report', render: (u) => <div><div className="font-medium">{{ WEEKLY_TRUCK: 'Weekly truck report', MONTHLY_MIS: 'Monthly MIS', INVOICE: 'Invoice annexure' }[u.kind] || u.kind}</div><div className="text-[11px] text-slate-500">{u.fileName}</div></div> },
            { key: 'period', header: 'Period' },
            { key: 'rows', header: 'Lines', align: 'right', value: (u) => (u.results || []).length },
            { key: 'match', header: 'Matched', align: 'right', value: (u) => (u.results || []).filter((r) => r.status === 'MATCH').length },
            { key: 'issues', header: 'Issues', align: 'right', value: (u) => (u.results || []).filter((r) => r.status !== 'MATCH').length, render: (u) => { const n = (u.results || []).filter((r) => r.status !== 'MATCH').length; return n ? <Badge tone="red">{n}</Badge> : <Badge tone="green">0</Badge> } },
            { key: 'billed', header: 'Billed', align: 'right', value: (u) => sum(u.results || [], (r) => r.amount || 0), render: (u) => fmtINR(sum(u.results || [], (r) => r.amount || 0)) },
            { key: 'uploadedAt', header: 'Uploaded', render: (u) => <span className="text-xs">{fmtDateTime(u.uploadedAt)}</span> },
            { key: 'review', header: 'Accounts review', render: (u) => { const res = u.results || []; const done = res.filter((r) => r.review || r.status === 'MATCH' || r.resolved).length; return u.accountsReviewed ? <StatusBadge status="DONE" label="Reviewed" /> : <Badge tone={done === res.length ? 'green' : 'amber'}>{done}/{res.length} checked</Badge> } },
          ]} />
      )}
      {tab === 'WW' && <WrongWorkings onEdit={setWwEdit} />}
      {tab === 'GAF' && <GafReminders rows={gafDue} />}
      {tab === 'BILLS' && <LogisticsBills />}
      {openMis && <MisDrawer id={openMis} onClose={() => setOpenMis(null)} onLog={(prefill) => setWwEdit(prefill)} />}
      {upload && <MisUpload onClose={() => setUpload(false)} />}
      {wwEdit && <WwForm init={wwEdit} onClose={() => setWwEdit(null)} />}
    </div>
  )
}

function MisDrawer({ id, onClose, onLog }) {
  const u = useStore((s) => (s.misUploads || []).find((x) => x.id === id))
  const { reviewMisResult, markMisReviewed } = useStore.getState()
  const [filter, setFilter] = useState('ISSUES')
  if (!u) return null
  const res = (u.results || []).map((r, idx) => ({ ...r, idx, id: `${idx}` }))
  const rows = filter === 'ISSUES' ? res.filter((r) => r.status !== 'MATCH') : res
  return (
    <Drawer open onClose={onClose} width="max-w-5xl" title={`${SRC_LABEL[u.source] || u.source} · ${u.fileName}`} subtitle={`Period ${u.period} · uploaded ${fmtDateTime(u.uploadedAt)}`}
      footer={<Button icon={CheckCircle2} disabled={!!u.accountsReviewed} onClick={() => { markMisReviewed(u.id); toast.success('MIS marked as reviewed by Accounts') }}>{u.accountsReviewed ? 'Reviewed' : 'Mark file reviewed'}</Button>}>
      <Grid cols={4} className="mb-4">
        <Stat label="Lines" value={res.length} />
        <Stat tone="green" label="Matched" value={res.filter((r) => r.status === 'MATCH').length} />
        <Stat tone="red" label="Mismatch / extra / missing" value={res.filter((r) => r.status !== 'MATCH').length} />
        <Stat tone="amber" label="Excess billed" value={fmtINR(sum(res.filter((r) => (r.diff || 0) > 0 && r.status !== 'MATCH'), (r) => r.diff))} />
      </Grid>
      {u.file && <div className="mb-3"><AttachmentList dense items={[u.file]} /></div>}
      <div className="flex gap-2 mb-2"><Button size="sm" variant={filter === 'ISSUES' ? 'dark' : 'secondary'} onClick={() => setFilter('ISSUES')}>Issues only</Button><Button size="sm" variant={filter === 'ALL' ? 'dark' : 'secondary'} onClick={() => setFilter('ALL')}>All lines</Button></div>
      <DataTable rows={rows} searchable pageSize={15} exportName={`mis-${u.id}`} columns={[
        { key: 'ref', header: 'Invoice / ref', render: (r) => <span className="font-medium">{r.ref}</span> },
        { key: 'status', header: 'Result', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'expected', header: 'ERP expected', align: 'right', render: (r) => (r.expected != null ? fmtINR(r.expected) : '—') },
        { key: 'amount', header: 'Billed', align: 'right', render: (r) => (r.amount != null ? fmtINR(r.amount) : '—') },
        { key: 'diff', header: 'Difference', align: 'right', render: (r) => (r.diff ? <span className={r.diff > 0 ? 'text-red-600' : 'text-emerald-700'}>{fmtINR(r.diff)}</span> : '—') },
        { key: 'note', header: 'Note', render: (r) => <div className="text-xs text-slate-600 max-w-xs">{r.note}{r.resolved && <div className="text-emerald-700">Resolved: {r.resolution}</div>}</div> },
        { key: 'review', header: 'Accounts', render: (r) => (r.review ? <Badge tone={r.review.status === 'LOGGED' ? 'violet' : r.review.status === 'QUERY' ? 'amber' : 'green'}>{r.review.status === 'LOGGED' ? `Logged ${r.review.note}` : r.review.status === 'QUERY' ? 'Query' : 'Reviewed'}</Badge> : <span className="text-slate-300">—</span>) },
        { key: 'act', header: '', sortable: false, export: false, render: (r) => (
          <div className="flex gap-1 justify-end">
            {!r.review && <Button size="sm" variant="secondary" onClick={() => { reviewMisResult(u.id, r.idx, { status: 'REVIEWED' }); toast.success('Line marked reviewed', r.ref) }}>Reviewed</Button>}
            {r.status !== 'MATCH' && r.review?.status !== 'LOGGED' && <Button size="sm" icon={Plus} onClick={() => onLog({ vendorId: SOURCES[u.source] || 'lg1', source: u.source, ref: r.ref, period: u.period, category: r.status === 'EXTRA' ? 'NOT_ORDERED' : /Duplicate/i.test(r.note) ? 'DUPLICATE' : 'RATE_MISMATCH', issue: r.note, billedAmount: r.amount || 0, correctAmount: r.expected || 0, misUploadId: u.id, misIndex: r.idx })}>Log error</Button>}
          </div>
        ) },
      ]} />
    </Drawer>
  )
}

function MisUpload({ onClose }) {
  const ref = useRef(null)
  const [f, setF] = useState({ source: 'STAREX', kind: 'WEEKLY_TRUCK', period: '', file: null, rows: [] })
  const onFile = async (file) => {
    if (!file) return
    const rows = parseCSV(await file.text())
    if (!rows.length) return toast.error('The file has no rows')
    const att = { id: uid('att'), name: file.name, size: file.size, type: 'text/csv', uploadedAt: nowISO() }
    setF((s) => ({ ...s, file: att, rows }))
  }
  const template = () => downloadText('mis-template.csv', 'Invoice No,Date,Customer,LR No,Vehicle No,Trucks,Freight\nBT/26-27/0301,21/10/2026,Shree Ganesh Hardware,LR701234,MH04 KF 2210,1,1850\n', 'text/csv')
  const submit = () => {
    if (!f.rows.length) return toast.error('Choose the MIS CSV file')
    const st = useStore.getState()
    const period = f.period || `Up to ${fmtDate(today())}`
    if (st.uploadMIS) st.uploadMIS({ source: f.source, kind: f.kind, period, fileName: f.file.name, rows: f.rows, file: f.file })
    else st.addItem('misUploads', { source: f.source, kind: f.kind, period, fileName: f.file.name, rows: f.rows, results: f.rows.map((r) => ({ ref: Object.values(r)[0], status: 'MISMATCH', note: 'Pending manual check', amount: 0 })), uploadedBy: st.session.userId, uploadedAt: nowISO(), status: 'OPEN', file: f.file })
    toast.success('MIS uploaded & matched against ERP invoices', `${f.rows.length} lines from ${f.file.name}`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Upload MIS file" subtitle="CSV exported from Starex / Safex / GAF – lines are matched to ERP invoices automatically for your review"
      footer={<><Button variant="secondary" icon={Download} onClick={template}>CSV format</Button><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Upload} onClick={submit}>Upload & reconcile</Button></>}>
      <FormGrid>
        <Field label="Source"><Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} options={Object.entries(SRC_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Report type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={[{ value: 'WEEKLY_TRUCK', label: 'Weekly truck report' }, { value: 'MONTHLY_MIS', label: 'Monthly MIS' }, { value: 'INVOICE', label: 'Invoice annexure' }]} /></Field>
        <Field label="Period" className="md:col-span-2"><Input value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} placeholder="e.g. 13 Oct – 19 Oct 2026" /></Field>
        <div className="md:col-span-2">
          <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          <button type="button" onClick={() => ref.current?.click()} className="w-full border-2 border-dashed border-slate-300 hover:border-brand-300 rounded-xl p-6 text-center text-sm text-slate-600">
            <Upload className="w-6 h-6 mx-auto text-slate-400 mb-1" />{f.file ? <><b>{f.file.name}</b> · {f.rows.length} rows read</> : 'Click to choose the MIS CSV'}
          </button>
        </div>
      </FormGrid>
    </Modal>
  )
}

function WrongWorkings({ onEdit }) {
  const ww = useStore((s) => s.wrongWorkings) || []
  const { updateWrongWorking, deleteWrongWorking } = useStore.getState()
  const { vendor, user } = useLookup()
  const [view, setView] = useState(null)
  const setStatus = (w, status) => {
    updateWrongWorking(w.id, { status })
    toast.success(`${w.number} → ${WW_STATUS[status][0]}`, status === 'RAISED_WITH_VENDOR' ? `Discrepancy emailed to ${vendor(w.vendorId)?.name}` : undefined)
  }
  const v = view && ww.find((x) => x.id === view)
  return (
    <>
      <DataTable rows={ww} onRowClick={(w) => setView(w.id)} exportName="wrong-workings" initialSort={{ key: 'number', dir: 'desc' }}
        filters={[{ key: 'status', label: 'statuses', options: Object.entries(WW_STATUS).map(([value, [label]]) => ({ value, label })) }, { key: 'source', label: 'sources', options: Object.entries(SRC_LABEL).map(([value, label]) => ({ value, label })) }]}
        columns={[
          { key: 'number', header: 'No.', render: (w) => <span className="font-medium">{w.number}</span> },
          { key: 'v', header: 'Vendor', value: (w) => vendor(w.vendorId)?.name },
          { key: 'ref', header: 'Bill / MIS ref', render: (w) => <div><div>{w.ref}</div><div className="text-[11px] text-slate-500">{w.period}</div></div> },
          { key: 'category', header: 'Type', render: (w) => <Badge tone="ink">{WW_CAT[w.category] || w.category}</Badge> },
          { key: 'issue', header: 'Issue', render: (w) => <div className="max-w-sm text-xs text-slate-700">{w.issue}</div> },
          { key: 'difference', header: 'Excess billed', align: 'right', render: (w) => fmtINR(w.difference) },
          { key: 'recoveredAmount', header: 'Recovered', align: 'right', render: (w) => (w.recoveredAmount ? <span className="text-emerald-700">{fmtINR(w.recoveredAmount)}</span> : '—') },
          { key: 'status', header: 'Status', render: (w) => <Badge tone={WW_STATUS[w.status]?.[1]} dot>{WW_STATUS[w.status]?.[0]}</Badge> },
          { key: 'act', header: '', sortable: false, export: false, render: (w) => (
            <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
              {w.status === 'OPEN' && <Button size="sm" variant="secondary" icon={Mail} onClick={() => setStatus(w, 'RAISED_WITH_VENDOR')}>Raise</Button>}
              {['OPEN', 'RAISED_WITH_VENDOR'].includes(w.status) && <Button size="sm" variant="success" onClick={() => onEdit({ ...w, status: 'RESOLVED', recoveredAmount: w.recoveredAmount || w.difference })}>Resolve</Button>}
              <IconButton icon={Pencil} title="Edit" onClick={() => onEdit(w)} />
              <IconButton icon={Trash2} tone="danger" title="Delete" onClick={async () => { if (await confirm({ title: `Delete ${w.number}?`, tone: 'danger', confirmText: 'Delete' })) { deleteWrongWorking(w.id); toast.success('Entry deleted') } }} />
            </div>
          ) },
        ]} />
      {v && (
        <Drawer open onClose={() => setView(null)} title={`${v.number} · ${vendor(v.vendorId)?.name}`} subtitle={<Badge tone={WW_STATUS[v.status]?.[1]}>{WW_STATUS[v.status]?.[0]}</Badge>} footer={<Button variant="secondary" icon={Pencil} onClick={() => { setView(null); onEdit(v) }}>Edit</Button>}>
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <Card><div className="text-xs text-slate-500">Billed</div><div className="font-semibold">{fmtINR(v.billedAmount)}</div></Card>
            <Card><div className="text-xs text-slate-500">Should be</div><div className="font-semibold">{fmtINR(v.correctAmount)}</div></Card>
            <Card><div className="text-xs text-slate-500">Difference</div><div className="font-semibold text-red-600">{fmtINR(v.difference)}</div></Card>
            <Card><div className="text-xs text-slate-500">Recovered</div><div className="font-semibold text-emerald-700">{fmtINR(v.recoveredAmount || 0)}</div></Card>
          </div>
          <p className="text-sm text-slate-700 mb-2"><b>Issue:</b> {v.issue}</p>
          {v.resolution && <p className="text-sm text-slate-700 mb-4"><b>Resolution:</b> {v.resolution}</p>}
          <Timeline items={(v.history || []).slice().reverse().map((h) => ({ ...h, by: user(h.by)?.name || h.by }))} />
        </Drawer>
      )}
    </>
  )
}

function WwForm({ init, onClose }) {
  const vendors = useStore((s) => s.vendors)
  const { createWrongWorking, updateWrongWorking } = useStore.getState()
  const [f, setF] = useState({ vendorId: 'lg1', source: 'STAREX', ref: '', period: '', category: 'RATE_MISMATCH', issue: '', billedAmount: '', correctAmount: '', status: 'OPEN', recoveredAmount: 0, resolution: '', ...init })
  const isEdit = !!init.id
  const save = () => {
    if (!f.issue.trim() || !f.ref.trim()) return toast.error('Reference and issue are required')
    if (isEdit) {
      const { id, number, history, loggedAt, loggedBy, difference, ...patch } = f // eslint-disable-line no-unused-vars
      updateWrongWorking(init.id, { ...patch, billedAmount: Number(f.billedAmount) || 0, correctAmount: Number(f.correctAmount) || 0, recoveredAmount: Number(f.recoveredAmount) || 0 }, f.status !== init.status ? undefined : 'Details updated')
      toast.success(`${init.number} updated`)
    } else {
      const w = createWrongWorking(f)
      toast.success('Logged in Wrong Workings', `${w.number} · ${fmtINR(w.difference)}`)
    }
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${init.number}` : 'Log billing error'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <FormGrid>
        <Field label="Source"><Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value, vendorId: SOURCES[e.target.value] })} options={Object.entries(SRC_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Vendor"><Select value={f.vendorId} onChange={(e) => setF({ ...f, vendorId: e.target.value })} options={vendors.filter((v) => ['LOGISTICS', 'FORWARDER', 'CHA'].includes(v.type)).map((v) => ({ value: v.id, label: v.name }))} /></Field>
        <Field label="Bill / MIS reference" required><Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
        <Field label="Period / container"><Input value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field>
        <Field label="Error type"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={Object.entries(WW_CAT).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={Object.entries(WW_STATUS).map(([value, [label]]) => ({ value, label }))} /></Field>
        <Field label="Billed amount (₹)"><NumberInput value={f.billedAmount} onChange={(v) => setF({ ...f, billedAmount: v })} /></Field>
        <Field label="Correct amount (₹)" hint={`Difference ${fmtINR((Number(f.billedAmount) || 0) - (Number(f.correctAmount) || 0))}`}><NumberInput value={f.correctAmount} onChange={(v) => setF({ ...f, correctAmount: v })} /></Field>
        <Field label="Issue" required className="md:col-span-2"><Textarea rows={2} value={f.issue} onChange={(e) => setF({ ...f, issue: e.target.value })} /></Field>
        {['RESOLVED', 'WRITTEN_OFF'].includes(f.status) && <>
          <Field label="Recovered amount (₹)"><NumberInput value={f.recoveredAmount} onChange={(v) => setF({ ...f, recoveredAmount: v })} /></Field>
          <Field label="Resolution"><Input value={f.resolution} onChange={(e) => setF({ ...f, resolution: e.target.value })} placeholder="e.g. Credit note received CN-8812" /></Field>
        </>}
      </FormGrid>
    </Modal>
  )
}

function useGafReminders() {
  const shipments = useStore((s) => s.shipments)
  const bills = useStore((s) => s.vendorBills) || []
  return useMemo(() => {
    const t = today()
    return shipments.filter((s) => (s.ata || s.eta) && (s.ata || s.eta) >= addDays(t, -150)).map((s) => {
      const arrival = s.ata || s.eta
      const expected = addDays(arrival, 15)
      const bill = bills.find((b) => b.vendorId === (s.indianForwarderId || 'fw3') && b.shipmentId === s.id)
      const state = bill ? 'RECEIVED' : arrival > t ? 'UPCOMING' : expected < t ? 'OVERDUE' : 'DUE_SOON'
      return { ...s, arrival, arrived: !!s.ata || s.status === 'AT_PORT', expected, bill, state, days: daysBetween(t, expected) }
    }).sort((a, b) => a.expected.localeCompare(b.expected))
  }, [shipments, bills])
}

function GafReminders({ rows }) {
  const { vendor } = useLookup()
  const nav = useNavigate()
  const remind = (s) => {
    const v = vendor(s.indianForwarderId || 'fw3')
    useStore.getState().sendEmail({ to: v?.email, subject: `Invoice request – ${s.number} / ${s.containerNo}`, body: `Dear ${v?.contact},\n\nContainer ${s.containerNo} (BL ${s.blNo}) arrived on ${fmtDate(s.arrival)}. Kindly share your freight & local charges invoice with the detention/DO breakup so that we can process payment on time.\n\nRegards,\nBtali Accounts`, ref: s.number, attachments: [makeAttachment(`Arrival-${s.number.replace(/\//g, '-')}.pdf`)] })
    toast.success('Invoice reminder emailed', v?.email)
  }
  return (
    <>
      <Alert tone="info" className="mb-3">GAF Logistics raises its invoice about 15 days after the container arrives in India. Bills received are checked here before they go to the Boss for approval.</Alert>
      <DataTable rows={rows} searchable={false} columns={[
        { key: 'number', header: 'Shipment', render: (s) => <div className="flex items-center gap-2"><Ship className="w-4 h-4 text-slate-400" /><div><div className="font-medium">{s.number}</div><div className="text-[11px] text-slate-500">{s.containerNo} · {vendor(s.vendorId)?.name}</div></div></div> },
        { key: 'fw', header: 'Forwarder', value: (s) => vendor(s.indianForwarderId)?.name },
        { key: 'arrival', header: 'Arrival', render: (s) => <div>{fmtDate(s.arrival)}<div className="text-[11px] text-slate-500">{s.ata ? 'Arrived' : s.status === 'AT_PORT' ? 'At port' : 'ETA'}</div></div> },
        { key: 'expected', header: 'GAF invoice expected', render: (s) => fmtDate(s.expected) },
        { key: 'state', header: 'Status', render: (s) => s.state === 'RECEIVED' ? <StatusBadge status="RECEIVED" label={`Received · ${s.bill.number}`} /> : s.state === 'OVERDUE' ? <Badge tone="red">Overdue {-s.days}d</Badge> : s.state === 'DUE_SOON' ? <Badge tone="amber">Due in {s.days}d</Badge> : <Badge tone="gray">After arrival</Badge> },
        { key: 'amt', header: 'Bill amount', align: 'right', render: (s) => (s.bill ? fmtINR(billPayable(s.bill)) : '—') },
        { key: 'act', header: '', sortable: false, render: (s) => s.state !== 'RECEIVED' && s.arrival <= today() ? <div className="flex gap-1 justify-end"><Button size="sm" variant="secondary" icon={Mail} onClick={() => remind(s)}>Remind GAF</Button><Button size="sm" icon={FilePlus2} onClick={() => nav('/erp/accounts/vendor-bills')}>Enter bill</Button></div> : null },
      ]} />
    </>
  )
}

function LogisticsBills() {
  const bills = useStore((s) => s.vendorBills) || []
  const ww = useStore((s) => s.wrongWorkings) || []
  const { vendor } = useLookup()
  const ids = ['lg1', 'lg2', 'lg3', 'fw3', 'cha1']
  const rows = bills.filter((b) => ids.includes(b.vendorId)).sort((a, b) => b.date.localeCompare(a.date))
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {ids.map((id) => {
          const l = bills.filter((b) => b.vendorId === id && b.status !== 'REJECTED')
          return <Card key={id}><div className="text-xs text-slate-500 truncate">{vendor(id)?.name}</div><div className="text-lg font-bold tabular-nums">{fmtINR(sum(l, billPayable))}</div><div className="text-[11px] text-slate-500">{l.length} bills · {ww.filter((w) => w.vendorId === id).length} errors logged</div></Card>
        })}
      </div>
      <DataTable rows={rows} exportName="logistics-bills" columns={[
        { key: 'number', header: 'Bill' }, { key: 'v', header: 'Vendor', value: (b) => vendor(b.vendorId)?.name }, { key: 'vendorRef', header: 'Vendor ref' },
        { key: 'description', header: 'Description', render: (b) => <span className="text-xs">{b.description}</span> },
        { key: 'amt', header: 'Net payable', align: 'right', value: billPayable, render: (b) => fmtINR(billPayable(b)) },
        { key: 'ww', header: 'Errors', value: (b) => ww.filter((w) => w.ref === b.vendorRef).length, render: (b) => { const n = ww.filter((w) => w.ref === b.vendorRef).length; return n ? <Badge tone="red">{n} logged</Badge> : <Badge tone="green">Checked</Badge> } },
        { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} label={b.status === 'PENDING_BOSS' ? 'Pending Boss' : undefined} /> },
      ]} />
    </>
  )
}
