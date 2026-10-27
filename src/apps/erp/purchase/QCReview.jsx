import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera, CheckCircle2, XCircle, BadgeCheck, ShieldCheck, Lightbulb, Upload, History } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Card, Button, Badge, StatusBadge, Grid, Stat, MediaGrid, EmptyState, FileUpload, Input, Field, Alert, Tabs, toast, confirm, prompt, cx } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtDateTime, fmtDate, fmtPct } from '../../../lib/format'
import { useCanEdit, PoLink } from './_purchaseKit'

export default function QCReview() {
  const [sp, setSp] = useSearchParams()
  const s = useStore()
  const { vendor, user } = useLookup()
  const { canEdit } = useCanEdit()
  const [tab, setTab] = useState('queue')
  const [caption, setCaption] = useState('')

  const queue = useMemo(() => s.purchaseOrders.filter((p) => ((p.qc || []).some((q) => q.status === 'PENDING') || ['IN_PRODUCTION', 'QC_PENDING'].includes(p.status)) && !['CANCELLED', 'REJECTED'].includes(p.status))
    .sort((a, b) => (b.qc || []).filter((q) => q.status === 'PENDING').length - (a.qc || []).filter((q) => q.status === 'PENDING').length), [s.purchaseOrders])
  const poId = sp.get('po') || queue[0]?.id
  const po = s.purchaseOrders.find((p) => p.id === poId)

  const history = useMemo(() => s.purchaseOrders.flatMap((p) => (p.qc || []).map((q) => ({ ...q, po: p, key: `${p.id}-${q.id}` }))).sort((a, b) => String(b.reviewedAt || b.uploadedAt).localeCompare(String(a.reviewedAt || a.uploadedAt))), [s.purchaseOrders])
  const released = s.purchaseOrders.filter((p) => p.qcApprovedAt)
  const ftp = released.length ? (released.filter((p) => !p.qcRejectedOnce && !(p.qc || []).some((q) => q.status === 'REJECTED')).length / released.length) * 100 : null
  const pendingFiles = history.filter((h) => h.status === 'PENDING').length

  const review = async (q, ok) => {
    const remark = await prompt(ok
      ? { title: 'Approve QC item', label: 'Remark (optional)', confirmText: 'Approve' }
      : { title: 'Reject QC item', label: 'What must the vendor fix?', required: true, tone: 'danger', confirmText: 'Reject & notify vendor', placeholder: 'e.g. MRP sticker misaligned on carton; re-shoot after correction' })
    if (remark === null) return
    s.reviewQCItem(po.id, q.id, ok, remark)
    ok ? toast.success('QC item approved') : toast.warn('QC item rejected', 'Vendor notified to correct and re-upload')
  }
  const release = async () => {
    const pend = po.qc.filter((q) => q.status === 'PENDING').length
    const rej = po.qc.filter((q) => q.status === 'REJECTED').length
    const ok = await confirm({ title: `Approve QC & release ${po.number}?`, message: `${pend ? `${pend} pending file(s) will be approved. ` : ''}${rej ? `${rej} rejected file(s) stay on record. ` : ''}The vendor is notified to proceed with stuffing and the PO moves to Ready to ship.`, confirmText: 'Approve all & release' })
    if (!ok) return
    s.releaseQC(po.id)
    toast.success('QC released', `${po.number} is ready to ship – vendor notified`)
  }
  const ack = async (imp) => {
    const note = await prompt({ title: 'Acknowledge improvement', label: 'Note to vendor (optional)', confirmText: 'Acknowledge' })
    if (note === null) return
    s.ackImprovement(po.id, imp.id, note)
    toast.success('Improvement acknowledged', 'Vendor notified')
  }

  const histCols = [
    { key: 'file', header: 'File', value: (h) => h.caption || h.file?.name, render: (h) => <div className="max-w-[260px]"><div className="text-sm truncate">{h.caption || h.file?.name}</div><div className="text-[11px] text-slate-400 truncate">{h.file?.name}</div></div> },
    { key: 'po', header: 'PO', value: (h) => h.po.number, render: (h) => <PoLink po={h.po} /> },
    { key: 'vendor', header: 'Vendor', value: (h) => vendor(h.po.vendorId)?.name, render: (h) => <span className="text-xs whitespace-nowrap">{vendor(h.po.vendorId)?.name.split(' ').slice(0, 2).join(' ')}</span> },
    { key: 'source', header: 'By', value: (h) => (h.source === 'BTALI' ? 'Btali' : 'Vendor') },
    { key: 'uploadedAt', header: 'Uploaded', render: (h) => fmtDate(h.uploadedAt) },
    { key: 'status', header: 'Result', render: (h) => <StatusBadge status={h.status} /> },
    { key: 'remark', header: 'Remark / reviewer', value: (h) => h.remark, render: (h) => <div className="text-xs"><div>{h.remark || '—'}</div>{h.reviewedBy && <div className="text-slate-400">{user(h.reviewedBy)?.name} · {fmtDateTime(h.reviewedAt)}</div>}</div> },
  ]

  return (
    <div>
      <PageHeader title="QC Review" subtitle="Validate branding, MRP stickers, barcodes and product quality from vendor photos & videos before release" />
      <Grid cols={4}>
        <Stat label="Files awaiting review" value={pendingFiles} icon={Camera} tone="amber" />
        <Stat label="POs in QC queue" value={queue.length} icon={ShieldCheck} tone="blue" />
        <Stat label="First-time pass rate" value={fmtPct(ftp, 0)} sub={`${released.length} POs released`} icon={BadgeCheck} tone="green" />
        <Stat label="Items rejected (all time)" value={history.filter((h) => h.status === 'REJECTED').length} icon={XCircle} tone="red" />
      </Grid>
      <Tabs className="mt-5 mb-4" value={tab} onChange={setTab} tabs={[{ key: 'queue', label: 'Review queue', count: queue.length }, { key: 'history', label: 'QC history', count: history.length }]} />

      {tab === 'history' ? (
        <DataTable columns={histCols} rows={history} rowKey="key" exportName="qc-history" filters={[{ key: 'status', label: 'results', options: ['PENDING', 'APPROVED', 'REJECTED'] }]} empty={<EmptyState icon={History} title="No QC records yet" />} />
      ) : queue.length === 0 ? (
        <Card><EmptyState icon={CheckCircle2} title="QC queue is clear" message="Vendor uploads from the portal appear here for review." /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            {queue.map((p) => {
              const pend = (p.qc || []).filter((q) => q.status === 'PENDING').length
              return (
                <button key={p.id} type="button" onClick={() => setSp({ po: p.id })} className={cx('w-full text-left rounded-xl border p-3 bg-white transition-colors', p.id === poId ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-200 hover:border-brand-200')}>
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-semibold">{p.number}</span>{pend ? <Badge tone="amber">{pend} new</Badge> : <Badge tone="gray">0 files</Badge>}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{vendor(p.vendorId)?.name}</div>
                  <div className="mt-1.5"><StatusBadge status={p.status} /></div>
                </button>
              )
            })}
          </div>
          {po && (
            <div className="lg:col-span-3 space-y-4">
              <Card title={<span className="flex items-center gap-2">QC media · <PoLink po={po} /></span>} subtitle={`${vendor(po.vendorId)?.name} · ${po.qc.length} file(s)`}
                actions={canEdit && !po.qcApprovedAt && <Button variant="success" icon={BadgeCheck} disabled={!po.qc.length} title={!po.qc.length ? 'No QC media uploaded yet' : ''} onClick={release}>Approve all & release</Button>}>
                {po.qcApprovedAt && <Alert tone="success" className="mb-3" title="QC released">Released {fmtDateTime(po.qcApprovedAt)}{po.qcApprovedBy ? ` by ${user(po.qcApprovedBy)?.name}` : ''} – PO is {po.status.replace(/_/g, ' ').toLowerCase()}.</Alert>}
                {po.qc.length === 0 ? <EmptyState icon={Camera} title="No QC media yet" message="Vendor uploads production photos & videos on the portal. Btali team can also upload inspection media below." /> : (
                  <MediaGrid items={po.qc} renderActions={(q) => (
                    <>
                      <StatusBadge status={q.status} />
                      {q.source === 'BTALI' && <Badge tone="ink">Btali</Badge>}
                      {canEdit && q.status === 'PENDING' && <>
                        <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => review(q, true)}>OK</Button>
                        <Button size="sm" variant="danger" icon={XCircle} onClick={() => review(q, false)}>Reject</Button>
                      </>}
                      {q.remark && <div className="w-full text-[11px] text-slate-500 mt-1">“{q.remark}”</div>}
                    </>
                  )} />
                )}
              </Card>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card title="Vendor-declared improvements" subtitle="Changes the factory made before delivery">
                  {(po.improvements || []).length === 0 ? <div className="text-sm text-slate-400">No improvements declared for this order.</div> : (
                    <ul className="space-y-2">
                      {po.improvements.map((i) => (
                        <li key={i.id} className="flex items-start gap-2 text-sm border border-slate-200 rounded-lg p-2.5">
                          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div className="flex-1"><div>{i.text}</div><div className="text-[11px] text-slate-400">Declared {fmtDate(i.date)}{i.ack ? ` · acknowledged ${fmtDate(i.ackAt)}${i.ackNote ? ` – ${i.ackNote}` : ''}` : ''}</div></div>
                          {i.ack ? <Badge tone="green">Acknowledged</Badge> : canEdit && <Button size="sm" variant="soft" onClick={() => ack(i)}>Acknowledge</Button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                {canEdit && (
                  <Card title="Upload internal QC media" subtitle="Third-party inspection or Btali visit photos/videos">
                    <Field label="Caption"><Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Pre-shipment inspection – carton drop test" /></Field>
                    <div className="mt-3"><FileUpload accept="image/*,video/*,.pdf" onFiles={(atts) => { s.addQCMedia(po.id, atts, caption); setCaption(''); toast.success(`${atts.length} file(s) added to QC`) }} label="Drop photos / videos" hint="Added as pending items for review" /></div>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
