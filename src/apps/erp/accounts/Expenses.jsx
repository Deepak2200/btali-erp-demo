import React, { useMemo, useState } from 'react'
import { Plus, Wallet, Clock, CheckCircle2, Repeat, XCircle, Pencil, Trash2, Zap } from 'lucide-react'
import { useStore, useUser, useLookup } from '../../../store'
import {
  PageHeader, Grid, Stat, Tabs, Button, StatusBadge, Badge, Modal, Drawer, FormGrid, Field, Input, NumberInput, Select, Textarea, FileUpload, AttachmentList,
  DescriptionList, Timeline, KV, Alert, Card, Switch, toast, prompt, confirm, IconButton, EmptyState,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { BarsChart, DonutChart } from '../../../components/business'
import { fmtINR, fmtDate, today, sum, lastMonths, monthLabel, groupBy } from '../../../lib/format'
import { EXPENSE_CATEGORY_LIST, TDS_SECTIONS, expensePayable } from './_books'
import { usePayFromOptions, SourceName } from './_ui'

export default function Expenses() {
  const expenses = useStore((s) => s.expenses) || []
  const templates = useStore((s) => s.expenseTemplates) || []
  const approveExpense = useStore((s) => s.approveExpense)
  const generate = useStore((s) => s.generateRecurringExpenses)
  const user = useUser()
  const [tab, setTab] = useState('ALL')
  const [openId, setOpenId] = useState(null)
  const [newOpen, setNewOpen] = useState(false)
  const [payId, setPayId] = useState(null)
  const [tpl, setTpl] = useState(null)
  const t = today()
  const ym = t.slice(0, 7)
  const canApprove = ['ADMIN', 'FINANCE_HEAD'].includes(user?.role)
  const gross = (e) => (Number(e.amount) || 0) + (Number(e.gst) || 0)
  const live = expenses.filter((e) => e.status !== 'REJECTED')
  const month = live.filter((e) => e.date.slice(0, 7) === ym)
  const pending = expenses.filter((e) => e.status === 'PENDING_APPROVAL')
  const toPay = expenses.filter((e) => e.status === 'APPROVED')
  const dueTpl = templates.filter((x) => x.active && (x.lastGenerated || '') < ym)
  const recurringMonth = month.filter((e) => e.recurring)

  const decide = async (e, ok) => {
    const remark = ok ? await prompt({ title: `Approve ${e.number}`, label: 'Remarks (optional)', confirmText: 'Approve' }) : await prompt({ title: `Reject ${e.number}`, label: 'Reason', required: true, tone: 'danger', confirmText: 'Reject' })
    if (remark === null) return
    approveExpense(e.id, ok, remark)
    toast.success(ok ? 'Expense approved' : 'Expense rejected', e.number)
  }
  const runGenerate = () => {
    const c = generate(ym)
    if (!c.length) return toast.info('Recurring entries for this month are already generated')
    toast.success(`${c.length} recurring entries created`, `${c.filter((x) => x.status === 'PENDING_APPROVAL').length} sent for approval, ${c.filter((x) => x.status === 'APPROVED').length} auto-approved`)
  }

  const rows = tab === 'ALL' ? expenses : tab === 'PENDING' ? pending : tab === 'TOPAY' ? toPay : expenses
  const columns = [
    { key: 'number', header: 'No.', render: (e) => <div><div className="font-medium">{e.number}</div>{e.recurring && <Badge tone="violet"><Repeat className="w-3 h-3" />Recurring</Badge>}{e.source === 'PAYROLL' && <Badge tone="blue">Payroll</Badge>}</div> },
    { key: 'date', header: 'Date', render: (e) => fmtDate(e.date) },
    { key: 'category', header: 'Category' },
    { key: 'description', header: 'Description', render: (e) => <div className="min-w-[180px]"><div className="text-slate-800">{e.description}</div><div className="text-[11px] text-slate-500">{e.payee}</div></div> },
    { key: 'amount', header: 'Amount', align: 'right', value: gross, render: (e) => <div><div className="font-semibold">{fmtINR(gross(e))}</div>{(e.gst > 0 || e.tds > 0) && <div className="text-[11px] text-slate-500">{e.gst ? `GST ${fmtINR(e.gst)}` : ''}{e.tds ? ` · TDS ${fmtINR(e.tds)}` : ''}</div>}</div> },
    { key: 'att', header: 'Docs', align: 'center', value: (e) => (e.attachments || []).length, render: (e) => ((e.attachments || []).length ? <Badge tone="gray">{e.attachments.length}</Badge> : <span className="text-slate-300">—</span>) },
    { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
    { key: 'act', header: '', sortable: false, export: false, render: (e) => (
      <div className="flex gap-1 justify-end" onClick={(ev) => ev.stopPropagation()}>
        {e.status === 'PENDING_APPROVAL' && canApprove && <><Button size="sm" variant="success" onClick={() => decide(e, true)}>Approve</Button><Button size="sm" variant="secondary" onClick={() => decide(e, false)}>Reject</Button></>}
        {e.status === 'APPROVED' && <Button size="sm" icon={Wallet} onClick={() => setPayId(e.id)}>Pay</Button>}
      </div>
    ) },
  ]

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Daily & monthly expenses with bills attached · entry → approval → payment · recurring rent, commission & utilities generated automatically"
        actions={<><Button variant="secondary" icon={Zap} onClick={runGenerate} disabled={!dueTpl.length}>Generate this month's recurring entries{dueTpl.length ? ` (${dueTpl.length})` : ''}</Button><Button icon={Plus} onClick={() => setNewOpen(true)}>New expense</Button></>} />
      <Grid cols={4} className="mb-5">
        <Stat icon={Wallet} label={`Spend – ${monthLabel(ym)}`} value={fmtINR(sum(month, gross))} sub={`${month.length} entries`} />
        <Stat icon={Clock} tone="amber" label="Pending approval" value={pending.length} sub={fmtINR(sum(pending, gross))} onClick={() => setTab('PENDING')} />
        <Stat icon={CheckCircle2} tone="blue" label="Approved – to pay" value={toPay.length} sub={fmtINR(sum(toPay, expensePayable))} onClick={() => setTab('TOPAY')} />
        <Stat icon={Repeat} tone="violet" label="Recurring auto-logged" value={`${recurringMonth.length}/${templates.filter((x) => x.active).length}`} sub={dueTpl.length ? `${dueTpl.length} template(s) not yet generated` : 'All generated this month'} onClick={() => setTab('RECUR')} />
      </Grid>
      {dueTpl.length > 0 && <Alert tone="warn" className="mb-4" title={`${dueTpl.length} recurring expense(s) not yet generated for ${monthLabel(ym)}`} action={<Button size="sm" onClick={runGenerate}>Generate now</Button>}>{dueTpl.map((x) => x.name).join(', ')}</Alert>}
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ key: 'ALL', label: 'All expenses', count: expenses.length }, { key: 'PENDING', label: 'Approvals', count: pending.length }, { key: 'TOPAY', label: 'To pay', count: toPay.length }, { key: 'RECUR', label: 'Recurring templates', count: templates.length }, { key: 'SUM', label: 'Summary' }]} />
      {['ALL', 'PENDING', 'TOPAY'].includes(tab) && (
        <DataTable columns={columns} rows={rows} onRowClick={(e) => setOpenId(e.id)} exportName="expenses" initialSort={{ key: 'date', dir: 'desc' }}
          filters={[{ key: 'category', label: 'categories', options: [...new Set(expenses.map((e) => e.category))] }, { key: 'status', label: 'statuses', options: ['PENDING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED'] }]}
          empty={<EmptyState title={tab === 'PENDING' ? 'Nothing waiting for approval' : 'No expenses'} />} />
      )}
      {tab === 'RECUR' && (
        <Card title="Recurring templates" subtitle="Generated on the chosen day each month; entries above the ₹5,000 threshold go for approval" actions={<Button size="sm" icon={Plus} onClick={() => setTpl({})}>Add template</Button>} padded={false}>
          <DataTable searchable={false} rows={templates} className="border-0 shadow-none" columns={[
            { key: 'name', header: 'Template', render: (x) => <div><div className="font-medium">{x.name}</div><div className="text-[11px] text-slate-500">{x.payee}</div></div> },
            { key: 'category', header: 'Category' },
            { key: 'amount', header: 'Amount', align: 'right', render: (x) => <div>{fmtINR(x.amount)}{x.gstRate ? <div className="text-[11px] text-slate-500">+ GST {x.gstRate}%</div> : null}</div> },
            { key: 'tdsSection', header: 'TDS', render: (x) => x.tdsSection || '—' },
            { key: 'dayOfMonth', header: 'Day', align: 'center' },
            { key: 'payFrom', header: 'Paid from', render: (x) => <SourceName id={x.payFrom} /> },
            { key: 'lastGenerated', header: 'Last generated', render: (x) => (x.lastGenerated ? <Badge tone={x.lastGenerated >= ym ? 'green' : 'amber'}>{monthLabel(x.lastGenerated)}</Badge> : '—') },
            { key: 'active', header: 'Active', render: (x) => <Switch checked={x.active} onChange={(v) => { useStore.getState().saveExpenseTemplate({ ...x, active: v }); toast.success(v ? 'Template activated' : 'Template paused', x.name) }} /> },
            { key: 'act', header: '', sortable: false, render: (x) => <div className="flex gap-1"><IconButton icon={Pencil} title="Edit" onClick={() => setTpl(x)} /><IconButton icon={Trash2} tone="danger" title="Delete" onClick={async () => { if (await confirm({ title: `Delete template "${x.name}"?`, tone: 'danger', confirmText: 'Delete' })) { useStore.getState().removeExpenseTemplate(x.id); toast.success('Template deleted') } }} /></div> },
          ]} />
        </Card>
      )}
      {tab === 'SUM' && <Summary expenses={live} />}
      {openId && <ExpenseDrawer id={openId} onClose={() => setOpenId(null)} decide={decide} canApprove={canApprove} onPay={(id) => { setOpenId(null); setPayId(id) }} />}
      {newOpen && <ExpenseForm onClose={() => setNewOpen(false)} />}
      {payId && <PayExpense id={payId} onClose={() => setPayId(null)} />}
      {tpl && <TemplateForm tpl={tpl} onClose={() => setTpl(null)} />}
    </div>
  )
}

function Summary({ expenses }) {
  const months = lastMonths(6)
  const [m, setM] = useState(months[months.length - 1])
  const gross = (e) => (Number(e.amount) || 0) + (Number(e.gst) || 0)
  const inM = expenses.filter((e) => e.date.slice(0, 7) === m)
  const byCat = Object.entries(groupBy(inM, 'category')).map(([name, l]) => ({ name, value: Math.round(sum(l, gross)) })).sort((a, b) => b.value - a.value)
  const cats = [...new Set(expenses.map((e) => e.category))]
  const trend = months.map((k) => ({ label: monthLabel(k), amount: Math.round(sum(expenses.filter((e) => e.date.slice(0, 7) === k), gross)) }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Monthly expense trend" subtitle="Logged in ERP (incl. GST)"><BarsChart data={trend} series={[{ key: 'amount', label: 'Expenses' }]} height={240} /></Card>
        <Card title="By category" actions={<Select value={m} onChange={(e) => setM(e.target.value)} options={months.map((k) => ({ value: k, label: monthLabel(k) }))} className="w-32" />}>
          {byCat.length ? <DonutChart data={byCat} height={220} /> : <EmptyState title="No expenses in this month" />}
        </Card>
      </div>
      <DataTable searchable={false} exportName="expense-summary" rows={cats.map((c) => ({ id: c, category: c, ...Object.fromEntries(months.map((k) => [k, Math.round(sum(expenses.filter((e) => e.category === c && e.date.slice(0, 7) === k), gross))])) }))}
        columns={[{ key: 'category', header: 'Category' }, ...months.map((k) => ({ key: k, header: monthLabel(k), align: 'right', render: (r) => (r[k] ? fmtINR(r[k]) : '—') })), { key: 'tot', header: 'Total', align: 'right', value: (r) => sum(months, (k) => r[k]), render: (r) => <b>{fmtINR(sum(months, (k) => r[k]))}</b> }]} />
    </div>
  )
}

function ExpenseDrawer({ id, onClose, decide, canApprove, onPay }) {
  const e = useStore((s) => (s.expenses || []).find((x) => x.id === id))
  const { user } = useLookup()
  if (!e) return null
  return (
    <Drawer open onClose={onClose} title={`${e.number} · ${e.category}`} subtitle={<StatusBadge status={e.status} />}
      footer={<>
        {e.status === 'PENDING_APPROVAL' && canApprove && <><Button variant="secondary" icon={XCircle} onClick={() => decide(e, false)}>Reject</Button><Button variant="success" icon={CheckCircle2} onClick={() => decide(e, true)}>Approve</Button></>}
        {e.status === 'APPROVED' && <Button icon={Wallet} onClick={() => onPay(e.id)}>Record payment</Button>}
      </>}>
      <DescriptionList items={[['Date', fmtDate(e.date)], ['Payee', e.payee || '—'], ['Description', e.description], ['Recurring', e.recurring ? 'Yes – monthly template' : 'No'], ['Paid from', e.status === 'PAID' ? <SourceName id={e.payFrom || e.bankId || 'bk1'} /> : '—'], ['Payment ref', e.paymentRef || '—'], e.remark && ['Approver remark', e.remark]]} />
      <Card className="mt-4" title="Amount">
        <KV label="Expense amount" value={fmtINR(e.amount, true)} />
        <KV label={`GST${e.gstRate ? ` @ ${e.gstRate}%` : ''} (input credit)`} value={fmtINR(e.gst || 0, true)} />
        <KV label={e.tdsSection ? `Less TDS u/s ${e.tdsSection}` : 'TDS'} value={e.tds ? `– ${fmtINR(e.tds, true)}` : '—'} />
        <KV label="Net payable" value={fmtINR(expensePayable(e), true)} className="border-t border-slate-100 mt-1" />
      </Card>
      <div className="mt-4"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Bills & receipts</div><AttachmentList items={e.attachments || []} empty="No bill attached." /></div>
      <div className="mt-4"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Workflow</div><Timeline items={(e.history || []).slice().reverse().map((h) => ({ ...h, by: user(h.by)?.name || h.by }))} /></div>
    </Drawer>
  )
}

function ExpenseForm({ onClose }) {
  const createExpense = useStore((s) => s.createExpense)
  const payOpts = usePayFromOptions()
  const [f, setF] = useState({ date: today(), category: 'Office Expenses', payee: '', description: '', amount: '', gstRate: 0, tdsSection: '', payFrom: 'bk1', attachments: [] })
  const save = () => {
    if (!f.description.trim()) return toast.error('Describe the expense')
    if (!(Number(f.amount) > 0)) return toast.error('Enter the amount')
    const e = createExpense(f)
    toast.success(e.status === 'APPROVED' ? 'Expense logged & auto-approved' : 'Expense sent for approval', `${e.number} · ${fmtINR(e.amount + e.gst)}`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="New expense" subtitle="Expenses above ₹5,000 go to the Director / Finance Head for approval"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save expense</Button></>}>
      <FormGrid>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, tdsSection: e.target.value === 'Rent' ? '194I' : e.target.value === 'Sales Commission' ? '194H' : e.target.value === 'Professional Fees' ? '194J' : f.tdsSection })} options={EXPENSE_CATEGORY_LIST} /></Field>
        <Field label="Payee"><Input value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} placeholder="Vendor / employee" /></Field>
        <Field label="Amount (₹, before GST)" required><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="GST rate"><Select value={String(f.gstRate)} onChange={(e) => setF({ ...f, gstRate: Number(e.target.value) })} options={[0, 5, 12, 18, 28].map((r) => ({ value: String(r), label: r ? `${r}%` : 'No GST' }))} /></Field>
        <Field label="TDS section"><Select value={f.tdsSection} onChange={(e) => setF({ ...f, tdsSection: e.target.value })} placeholder="No TDS" options={TDS_SECTIONS.map((x) => ({ value: x.code, label: x.label }))} /></Field>
        <Field label="To be paid from"><Select value={f.payFrom} onChange={(e) => setF({ ...f, payFrom: e.target.value })} options={payOpts} /></Field>
        <Field label="Description" required className="md:col-span-2"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="md:col-span-2">
          <FileUpload compact onFiles={(a) => setF({ ...f, attachments: [...f.attachments, ...a] })} label="Attach bill / receipt (photo or PDF)" />
          {f.attachments.length > 0 && <div className="mt-2"><AttachmentList dense items={f.attachments} onRemove={(a) => setF({ ...f, attachments: f.attachments.filter((x) => x.id !== a.id) })} /></div>}
        </div>
      </FormGrid>
    </Modal>
  )
}

function PayExpense({ id, onClose }) {
  const e = useStore((s) => (s.expenses || []).find((x) => x.id === id))
  const payExpense = useStore((s) => s.payExpense)
  const payOpts = usePayFromOptions()
  const [f, setF] = useState({ payFrom: e?.payFrom || 'bk1', mode: 'NEFT', ref: '', date: today() })
  if (!e) return null
  const save = () => {
    if (!['CASH', 'PETTY'].includes(f.payFrom) && !f.ref.trim()) return toast.error('Enter the payment reference')
    payExpense(id, { ...f, mode: ['CASH', 'PETTY'].includes(f.payFrom) ? 'CASH' : f.mode })
    toast.success('Expense paid', `${e.number} · ${fmtINR(expensePayable(e), true)}`)
    onClose()
  }
  return (
    <Modal open size="sm" onClose={onClose} title={`Pay ${e.number}`} subtitle={`${e.payee || e.category} · net ${fmtINR(expensePayable(e), true)}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" onClick={save}>Mark paid</Button></>}>
      <FormGrid cols={1}>
        <Field label="Paid from"><Select value={f.payFrom} onChange={(ev) => setF({ ...f, payFrom: ev.target.value })} options={payOpts} /></Field>
        {!['CASH', 'PETTY'].includes(f.payFrom) && <Field label="Mode"><Select value={f.mode} onChange={(ev) => setF({ ...f, mode: ev.target.value })} options={['NEFT', 'RTGS', 'IMPS', 'UPI', 'CHEQUE']} /></Field>}
        {!['CASH', 'PETTY'].includes(f.payFrom) && <Field label="UTR / cheque no." required><Input value={f.ref} onChange={(ev) => setF({ ...f, ref: ev.target.value })} /></Field>}
        <Field label="Date"><Input type="date" value={f.date} onChange={(ev) => setF({ ...f, date: ev.target.value })} /></Field>
      </FormGrid>
    </Modal>
  )
}

function TemplateForm({ tpl, onClose }) {
  const save = useStore((s) => s.saveExpenseTemplate)
  const payOpts = usePayFromOptions()
  const [f, setF] = useState({ name: '', category: 'Rent', payee: '', amount: '', gstRate: 0, tdsSection: '', dayOfMonth: 1, payFrom: 'bk1', active: true, ...tpl })
  const submit = () => {
    if (!f.name.trim() || !(Number(f.amount) > 0)) return toast.error('Name and amount are required')
    save({ ...f, amount: Number(f.amount), dayOfMonth: Number(f.dayOfMonth) || 1 })
    toast.success(tpl.id ? 'Template updated' : 'Recurring template added', f.name)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={tpl.id ? `Edit ${tpl.name}` : 'New recurring expense'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Save template</Button></>}>
      <FormGrid>
        <Field label="Template name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Godown rent – Bhiwandi" /></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={EXPENSE_CATEGORY_LIST} /></Field>
        <Field label="Payee"><Input value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} /></Field>
        <Field label="Monthly amount (₹)" required><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="GST rate"><Select value={String(f.gstRate)} onChange={(e) => setF({ ...f, gstRate: Number(e.target.value) })} options={[0, 5, 12, 18].map((r) => ({ value: String(r), label: r ? `${r}%` : 'No GST' }))} /></Field>
        <Field label="TDS section"><Select value={f.tdsSection} onChange={(e) => setF({ ...f, tdsSection: e.target.value })} placeholder="No TDS" options={TDS_SECTIONS.map((x) => ({ value: x.code, label: x.label }))} /></Field>
        <Field label="Day of month"><NumberInput min={1} max={28} value={f.dayOfMonth} onChange={(v) => setF({ ...f, dayOfMonth: v })} /></Field>
        <Field label="Paid from"><Select value={f.payFrom} onChange={(e) => setF({ ...f, payFrom: e.target.value })} options={payOpts} /></Field>
      </FormGrid>
    </Modal>
  )
}
