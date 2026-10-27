import React, { useMemo, useState } from 'react'
import { Upload, Clock, CheckCircle2, AlertTriangle, Download, Mail } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Grid, Stat, Tabs, Button, Badge, Card, openAttachment, toast } from '../../../components/ui'
import { PartnerCell, BarsChart } from '../../../components/business'
import DataTable from '../../../components/DataTable'
import { fmtDate, fmtNum, daysAgo, daysBetween, today } from '../../../lib/format'
import { InvoiceDrawer, LRUploadModal, lrAgeDays } from './_shared'

const ageTone = (d) => (d <= 1 ? 'green' : d <= 2 ? 'amber' : 'red')

export default function LR() {
  const s = useStore()
  const resend = useStore((x) => x.resendInvoiceEmail)
  const { partner, transporter, user } = useLookup()
  const [tab, setTab] = useState('pending')
  const [lrFor, setLrFor] = useState(null)
  const [openId, setOpenId] = useState(null)
  const pending = useMemo(() => s.invoices.filter((i) => i.status === 'ISSUED' && i.locationId !== 'WH-GUJ'), [s.invoices])
  const done = useMemo(() => s.invoices.filter((i) => i.lr && i.date >= daysAgo(120)), [s.invoices])
  const within = done.filter((i) => daysBetween(i.date, i.lr.date) <= 2).length
  const ageing = [
    { label: '0–1 day', count: pending.filter((i) => lrAgeDays(i) <= 1).length },
    { label: '2 days', count: pending.filter((i) => lrAgeDays(i) === 2).length },
    { label: '3–5 days', count: pending.filter((i) => lrAgeDays(i) >= 3 && lrAgeDays(i) <= 5).length },
    { label: '> 5 days', count: pending.filter((i) => lrAgeDays(i) > 5).length },
  ]
  return (
    <div className="space-y-5">
      <PageHeader title="Dispatch & LR" subtitle="Upload lorry receipts – auto-attached to the order, emailed to client and visible to Sales & dealer portal" />
      <Grid cols={4}>
        <Stat label="Awaiting LR" value={pending.length} icon={Clock} tone="amber" />
        <Stat label="Beyond 48h SLA" value={pending.filter((i) => lrAgeDays(i) > 2).length} icon={AlertTriangle} tone="red" />
        <Stat label="LR uploaded today" value={s.invoices.filter((i) => i.lr?.uploadedAt?.slice(0, 10) === today()).length} icon={Upload} tone="blue" />
        <Stat label="Within SLA (120 days)" value={`${done.length ? Math.round((within / done.length) * 100) : 100}%`} sub={`${fmtNum(within)} of ${fmtNum(done.length)}`} icon={CheckCircle2} tone="green" />
      </Grid>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'pending', label: 'Awaiting LR', count: pending.length }, { key: 'done', label: 'Dispatched', count: done.length }]} />
      {tab === 'pending' ? (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <DataTable key="pending" rows={pending} onRowClick={(i) => setOpenId(i.id)} initialSort={{ key: 'age', dir: 'desc' }}
              columns={[
                { key: 'number', header: 'Invoice', render: (i) => <div><div className="font-mono text-xs whitespace-nowrap">{i.number}</div>{i.type === 'FOC' && <Badge tone="amber">FOC</Badge>}</div> },
                { key: 'partner', header: 'Customer', value: (i) => partner(i.partnerId)?.name, render: (i) => <PartnerCell id={i.partnerId} /> },
                { key: 'tr', header: 'Transporter', value: (i) => transporter(i.transporterId)?.name },
                { key: 'stage', header: 'Starex', value: (i) => i.starexStage || 'Scheduled', render: (i) => <Badge tone={i.starexStage === 'LOADED' ? 'green' : i.starexStage === 'PICKED' ? 'blue' : 'gray'}>{i.starexStage === 'LOADED' ? 'Loaded' : i.starexStage === 'PICKED' ? 'Picked' : 'Scheduled'}</Badge> },
                { key: 'age', header: 'Age', align: 'right', value: (i) => lrAgeDays(i), render: (i) => <Badge tone={ageTone(lrAgeDays(i))}>{lrAgeDays(i)} d</Badge> },
                { key: 'act', header: '', sortable: false, export: false, render: (i) => <Button size="sm" icon={Upload} onClick={(e) => { e.stopPropagation(); setLrFor(i.id) }}>Upload LR</Button> },
              ]}
              empty={<div className="text-center text-sm text-slate-500 py-10">Every invoice has its LR – nothing pending.</div>} />
          </div>
          <Card title="SLA ageing" subtitle="Open invoices by days since invoice">
            <BarsChart data={ageing} money={false} height={220} series={[{ key: 'count', label: 'Invoices', color: '#f59e0b' }]} />
          </Card>
        </div>
      ) : (
        <DataTable key="done" rows={done} exportName="dispatched-lr" onRowClick={(i) => setOpenId(i.id)} initialSort={{ key: 'lrdate', dir: 'desc' }}
          filters={[{ key: 'transporterId', label: 'transporters', options: s.transporters.map((t) => ({ value: t.id, label: t.name })) }, { key: 'sla', label: 'SLA', value: (i) => (daysBetween(i.date, i.lr.date) <= 2 ? 'Within' : 'Breached'), options: ['Within', 'Breached'] }]}
          columns={[
            { key: 'number', header: 'Invoice', render: (i) => <span className="font-mono text-xs whitespace-nowrap">{i.number}</span> },
            { key: 'partner', header: 'Customer', value: (i) => partner(i.partnerId)?.name, render: (i) => <PartnerCell id={i.partnerId} /> },
            { key: 'tr', header: 'Transporter', value: (i) => transporter(i.transporterId)?.name },
            { key: 'lrno', header: 'LR no.', value: (i) => i.lr.number, render: (i) => <span className="font-mono text-xs whitespace-nowrap">{i.lr.number}</span> },
            { key: 'lrdate', header: 'LR date', value: (i) => i.lr.date, render: (i) => fmtDate(i.lr.date) },
            { key: 'lead', header: 'Lead time', align: 'right', value: (i) => daysBetween(i.date, i.lr.date), render: (i) => <Badge tone={ageTone(daysBetween(i.date, i.lr.date))}>{daysBetween(i.date, i.lr.date)} d</Badge> },
            { key: 'by', header: 'Uploaded by', value: (i) => user(i.lr.uploadedBy)?.name || '—' },
            { key: 'act', header: '', sortable: false, export: false, render: (i) => (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" icon={Download} onClick={() => openAttachment(i.lr.file || { name: `LR-${i.lr.number}.pdf`, docType: 'LR', uploadedAt: i.lr.date })}>LR</Button>
                <Button size="sm" variant="ghost" icon={Mail} onClick={() => { resend(i.id); toast.success('Invoice & LR re-sent', partner(i.partnerId)?.email) }}>Resend</Button>
              </div>
            ) },
          ]} />
      )}
      {lrFor && <LRUploadModal invoiceId={lrFor} onClose={() => setLrFor(null)} />}
      {openId && <InvoiceDrawer invoiceId={openId} onClose={() => setOpenId(null)} onUploadLR={(id) => setLrFor(id)} />}
    </div>
  )
}
