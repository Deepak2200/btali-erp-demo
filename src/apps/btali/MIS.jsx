import React, { useState } from 'react'
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Grid, Stat, Card, Button, Badge, EmptyState, Alert } from '../../components/ui'
import { fmtINR, fmtDate, fmtDateTime } from '../../lib/format'
import { MisUploadModal, MisResults, MisHistoryTable, MisChart, MIS_KIND } from '../erp/dispatch/_shared'
import { misSummary } from '../../store/slices/dispatch'

export default function BtaliMIS() {
  const uploads = useStore((s) => (s.misUploads || []).filter((u) => u.source === 'BTALI'))
  const [modal, setModal] = useState(false)
  const [openId, setOpenId] = useState(null)
  const open = uploads.find((u) => u.id === openId)
  const totals = uploads.reduce((a, u) => { const s = misSummary(u.results); a.open += s.open; a.over += s.overbilled; a.lines += s.total; a.match += s.MATCH; return a }, { open: 0, over: 0, lines: 0, match: 0 })

  if (open) {
    const sm = misSummary(open.results)
    return (
      <div>
        <PageHeader title={open.fileName} subtitle={`${MIS_KIND[open.kind]} · ${open.period} · uploaded ${fmtDateTime(open.uploadedAt)}`}
          actions={<Button variant="secondary" icon={ArrowLeft} onClick={() => setOpenId(null)}>All uploads</Button>} />
        <Alert className="mb-4" tone={sm.open ? 'warn' : 'success'} title={sm.open ? `${sm.open} exceptions flagged for Btali Dispatch review` : 'Report fully reconciled'}>
          {sm.open ? 'Btali Dispatch reviews each exception and records the resolution; status updates here automatically.' : 'All lines agree with ERP dispatch records.'}
        </Alert>
        <MisResults upload={open} canResolve={false} />
      </div>
    )
  }
  return (
    <div>
      <PageHeader title="MIS upload" subtitle="Upload weekly truck reports and monthly MIS – ERP auto-reconciles against Btali dispatch records"
        actions={<Button icon={Upload} onClick={() => setModal(true)}>Upload report</Button>} />
      <Grid cols={4}>
        <Stat label="Reports uploaded" value={uploads.length} icon={FileSpreadsheet} tone="ink" />
        <Stat label="Lines reconciled" value={totals.lines} sub={`${totals.lines ? Math.round((totals.match / totals.lines) * 100) : 0}% matched`} icon={CheckCircle2} tone="green" />
        <Stat label="Open exceptions" value={totals.open} icon={AlertTriangle} tone="red" />
        <Stat label="Billing differences flagged" value={fmtINR(totals.over)} tone="amber" />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2" title="Btali reported vs ERP actual" subtitle="Freight per uploaded report">
          {uploads.length ? <MisChart uploads={uploads} /> : <EmptyState title="No reports yet" />}
        </Card>
        <Card title="How it works">
          <ol className="text-sm text-slate-600 space-y-2 list-decimal pl-4">
            <li>Export the week's truck sheet or month's MIS from the Btali system as CSV.</li>
            <li>Upload it here – each line is matched to Btali invoice numbers.</li>
            <li>Over/under charges, extra trucks, unknown invoices and missing dispatches are flagged.</li>
            <li>Btali Dispatch resolves exceptions; you see the outcome on each report.</li>
          </ol>
          <Button className="mt-4 w-full" variant="soft" icon={Upload} onClick={() => setModal(true)}>Upload report</Button>
        </Card>
      </div>
      <h3 className="text-sm font-semibold text-slate-900 mt-6 mb-2">Uploaded reports</h3>
      <MisHistoryTable uploads={uploads} onOpen={(u) => setOpenId(u.id)} />
      {modal && <MisUploadModal onClose={() => setModal(false)} onDone={(u) => setOpenId(u.id)} />}
    </div>
  )
}
