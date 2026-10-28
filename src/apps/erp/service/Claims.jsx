import React, { useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ShieldAlert, CheckCircle2, XCircle, Factory, PackageCheck, CheckCheck, BellRing, ClipboardCheck, Search, IndianRupee, ExternalLink } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Grid, Stat, Badge, StatusBadge, Button, Drawer, DescriptionList, SectionTitle, Modal, Field, FormGrid, Select, Textarea, NumberInput,
  Timeline, Alert, Segmented, AttachmentList, toast, prompt, confirm, Input,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, PartnerCell } from '../../../components/business'
import { fmtDate, fmtINR, fmtDateTime, timeAgo } from '../../../lib/format'
import { RESPONSE_TYPES } from '../../../store/slices/service'
import { WarrantyCover, useWarrantyCheck } from './_parts'

const OPEN = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'VENDOR_ESCALATED']

export default function Claims() {
  const claims = useStore((s) => s.warrantyClaims)
  const { product, partner, vendor } = useLookup()
  const [params, setParams] = useSearchParams()
  const [seg, setSeg] = useState('OPEN')
  const openId = params.get('id')
  const rows = seg === 'OPEN' ? claims.filter((c) => OPEN.includes(c.status)) : seg === 'ALL' ? claims : claims.filter((c) => c.status === seg)
  const cost = (b) => claims.filter((c) => c.bearer === b && c.status !== 'REJECTED').reduce((a, c) => a + (c.cost || 0), 0)

  const cols = [
    { key: 'number', header: 'Claim', render: (c) => <div><div className="font-mono text-xs font-semibold">{c.number}</div><div className="text-[11px] text-slate-400">{fmtDate(c.createdAt)}</div></div> },
    { key: 'product', header: 'Product / barcode', value: (c) => `${product(c.productId)?.name} ${c.barcode}`, render: (c) => <ProductCell id={c.productId} sub={c.barcode} /> },
    { key: 'partner', header: 'Dealer / franchise', value: (c) => partner(c.partnerId)?.name, render: (c) => <PartnerCell id={c.partnerId} /> },
    { key: 'issue', header: 'Issue', render: (c) => <div className="max-w-[220px] truncate" title={c.issue}>{c.issue}</div> },
    { key: 'requestType', header: 'Request', render: (c) => <Badge tone={c.requestType === 'REPLACEMENT' ? 'brand' : 'ink'}>{c.requestType === 'REPLACEMENT' ? 'Replacement' : 'Repair'}</Badge> },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
    { key: 'vendor', header: 'Vendor', value: (c) => vendor(c.vendorClaim?.vendorId)?.name || '', render: (c) => (c.vendorClaim ? <div className="text-xs">{vendor(c.vendorClaim.vendorId)?.name}<div><StatusBadge status={c.vendorClaim.status} /></div></div> : '—') },
    { key: 'bearer', header: 'Cost borne by', render: (c) => (c.bearer ? <Badge tone={c.bearer === 'VENDOR' ? 'violet' : 'amber'}>{c.bearer === 'VENDOR' ? 'Vendor' : 'Btali'}</Badge> : '—') },
    { key: 'cost', header: 'Cost', align: 'right', value: (c) => c.cost || 0, render: (c) => (c.cost ? fmtINR(c.cost) : '—') },
  ]
  return (
    <div>
      <PageHeader title="Warranty Claims" subtitle="Verify against barcode validity, approve, allocate replacements and recover cost from vendors" />
      <Grid cols={4} className="mb-4">
        <Stat label="Awaiting decision" value={claims.filter((c) => ['SUBMITTED', 'UNDER_REVIEW'].includes(c.status)).length} icon={ClipboardCheck} tone="amber" onClick={() => setSeg('OPEN')} />
        <Stat label="With vendors" value={claims.filter((c) => c.status === 'VENDOR_ESCALATED').length} icon={Factory} tone="violet" onClick={() => setSeg('VENDOR_ESCALATED')} />
        <Stat label="Btali-borne cost" value={fmtINR(cost('BTALI'))} icon={IndianRupee} tone="red" />
        <Stat label="Recovered from vendors" value={fmtINR(cost('VENDOR'))} icon={IndianRupee} tone="green" />
      </Grid>
      <div className="mb-3 overflow-x-auto"><Segmented value={seg} onChange={setSeg} options={[{ key: 'OPEN', label: 'Open' }, { key: 'SUBMITTED', label: 'Submitted' }, { key: 'APPROVED', label: 'Approved' }, { key: 'VENDOR_ESCALATED', label: 'With vendor' }, { key: 'CLOSED', label: 'Closed' }, { key: 'REJECTED', label: 'Rejected' }, { key: 'ALL', label: 'All' }]} /></div>
      <DataTable columns={cols} rows={rows} onRowClick={(c) => setParams({ id: c.id })} exportName="warranty-claims" searchPlaceholder="Search claim, barcode, dealer…" initialSort={{ key: 'number', dir: 'desc' }} />
      {openId && <ClaimDrawer id={openId} onClose={() => setParams({})} />}
    </div>
  )
}

function ClaimDrawer({ id, onClose }) {
  const c = useStore((s) => s.warrantyClaims.find((x) => x.id === id))
  const units = useStore((s) => s.units)
  const decide = useStore((s) => s.decideWarrantyClaim)
  const setStatus = useStore((s) => s.svcSetClaimStatus)
  const escalate = useStore((s) => s.svcEscalateClaimToVendor)
  const remind = useStore((s) => s.svcSendVendorReminder)
  const { partner, vendor, product } = useLookup()
  const nav = useNavigate()
  const wc = useWarrantyCheck(c?.barcode)
  const [modal, setModal] = useState(null)
  if (!c) return null
  const p = product(c.productId)
  const inWh = units.filter((u) => u.productId === c.productId && u.status === 'IN_WAREHOUSE')
  const valid = wc?.customer?.valid
  const vendorValid = wc?.vendorCover?.valid
  const isOpen = OPEN.includes(c.status)
  const approve = async () => {
    if (!valid && !(await confirm({ title: 'Warranty not valid', message: 'Customer warranty is expired or not registered for this barcode. Approve as a goodwill claim?', confirmText: 'Approve anyway' }))) return
    const r = await prompt({ title: `Approve ${c.number}`, label: 'Remarks (optional)', confirmText: 'Approve' })
    if (r === null) return
    decide(c.id, true, r); toast.success('Claim approved', 'Dealer notified.')
  }
  const reject = async () => {
    const r = await prompt({ title: `Reject ${c.number}`, label: 'Reason', required: true, tone: 'danger', confirmText: 'Reject claim' })
    if (!r) return
    decide(c.id, false, r); toast.success('Claim rejected', 'Dealer notified with reason.')
  }
  const toVendor = async () => {
    const r = await prompt({ title: `Escalate to ${vendor(units.find((u) => u.code === c.barcode)?.vendorId || p?.vendorId)?.name}`, label: 'Note for vendor', placeholder: 'Failure analysis, batch, requested remedy', required: true, confirmText: 'Escalate' })
    if (!r) return
    escalate(c.id, r); toast.success('Escalated to vendor', 'Vendor notified on portal and by email.')
  }
  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={`${c.number} · ${c.issue}`}
      subtitle={<div className="flex gap-1.5 mt-1 flex-wrap"><StatusBadge status={c.status} /><Badge tone={c.requestType === 'REPLACEMENT' ? 'brand' : 'ink'}>{c.requestType === 'REPLACEMENT' ? 'Replacement requested' : 'Repair requested'}</Badge>{c.replacementBarcode && <Badge tone="teal">Replaced by {c.replacementBarcode}</Badge>}</div>}
      footer={<>
        {c.status === 'SUBMITTED' && <Button variant="secondary" icon={Search} onClick={() => { setStatus(c.id, 'UNDER_REVIEW', 'Taken up for verification'); toast.success('Moved to review') }}>Start review</Button>}
        {['SUBMITTED', 'UNDER_REVIEW'].includes(c.status) && <><Button variant="danger" icon={XCircle} onClick={reject}>Reject</Button><Button variant="success" icon={CheckCircle2} onClick={approve}>Approve</Button></>}
        {['APPROVED', 'VENDOR_ESCALATED'].includes(c.status) && !c.replacementBarcode && <Button variant="secondary" icon={PackageCheck} onClick={() => setModal('replace')}>Allocate replacement</Button>}
        {c.status === 'APPROVED' && <Button variant="secondary" icon={Factory} onClick={toVendor}>Escalate to vendor</Button>}
        {c.status === 'VENDOR_ESCALATED' && <Button variant="secondary" icon={BellRing} onClick={() => { remind('CLAIM', c.id); toast.success('Reminder sent', 'Email + portal notification to vendor.') }}>Send reminder</Button>}
        {c.status === 'VENDOR_ESCALATED' && <Button variant="secondary" icon={ClipboardCheck} onClick={() => setModal('response')}>Record vendor decision</Button>}
        {['APPROVED', 'VENDOR_ESCALATED'].includes(c.status) && <Button variant="dark" icon={CheckCheck} onClick={() => setModal('close')}>Close claim</Button>}
      </>}>
      <SectionTitle>Validity check (barcode {c.barcode})</SectionTitle>
      {wc && <WarrantyCover result={wc} />}
      {wc?.found && isOpen && (
        <Alert className="mt-3" tone={valid ? 'success' : 'error'} title={valid ? 'Customer warranty valid' : 'Customer warranty not valid'}>
          {vendorValid ? `Vendor warranty from ${wc.vendor?.name} is active – cost can be recovered by escalating to the vendor.` : 'Vendor warranty not active – cost will be borne by Btali.'}
          {wc.terms.exclusions ? ` Exclusions: ${wc.terms.exclusions}.` : ''}
        </Alert>
      )}
      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        <DescriptionList cols={1} items={[['Product', p ? `${p.name} (${p.sku})` : '—'], ['Dealer / franchise', partner(c.partnerId) ? `${partner(c.partnerId).name}, ${partner(c.partnerId).city}` : '—'], ['Customer', wc?.warranty ? `${wc.warranty.customer?.name} · ${wc.warranty.customer?.phone}` : '—']]} />
        <DescriptionList cols={1} items={[['Submitted', fmtDateTime(c.createdAt)], ['Cost borne by', c.bearer ? (c.bearer === 'VENDOR' ? 'Vendor' : 'Btali') : 'To be decided'], ['Claim cost', c.cost ? fmtINR(c.cost) : '—'], c.remark && ['Decision remark', c.remark]]} />
      </div>
      {c.ticketId && <Button className="mt-3" size="sm" variant="link" iconRight={ExternalLink} onClick={() => nav(`/erp/service/tickets?id=${c.ticketId}`)}>Open linked service ticket</Button>}
      {c.vendorClaim && (
        <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-900"><Factory className="w-4 h-4" />{vendor(c.vendorClaim.vendorId)?.name}<StatusBadge status={c.vendorClaim.status} className="ml-auto" /></div>
          <div className="text-xs text-slate-600 mt-1">Escalated {fmtDateTime(c.vendorClaim.sentAt)} ({timeAgo(c.vendorClaim.sentAt)}){c.vendorClaim.reminders?.length ? ` · ${c.vendorClaim.reminders.length} reminder(s) sent` : ''}</div>
          {c.vendorClaim.response ? <div className="mt-2 text-sm text-slate-800"><b>Vendor response:</b> {c.vendorClaim.response}{c.vendorClaim.respondedAt && <span className="text-[11px] text-slate-500"> · {fmtDateTime(c.vendorClaim.respondedAt)}</span>}</div> : <div className="mt-2 text-sm text-violet-800">Awaiting vendor response.</div>}
          {c.vendorClaim.docs?.length > 0 && <div className="mt-2"><AttachmentList dense items={c.vendorClaim.docs} /></div>}
        </div>
      )}
      {c.attachments?.length > 0 && <div className="mt-5"><SectionTitle>Attachments</SectionTitle><AttachmentList items={c.attachments} /></div>}
      <div className="mt-5"><SectionTitle>Timeline</SectionTitle><Timeline items={[...(c.timeline || [])].reverse()} /></div>
      {modal === 'replace' && <ReplaceModal claim={c} units={inWh} onClose={() => setModal(null)} />}
      {modal === 'response' && <ResponseModal claim={c} onClose={() => setModal(null)} />}
      {modal === 'close' && <CloseModal claim={c} defaultCost={c.cost || p?.landedCost || 0} onClose={() => setModal(null)} />}
    </Drawer>
  )
}

function ReplaceModal({ claim, units, onClose }) {
  const allocate = useStore((s) => s.svcAllocateReplacement)
  const [code, setCode] = useState(units[0]?.code || '')
  return (
    <Modal open onClose={onClose} title="Allocate replacement unit" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={PackageCheck} disabled={!code} onClick={() => {
        const r = allocate(claim.id, code)
        if (!r.ok) return toast.error(r.error)
        toast.success(`Replacement ${code} allocated`, 'Stock reduced by 1; old unit marked replaced; dealer notified.')
        onClose()
      }}>Allocate & dispatch</Button></>}>
      {units.length === 0 ? <Alert tone="warn" title="No barcoded stock">No unit of this product is available in the warehouse. Raise a replenishment or escalate to the vendor for a replacement.</Alert> : (
        <>
          <p className="text-sm text-slate-600 mb-3">{units.length} unit(s) of the same product available at Btali. The selected barcode is linked to the claim, moved to the dealer and the defective unit {claim.barcode} is marked replaced.</p>
          <Field label="Replacement barcode"><Select value={code} onChange={(e) => setCode(e.target.value)} options={units.slice(0, 100).map((u) => ({ value: u.code, label: `${u.code} · ${u.locationId}` }))} /></Field>
        </>
      )}
    </Modal>
  )
}

function ResponseModal({ claim, onClose }) {
  const record = useStore((s) => s.svcRecordVendorResponse)
  const [f, setF] = useState({ accepted: 'YES', response: claim.vendorClaim?.response || '', bearer: 'VENDOR', cost: claim.cost || '' })
  return (
    <Modal open onClose={onClose} title="Record vendor decision" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { record(claim.id, { accepted: f.accepted === 'YES', response: f.response, bearer: f.bearer, cost: f.cost }); toast.success('Vendor decision recorded'); onClose() }}>Save</Button></>}>
      <FormGrid cols={1}>
        <Field label="Vendor decision"><Select value={f.accepted} onChange={(e) => setF({ ...f, accepted: e.target.value, bearer: e.target.value === 'YES' ? 'VENDOR' : 'BTALI' })} options={[{ value: 'YES', label: 'Accepted by vendor' }, { value: 'NO', label: 'Declined by vendor' }]} /></Field>
        <Field label="Vendor response / remedy"><Textarea rows={3} value={f.response} onChange={(e) => setF({ ...f, response: e.target.value })} placeholder="e.g. Free replacement in next container / credit note USD 32" /></Field>
        <FormGrid cols={2}>
          <Field label="Cost borne by"><Select value={f.bearer} onChange={(e) => setF({ ...f, bearer: e.target.value })} options={[{ value: 'VENDOR', label: 'Vendor' }, { value: 'BTALI', label: 'Btali' }]} /></Field>
          <Field label="Claim cost (₹)"><NumberInput value={f.cost} onChange={(v) => setF({ ...f, cost: v })} /></Field>
        </FormGrid>
      </FormGrid>
    </Modal>
  )
}

function CloseModal({ claim, defaultCost, onClose }) {
  const close = useStore((s) => s.svcCloseClaim)
  const [f, setF] = useState({ remark: '', bearer: claim.bearer || (claim.vendorClaim?.status === 'ACCEPTED' ? 'VENDOR' : 'BTALI'), cost: claim.cost || defaultCost })
  return (
    <Modal open onClose={onClose} title={`Close ${claim.number}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="dark" disabled={!f.remark.trim()} onClick={() => { close(claim.id, f); toast.success('Claim closed', 'Dealer notified; linked ticket closed.'); onClose() }}>Close claim</Button></>}>
      <FormGrid cols={1}>
        <Field label="Closure remark" required><Input value={f.remark} onChange={(e) => setF({ ...f, remark: e.target.value })} placeholder="e.g. Replacement handed over to customer" /></Field>
        <FormGrid cols={2}>
          <Field label="Cost borne by"><Select value={f.bearer} onChange={(e) => setF({ ...f, bearer: e.target.value })} options={[{ value: 'BTALI', label: 'Btali' }, { value: 'VENDOR', label: 'Vendor' }]} /></Field>
          <Field label="Final cost (₹)"><NumberInput value={f.cost} onChange={(v) => setF({ ...f, cost: v })} /></Field>
        </FormGrid>
      </FormGrid>
    </Modal>
  )
}
