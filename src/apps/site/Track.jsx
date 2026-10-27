import React, { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, Store, Phone, Wrench, AlertCircle, Clock } from 'lucide-react'
import { useStore } from '../../store'
import { Field, Input, Stepper, ProductImage } from '../../components/ui'
import { fmtDateTime, fmtDate } from '../../lib/format'
import { findPublicTicket, CATEGORY_LABEL } from '../../store/slices/service'
import { SiteHero } from './Warranty'

const STEPS = [
  { key: 'LOGGED', label: 'Registered' },
  { key: 'UNDER_REVIEW', label: 'Assigned' },
  { key: 'IN_PROGRESS', label: 'Being serviced' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'CLOSED', label: 'Closed' },
]
const STATUS_TEXT = {
  LOGGED: 'We have received your request and are assigning a service engineer.',
  UNDER_REVIEW: 'Your request has been assigned and is being reviewed.',
  IN_PROGRESS: 'Our service partner is working on your product.',
  RESOLVED: 'The issue has been resolved. Please confirm if everything is working fine.',
  CLOSED: 'This request is closed. Thank you for choosing Btali.',
}

export default function Track() {
  const tickets = useStore((s) => s.tickets)
  const { partners, products } = useStore.getState()
  const [params, setParams] = useSearchParams()
  const [no, setNo] = useState(params.get('no') || '')
  const [phone, setPhone] = useState(params.get('phone') || '')
  const q = { no: params.get('no'), phone: params.get('phone') }
  const res = useMemo(() => (q.no ? findPublicTicket({ ...useStore.getState(), tickets }, q.no, q.phone) : null), [q.no, q.phone, tickets]) // eslint-disable-line
  const t = res?.ok ? res.ticket : null
  const partner = t && partners.find((p) => p.id === (t.routedPartnerId || t.partnerId))
  const product = t && products.find((p) => p.id === t.productId)
  const updates = t ? t.updates.filter((u) => u.public || u.stage) : []

  return (
    <div className="bg-slate-50 min-h-full">
      <SiteHero icon={Search} title="Track your service request" text="Enter the reference number from your SMS and the mobile number you registered with." />
      <div className="max-w-3xl mx-auto px-4 -mt-6 pb-14">
        <form onSubmit={(e) => { e.preventDefault(); setParams({ no: no.trim(), phone: phone.trim() }) }} className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <Field label="Reference number"><Input value={no} onChange={(e) => setNo(e.target.value)} placeholder="TKT-01211" className="font-mono uppercase placeholder:normal-case" /></Field>
          <Field label="Registered mobile"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" inputMode="tel" /></Field>
          <button className="bg-ink-900 hover:bg-ink-800 text-white font-semibold px-5 py-2 rounded-lg h-[38px]" disabled={!no.trim() || !phone.trim()}>Track</button>
        </form>

        {res && !res.ok && (
          <div className="mt-5 bg-white rounded-2xl border border-red-200 p-5 flex gap-3"><AlertCircle className="w-5 h-5 text-red-500 shrink-0" /><div className="text-sm text-slate-700">{res.error} If you need help, call <b>1800 266 7700</b>.</div></div>
        )}

        {t && (
          <div className="mt-5 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">Reference</div>
                  <div className="text-xl font-black font-mono text-ink-900">{t.number}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Registered {fmtDateTime(t.createdAt)} · {CATEGORY_LABEL[t.category]}</div>
                </div>
                {product && <div className="flex items-center gap-2"><ProductImage product={product} size="sm" /><div className="text-sm"><div className="font-medium">{product.shortName || product.name}</div>{t.barcode && <div className="text-[11px] text-slate-500 font-mono">{t.barcode}</div>}</div></div>}
              </div>
              <Stepper className="mt-5" steps={STEPS} current={t.stage} />
              <div className="mt-4 rounded-xl bg-brand-50 text-brand-900 text-sm p-3">{STATUS_TEXT[t.stage]}</div>
              {t.resolution && <div className="mt-3 text-sm text-slate-700"><b>Resolution:</b> {t.resolution}</div>}
              {!['RESOLVED', 'CLOSED'].includes(t.stage) && <div className="mt-3 text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Target resolution by {fmtDate(new Date(new Date(t.createdAt).getTime() + (t.slaHours || 72) * 3600000).toISOString())}</div>}
            </div>
            {partner && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex gap-3">
                <Store className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-semibold text-ink-900">Service partner: {partner.name}</div>
                  <div className="text-xs text-slate-500">{partner.address || partner.city}</div>
                  <a href={`tel:${partner.phone}`} className="text-xs font-semibold text-brand-600 inline-flex items-center gap-1 mt-1"><Phone className="w-3 h-3" />{partner.phone}</a>
                </div>
              </div>
            )}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="font-semibold text-ink-900 mb-3">Updates</div>
              <ol className="relative border-l border-slate-200 ml-2 space-y-4">
                {[...updates].reverse().map((u, i) => (
                  <li key={i} className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-brand-500 border-2 border-white" />
                    <div className="text-sm text-slate-800">{u.public ? u.text : `Status updated: ${STEPS.find((s) => s.key === u.stage)?.label || u.stage}`}</div>
                    <div className="text-[11px] text-slate-400">{fmtDateTime(u.ts)}</div>
                  </li>
                ))}
                <li className="ml-4">
                  <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-slate-300 border-2 border-white" />
                  <div className="text-sm text-slate-800">Request registered</div>
                  <div className="text-[11px] text-slate-400">{fmtDateTime(t.createdAt)}</div>
                </li>
              </ol>
            </div>
            <Link to="/site/service" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600"><Wrench className="w-4 h-4" />Raise a new request</Link>
          </div>
        )}
      </div>
    </div>
  )
}
