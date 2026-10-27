import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import JSZip from 'jszip'
import { FolderArchive, Download, Upload, CheckCircle2, Circle, Eye, Trash2, FileText, Ticket } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Card, Grid, Stat, Button, IconButton, StatusBadge, Badge, SearchInput, Modal, Field, Select, FileUpload, Progress, EmptyState,
  openAttachment, toast, confirm, cx,
} from '../../../components/ui'
import { fmtDate, fmtDateTime, fmtNum, fmtSize, downloadBlob, sum } from '../../../lib/format'

const CHECKLIST = [
  { key: 'PI', label: 'Proforma Invoice (PI)', group: 'Order' },
  { key: 'PI_STAMPED', label: 'Stamped / approved PI', group: 'Order' },
  { key: 'MRP', label: 'MRP sticker & barcode files', group: 'Order' },
  { key: 'PL', label: 'Packing list', group: 'Shipping' },
  { key: 'CI', label: 'Commercial invoice', group: 'Shipping' },
  { key: 'QC', label: 'QC photos / videos', group: 'Order' },
  { key: 'FREIGHT', label: 'Freight forwarder selection', group: 'Shipping' },
  { key: 'BL', label: 'Bill of Lading (BL)', group: 'Shipping' },
  { key: 'INSURANCE', label: 'Marine insurance', group: 'Shipping' },
  { key: 'CAN', label: 'Cargo Arrival Notice (CAN)', group: 'Customs' },
  { key: 'IGM', label: 'Import General Manifest (IGM)', group: 'Customs' },
  { key: 'BOE', label: 'Bill of Entry (BOE)', group: 'Customs' },
  { key: 'SWIFT', label: 'SWIFT payment copies', group: 'Finance' },
  { key: 'TELEX', label: 'Telex release', group: 'Finance' },
  { key: 'CHA', label: 'CHA bill', group: 'Customs' },
  { key: 'TICKETS', label: 'Issue tickets', group: 'Other' },
]
const UPLOAD_TYPES = CHECKLIST.filter((c) => c.key !== 'TICKETS').map((c) => ({ value: c.key, label: c.label })).concat([{ value: 'OTHER', label: 'Other document' }])

/** map an attachment to a checklist key using its docType and file name */
export const classifyDoc = (a) => {
  const t = String(a.docType || '').toUpperCase()
  const n = String(a.name || '').toUpperCase()
  if (t === 'PI_STAMPED' || (/STAMPED/.test(n) && (t === 'PI' || /^PI/.test(n)))) return 'PI_STAMPED'
  if (t === 'PI') return 'PI'
  if (['MRP', 'BARCODES', 'LABELS'].includes(t) || /MRP|STICKER|BARCODE|LABEL/.test(n)) return 'MRP'
  if (t === 'PL' || /^PL-|PACKING/.test(n)) return 'PL'
  if (t === 'CI' || /^CI-|COMMERCIAL/.test(n)) return 'CI'
  if (t === 'QC' || /^QC-/.test(n)) return 'QC'
  if (t === 'FREIGHT' || /FREIGHT/.test(n)) return 'FREIGHT'
  if (t === 'BL' || /^BL-/.test(n)) return 'BL'
  if (t === 'INSURANCE' || /INSURANCE/.test(n)) return 'INSURANCE'
  for (const k of ['CAN', 'IGM', 'BOE', 'SWIFT', 'TELEX', 'CHA']) if (t === k || n.startsWith(`${k}-`)) return k
  return CHECKLIST.some((c) => c.key === t) ? t : 'OTHER'
}

/** Build the full document set for one PO: uploaded files + system records */
const buildRepo = (state, po) => {
  const sh = state.shipments.find((s) => s.id === po.shipmentId || s.poIds.includes(po.id))
  const rfq = (state.freightRfqs || []).find((r) => r.status === 'APPROVED' && (r.poIds.includes(po.id) || (sh && r.shipmentId === sh.id)))
  const items = []
  const seen = new Set()
  const push = (key, file, source = 'Uploaded') => {
    if (!file) return
    const sig = `${key}:${file.name}`
    if (seen.has(sig)) return
    seen.add(sig)
    items.push({ key, file, source })
  }
  for (const d of po.docs || []) push(classifyDoc(d), d)
  if (po.pi?.file) push('PI', { ...po.pi.file, docType: 'PI' }, 'Vendor portal')
  if (po.pi?.stampedFile) push('PI_STAMPED', { ...po.pi.stampedFile, docType: 'PI_STAMPED' }, 'System')
  if (po.commercialInvoice) push('CI', { ...po.commercialInvoice, docType: 'CI' }, 'Vendor portal')
  for (const q of po.qc || []) push('QC', { ...q.file, docType: 'QC', caption: q.caption }, `Vendor QC · ${q.status.toLowerCase()}`)
  for (const m of sh?.inward?.qcMedia || []) push('QC', { ...m, docType: 'QC' }, 'Starex inward QC')
  if (sh?.landedCost?.chaBill) push('CHA', sh.landedCost.chaBill, 'Landed cost')
  const system = []
  if (po.labelsSent || po.mrpConfirmed) system.push({ key: 'MRP', text: `MRP labels ${po.mrpConfirmed ? 'confirmed' : 'prepared'}${po.labelsSent ? ' and sent to vendor' : ''}${po.barcodesGenerated ? '; barcodes generated' : ''}` })
  if (po.packingList?.generatedAt) system.push({ key: 'PL', text: `Packing list generated from ${po.packingList.source === 'BARCODE_SCAN' ? 'barcode scan' : 'vendor upload'} on ${fmtDate(po.packingList.generatedAt)}` })
  if (rfq) system.push({ key: 'FREIGHT', text: `${rfq.number} approved – ${state.vendors.find((v) => v.id === rfq.selectedForwarderId)?.name}` })
  if (sh?.blNo) system.push({ key: 'BL', text: `BL ${sh.blNo} · container ${sh.containerNo}` })
  for (const [k, mk] of [['CAN', 'CAN'], ['IGM', 'IGM'], ['BOE', 'BOE']]) {
    const m = sh?.milestones?.find((x) => x.key === mk && x.done)
    if (m) system.push({ key: k, text: `${m.label} on ${fmtDate(m.date)}` })
  }
  if (sh?.telexReleased) system.push({ key: 'TELEX', text: 'Telex release received' })
  const tickets = state.tickets.filter((t) => t.orderRef && (t.orderRef === po.number || t.orderRef === sh?.number || (sh?.inward?.grnNo && t.orderRef === sh.inward.grnNo)))
  return { sh, rfq, items, system, tickets }
}

export default function Documents() {
  const state = useStore()
  const pos = state.purchaseOrders.filter((p) => !['DRAFT', 'REJECTED', 'CANCELLED'].includes(p.status))
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const sel = pos.find((p) => p.id === params.get('po')) || pos.find((p) => p.id === 'po7') || pos[0]
  const { vendor } = useLookup()

  const coverage = useMemo(() => Object.fromEntries(pos.map((p) => {
    const r = buildRepo(state, p)
    const have = new Set([...r.items.map((i) => i.key), ...r.system.map((s) => s.key), ...(r.tickets.length ? ['TICKETS'] : [])])
    const applicable = applicableKeys(p, r.sh)
    return [p.id, { have: applicable.filter((k) => have.has(k)).length, total: applicable.length, files: r.items.length }]
  })), [state]) // eslint-disable-line
  const list = pos.filter((p) => !q || `${p.number} ${vendor(p.vendorId)?.name}`.toLowerCase().includes(q.toLowerCase()))
  const totalFiles = sum(Object.values(coverage), (c) => c.files)
  const complete = Object.values(coverage).filter((c) => c.have === c.total).length

  return (
    <div>
      <PageHeader title="Order Document Repository" subtitle="One digital locker per purchase order – PI to telex release, downloadable as a ZIP for audits and disputes" />
      <Grid cols={4} className="mb-5">
        <Stat label="Order lockers" value={pos.length} icon={FolderArchive} tone="ink" />
        <Stat label="Files stored" value={fmtNum(totalFiles)} icon={FileText} tone="blue" />
        <Stat label="Complete lockers" value={complete} icon={CheckCircle2} tone="green" sub="all applicable documents" />
        <Stat label="Open issue tickets" value={state.tickets.filter((t) => t.orderRef && !['RESOLVED', 'CLOSED'].includes(t.stage)).length} icon={Ticket} tone="amber" sub="linked to orders / shipments" />
      </Grid>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <Card padded={false} className="self-start">
          <div className="p-3 border-b border-slate-100"><SearchInput value={q} onChange={setQ} placeholder="Search PO or vendor…" /></div>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
            {list.map((p) => {
              const c = coverage[p.id]
              return (
                <button key={p.id} onClick={() => setParams({ po: p.id })} className={cx('w-full text-left px-3 py-2.5 hover:bg-slate-50', sel?.id === p.id && 'bg-brand-50/70')}>
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-800">{p.number}</span><StatusBadge status={p.status} /></div>
                  <div className="text-[11px] text-slate-500 truncate">{vendor(p.vendorId)?.name} · {p.type.toLowerCase()}</div>
                  <Progress value={c.have} max={c.total} tone={c.have === c.total ? 'green' : 'brand'} className="mt-1.5" />
                  <div className="text-[10px] text-slate-400 mt-0.5">{c.have}/{c.total} documents · {c.files} files</div>
                </button>
              )
            })}
          </div>
        </Card>
        {sel ? <Locker key={sel.id} po={sel} /> : <Card><EmptyState title="No purchase orders" /></Card>}
      </div>
    </div>
  )
}

const applicableKeys = (po, sh) => {
  const keys = ['PI', 'PI_STAMPED']
  if (po.type === 'IMPORT' || po.type === 'EXPORT') keys.push('MRP', 'QC', 'PL', 'CI', 'FREIGHT', 'SWIFT')
  else keys.push('CI')
  if (sh) keys.push('BL', 'INSURANCE', 'CAN', 'IGM', 'BOE')
  if (sh && ['CLEARED', 'RECEIVED'].includes(sh.status)) keys.push('TELEX', 'CHA')
  return keys
}

function Locker({ po }) {
  const state = useStore()
  const addDocs = useStore((s) => s.addPoDocuments)
  const removeDoc = useStore((s) => s.removePoDocument)
  const { vendor, user } = useLookup()
  const repo = buildRepo(state, po)
  const applicable = applicableKeys(po, repo.sh)
  const [upload, setUpload] = useState(null)
  const [busy, setBusy] = useState(false)

  const rows = CHECKLIST.map((c) => ({
    ...c,
    files: repo.items.filter((i) => i.key === c.key),
    system: repo.system.filter((s) => s.key === c.key),
    applicable: applicable.includes(c.key) || c.key === 'TICKETS',
  }))
  const others = repo.items.filter((i) => i.key === 'OTHER')

  const zip = async () => {
    setBusy(true)
    try {
      const z = new JSZip()
      const root = z.folder(po.number.replace(/\//g, '-'))
      const lines = [`Btali International – Order document repository`, `Purchase order: ${po.number} (${po.type})`, `Vendor: ${vendor(po.vendorId)?.name}`, `Status: ${po.status}`, `PO date: ${fmtDate(po.date)}`, repo.sh ? `Shipment: ${repo.sh.number} · ${repo.sh.containerNo} · BL ${repo.sh.blNo || '—'}` : 'Shipment: not yet booked', `Exported: ${fmtDateTime(new Date().toISOString())}`, '', 'CHECKLIST']
      for (const r of rows.filter((x) => x.applicable)) lines.push(`[${r.files.length || r.system.length || (r.key === 'TICKETS' && repo.tickets.length) ? 'x' : ' '}] ${r.label}${r.files.length ? ` – ${r.files.length} file(s)` : ''}${r.system.length ? ` – ${r.system.map((s) => s.text).join('; ')}` : ''}`)
      lines.push('', 'LINES')
      for (const l of po.lines) lines.push(`${state.products.find((p) => p.id === l.productId)?.sku}\t${l.qty} pcs @ ${po.currency} ${l.rate}`)
      lines.push('', 'TIMELINE', ...(po.timeline || []).map((t) => `${fmtDateTime(t.ts)}  ${t.text}`))
      root.file('00-Order-Summary.txt', lines.join('\n'))
      let n = 0
      for (const r of rows) {
        const folder = root.folder(`${String(CHECKLIST.indexOf(r) + 1).padStart(2, '0')}-${r.key}`)
        for (const { file } of r.files) {
          n++
          if (file.url && file.url.startsWith('data:')) folder.file(file.name, file.url.split(',')[1], { base64: true })
          else if (file.url && file.url.startsWith('blob:')) folder.file(file.name, await (await fetch(file.url)).blob())
          else folder.file(`${file.name}.txt`, `Btali International – ${r.label}\nFile: ${file.name}\nOrder: ${po.number}\nStored: ${fmtDateTime(file.uploadedAt)}\nSize: ${fmtSize(file.size)}\nUploaded by: ${user(file.uploadedBy)?.name || 'Vendor / system'}\n`)
        }
        if (r.system.length) folder.file(`${r.key}-system-record.txt`, r.system.map((s) => `${r.label}: ${s.text}`).join('\n'))
      }
      for (const { file } of others) root.folder('99-OTHER').file(file.url?.startsWith('data:') ? file.name : `${file.name}.txt`, file.url?.startsWith('data:') ? file.url.split(',')[1] : `File: ${file.name}`, file.url?.startsWith('data:') ? { base64: true } : undefined)
      if (repo.tickets.length) root.folder('16-TICKETS').file('tickets.txt', repo.tickets.map((t) => `${t.number} [${t.stage}] ${t.subject}\nCreated ${fmtDateTime(t.createdAt)}\n${(t.updates || []).map((u) => `  - ${fmtDateTime(u.ts)} ${u.text}`).join('\n')}`).join('\n\n'))
      const blob = await z.generateAsync({ type: 'blob' })
      downloadBlob(`${po.number.replace(/\//g, '-')}-documents.zip`, blob)
      toast.success('ZIP downloaded', `${n} files + summary for ${po.number}`)
    } catch (e) {
      toast.error('Could not build ZIP', String(e.message || e))
    }
    setBusy(false)
  }

  const have = rows.filter((r) => r.applicable && (r.files.length || r.system.length || (r.key === 'TICKETS' && repo.tickets.length))).length
  return (
    <Card title={`${po.number} · ${vendor(po.vendorId)?.name}`} subtitle={`${have}/${rows.filter((r) => r.applicable).length} checklist items present${repo.sh ? ` · ${repo.sh.number} (${repo.sh.containerNo})` : ''}`}
      actions={<><Button variant="secondary" size="sm" icon={Upload} onClick={() => setUpload({ docType: 'PI' })}>Upload</Button><Button size="sm" icon={Download} loading={busy} onClick={zip}>Download ZIP</Button></>}>
      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
        {rows.map((r) => {
          const ok = r.files.length || r.system.length || (r.key === 'TICKETS' && repo.tickets.length)
          return (
            <div key={r.key} className={cx('px-3 py-2.5', !r.applicable && 'opacity-60')}>
              <div className="flex items-center gap-3">
                {ok ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <Circle className={cx('w-5 h-5 shrink-0', r.applicable ? 'text-red-300' : 'text-slate-300')} />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{r.label}</div>
                  <div className="text-[11px] text-slate-500">{r.group}{!r.applicable ? ' · not yet applicable' : ''}{r.system.length ? ` · ${r.system.map((s) => s.text).join(' · ')}` : ''}</div>
                </div>
                {ok ? <Badge tone="green">Present</Badge> : r.applicable ? <Badge tone="red">Missing</Badge> : <Badge>Later</Badge>}
                {r.key !== 'TICKETS' && <IconButton icon={Upload} title={`Upload ${r.label}`} onClick={() => setUpload({ docType: r.key })} />}
              </div>
              {r.files.length > 0 && (
                <ul className="mt-2 ml-8 space-y-1">
                  {r.files.map(({ file, source }) => (
                    <li key={file.id || file.name} className="flex items-center gap-2 text-xs">
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate text-slate-700">{file.caption || file.name}</span>
                      <span className="text-slate-400 shrink-0 hidden sm:inline">{source} · {fmtDate(file.uploadedAt)}</span>
                      <span className="flex-1" />
                      <IconButton icon={Eye} title="Open" onClick={() => openAttachment(file)} />
                      {source === 'Uploaded' && (po.docs || []).some((d) => d.id === file.id) && <IconButton icon={Trash2} tone="danger" title="Remove" onClick={async () => { if (await confirm({ title: `Remove ${file.name}?`, tone: 'danger', confirmText: 'Remove' })) { removeDoc(po.id, file.id); toast.success('Document removed') } }} />}
                    </li>
                  ))}
                </ul>
              )}
              {r.key === 'TICKETS' && repo.tickets.length > 0 && (
                <ul className="mt-2 ml-8 space-y-1">{repo.tickets.map((t) => <li key={t.id} className="text-xs flex items-center gap-2"><span className="font-mono text-slate-600">{t.number}</span><span className="truncate">{t.subject}</span><StatusBadge status={t.stage} /></li>)}</ul>
              )}
            </div>
          )
        })}
        {others.length > 0 && (
          <div className="px-3 py-2.5">
            <div className="text-sm font-medium text-slate-800 mb-1">Other documents</div>
            <ul className="ml-8 space-y-1">{others.map(({ file }) => <li key={file.id} className="flex items-center gap-2 text-xs"><FileText className="w-3.5 h-3.5 text-slate-400" /><span className="flex-1 truncate">{file.name}</span><IconButton icon={Eye} title="Open" onClick={() => openAttachment(file)} /></li>)}</ul>
          </div>
        )}
      </div>
      {upload && <UploadModal po={po} initial={upload.docType} onClose={() => setUpload(null)} onSave={(atts, t) => { addDocs(po.id, atts, t); toast.success(`${atts.length} file(s) added`, CHECKLIST.find((c) => c.key === t)?.label || 'Other document'); setUpload(null) }} />}
    </Card>
  )
}

function UploadModal({ po, initial, onClose, onSave }) {
  const [t, setT] = useState(initial)
  const [files, setFiles] = useState([])
  return (
    <Modal open onClose={onClose} title="Upload order documents" subtitle={po.number} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!files.length} onClick={() => onSave(files, t)}>Save {files.length || ''} file(s)</Button></>}>
      <Field label="Document type" className="mb-3"><Select value={t} onChange={(e) => setT(e.target.value)} options={UPLOAD_TYPES} /></Field>
      <FileUpload onFiles={(a) => setFiles((f) => [...f, ...a])} hint="PDF, images, spreadsheets or videos" />
      {files.length > 0 && <ul className="mt-3 text-sm space-y-1">{files.map((f) => <li key={f.id} className="flex justify-between"><span className="truncate">{f.name}</span><span className="text-slate-400 text-xs">{fmtSize(f.size)}</span></li>)}</ul>}
    </Modal>
  )
}
