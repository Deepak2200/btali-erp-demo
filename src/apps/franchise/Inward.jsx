import React, { useMemo, useState } from 'react'
import { PackageCheck, Truck, ScanLine, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, Grid, Stat, ProductImage, Progress, Alert, Textarea, NumberInput, FileUpload, AttachmentList, EmptyState, Field, toast, confirm, cx } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { ScanInput } from '../../components/business'
import { fmtDate, fmtNum, fmtINR, sum, timeAgo } from '../../lib/format'
import { usePortal, isPendingInward } from '../dealer/_portal'

export default function Inward() {
  const { partnerId, partner } = usePortal()
  const invoices = useStore((s) => s.invoices)
  const transporters = useStore((s) => s.transporters)
  const mine = useMemo(() => invoices.filter((i) => i.partnerId === partnerId), [invoices, partnerId])
  const pending = mine.filter((i) => isPendingInward(i, partnerId)).sort((a, b) => (a.lr?.date || '').localeCompare(b.lr?.date || ''))
  const done = mine.filter((i) => i.inward?.acknowledged).sort((a, b) => b.inward.ackAt.localeCompare(a.inward.ackAt))
  const issued = mine.filter((i) => i.status === 'ISSUED')
  const [sel, setSel] = useState(null)
  const inv = pending.find((i) => i.id === sel)
  const tr = (id) => transporters.find((t) => t.id === id)

  if (inv) return <Receive inv={inv} partner={partner} transporter={tr(inv.transporterId)} onBack={() => setSel(null)} />
  return (
    <div>
      <PageHeader title="Stock inward" subtitle="Scan every carton received from Btali to confirm receipt – short or damaged items raise a ticket automatically" />
      <Grid cols={4} className="mb-4">
        <Stat icon={Truck} tone="amber" label="In transit" value={pending.length} sub={`${fmtNum(sum(pending, (i) => sum(i.lines, (l) => l.qty)))} units`} />
        <Stat icon={PackageCheck} tone="blue" label="Invoiced" value={issued.length} />
        <Stat icon={CheckCircle2} tone="green" label="Received" value={done.length} />
        <Stat icon={AlertTriangle} tone="red" label="With issues" value={done.filter((i) => i.inward.lines?.some((l) => l.received < l.expected || l.damaged)).length} />
      </Grid>
      <Card title="Consignments to receive" className="mb-4">
        {pending.length === 0 ? <EmptyState icon={PackageCheck} title="Nothing pending" message="All dispatched consignments have been received." /> : (
          <div className="grid md:grid-cols-2 gap-3">
            {pending.map((i) => (
              <div key={i.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex justify-between gap-2"><div><div className="font-mono font-semibold">{i.number}</div><div className="text-xs text-slate-500">Invoice {fmtDate(i.date)} · {fmtINR(i.total)}</div></div><Badge tone="amber">In transit</Badge></div>
                <div className="text-sm mt-2">{tr(i.transporterId)?.name} · LR <span className="font-mono">{i.lr?.number}</span> · dispatched {timeAgo(i.lr?.date ? `${i.lr.date}T10:00:00Z` : i.dispatchDate)}</div>
                <div className="text-xs text-slate-500 mt-1">{i.lines.length} lines · {fmtNum(sum(i.lines, (l) => l.qty))} units · {(i.units || []).length} barcodes to scan</div>
                <Button className="mt-3" icon={ScanLine} onClick={() => setSel(i.id)}>Start inward scan</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Received consignments" padded={false}>
        <DataTable rows={done} className="border-0 shadow-none" searchable={false} empty={<EmptyState title="No receipts yet" />}
          columns={[
            { key: 'number', header: 'Invoice', render: (i) => <span className="font-mono">{i.number}</span> },
            { key: 'lr', header: 'LR', value: (i) => i.lr?.number || '' },
            { key: 'ack', header: 'Received on', value: (i) => i.inward.date, render: (i) => fmtDate(i.inward.date) },
            { key: 'scanned', header: 'Barcodes scanned', align: 'right', value: (i) => `${(i.inward.scanned || []).length}/${(i.units || []).length}` },
            { key: 'status', header: 'Result', render: (i) => (i.inward.lines?.some((l) => l.received < l.expected || l.damaged) ? <Badge tone="red">Discrepancy reported</Badge> : <Badge tone="green">All OK</Badge>) },
          ]} />
      </Card>
    </div>
  )
}

function Receive({ inv, partner, transporter, onBack }) {
  const products = useStore((s) => s.products)
  const units = useStore((s) => s.units)
  const acknowledgeInward = useStore((s) => s.acknowledgeInward)
  const [scanned, setScanned] = useState([])
  const [manual, setManual] = useState({})
  const [damaged, setDamaged] = useState({})
  const [remarks, setRemarks] = useState('')
  const [files, setFiles] = useState([])
  const [err, setErr] = useState('')
  const codes = inv.units || []
  const unitOf = (c) => units.find((u) => u.code === c)
  const barcodedPids = new Set(codes.map((c) => unitOf(c)?.productId))
  const lines = inv.lines.map((l) => {
    const isBar = barcodedPids.has(l.productId)
    const sc = scanned.filter((c) => unitOf(c)?.productId === l.productId).length
    const received = isBar ? sc : (manual[l.productId] ?? l.qty)
    return { productId: l.productId, expected: l.qty, received: Number(received) || 0, damaged: Number(damaged[l.productId]) || 0, isBar, free: l.free }
  })
  const scan = (code) => {
    setErr('')
    if (!codes.includes(code)) return setErr(`${code} does not belong to invoice ${inv.number}`)
    if (scanned.includes(code)) return setErr(`${code} already scanned`)
    setScanned((s) => [...s, code])
  }
  const issues = lines.filter((l) => l.received < l.expected || l.damaged > 0)
  const submit = async () => {
    const msg = issues.length ? `${issues.length} line(s) short or damaged. A ticket will be raised to Btali Dispatch and these units removed from store stock.` : 'All items received in good condition.'
    if (!(await confirm({ title: `Confirm receipt of ${inv.number}?`, message: msg, confirmText: 'Confirm receipt', tone: issues.length ? 'danger' : undefined }))) return
    const r = acknowledgeInward(inv.id, { scanned, lines: lines.map(({ productId, expected, received, damaged: dmg }) => ({ productId, expected, received, damaged: dmg })), remarks, attachments: files })
    if (!r.ok) return toast.error('Could not save', r.error)
    toast.success('Inward complete', issues.length ? `${r.inward.ticketIds.length} ticket(s) raised for discrepancies` : `${inv.number} received into store stock`)
    onBack()
  }
  const pct = codes.length ? (scanned.length / codes.length) * 100 : 100
  return (
    <div>
      <PageHeader title={`Receive ${inv.number}`} subtitle={`${transporter?.name || ''} · LR ${inv.lr?.number} · ${partner?.name}`} actions={<Button variant="secondary" icon={ArrowLeft} onClick={onBack}>Back</Button>} />
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Scan barcodes" subtitle={`${scanned.length} of ${codes.length} unit barcodes scanned`}>
            <ScanInput onScan={scan} suggestions={codes.filter((c) => !scanned.includes(c))} />
            <Progress className="mt-3" value={pct} tone={pct >= 100 ? 'green' : 'brand'} showLabel />
            {err && <Alert tone="error" className="mt-3">{err}</Alert>}
          </Card>
          <Card padded={false} title="Items on invoice">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-4 py-2">Product</th><th className="text-right px-3 py-2">Invoiced</th><th className="text-center px-3 py-2">Received</th><th className="text-center px-3 py-2">Damaged</th><th className="text-left px-3 py-2">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => {
                    const p = products.find((x) => x.id === l.productId)
                    const ok = l.received >= l.expected && !l.damaged
                    return (
                      <tr key={l.productId} className={cx(!ok && 'bg-red-50/30')}>
                        <td className="px-4 py-2"><div className="flex items-center gap-2"><ProductImage product={p} size="sm" /><div><div className="font-medium">{p?.shortName}</div><div className="text-[11px] text-slate-500">{p?.sku}{l.isBar ? ' · scan each unit' : ' · count cartons'}{l.free ? ' · free' : ''}</div></div></div></td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.expected}</td>
                        <td className="px-3 py-2 text-center">{l.isBar ? <span className="tabular-nums font-semibold">{l.received}</span> : <NumberInput min={0} max={l.expected} value={manual[l.productId] ?? l.expected} onChange={(v) => setManual({ ...manual, [l.productId]: v })} className="!w-20 mx-auto text-center py-1" />}</td>
                        <td className="px-3 py-2 text-center"><NumberInput min={0} value={damaged[l.productId] ?? ''} onChange={(v) => setDamaged({ ...damaged, [l.productId]: v })} className="!w-16 mx-auto text-center py-1" placeholder="0" /></td>
                        <td className="px-3 py-2">{ok ? <Badge tone="green">OK</Badge> : l.received < l.expected ? <Badge tone="red">Short {l.expected - l.received}</Badge> : <Badge tone="amber">{l.damaged} damaged</Badge>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <Card title="Confirm receipt" className="lg:sticky lg:top-4">
          {issues.length ? <Alert tone="warn" title={`${issues.length} discrepancy line(s)`}>Attach photos of damaged cartons / LR remarks. A shortage or transit-damage ticket is raised to Btali.</Alert> : <Alert tone="success" title="Everything matches">{codes.length && scanned.length < codes.length ? 'Scan the remaining barcodes to complete.' : 'Ready to confirm.'}</Alert>}
          <Field label="Remarks" className="mt-3"><Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. 1 carton torn, LR endorsed by driver" /></Field>
          <div className="mt-3"><FileUpload compact onFiles={(a) => setFiles((s) => [...s, ...a])} label="Photos of cartons / LR" />{files.length > 0 && <div className="mt-2"><AttachmentList items={files} dense onRemove={(a) => setFiles((s) => s.filter((x) => x.id !== a.id))} /></div>}</div>
          <Button className="w-full mt-4" icon={PackageCheck} variant={issues.length ? 'danger' : 'primary'} onClick={submit}>{issues.length ? 'Confirm & report discrepancy' : 'Confirm receipt'}</Button>
        </Card>
      </div>
    </div>
  )
}
