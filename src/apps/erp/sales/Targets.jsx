import React, { useMemo, useState } from 'react'
import { Target, Plus, Trophy, IndianRupee, Copy, Pencil, Trash2, BadgeCheck, Download, TrendingUp } from 'lucide-react'
import { useStore } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Tabs, Button, IconButton, Modal, Field, FormGrid, Select, NumberInput, Combobox, Badge, Progress, toast, confirm, Alert,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PartnerCell, BarsChart } from '../../../components/business'
import { fmtINR, fmtCompact, fmtPct, lastMonths, monthLabel, exportCSV, sum, round2 } from '../../../lib/format'
import { useScope, ScopeToggle, targetRow, periodLabel, quarterStartOf, SALES_PEOPLE } from './_shared'

const DEFAULT_SLABS = [{ achievePct: 90, incentivePct: 1 }, { achievePct: 100, incentivePct: 2 }, { achievePct: 120, incentivePct: 3 }]
const shiftMonth = (key, n) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function TargetModal({ open, onClose, edit, defaults }) {
  const state = useStore()
  const upsertTarget = useStore((s) => s.upsertTarget)
  const cur = lastMonths(1)[0]
  const [f, setF] = useState(() => edit ? { ...edit, slabs: edit.slabs?.length ? edit.slabs : DEFAULT_SLABS } : { ownerType: defaults?.ownerType || 'DEALER', ownerId: '', periodType: defaults?.ownerType === 'SALESPERSON' ? 'QUARTER' : 'MONTH', period: defaults?.period || cur, amount: '', slabs: DEFAULT_SLABS })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const ownerOpts = f.ownerType === 'DEALER'
    ? state.partners.filter((p) => p.status === 'ACTIVE' && p.type !== 'EXPORT').map((p) => ({ value: p.id, label: p.name, sub: `${p.city} · ${p.region}` }))
    : state.users.filter((u) => SALES_PEOPLE.includes(u.id)).map((u) => ({ value: u.id, label: u.name, sub: u.title }))
  const months = [...lastMonths(6), shiftMonth(cur, 1), shiftMonth(cur, 2), shiftMonth(cur, 3)]
  const periodOpts = f.periodType === 'QUARTER'
    ? [...new Set(months.map(quarterStartOf))].map((q) => ({ value: q, label: periodLabel('QUARTER', q) }))
    : months.map((m) => ({ value: m, label: monthLabel(m) }))
  const save = () => {
    if (!f.ownerId) return toast.error('Select whom the target is for')
    if (!(Number(f.amount) > 0)) return toast.error('Enter a target amount')
    const slabs = f.slabs.filter((s) => Number(s.achievePct) > 0).map((s) => ({ achievePct: Number(s.achievePct), incentivePct: Number(s.incentivePct) || 0 }))
    upsertTarget({ ...(edit ? { id: edit.id } : {}), ownerType: f.ownerType, ownerId: f.ownerId, periodType: f.periodType, period: f.period, amount: Number(f.amount), slabs })
    toast.success(edit ? 'Target updated' : 'Target set', `${periodLabel(f.periodType, f.period)} · ${fmtINR(Number(f.amount))}`)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={edit ? 'Edit target' : 'Set sales target'} subtitle="Achievement is measured on invoiced taxable value. Incentive is paid on the highest slab reached."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save target</Button></>}>
      <FormGrid>
        <Field label="Target for"><Select value={f.ownerType} disabled={!!edit} onChange={(e) => setF((s) => ({ ...s, ownerType: e.target.value, ownerId: '', periodType: e.target.value === 'SALESPERSON' ? 'QUARTER' : 'MONTH', period: e.target.value === 'SALESPERSON' ? quarterStartOf(cur) : cur }))} options={[{ value: 'DEALER', label: 'Dealer / franchise' }, { value: 'SALESPERSON', label: 'Salesperson' }]} /></Field>
        <Field label={f.ownerType === 'DEALER' ? 'Dealer' : 'Salesperson'} required>{edit ? <div className="text-sm py-2 font-medium">{ownerOpts.find((o) => o.value === f.ownerId)?.label}</div> : <Combobox options={ownerOpts} value={f.ownerId} onChange={(v) => set('ownerId', v)} />}</Field>
        <Field label="Period type"><Select value={f.periodType} disabled={!!edit} onChange={(e) => setF((s) => ({ ...s, periodType: e.target.value, period: e.target.value === 'QUARTER' ? quarterStartOf(s.period) : s.period }))} options={[{ value: 'MONTH', label: 'Monthly' }, { value: 'QUARTER', label: 'Quarterly' }]} /></Field>
        <Field label="Period"><Select value={f.period} disabled={!!edit} onChange={(e) => set('period', e.target.value)} options={periodOpts} /></Field>
        <Field label="Target amount (₹, taxable)" required className="md:col-span-2"><NumberInput min={0} value={f.amount} onChange={(v) => set('amount', v)} placeholder="e.g. 250000" /></Field>
      </FormGrid>
      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-600 mb-2">Incentive slabs</div>
        <div className="space-y-2">
          {f.slabs.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 w-24">Achieve ≥</span>
              <NumberInput className="w-24" value={s.achievePct} onChange={(v) => set('slabs', f.slabs.map((x, j) => (j === i ? { ...x, achievePct: v } : x)))} />
              <span className="text-slate-500">% → pay</span>
              <NumberInput className="w-24" step="0.5" value={s.incentivePct} onChange={(v) => set('slabs', f.slabs.map((x, j) => (j === i ? { ...x, incentivePct: v } : x)))} />
              <span className="text-slate-500">%</span>
              <IconButton icon={Trash2} tone="danger" title="Remove slab" onClick={() => set('slabs', f.slabs.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => set('slabs', [...f.slabs, { achievePct: '', incentivePct: '' }])}>Add slab</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function Targets() {
  const state = useStore()
  const scope = useScope()
  const upsertTarget = useStore((s) => s.upsertTarget)
  const removeTarget = useStore((s) => s.removeTarget)
  const recordIncentivePayout = useStore((s) => s.recordIncentivePayout)
  const cur = lastMonths(1)[0]
  const [tab, setTab] = useState('DEALER')
  const [period, setPeriod] = useState({ DEALER: cur, SALESPERSON: quarterStartOf(cur) })
  const [modal, setModal] = useState(null)
  const targets = state.targets || []
  const user = scope.user

  const periodsFor = (ownerType) => [...new Set(targets.filter((t) => t.ownerType === ownerType).map((t) => t.period))].sort().reverse()
  const rows = useMemo(() => targets
    .filter((t) => t.ownerType === tab && t.period === period[tab])
    .filter((t) => (tab === 'DEALER' ? scope.inScope(t.ownerId) : !scope.mine || !scope.isExec || t.ownerId === user?.id))
    .map((t) => targetRow(state, t)), [targets, tab, period, state, scope.mine]) // eslint-disable-line

  const totT = sum(rows, (r) => r.amount)
  const totA = sum(rows, (r) => r.achieved)
  const totI = sum(rows, (r) => r.incentive)
  const hit = rows.filter((r) => r.pct >= 100).length
  const ownerName = (r) => (r.ownerType === 'DEALER' ? state.partners.find((p) => p.id === r.ownerId)?.name : state.users.find((u) => u.id === r.ownerId)?.name) || r.ownerId

  const copyFromPrevious = async () => {
    const prevPeriod = tab === 'DEALER' ? shiftMonth(period[tab], -1) : shiftMonth(period[tab], -3)
    const prev = targets.filter((t) => t.ownerType === tab && t.period === prevPeriod)
    if (!prev.length) return toast.error('No targets in the previous period to copy')
    const ok = await confirm({ title: 'Roll forward targets', message: `Copy ${prev.length} targets from ${periodLabel(tab === 'DEALER' ? 'MONTH' : 'QUARTER', prevPeriod)} into ${periodLabel(tab === 'DEALER' ? 'MONTH' : 'QUARTER', period[tab])} with a 5% growth uplift? Existing targets for the same owner are overwritten.`, confirmText: 'Copy with +5%' })
    if (!ok) return
    prev.forEach((t) => upsertTarget({ ownerType: t.ownerType, ownerId: t.ownerId, periodType: t.periodType, period: period[tab], amount: Math.round((t.amount * 1.05) / 1000) * 1000, slabs: t.slabs }))
    toast.success(`${prev.length} targets rolled forward`)
  }
  const approvePayout = async (r) => {
    const ok = await confirm({ title: 'Approve incentive payout', message: `${ownerName(r)} achieved ${fmtPct(r.pct)} of target – slab ${r.slab.incentivePct}% → payout ${fmtINR(r.incentive)}.\n\nThis is recorded for Accounts (credit note for dealers / payroll for salespeople).`, confirmText: 'Approve payout' })
    if (!ok) return
    recordIncentivePayout(r.id, { amount: r.incentive, achievedPct: r.pct })
    toast.success('Incentive payout approved', `${ownerName(r)} · ${fmtINR(r.incentive)}`)
  }
  const exportAll = () => exportCSV(`targets-${tab.toLowerCase()}-${period[tab]}.csv`, rows, [
    { header: 'Owner type', value: (r) => r.ownerType }, { header: 'Owner', value: ownerName }, { header: 'Period', value: (r) => periodLabel(r.periodType, r.period) },
    { header: 'Target', value: (r) => r.amount }, { header: 'Achieved', value: (r) => r.achieved }, { header: 'Achievement %', value: (r) => r.pct },
    { header: 'Slab incentive %', value: (r) => r.slab?.incentivePct || 0 }, { header: 'Incentive payout', value: (r) => r.incentive }, { header: 'Payout approved', value: (r) => (r.payout ? 'Yes' : 'No') },
  ])

  const cols = [
    { key: 'owner', header: tab === 'DEALER' ? 'Dealer' : 'Salesperson', value: ownerName, render: (r) => (r.ownerType === 'DEALER' ? <PartnerCell id={r.ownerId} /> : <div><div className="font-medium text-slate-800">{ownerName(r)}</div><div className="text-[11px] text-slate-500">{state.users.find((u) => u.id === r.ownerId)?.title}</div></div>) },
    { key: 'amount', header: 'Target', align: 'right', value: (r) => r.amount, render: (r) => fmtINR(r.amount) },
    { key: 'achieved', header: 'Achieved', align: 'right', value: (r) => r.achieved, render: (r) => fmtINR(r.achieved) },
    { key: 'pct', header: 'Achievement', value: (r) => r.pct, render: (r) => <div className="w-36"><Progress value={Math.min(r.pct, 100)} tone={r.pct >= 100 ? 'green' : r.pct >= 90 ? 'amber' : 'red'} /><div className="text-[11px] text-slate-500 mt-0.5">{fmtPct(r.pct)}</div></div> },
    { key: 'slab', header: 'Slab', value: (r) => r.slab?.incentivePct || 0, render: (r) => (r.slab ? <Badge tone="green">{r.slab.incentivePct}% slab</Badge> : <Badge>Below {r.slabs?.[0]?.achievePct || 90}%</Badge>) },
    { key: 'incentive', header: 'Incentive', align: 'right', value: (r) => r.incentive, render: (r) => <span className="font-semibold">{fmtINR(r.incentive)}</span> },
    { key: 'gap', header: 'To next slab', align: 'right', value: (r) => r.gapToNext, render: (r) => (r.next ? <span className="text-xs text-slate-600">{fmtINR(r.gapToNext)} → {r.next.incentivePct}%</span> : <span className="text-xs text-emerald-600">Top slab</span>) },
    { key: 'actions', header: '', sortable: false, export: false, render: (r) => (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {r.payout ? <Badge tone="teal">Paid {fmtCompact(r.payout.amount)}</Badge> : scope.canManage && r.incentive > 0 && <Button size="sm" variant="soft" icon={BadgeCheck} onClick={() => approvePayout(r)}>Approve</Button>}
        {scope.canManage && <IconButton icon={Pencil} title="Edit" onClick={() => setModal({ edit: r })} />}
        {scope.canManage && <IconButton icon={Trash2} tone="danger" title="Remove" onClick={async () => { if (await confirm({ title: 'Remove target?', message: ownerName(r), tone: 'danger', confirmText: 'Remove' })) { removeTarget(r.id); toast.success('Target removed') } }} />}
      </div>
    ) },
  ]
  const chart = [...rows].sort((a, b) => b.amount - a.amount).slice(0, 10).map((r) => ({ label: ownerName(r).split(' ').slice(0, 2).join(' '), target: r.amount, achieved: r.achieved }))
  const periodOpts = [...new Set([...periodsFor(tab), period[tab]])].sort().reverse().map((p) => ({ value: p, label: periodLabel(tab === 'DEALER' ? 'MONTH' : 'QUARTER', p) }))

  return (
    <div>
      <PageHeader title="Targets & Incentives" subtitle="Monthly dealer targets and quarterly salesperson targets with slab incentives, measured on invoiced value."
        actions={<>
          <ScopeToggle scope={scope} />
          <Button variant="secondary" icon={Download} onClick={exportAll}>Export</Button>
          {scope.canManage && <Button variant="secondary" icon={Copy} onClick={copyFromPrevious}>Roll forward</Button>}
          {scope.canManage && <Button icon={Plus} onClick={() => setModal({ defaults: { ownerType: tab, period: period[tab] } })}>Set target</Button>}
        </>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'DEALER', label: 'Dealer targets (monthly)' }, { key: 'SALESPERSON', label: 'Salesperson targets (quarterly)' }]} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm text-slate-500">Period</span>
        <div className="w-64"><Select value={period[tab]} onChange={(e) => setPeriod((p) => ({ ...p, [tab]: e.target.value }))} options={periodOpts} /></div>
      </div>
      <Grid cols={4} className="mb-4">
        <Stat label="Total target" value={fmtCompact(totT)} icon={Target} tone="ink" sub={`${rows.length} ${tab === 'DEALER' ? 'dealers' : 'salespeople'}`} />
        <Stat label="Achieved" value={fmtCompact(totA)} icon={TrendingUp} tone="brand" sub={totT ? `${fmtPct((totA / totT) * 100)} of target` : '—'} />
        <Stat label="Hit 100%+" value={`${hit} / ${rows.length}`} icon={Trophy} tone="green" />
        <Stat label="Incentive accrued" value={fmtINR(round2(totI))} icon={IndianRupee} tone="violet" sub={`${rows.filter((r) => r.payout).length} payouts approved`} />
      </Grid>
      {!scope.canManage && <Alert tone="info" className="mb-4">Targets are set by the Sales Manager. You can track achievement and the gap to your next incentive slab here.</Alert>}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <DataTable columns={cols} rows={rows} initialSort={{ key: 'pct', dir: 'desc' }}
            empty={<div className="p-8 text-center text-sm text-slate-500">No targets set for this period.{scope.canManage && <> <button className="text-brand-600 hover:underline" onClick={copyFromPrevious}>Roll forward from previous period</button></>}</div>} />
        </div>
        <Card title="Target vs achieved" subtitle="Top 10 by target">
          {chart.length ? <BarsChart data={chart} layout="vertical" height={Math.max(220, chart.length * 34)} series={[{ key: 'target', label: 'Target', color: '#cbd5e1' }, { key: 'achieved', label: 'Achieved' }]} /> : <div className="text-sm text-slate-400 py-10 text-center">No data</div>}
          <div className="mt-3 text-xs text-slate-500 space-y-1">
            <div className="font-semibold text-slate-600">Standard incentive slabs</div>
            {DEFAULT_SLABS.map((s) => <div key={s.achievePct}>≥ {s.achievePct}% achievement → {s.incentivePct}% of achieved value</div>)}
          </div>
        </Card>
      </div>
      {modal && <TargetModal open onClose={() => setModal(null)} edit={modal.edit} defaults={modal.defaults} />}
    </div>
  )
}
