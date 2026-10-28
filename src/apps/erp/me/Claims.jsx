import React, { useState } from 'react'
import { Plus, Clock, CheckCircle2, Banknote, ReceiptText } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Button, Drawer, DescriptionList, AttachmentList, Timeline, StatusBadge, Alert, EmptyState, toast, confirm } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtDate } from '../../../lib/format'
import { claimTypeLabel } from '../../../store/slices/hr'
import { useMyEmployee } from '../hr/_parts'
import ClaimForm from '../hr/_claimForm'

export default function MyClaims() {
  const me = useMyEmployee()
  const claims = useStore((s) => (s.empClaims || []).filter((c) => c.empId === me?.id))
  const withdrawEmpClaim = useStore((s) => s.withdrawEmpClaim)
  const [form, setForm] = useState(false)
  const [open, setOpen] = useState(null)
  if (!me) return <div><PageHeader title="My Claims" /><EmptyState title="No employee record linked to your login" message="Please contact HR." /></div>
  const amt = (c) => c.approvedAmount ?? c.amount
  const sumOf = (st) => claims.filter((c) => c.status === st).reduce((a, c) => a + amt(c), 0)
  const c = claims.find((x) => x.id === open)
  return (
    <div>
      <PageHeader title="My Claims" subtitle="Submit travel, fuel, medical and other expenses with bills · approved claims are paid with your salary"
        actions={<Button icon={Plus} onClick={() => setForm(true)}>New claim</Button>} />
      <Grid cols={3} className="mb-4">
        <Stat label="Awaiting approval" value={fmtINR(sumOf('PENDING'))} sub={`${claims.filter((x) => x.status === 'PENDING').length} claims`} icon={Clock} tone="amber" />
        <Stat label="Approved – with next salary" value={fmtINR(sumOf('APPROVED'))} icon={CheckCircle2} tone="blue" />
        <Stat label="Reimbursed" value={fmtINR(sumOf('PAID'))} sub="all time" icon={Banknote} tone="green" />
      </Grid>
      <DataTable rows={[...claims].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))} onRowClick={(x) => setOpen(x.id)} searchable={false} exportName="my-claims"
        empty={<EmptyState icon={ReceiptText} title="No claims yet" message="Snap a photo of your bill and submit it here." action={<Button icon={Plus} onClick={() => setForm(true)}>New claim</Button>} />}
        columns={[
          { key: 'number', header: 'Claim', render: (x) => <span className="font-mono text-xs">{x.number}</span> },
          { key: 'type', header: 'Type', render: (x) => claimTypeLabel(x.type) },
          { key: 'date', header: 'Date', render: (x) => fmtDate(x.date) },
          { key: 'description', header: 'Description', className: 'max-w-[240px] truncate' },
          { key: 'amount', header: 'Amount', align: 'right', render: (x) => fmtINR(x.amount) },
          { key: 'status', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
        ]} />
      {c && (
        <Drawer open onClose={() => setOpen(null)} title={`${c.number} · ${claimTypeLabel(c.type)}`} subtitle={<StatusBadge status={c.status} />}
          footer={c.status === 'PENDING' && <Button variant="secondary" onClick={async () => { if (await confirm({ title: 'Withdraw this claim?', confirmText: 'Withdraw' })) { withdrawEmpClaim(c.id); toast.success('Claim withdrawn'); setOpen(null) } }}>Withdraw claim</Button>}>
          <div className="space-y-5">
            <div className="text-2xl font-bold text-ink-900">{fmtINR(c.amount)}{c.approvedAmount != null && c.approvedAmount !== c.amount && <span className="text-sm font-normal text-emerald-700 ml-2">approved {fmtINR(c.approvedAmount)}</span>}</div>
            <DescriptionList items={[['Expense date', fmtDate(c.date)], ['Category', claimTypeLabel(c.type)], c.km ? ['Distance', `${c.km} km`] : null, ['Description', c.description], c.paidAt ? ['Paid', `${fmtDate(c.paidAt)} · ${c.payout === 'ACCOUNTS' ? 'bank transfer' : 'with salary'}`] : null]} />
            {c.remark && <Alert tone={c.status === 'REJECTED' ? 'error' : 'info'}>{c.remark}</Alert>}
            {c.status === 'APPROVED' && <Alert tone="info">Approved – will be credited with your next salary.</Alert>}
            <AttachmentList items={c.attachments || []} empty="No receipts attached." />
            <Timeline items={[...(c.history || [])].reverse()} />
          </div>
        </Drawer>
      )}
      {form && <ClaimForm empId={me.id} onClose={() => setForm(false)} />}
    </div>
  )
}
