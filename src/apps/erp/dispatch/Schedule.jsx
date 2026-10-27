import React, { useMemo, useState } from 'react'
import { FileSpreadsheet, Send, CheckCircle2, Truck, Package, Weight, Box } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Button, Badge, Input, Alert, EmptyState, confirm, toast } from '../../../components/ui'
import { fmtNum, fmtDate, fmtDateTime, today, addDays, sum, round2, downloadText, makeAttachment, groupBy } from '../../../lib/format'
import { scheduleInvoices, scheduleRows, scheduleCSV } from './_shared'

export default function Schedule() {
  const s = useStore()
  const confirmSchedule = useStore((x) => x.confirmDispatchSchedule)
  const [date, setDate] = useState(addDays(today(), 1))
  const invs = useMemo(() => scheduleInvoices(s.invoices, date), [s.invoices, date])
  const rows = useMemo(() => scheduleRows(invs, s), [invs, s.products, s.partners, s.transporters]) // eslint-disable-line
  const groups = groupBy(rows, 'transporter')
  const rec = (s.dispatchSchedules || []).find((x) => x.date === date)
  const changed = rec && (rec.invoiceIds.length !== invs.length || invs.some((i) => !rec.invoiceIds.includes(i.id)))
  const fileName = `Btali-Dispatch-Schedule-${date}.csv`

  const exportFile = () => {
    downloadText(fileName, scheduleCSV(rows), 'text/csv')
    toast.success('Schedule exported', fileName)
  }
  const send = async () => {
    if (!invs.length) return toast.error('Nothing to schedule for this date')
    const ok = await confirm({ title: 'Confirm & email to Starex?', message: `${invs.length} invoices · ${fmtNum(sum(rows, (r) => r.qty))} pcs · ${fmtNum(round2(sum(rows, (r) => r.weight)))} kg will be emailed to ops@starex3pl.in and published on the Starex portal.`, confirmText: 'Confirm & send' })
    if (!ok) return
    confirmSchedule({ date, invoiceIds: invs.map((i) => i.id), email: true, attachment: makeAttachment(fileName.replace('.csv', '.xlsx'), { docType: 'SCHEDULE' }) })
    toast.success('Schedule sent to Starex', `${fmtDate(date)} · ${invs.length} invoices`)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Daily Dispatch Summary" subtitle="Auto-built from issued invoices – grouped by transporter for Starex loading & vehicle planning"
        actions={<>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          <Button variant="secondary" icon={FileSpreadsheet} onClick={exportFile} disabled={!rows.length}>Export Excel</Button>
          <Button icon={Send} onClick={send} disabled={!rows.length}>{rec ? 'Re-send to Starex' : 'Confirm & email Starex'}</Button>
        </>} />
      {rec && !changed && <Alert tone="success" title={`Schedule confirmed for ${fmtDate(date)}`}>Emailed to Starex {fmtDateTime(rec.emailedAt)} · revision {rec.revision}.</Alert>}
      {rec && changed && <Alert tone="warn" title="Schedule changed since it was sent">New invoices were added after confirmation on {fmtDateTime(rec.confirmedAt)}. Re-send to keep Starex in sync.</Alert>}
      <Grid cols={4}>
        <Stat label="Invoices" value={invs.length} sub={`${invs.filter((i) => i.dispatchDate < date).length} carried over`} icon={Package} />
        <Stat label="Transporters / vehicles" value={Object.keys(groups).length} icon={Truck} tone="ink" />
        <Stat label="Total weight" value={`${fmtNum(round2(sum(rows, (r) => r.weight)))} kg`} icon={Weight} tone="blue" />
        <Stat label="Total volume" value={`${fmtNum(round2(sum(rows, (r) => r.cbm)))} CBM`} icon={Box} tone="violet" />
      </Grid>
      {!rows.length && <Card><EmptyState icon={CheckCircle2} title="No dispatches for this date" message="Invoices generated today are scheduled for next-day dispatch automatically." /></Card>}
      {Object.entries(groups).map(([tr, list]) => {
        const invNos = [...new Set(list.map((r) => r.invoice))]
        const isSafex = s.transporters.find((t) => t.name === tr)?.isSafex
        return (
          <Card key={tr} padded={false} title={<span className="flex items-center gap-2"><Truck className="w-4 h-4 text-brand-500" />{tr}{isSafex && <Badge tone="violet">Safex direct pickup</Badge>}</span>}
            subtitle={`${invNos.length} invoices · ${fmtNum(sum(list, (r) => r.qty))} pcs · ${fmtNum(round2(sum(list, (r) => r.weight)))} kg · ${fmtNum(round2(sum(list, (r) => r.cbm)))} CBM`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr><th className="text-left px-4 py-2">Invoice</th><th className="text-left px-3 py-2">Client</th><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Weight (kg)</th><th className="text-right px-4 py-2">CBM</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((r, i) => {
                    const first = i === 0 || list[i - 1].invoice !== r.invoice
                    return (
                      <tr key={i} className={first ? '' : 'border-t-0'}>
                        <td className="px-4 py-2 font-mono text-xs">{first ? <>{r.invoice}{r.type === 'FOC' && <Badge tone="amber" className="ml-1">FOC</Badge>}{r.date < date && <Badge tone="red" className="ml-1">Carry-over</Badge>}</> : ''}</td>
                        <td className="px-3 py-2">{first ? <div><div className="font-medium text-slate-800">{r.customer}</div><div className="text-[11px] text-slate-500">{r.city}</div></div> : ''}</td>
                        <td className="px-3 py-2"><span className="text-slate-800">{r.product}</span> <span className="text-[11px] text-slate-500">{r.sku}</span></td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.qty)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.weight)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtNum(r.cbm)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
