import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Save, Copy, Users, Layers, ShieldCheck } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Button, Field, Input, NumberInput, Select, Switch, Badge, KV, Alert, IconButton, Segmented, SectionTitle, toast, cx } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR } from '../../../lib/format'
import { ctcBreakup, PF_WAGE_CEILING, ESIC_WAGE_LIMIT, STD_DEDUCTION_NEW, annualTaxNewRegime } from '../../../store/slices/hr'
import { EmpCell, useCanSeeSalary } from './_parts'

const CALC = [
  { value: 'PCT_GROSS', label: '% of gross' },
  { value: 'PCT_BASIC', label: '% of basic' },
  { value: 'FIXED', label: 'Fixed ₹ / month' },
  { value: 'BALANCE', label: 'Balancing figure' },
]

export default function SalaryStructures() {
  const canSal = useCanSeeSalary()
  const structures = useStore((s) => s.salaryStructures || [])
  const employees = useStore((s) => s.employees || [])
  const { saveSalaryStructure, assignStructure } = useStore()
  const [selId, setSelId] = useState(structures[0]?.id)
  const sel = structures.find((s) => s.id === selId)
  const [draft, setDraft] = useState(sel)
  const [view, setView] = useState('design')
  const [ctc, setCtc] = useState(600000)
  const [gender, setGender] = useState('M')
  useEffect(() => { setDraft(sel ? JSON.parse(JSON.stringify(sel)) : null) }, [selId]) // eslint-disable-line
  const active = employees.filter((e) => e.status !== 'EXITED')
  const preview = useMemo(() => (draft ? ctcBreakup(draft, ctc || 0, gender) : null), [draft, ctc, gender])

  if (!canSal) return <div><PageHeader title="Salary Structures" /><Alert tone="warn" title="Restricted">Salary structures are visible to HR, Finance Head and Director only.</Alert></div>

  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(sel)
  const setComp = (i, patch) => setDraft((d) => ({ ...d, components: d.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))
  const save = () => {
    if (!draft.name.trim()) return toast.error('Structure name is required')
    if (!draft.components.some((c) => c.code === 'BASIC')) return toast.error('A BASIC component is required (PF is computed on it)')
    if (draft.components.filter((c) => c.calc === 'BALANCE').length !== 1) return toast.error('Exactly one balancing component is required')
    const codes = draft.components.map((c) => c.code)
    if (new Set(codes).size !== codes.length) return toast.error('Component codes must be unique')
    saveSalaryStructure(draft)
    toast.success('Salary structure saved', `${draft.name} · applies from the next payroll run`)
    if (!draft.id) setSelId(useStore.getState().salaryStructures[0].id)
  }
  const clone = () => {
    const copy = { ...JSON.parse(JSON.stringify(draft)), id: undefined, name: `${draft.name} (copy)`, code: `${draft.code}2` }
    saveSalaryStructure(copy)
    setSelId(useStore.getState().salaryStructures[0].id)
    toast.success('Structure duplicated')
  }
  const newOne = () => {
    saveSalaryStructure({ code: 'NEW', name: 'New structure', description: '', components: [{ code: 'BASIC', name: 'Basic', calc: 'PCT_GROSS', value: 50 }, { code: 'HRA', name: 'House Rent Allowance', calc: 'PCT_BASIC', value: 40 }, { code: 'SPL', name: 'Special Allowance', calc: 'BALANCE', value: 0 }], pf: true, esic: true, pt: true, tds: true, otEligible: false, incentiveEligible: false })
    setSelId(useStore.getState().salaryStructures[0].id)
    toast.success('Structure created', 'Configure components and save')
  }

  return (
    <div>
      <PageHeader title="Salary Structures" subtitle="Components, formula rules and statutory deductions · assign by employee or designation"
        actions={<><Segmented value={view} onChange={setView} options={[{ key: 'design', label: 'Design & preview' }, { key: 'assign', label: 'Assign to employees' }]} /><Button icon={Plus} onClick={newOne}>New structure</Button></>} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {structures.map((s) => (
          <button key={s.id} type="button" onClick={() => setSelId(s.id)} className={cx('text-left bg-white rounded-xl border p-4 shadow-card transition-colors', s.id === selId ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-200 hover:border-brand-200')}>
            <div className="flex items-center justify-between"><div className="font-semibold text-ink-900 flex items-center gap-2"><Layers className="w-4 h-4 text-brand-500" />{s.name}</div><Badge tone="ink">{s.code}</Badge></div>
            <div className="text-xs text-slate-500 mt-1 line-clamp-2 min-h-[2rem]">{s.description}</div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <Badge tone="gray"><Users className="w-3 h-3" />{active.filter((e) => e.structureId === s.id).length}</Badge>
              {s.pf && <Badge tone="blue">PF</Badge>}{s.esic && <Badge tone="blue">ESIC</Badge>}{s.pt && <Badge tone="blue">PT</Badge>}{s.tds && <Badge tone="blue">TDS</Badge>}
              {s.otEligible && <Badge tone="teal">OT</Badge>}{s.incentiveEligible && <Badge tone="brand">Incentive</Badge>}
            </div>
          </button>
        ))}
      </div>

      {view === 'design' && draft && (
        <div className="grid xl:grid-cols-5 gap-4">
          <Card className="xl:col-span-3" title={`Components – ${sel?.name}`} subtitle="Order of evaluation: % of gross → % of basic → fixed → balancing figure"
            actions={<><Button size="sm" variant="secondary" icon={Copy} onClick={clone}>Duplicate</Button><Button size="sm" icon={Save} disabled={!dirty} onClick={save}>Save</Button></>}>
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="Code"><Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Description"><Input value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2 w-24">Code</th><th className="text-left px-3 py-2">Component</th><th className="text-left px-3 py-2 w-44">Formula</th><th className="text-right px-3 py-2 w-28">Value</th><th className="text-right px-3 py-2 w-28">At preview CTC</th><th className="w-10" /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {draft.components.map((c, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5"><Input value={c.code} onChange={(e) => setComp(i, { code: e.target.value.toUpperCase() })} className="py-1.5 font-mono text-xs" /></td>
                      <td className="px-2 py-1.5 min-w-[160px]"><Input value={c.name} onChange={(e) => setComp(i, { name: e.target.value })} className="py-1.5" /></td>
                      <td className="px-2 py-1.5 min-w-[150px]"><Select value={c.calc} onChange={(e) => setComp(i, { calc: e.target.value })} options={CALC} className="py-1.5" /></td>
                      <td className="px-2 py-1.5">{c.calc === 'BALANCE' ? <span className="text-xs text-slate-400 block text-right">auto</span> : <NumberInput value={c.value} onChange={(v) => setComp(i, { value: v })} className="py-1.5 text-right" />}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmtINR(preview?.earnings.find((e) => e.code === c.code)?.amount)}</td>
                      <td className="px-1"><IconButton icon={Trash2} tone="danger" title="Remove" disabled={c.code === 'BASIC'} onClick={() => setDraft({ ...draft, components: draft.components.filter((_, j) => j !== i) })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 bg-slate-50 border-t border-slate-200"><Button size="sm" variant="ghost" icon={Plus} onClick={() => setDraft({ ...draft, components: [...draft.components.filter((c) => c.calc !== 'BALANCE'), { code: `ALW${draft.components.length}`, name: 'New allowance', calc: 'FIXED', value: 1000 }, ...draft.components.filter((c) => c.calc === 'BALANCE')] })}>Add component</Button></div>
            </div>
            <SectionTitle className="mt-5">Statutory deductions & variable pay</SectionTitle>
            <div className="grid sm:grid-cols-2 gap-3">
              <Switch checked={draft.pf} onChange={(v) => setDraft({ ...draft, pf: v })} label={`PF – 12% of basic (wage ceiling ${fmtINR(PF_WAGE_CEILING)})`} />
              <Switch checked={draft.esic} onChange={(v) => setDraft({ ...draft, esic: v })} label={`ESIC – 0.75% / 3.25% if gross ≤ ${fmtINR(ESIC_WAGE_LIMIT)}`} />
              <Switch checked={draft.pt} onChange={(v) => setDraft({ ...draft, pt: v })} label="Professional Tax – Maharashtra slabs" />
              <Switch checked={draft.tds} onChange={(v) => setDraft({ ...draft, tds: v })} label="TDS – monthly estimate, new regime" />
              <Switch checked={draft.otEligible} onChange={(v) => setDraft({ ...draft, otEligible: v })} label="Overtime – 2x hourly rate (gross ÷ 26 ÷ 8)" />
              <Switch checked={draft.incentiveEligible} onChange={(v) => setDraft({ ...draft, incentiveEligible: v })} label="Sales incentive – 0.5% of booked sales (cap ₹25,000)" />
            </div>
          </Card>

          <Card className="xl:col-span-2" title="Salary breakup preview" subtitle="Monthly gross is derived so that gross + employer PF + ESIC = CTC">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="Annual CTC (₹)"><NumberInput value={ctc} onChange={setCtc} step={12000} /></Field>
              <Field label="Gender (for PT)"><Select value={gender} onChange={(e) => setGender(e.target.value)} options={[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }]} /></Field>
            </div>
            {preview && (
              <>
                <SectionTitle>Earnings (monthly)</SectionTitle>
                {preview.earnings.map((e) => <KV key={e.code} label={e.name} value={fmtINR(e.amount)} />)}
                <KV className="border-t border-slate-100 font-semibold" label="Gross salary" value={fmtINR(preview.gross)} />
                <SectionTitle className="mt-3">Employee deductions</SectionTitle>
                {preview.deductions.map((d) => <KV key={d.code} label={d.name} value={d.amount ? `− ${fmtINR(d.amount)}` : <span className="text-slate-400">nil</span>} />)}
                <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-50 my-3"><span className="text-sm font-medium text-emerald-800">Net take-home / month</span><span className="text-lg font-bold text-emerald-800 tabular-nums">{fmtINR(preview.net)}</span></div>
                <SectionTitle>Employer contributions</SectionTitle>
                <KV label="Employer PF (EPS 8.33% + EPF 3.67%)" value={fmtINR(preview.employer.pf)} />
                <KV label="Employer ESIC 3.25%" value={fmtINR(preview.employer.esic)} />
                <KV className="border-t border-slate-100 font-semibold" label="Monthly CTC" value={fmtINR(preview.ctcMonthly)} />
                <KV label="Annual CTC" value={fmtINR(preview.ctcMonthly * 12)} />
                <KV label="Annual taxable (after ₹75,000 std. deduction)" value={fmtINR(Math.max(0, preview.gross * 12 - STD_DEDUCTION_NEW))} />
              </>
            )}
          </Card>
          <Card className="xl:col-span-5" title="Statutory rules applied" actions={<ShieldCheck className="w-4 h-4 text-emerald-600" />}>
            <div className="grid md:grid-cols-4 gap-4 text-sm text-slate-600">
              <div><div className="font-semibold text-slate-800 mb-1">Provident Fund</div>Employee 12% of earned basic, capped at {fmtINR(PF_WAGE_CEILING)} wage. Employer 12% (8.33% EPS + 3.67% EPF).</div>
              <div><div className="font-semibold text-slate-800 mb-1">ESIC</div>Applicable when fixed gross ≤ {fmtINR(ESIC_WAGE_LIMIT)}: employee 0.75%, employer 3.25% of earned gross.</div>
              <div><div className="font-semibold text-slate-800 mb-1">Professional Tax (MH)</div>Men: nil ≤ ₹7,500 · ₹175 ≤ ₹10,000 · ₹200 above (₹300 in Feb). Women: nil ≤ ₹25,000, else ₹200 (₹300 Feb).</div>
              <div><div className="font-semibold text-slate-800 mb-1">TDS – new regime</div>Slabs 0/5/10/15/20/25/30% at ₹4L steps; rebate to ₹12L taxable; 4% cess. E.g. ₹15L taxable → {fmtINR(annualTaxNewRegime(1500000))} p.a.</div>
            </div>
          </Card>
        </div>
      )}

      {view === 'assign' && (
        <DataTable rows={active} exportName="salary-structure-assignment" pageSize={15} columns={[
          { key: 'name', header: 'Employee', render: (e) => <EmpCell emp={e} />, value: (e) => e.name },
          { key: 'dept', header: 'Department' },
          { key: 'ctc', header: 'CTC (p.a.)', align: 'right', render: (e) => fmtINR(e.ctc) },
          { key: 'gross', header: 'Monthly gross', align: 'right', value: (e) => ctcBreakup(structures.find((s) => s.id === e.structureId), e.ctc, e.gender).gross, render: (e) => fmtINR(ctcBreakup(structures.find((s) => s.id === e.structureId), e.ctc, e.gender).gross) },
          { key: 'structureId', header: 'Structure', sortable: false, render: (e) => (
            <div className="min-w-[150px]" onClick={(ev) => ev.stopPropagation()}><Select value={e.structureId || ''} placeholder="—" options={structures.map((s) => ({ value: s.id, label: s.name }))} onChange={(ev) => { assignStructure([e.id], ev.target.value); toast.success('Structure assigned', `${e.name} → ${structures.find((s) => s.id === ev.target.value)?.name}`) }} /></div>
          ) },
        ]} filters={[{ key: 'structureId', label: 'structures', options: structures.map((s) => ({ value: s.id, label: s.name })) }, { key: 'designation', label: 'designations', options: [...new Set(active.map((e) => e.designation))].sort() }]}
          bulkActions={(sel, clear) => (
            <Select value="" placeholder="Assign structure to selected…" className="w-60" options={structures.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(ev) => { if (!ev.target.value) return; assignStructure(sel.map((x) => x.id), ev.target.value); toast.success(`Structure assigned to ${sel.length} employees`); clear() }} />
          )} />
      )}
    </div>
  )
}
