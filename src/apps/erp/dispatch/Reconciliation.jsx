import React, { useMemo, useState } from 'react'
import { Upload, GitCompare, ShieldCheck, IndianRupee, AlertTriangle, ArrowLeft, Trash2 } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Button, Badge, EmptyState, confirm, toast } from '../../../components/ui'
import { fmtINR, fmtDateTime, sum, round2 } from '../../../lib/format'
import { misSummary } from '../../../store/slices/dispatch'
import { MisUploadModal, MisResults, MisHistoryTable, MisChart, MIS_KIND, InvoiceDrawer } from './_shared'

export default function Reconciliation() {
  const uploads = useStore((s) => s.misUploads || [])
  const users = useStore((s) => s.users)
  const removeMis = useStore((s) => s.removeMisUpload)
  const [upOpen, setUpOpen] = useState(false)
  const [sel, setSel] = useState(null)
  const [inv, setInv] = useState(null)
  const current = uploads.find((u) => u.id === sel)
  const agg = useMemo(() => {
    const all = uploads.flatMap((u) => u.results)
    const sm = misSummary(all)
    const weekly = uploads.find((u) => u.kind === 'WEEKLY_TRUCK')
    const monthly = uploads.find((u) => u.kind === 'MONTHLY_MIS')
    const prevented = sum(all.filter((r) => r.resolved && r.diff > 0), (r) => r.diff)
    return { sm, weekly: weekly ? misSummary(weekly.results) : null, monthly: monthly ? misSummary(monthly.results) : null, prevented, open: sm.open }
  }, [uploads])

  if (current) {
    const sm = misSummary(current.results)
    return (
      <div className="space-y-5">
        <PageHeader breadcrumb={<button className="inline-flex items-center gap-1 hover:text-slate-800" onClick={() => setSel(null)}><ArrowLeft className="w-3 h-3" /> Reconciliation</button>}
          title={current.fileName} subtitle={`${MIS_KIND[current.kind]} · ${current.source === 'STAREX' ? 'Starex 3PL' : 'Safex'} · ${current.period} · uploaded ${fmtDateTime(current.uploadedAt)} by ${users.find((u) => u.id === current.uploadedBy)?.name || '—'}`}
          actions={<>
            {sm.open === 0 && <Badge tone="green">Fully reconciled</Badge>}
            <Button variant="ghost" icon={Trash2} onClick={async () => { if (await confirm({ title: 'Delete this upload?', message: 'Results and resolutions for this file will be removed.', tone: 'danger', confirmText: 'Delete' })) { removeMis(current.id); setSel(null); toast.success('Upload deleted') } }}>Delete</Button>
          </>} />
        <MisResults upload={current} onOpenInvoice={setInv} />
        {inv && <InvoiceDrawer invoiceId={inv} onClose={() => setInv(null)} />}
      </div>
    )
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Starex Reconciliation" subtitle="Starex reported vs ERP actual – weekly truck reports and monthly MIS auto-matched to invoices"
        actions={<Button icon={Upload} onClick={() => setUpOpen(true)}>Upload report</Button>} />
      <Grid cols={4}>
        <Stat label="Weekly mismatch rate" value={agg.weekly ? `${agg.weekly.mismatchRate}%` : '—'} sub="latest truck report" icon={GitCompare} tone={agg.weekly?.mismatchRate > 10 ? 'red' : 'green'} />
        <Stat label="Monthly accuracy" value={agg.monthly ? `${agg.monthly.accuracy}%` : '—'} sub="latest MIS" icon={ShieldCheck} tone="blue" />
        <Stat label="Open exceptions" value={agg.open} icon={AlertTriangle} tone={agg.open ? 'amber' : 'green'} />
        <Stat label="Over-billing prevented" value={fmtINR(agg.prevented)} sub={`${fmtINR(agg.sm.overbilled)} flagged in total`} icon={IndianRupee} tone="violet" />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-5">
        <Card title="Starex reported vs ERP actual" subtitle="Freight per uploaded report" className="lg:col-span-2">
          {uploads.length ? <MisChart uploads={uploads} /> : <EmptyState title="No reports yet" />}
        </Card>
        <Card title="Exception mix" subtitle="All uploads">
          <div className="space-y-3 text-sm">
            {[['Over / under charged', agg.sm.MISMATCH, 'red'], ['Extra trucks / consignments billed', agg.sm.EXTRA, 'violet'], ['Missing deliveries', agg.sm.MISSING, 'amber'], ['Matched', agg.sm.MATCH, 'green']].map(([l, v, t]) => (
              <div key={l} className="flex items-center justify-between"><span className="text-slate-600">{l}</span><Badge tone={t}>{v}</Badge></div>
            ))}
            <div className="pt-3 border-t border-slate-100 text-xs text-slate-500">Matching keys: invoice number, trucks used vs consignment weight (9 t/truck), freight vs ERP freight cost or Starex rate card (₹3.4/kg, min ₹450). Tolerance ±2% or ₹50.</div>
          </div>
        </Card>
      </div>
      <Card title="Uploaded reports" subtitle="Click a report to review and resolve exceptions" padded={false}>
        {uploads.length ? <MisHistoryTable uploads={uploads} onOpen={(u) => setSel(u.id)} /> : <EmptyState title="No reports uploaded" action={<Button icon={Upload} onClick={() => setUpOpen(true)}>Upload report</Button>} />}
      </Card>
      {upOpen && <MisUploadModal onClose={() => setUpOpen(false)} onDone={(u) => setSel(u.id)} />}
    </div>
  )
}
