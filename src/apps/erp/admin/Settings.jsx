import React, { useEffect, useState } from 'react'
import { Save, Plus, Trash2, Send, RotateCcw, ArrowRight, Building, IndianRupee, Barcode as BarcodeIcon, Hash, GitBranch, Mail, BellRing } from 'lucide-react'
import {
  PageHeader, Card, Tabs, Button, IconButton, FormGrid, Field, Input, NumberInput, Select, Textarea, Badge, Alert, Barcode, SectionTitle, toast, confirm, cx,
} from '../../../components/ui'
import { useStore, useUser, SERIES_FORMAT } from '../../../store'
import { fmtINR } from '../../../lib/format'

const TABS = [
  { key: 'company', label: 'Company', icon: Building },
  { key: 'commercial', label: 'Commercial & Costing', icon: IndianRupee },
  { key: 'barcodes', label: 'Barcode series', icon: BarcodeIcon },
  { key: 'series', label: 'Number series', icon: Hash },
  { key: 'approvals', label: 'Approval matrix', icon: GitBranch },
  { key: 'templates', label: 'Email templates', icon: Mail },
  { key: 'alerts', label: 'Alert rules', icon: BellRing },
]
const SERIES_LABEL = { PO: 'Purchase Order', SO: 'Sales Order', INV: 'Sales Invoice', QT: 'Quotation', SH: 'Import Shipment', RFQ: 'Freight RFQ', EXP: 'Export Order', GRN: 'Goods Receipt', TKT: 'Service Ticket', WCL: 'Warranty Claim', RET: 'Return', VB: 'Vendor Bill', EXPN: 'Expense', JV: 'Journal Voucher', CN: 'Credit Note', DN: 'Debit Note', POS: 'POS Bill', REP: 'Replenishment', CP: 'Container Plan', PAY: 'Payment', RCPT: 'Receipt', CLM: 'Employee Claim', PR: 'Payroll Run' }
const PLACEHOLDERS = ['{{dealer}}', '{{so}}', '{{invoice}}', '{{amount}}', '{{transporter}}', '{{lr}}', '{{bill}}', '{{due}}', '{{vendor}}', '{{po}}']
const SAMPLE = { dealer: 'Shree Ganesh Hardware', so: 'SO/26-27/0318', invoice: 'BT/26-27/0291', amount: '₹1,84,500', transporter: 'Safex Transport', lr: 'SFX-778812', bill: 'VB/26-27/0042', due: '05 Nov 2026', vendor: 'Ningbo Hailong Pump Co., Ltd.', po: 'PO/26-27/0113' }
const fill = (t = '') => t.replace(/\{\{(\w+)\}\}/g, (_, k) => SAMPLE[k] ?? `{{${k}}}`)

/** Local draft of a settings slice with dirty-tracking */
function useDraft(key) {
  const value = useStore((s) => s.settings[key])
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const dirty = JSON.stringify(draft) !== JSON.stringify(value)
  return [draft, setDraft, dirty, () => setDraft(value)]
}

function SaveBar({ dirty, onSave, onReset, label = 'Save changes' }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
      {dirty && <span className="text-xs text-amber-600 mr-auto">Unsaved changes</span>}
      <Button variant="secondary" icon={RotateCcw} disabled={!dirty} onClick={onReset}>Discard</Button>
      <Button icon={Save} disabled={!dirty} onClick={onSave}>{label}</Button>
    </div>
  )
}

function Company() {
  const update = useStore((s) => s.updateSettings)
  const audit = useStore((s) => s.audit)
  const [d, setD, dirty, reset] = useDraft('company')
  const up = (k, v) => setD((s) => ({ ...s, [k]: v }))
  const save = () => {
    if (!d.legalName?.trim() || !/^[0-9A-Z]{15}$/.test(d.gstin || '')) return toast.error('Check company details', 'Legal name and a valid 15-character GSTIN are required')
    update({ company: d }); audit('Updated company profile', 'Settings', d.legalName); toast.success('Company profile saved', 'Used on all invoices, POs and documents')
  }
  return (
    <Card title="Company profile" subtitle="Printed on invoices, purchase orders, payslips and all outgoing documents">
      <FormGrid>
        <Field label="Trade name" required><Input value={d.name} onChange={(e) => up('name', e.target.value)} /></Field>
        <Field label="Legal name" required><Input value={d.legalName} onChange={(e) => up('legalName', e.target.value)} /></Field>
        <Field label="GSTIN" required><Input value={d.gstin} onChange={(e) => up('gstin', e.target.value.toUpperCase())} className="font-mono" maxLength={15} /></Field>
        <Field label="PAN"><Input value={d.pan} onChange={(e) => up('pan', e.target.value.toUpperCase())} className="font-mono" maxLength={10} /></Field>
        <Field label="Registered address" className="md:col-span-2"><Textarea rows={2} value={d.address} onChange={(e) => up('address', e.target.value)} /></Field>
        <Field label="Accounts email"><Input value={d.email} onChange={(e) => up('email', e.target.value)} /></Field>
        <Field label="Phone"><Input value={d.phone} onChange={(e) => up('phone', e.target.value)} /></Field>
        <Field label="Website"><Input value={d.website} onChange={(e) => up('website', e.target.value)} /></Field>
        <Field label="Financial year"><Select value={d.fy} onChange={(e) => up('fy', e.target.value)} options={['2025-26', '2026-27', '2027-28']} /></Field>
      </FormGrid>
      <div className="mt-5 border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50/50">
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">Document header preview</div>
        <div className="text-2xl font-black italic tracking-tight"><span className="text-ink-900">B</span><span className="text-brand-500">TALI</span></div>
        <div className="text-xs text-slate-500 mt-1 leading-relaxed">{d.legalName}<br />{d.address}<br />GSTIN {d.gstin} · {d.email} · {d.phone}</div>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </Card>
  )
}

function Commercial() {
  const settings = useStore((s) => s.settings)
  const update = useStore((s) => s.updateSettings)
  const audit = useStore((s) => s.audit)
  const keys = ['fx', 'mrpMultiplier', 'baseDiscountPct', 'targetMarginPct', 'exportMarginPct', 'stockValuationMarkupPct', 'reorderCycleDay', 'landedCostMethod']
  const pick = () => Object.fromEntries(keys.map((k) => [k, settings[k]]))
  const [d, setD] = useState(pick)
  useEffect(() => setD(pick()), [settings]) // eslint-disable-line
  const dirty = JSON.stringify(d) !== JSON.stringify(pick())
  const up = (k, v) => setD((s) => ({ ...s, [k]: v }))
  const save = () => {
    if (!(d.fx.USD > 0) || !(d.fx.CNY > 0)) return toast.error('Exchange rates must be greater than zero')
    if (!(d.reorderCycleDay >= 1 && d.reorderCycleDay <= 28)) return toast.error('Reorder cycle day must be between 1 and 28')
    update(d); audit('Updated commercial settings', 'Settings', `USD ${d.fx.USD} · MRP ×${d.mrpMultiplier}`)
    toast.success('Commercial settings saved', 'Pricing, landed cost and valuation use the new values')
  }
  // worked example
  const rateUSD = 26
  const rateINR = rateUSD * (d.fx.USD || 0)
  const mrp = Math.round((rateINR * (d.mrpMultiplier || 0)) / 10) * 10
  const dealer = mrp * (1 - (d.baseDiscountPct || 0) / 100)
  const landed = rateINR * 1.28
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card title="Exchange rates & pricing rules" className="xl:col-span-2">
        <SectionTitle>Foreign exchange (₹ per unit)</SectionTitle>
        <FormGrid cols={3}>
          <Field label="USD → INR"><NumberInput step="0.01" value={d.fx.USD} onChange={(v) => up('fx', { ...d.fx, USD: v })} /></Field>
          <Field label="CNY → INR"><NumberInput step="0.01" value={d.fx.CNY} onChange={(v) => up('fx', { ...d.fx, CNY: v })} /></Field>
          <Field label="INR"><Input value="1.00" disabled /></Field>
        </FormGrid>
        <SectionTitle className="mt-5">Pricing & margin</SectionTitle>
        <FormGrid cols={3}>
          <Field label="MRP multiplier (× vendor cost)" hint="MRP = vendor rate in ₹ × multiplier"><NumberInput step="0.1" value={d.mrpMultiplier} onChange={(v) => up('mrpMultiplier', v)} /></Field>
          <Field label="Base dealer discount %" hint="Off MRP before slabs/schemes"><NumberInput value={d.baseDiscountPct} onChange={(v) => up('baseDiscountPct', v)} /></Field>
          <Field label="Target margin %" hint="Flagged in profitability reports"><NumberInput value={d.targetMarginPct} onChange={(v) => up('targetMarginPct', v)} /></Field>
          <Field label="Export margin %" hint="Cost + margin for export price list"><NumberInput value={d.exportMarginPct} onChange={(v) => up('exportMarginPct', v)} /></Field>
          <Field label="Stock valuation markup %" hint="Used for insurance / bank stock statements"><NumberInput value={d.stockValuationMarkupPct} onChange={(v) => up('stockValuationMarkupPct', v)} /></Field>
        </FormGrid>
        <SectionTitle className="mt-5">Procurement & costing</SectionTitle>
        <FormGrid cols={3}>
          <Field label="Reorder cycle day of month" hint="Consolidated reorder review"><NumberInput min={1} max={28} value={d.reorderCycleDay} onChange={(v) => up('reorderCycleDay', v)} /></Field>
          <Field label="Landed-cost allocation method" className="md:col-span-2">
            <Select value={d.landedCostMethod} onChange={(e) => up('landedCostMethod', e.target.value)} options={[{ value: 'VALUE', label: 'By invoice value (recommended)' }, { value: 'WEIGHT', label: 'By gross weight' }, { value: 'VOLUME', label: 'By volume (CBM)' }]} />
          </Field>
        </FormGrid>
        <SaveBar dirty={dirty} onSave={save} onReset={() => setD(pick())} />
      </Card>
      <Card title="Live pricing example" subtitle="Monoblock Pump 1 HP @ USD 26">
        <div className="space-y-2 text-sm">
          {[['Vendor rate in ₹', fmtINR(rateINR)], ['Indicative landed cost (+28%)', fmtINR(landed)], ['MRP (× ' + d.mrpMultiplier + ', rounded)', fmtINR(mrp)], [`Dealer price (−${d.baseDiscountPct}%)`, fmtINR(dealer)]].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">{k}</span><span className="font-semibold tabular-nums">{v}</span></div>
          ))}
          <div className="flex justify-between pt-1"><span className="text-slate-500">Dealer-level margin</span>
            <Badge tone={dealer && (dealer - landed) / dealer * 100 >= d.targetMarginPct ? 'green' : 'red'}>{dealer ? (((dealer - landed) / dealer) * 100).toFixed(1) : 0}%</Badge>
          </div>
          <p className="text-xs text-slate-400 pt-2">Target margin {d.targetMarginPct}%. Changing FX or the multiplier updates new price lists; published price lists keep their version until re-published.</p>
        </div>
      </Card>
    </div>
  )
}

function BarcodeSeries() {
  const update = useStore((s) => s.updateSettings)
  const audit = useStore((s) => s.audit)
  const units = useStore((s) => s.units)
  const [d, setD, dirty, reset] = useDraft('barcodeSeries')
  const save = () => {
    const prefixes = Object.values(d).map((x) => x.prefix)
    if (new Set(prefixes).size !== prefixes.length) return toast.error('Prefixes must be unique per category')
    for (const [cat, v] of Object.entries(d)) {
      const used = units.filter((u) => u.code.startsWith(v.prefix)).map((u) => Number(u.code.slice(v.prefix.length)) || 0)
      const max = used.length ? Math.max(...used) : 0
      if (v.next <= max) return toast.error(`${cat}: next number must be above ${max}`, 'Barcodes up to that number are already issued')
    }
    update({ barcodeSeries: d }); audit('Updated barcode series', 'Settings'); toast.success('Barcode series saved')
  }
  return (
    <Card title="Barcode series per category" subtitle="One barcode per finished-goods unit and one per spare-parts carton. Codes are generated at PO stage and printed by the vendor.">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50">
            <tr><th className="text-left px-3 py-2">Category</th><th className="text-left px-3 py-2 w-32">Prefix</th><th className="text-left px-3 py-2 w-36">Next number</th><th className="text-right px-3 py-2">Issued</th><th className="text-left px-3 py-2">Next code</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.entries(d).map(([cat, v]) => (
              <tr key={cat}>
                <td className="px-3 py-2 font-medium text-slate-800">{cat}</td>
                <td className="px-3 py-2"><Input value={v.prefix} className="font-mono uppercase" onChange={(e) => setD((s) => ({ ...s, [cat]: { ...v, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') } }))} /></td>
                <td className="px-3 py-2"><NumberInput value={v.next} onChange={(n) => setD((s) => ({ ...s, [cat]: { ...v, next: n } }))} /></td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{units.filter((u) => u.code.startsWith(v.prefix)).length.toLocaleString('en-IN')}</td>
                <td className="px-3 py-1"><Barcode value={`${v.prefix}${String(v.next || 0).padStart(6, '0')}`} height={26} width={1.1} fontSize={10} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </Card>
  )
}

function NumberSeries() {
  const update = useStore((s) => s.updateSettings)
  const audit = useStore((s) => s.audit)
  const [d, setD, dirty, reset] = useDraft('series')
  const save = async () => {
    const ok = await confirm({ title: 'Update document number series?', message: 'Lowering a counter can create duplicate document numbers. Only change counters at year start or after migration.', confirmText: 'Save series' })
    if (!ok) return
    update({ series: d }); audit('Updated number series', 'Settings'); toast.success('Number series saved')
  }
  return (
    <Card title="Document number series" subtitle="Last number used per document type. The next document takes the following number.">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Object.keys(d).map((k) => {
          const fmt = SERIES_FORMAT[k] || ((n) => `${k}-${n}`)
          return (
            <div key={k} className="border border-slate-200 rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800">{SERIES_LABEL[k] || k}</div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate">Next <ArrowRight className="w-3 h-3" /><span className="font-mono text-brand-700">{fmt((Number(d[k]) || 0) + 1)}</span></div>
              </div>
              <NumberInput min={0} value={d[k]} onChange={(v) => setD((s) => ({ ...s, [k]: v === '' ? 0 : v }))} className="w-24 text-right" />
            </div>
          )
        })}
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </Card>
  )
}

const STEP_OPTIONS = ['Purchase Manager', 'Sales Manager', 'Service Head', 'HR Manager', 'Accounts Executive', 'Director', 'Director (Boss)', 'Finance Head', 'Finance Head (Madam)']
function ApprovalMatrix() {
  const update = useStore((s) => s.updateSettings)
  const audit = useStore((s) => s.audit)
  const [d, setD, dirty, reset] = useDraft('approvalMatrix')
  const row = (i, patch) => setD((s) => s.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const save = () => {
    if (d.some((r) => !r.doc?.trim() || !r.steps.length)) return toast.error('Each rule needs a document name and at least one approver')
    update({ approvalMatrix: d }); audit('Updated approval matrix', 'Settings', `${d.length} rules`); toast.success('Approval matrix saved', 'New submissions follow the updated chain')
  }
  return (
    <Card title="Approval matrix" subtitle="Who approves what, in which order, and above which amount (₹). Documents below the threshold are auto-approved.">
      <div className="space-y-3">
        {d.map((r, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-3">
            <div className="flex flex-col md:flex-row gap-3 md:items-end">
              <Field label="Document" className="md:w-64"><Input value={r.doc} onChange={(e) => row(i, { doc: e.target.value })} /></Field>
              <Field label="Threshold (₹)" className="md:w-40"><NumberInput min={0} value={r.threshold} onChange={(v) => row(i, { threshold: v || 0 })} /></Field>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-600 mb-1">Approval chain</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.steps.map((st, k) => (
                    <React.Fragment key={k}>
                      {k > 0 && <ArrowRight className="w-3.5 h-3.5 text-slate-400" />}
                      <span className="inline-flex items-center gap-1 bg-ink-50 text-ink-700 ring-1 ring-ink-200 rounded-full pl-2.5 pr-1 py-0.5 text-xs font-medium">
                        {k + 1}. {st}
                        <button type="button" title="Remove step" className="p-0.5 rounded-full hover:bg-ink-100" onClick={() => row(i, { steps: r.steps.filter((_, x) => x !== k) })}>×</button>
                      </span>
                    </React.Fragment>
                  ))}
                  <select className="text-xs border border-dashed border-slate-300 rounded-full px-2 py-1 bg-white text-slate-600" value="" onChange={(e) => e.target.value && row(i, { steps: [...r.steps, e.target.value] })}>
                    <option value="">+ Add approver</option>
                    {STEP_OPTIONS.filter((o) => !r.steps.includes(o)).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <IconButton icon={Trash2} tone="danger" title="Delete rule" onClick={() => setD((s) => s.filter((_, j) => j !== i))} />
            </div>
          </div>
        ))}
      </div>
      <Button variant="soft" icon={Plus} className="mt-3" onClick={() => setD((s) => [...s, { doc: 'New document type', steps: ['Director'], threshold: 0 }])}>Add rule</Button>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </Card>
  )
}

function Templates() {
  const update = useStore((s) => s.updateSettings)
  const sendEmail = useStore((s) => s.sendEmail)
  const audit = useStore((s) => s.audit)
  const me = useUser()
  const [d, setD, dirty, reset] = useDraft('emailTemplates')
  const [sel, setSel] = useState(0)
  const t = d[sel] || d[0]
  const upT = (patch) => setD((s) => s.map((x, i) => (i === sel ? { ...x, ...patch } : x)))
  const save = () => { update({ emailTemplates: d }); audit('Updated email templates', 'Settings'); toast.success('Email templates saved') }
  const test = () => {
    sendEmail({ to: me?.email, subject: `[Test] ${fill(t.subject)}`, body: fill(t.body), ref: t.key, kind: 'TEST' })
    toast.success('Test email sent', `To ${me?.email} – see Communication Log`)
  }
  const add = () => { setD((s) => [...s, { key: `CUSTOM_${s.length + 1}`, name: 'New template', subject: '', body: '' }]); setSel(d.length) }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Templates" className="self-start" padded={false} actions={<Button size="sm" variant="soft" icon={Plus} onClick={add}>New</Button>}>
        <ul className="divide-y divide-slate-100">
          {d.map((x, i) => (
            <li key={x.key}>
              <button type="button" onClick={() => setSel(i)} className={cx('w-full text-left px-4 py-3 hover:bg-slate-50', i === sel && 'bg-brand-50/60 border-l-2 border-brand-500')}>
                <div className="text-sm font-medium text-slate-800">{x.name}</div>
                <div className="text-[11px] text-slate-500 truncate">{x.subject || 'No subject'}</div>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {t && (
        <Card title={t.name} subtitle={`Key: ${t.key}`} className="lg:col-span-2" actions={<Button size="sm" variant="secondary" icon={Send} onClick={test}>Send test to me</Button>}>
          <FormGrid cols={1}>
            <Field label="Template name"><Input value={t.name} onChange={(e) => upT({ name: e.target.value })} /></Field>
            <Field label="Subject"><Input value={t.subject} onChange={(e) => upT({ subject: e.target.value })} /></Field>
            <Field label="Body"><Textarea rows={8} value={t.body} onChange={(e) => upT({ body: e.target.value })} className="font-mono text-xs" /></Field>
          </FormGrid>
          <div className="mt-2 flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-slate-500 mr-1">Insert:</span>
            {PLACEHOLDERS.map((p) => <button key={p} type="button" onClick={() => upT({ body: `${t.body}${p}` })} className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 hover:bg-brand-50 hover:text-brand-700">{p}</button>)}
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Preview with sample data</div>
            <div className="text-sm font-semibold text-slate-800">{fill(t.subject)}</div>
            <div className="text-sm text-slate-700 whitespace-pre-line mt-2">{fill(t.body)}</div>
          </div>
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="sm" icon={Trash2} className="mt-4 !text-red-600" onClick={async () => { if (await confirm({ title: `Delete template "${t.name}"?`, tone: 'danger', confirmText: 'Delete' })) { setD((s) => s.filter((_, i) => i !== sel)); setSel(0) } }}>Delete template</Button>
          </div>
          <SaveBar dirty={dirty} onSave={save} onReset={reset} />
        </Card>
      )}
    </div>
  )
}

function AlertRules() {
  const update = useStore((s) => s.updateSettings)
  const audit = useStore((s) => s.audit)
  const [d, setD, dirty, reset] = useDraft('alertRules')
  const up = (k, v) => setD((s) => ({ ...s, [k]: v }))
  const buckets = d.receivableBuckets || [30, 60, 90]
  const save = () => {
    const b = [...buckets].map(Number)
    if (b.some((x) => !(x > 0)) || b.some((x, i) => i && x <= b[i - 1])) return toast.error('Receivable buckets must be increasing positive days')
    update({ alertRules: d }); audit('Updated alert rules', 'Settings'); toast.success('Alert rules saved', 'Live alerts recalculated')
  }
  return (
    <Card title="Alert rules" subtitle="Thresholds used by the live alerts engine (Notifications & Alerts, Home and Executive Dashboard)">
      <FormGrid cols={3}>
        <Field label="Container delay – critical after (days past ETA)"><NumberInput min={0} value={d.containerDelayDays} onChange={(v) => up('containerDelayDays', v)} /></Field>
        <Field label="Pre-ETA alert (days before arrival)"><NumberInput min={0} value={d.preEtaDays} onChange={(v) => up('preEtaDays', v)} /></Field>
        <Field label="Stock cover warning (days)"><NumberInput min={0} value={d.stockCoverDays} onChange={(v) => up('stockCoverDays', v)} /></Field>
        <Field label="Dealer inactive after (days without order)"><NumberInput min={1} value={d.dealerInactiveDays} onChange={(v) => up('dealerInactiveDays', v)} /></Field>
        <Field label="High-value supplier payment (₹)" hint={fmtINR(d.highValuePayment)}><NumberInput min={0} value={d.highValuePayment} onChange={(v) => up('highValuePayment', v)} /></Field>
        <Field label="Receivable ageing buckets (days)">
          <div className="flex gap-2">
            {buckets.map((b, i) => <NumberInput key={i} value={b} onChange={(v) => up('receivableBuckets', buckets.map((x, j) => (j === i ? v : x)))} className="text-center" />)}
          </div>
        </Field>
      </FormGrid>
      <Alert tone="info" className="mt-4">Stock below reorder level is always alerted. CAN / IGM / BOE milestones are flagged when their planned date has passed without completion.</Alert>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </Card>
  )
}

export default function Settings() {
  const [tab, setTab] = useState('company')
  const C = { company: Company, commercial: Commercial, barcodes: BarcodeSeries, series: NumberSeries, approvals: ApprovalMatrix, templates: Templates, alerts: AlertRules }[tab]
  return (
    <div>
      <PageHeader title="System Configuration" subtitle="Company profile, pricing rules, numbering, approvals, templates and alerts" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} />
      <C />
    </div>
  )
}
