import React, { useMemo, useState } from 'react'
import { Upload, FileCheck2, Clock, PackageCheck, Download } from 'lucide-react'
import { useStore, useLookup } from '../../store'
import { PageHeader, Grid, Stat, Button, Badge, StatusBadge, Tabs, EmptyState, openAttachment } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { fmtNum, fmtDate, fmtDateTime, today, daysBetween, sum } from '../../lib/format'
import { LRUploadModal, InvoiceDrawer } from '../erp/dispatch/_shared'

const STAGE_ORDER = { LOADED: 0, PICKED: 1 }

export default function StarexLR() {
  const invoices = useStore((s) => s.invoices)
  const userId = useStore((s) => s.session.userId)
  const { partner, transporter } = useLookup()
  const [tab, setTab] = useState('PENDING')
  const [upload, setUpload] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const t = today()
  const pending = useMemo(() => invoices.filter((i) => i.status === 'ISSUED' && i.locationId !== 'WH-GUJ')
    .sort((a, b) => (STAGE_ORDER[a.starexStage] ?? 2) - (STAGE_ORDER[b.starexStage] ?? 2) || (a.date < b.date ? -1 : 1)), [invoices])
  const done = useMemo(() => invoices.filter((i) => i.lr && i.locationId !== 'WH-GUJ' && i.lr.uploadedAt).sort((a, b) => (a.lr.uploadedAt < b.lr.uploadedAt ? 1 : -1)), [invoices])
  const recentHist = useMemo(() => invoices.filter((i) => i.lr && i.status === 'DISPATCHED').sort((a, b) => (a.lr.date < b.lr.date ? 1 : -1)).slice(0, 60), [invoices])
  const uploadedToday = invoices.filter((i) => i.lr?.date === t && i.lr?.uploadedAt).length
  const overdue = pending.filter((i) => daysBetween(i.date, t) > 2).length

  const pendingCols = [
    { key: 'number', header: 'Invoice', render: (r) => <button className="font-mono text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); setDrawer(r.id) }}>{r.number}</button> },
    { key: 'customer', header: 'Customer', value: (r) => partner(r.partnerId)?.name, render: (r) => <div><div className="font-medium text-slate-800">{partner(r.partnerId)?.name}</div><div className="text-[11px] text-slate-500">{partner(r.partnerId)?.city}</div></div> },
    { key: 'transporter', header: 'Transporter', value: (r) => transporter(r.transporterId)?.name, render: (r) => <span>{transporter(r.transporterId)?.name}{r.safex && <Badge tone="violet" className="ml-1">Safex</Badge>}</span> },
    { key: 'qty', header: 'Qty', align: 'right', value: (r) => sum(r.lines, (l) => l.qty), render: (r) => fmtNum(sum(r.lines, (l) => l.qty)) },
    { key: 'date', header: 'Invoiced', render: (r) => fmtDate(r.date) },
    { key: 'age', header: 'Age', value: (r) => daysBetween(r.date, t), render: (r) => { const d = daysBetween(r.date, t); return <Badge tone={d > 2 ? 'red' : d > 1 ? 'amber' : 'green'}>{d}d {d > 2 ? '· SLA breach' : ''}</Badge> } },
    { key: 'stage', header: 'Floor status', value: (r) => r.starexStage || '', render: (r) => r.starexStage === 'LOADED' ? <StatusBadge status="DONE" label="Loaded" /> : r.starexStage === 'PICKED' ? <StatusBadge status="IN_PROGRESS" label="Picked" /> : <StatusBadge status="PENDING" label="Awaiting pick" /> },
    { key: 'act', header: '', sortable: false, export: false, render: (r) => <Button size="sm" variant={r.starexStage === 'LOADED' ? 'primary' : 'secondary'} icon={Upload} onClick={(e) => { e.stopPropagation(); setUpload(r.id) }}>Upload LR</Button> },
  ]
  const doneCols = [
    { key: 'number', header: 'Invoice', render: (r) => <span className="font-mono text-xs">{r.number}</span> },
    { key: 'customer', header: 'Customer', value: (r) => partner(r.partnerId)?.name },
    { key: 'lr', header: 'LR no.', value: (r) => r.lr.number },
    { key: 'lrDate', header: 'LR date', value: (r) => r.lr.date, render: (r) => fmtDate(r.lr.date) },
    { key: 'vehicle', header: 'Vehicle', value: (r) => r.lr.vehicleNo || r.vehicleNo || '—' },
    { key: 'by', header: 'Uploaded', value: (r) => r.lr.uploadedAt || r.lr.date, render: (r) => r.lr.uploadedAt ? <span className="text-xs">{fmtDateTime(r.lr.uploadedAt)}{r.lr.uploadedBy === userId ? ' · you' : ''}</span> : <span className="text-xs text-slate-500">{fmtDate(r.lr.date)}</span> },
    { key: 'mail', header: 'Emailed', sortable: false, render: () => <Badge tone="green">Client & Sales</Badge> },
    { key: 'file', header: '', sortable: false, export: false, render: (r) => r.lr.file ? <Button size="sm" variant="ghost" icon={Download} onClick={(e) => { e.stopPropagation(); openAttachment(r.lr.file) }}>LR</Button> : null },
  ]
  return (
    <div>
      <PageHeader title="LR upload" subtitle="Upload lorry receipts after loading – ERP emails the LR to the customer and Btali Sales automatically" />
      <Grid cols={4}>
        <Stat label="Awaiting LR" value={pending.length} icon={Clock} tone="amber" />
        <Stat label="Loaded, LR due" value={pending.filter((i) => i.starexStage === 'LOADED').length} icon={PackageCheck} tone="brand" />
        <Stat label="Uploaded today" value={uploadedToday} icon={FileCheck2} tone="green" />
        <Stat label="Beyond 48h SLA" value={overdue} icon={Clock} tone="red" />
      </Grid>
      <Tabs className="mt-4 mb-3" value={tab} onChange={setTab} tabs={[{ key: 'PENDING', label: 'Pending LR', count: pending.length }, { key: 'DONE', label: 'Uploaded from this desk', count: done.length }, { key: 'HIST', label: 'All recent dispatches' }]} />
      {tab === 'PENDING' && <DataTable rows={pending} columns={pendingCols} onRowClick={(r) => setUpload(r.id)} exportName="pending-lr" empty={<EmptyState icon={FileCheck2} title="All LRs uploaded" message="Every invoice in the schedule has its LR on record." />} />}
      {tab === 'DONE' && <DataTable rows={done} columns={doneCols} onRowClick={(r) => setDrawer(r.id)} exportName="lr-uploads" empty={<EmptyState title="No LRs uploaded yet" message="LRs you upload appear here." />} />}
      {tab === 'HIST' && <DataTable rows={recentHist} columns={doneCols} onRowClick={(r) => setDrawer(r.id)} exportName="recent-dispatches" />}
      {upload && <LRUploadModal invoiceId={upload} onClose={() => setUpload(null)} />}
      {drawer && <InvoiceDrawer invoiceId={drawer} onClose={() => setDrawer(null)} onUploadLR={(id) => { setDrawer(null); setUpload(id) }} />}
    </div>
  )
}
