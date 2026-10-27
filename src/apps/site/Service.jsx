import React, { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Wrench, CheckCircle2, Store, Phone, MessageSquare, Copy, Search } from 'lucide-react'
import { useStore } from '../../store'
import { Field, Input, Select, Textarea, FileUpload, AttachmentList, toast, cx } from '../../components/ui'
import { CATEGORIES } from '../../store/seed/core'
import { SiteHero } from './Warranty'

const ISSUES = [
  { value: 'PRODUCT_DEFECT', label: 'Not working / defect' },
  { value: 'INSTALLATION', label: 'Installation / demo' },
  { value: 'SPARE_REQUIREMENT', label: 'Spare part needed' },
  { value: 'WARRANTY_CLAIM', label: 'Warranty repair / replacement' },
  { value: 'GENERAL', label: 'Other / general' },
]

export default function Service() {
  const products = useStore((s) => s.products)
  const units = useStore((s) => s.units)
  const log = useStore((s) => s.svcLogServiceRequest)
  const [params] = useSearchParams()
  const initCode = params.get('code') || ''
  const initUnit = units.find((u) => u.code === initCode)
  const [f, setF] = useState({ name: '', phone: '', email: '', city: '', pincode: '', address: '', category: initCode ? 'WARRANTY_CLAIM' : 'PRODUCT_DEFECT', cat: initUnit ? products.find((p) => p.id === initUnit.productId)?.category : '', productId: initUnit?.productId || '', barcode: initCode, description: '' })
  const [files, setFiles] = useState([])
  const [err, setErr] = useState({})
  const [done, setDone] = useState(null)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const unit = f.barcode ? units.find((u) => u.code === f.barcode.trim().toUpperCase()) : null
  const prodOpts = useMemo(() => products.filter((p) => p.type === 'FG' && p.active !== false && (!f.cat || p.category === f.cat)).map((p) => ({ value: p.id, label: p.name })), [products, f.cat])

  const submit = (e) => {
    e.preventDefault()
    const er = {}
    if (!f.name.trim()) er.name = 'Required'
    if (f.phone.replace(/\D/g, '').length !== 10) er.phone = 'Enter a 10-digit mobile number'
    if (!f.city.trim()) er.city = 'Required'
    if (f.pincode && !/^\d{6}$/.test(f.pincode)) er.pincode = '6-digit pincode'
    if (!f.productId && !unit) er.productId = 'Select your product or enter its barcode'
    if (f.barcode && !unit) er.barcode = 'Barcode not found – check the sticker or leave blank'
    if (f.description.trim().length < 10) er.description = 'Please describe the problem (min. 10 characters)'
    setErr(er)
    if (Object.keys(er).length) return toast.error('Please correct the highlighted fields')
    const r = log({ source: 'WEBSITE', customer: { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), city: f.city.trim(), pincode: f.pincode.trim(), address: f.address.trim() }, productId: f.productId || unit?.productId, barcode: unit?.code, category: f.category, description: f.description.trim(), attachments: files })
    setDone(r)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (done) {
    const t = done.ticket
    return (
      <div className="bg-slate-50 min-h-full">
        <SiteHero icon={Wrench} title="Request registered" text="Thank you. Our service partner will call you within 24 hours." />
        <div className="max-w-2xl mx-auto px-4 -mt-6 pb-14">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <div className="text-sm text-slate-500 mt-3">Your reference number</div>
            <div className="text-3xl font-black tracking-tight text-ink-900 font-mono mt-1">{t.number}</div>
            <button type="button" className="mt-2 text-xs text-brand-600 inline-flex items-center gap-1" onClick={() => { navigator.clipboard?.writeText(t.number); toast.success('Reference copied') }}><Copy className="w-3 h-3" />Copy</button>
            <div className="mt-4 text-sm text-slate-600 flex items-center justify-center gap-2"><MessageSquare className="w-4 h-4 text-emerald-500" />SMS confirmation sent to {t.customer.phone}{t.customer.email ? ` and email to ${t.customer.email}` : ''}</div>
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-left flex gap-3">
              <Store className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
              {done.partner ? (
                <div className="text-sm">
                  <div className="font-semibold text-ink-900">Assigned to {done.partner.name}</div>
                  <div className="text-xs text-slate-500">{done.match === 'CITY' ? `Authorised service partner in ${done.partner.city}` : `Nearest authorised partner (${done.partner.city})`}</div>
                  <a href={`tel:${done.partner.phone}`} className="text-xs font-semibold text-brand-600 inline-flex items-center gap-1 mt-1"><Phone className="w-3 h-3" />{done.partner.phone}</a>
                </div>
              ) : (
                <div className="text-sm"><div className="font-semibold text-ink-900">Assigned to Btali service team</div><div className="text-xs text-slate-500">Our engineer will call you to schedule a visit. Helpline 1800 266 7700.</div></div>
              )}
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to={`/site/track?no=${t.number}&phone=${encodeURIComponent(t.customer.phone)}`} className="inline-flex items-center justify-center gap-2 bg-ink-900 text-white font-semibold px-5 py-3 rounded-xl"><Search className="w-4 h-4" />Track this request</Link>
              <button type="button" onClick={() => { setDone(null); setFiles([]); setF((x) => ({ ...x, description: '', barcode: '' })) }} className="inline-flex items-center justify-center gap-2 border border-slate-300 font-semibold px-5 py-3 rounded-xl">Raise another request</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 min-h-full">
      <SiteHero icon={Wrench} title="Request service" text="Tell us what’s wrong. We’ll route your request to the nearest authorised Btali service partner and keep you updated by SMS." />
      <form onSubmit={submit} className="max-w-3xl mx-auto px-4 -mt-6 pb-14 space-y-4">
        <Section title="Your details">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full name" required error={err.name}><Input value={f.name} onChange={set('name')} autoComplete="name" /></Field>
            <Field label="Mobile number" required error={err.phone}><Input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="10-digit mobile" /></Field>
            <Field label="Email" hint="Optional – for email updates"><Input type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="City" required error={err.city}><Input value={f.city} onChange={set('city')} /></Field>
            <Field label="Pincode" error={err.pincode}><Input value={f.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={6} /></Field>
            <Field label="Address / landmark"><Input value={f.address} onChange={set('address')} /></Field>
          </div>
        </Section>
        <Section title="Product">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Barcode / serial no." error={err.barcode} hint={unit ? `✓ ${products.find((p) => p.id === unit.productId)?.name}` : 'Found on the silver Btali sticker'}>
              <Input value={f.barcode} onChange={set('barcode')} className="font-mono uppercase placeholder:normal-case" placeholder="e.g. PUMP001071" />
            </Field>
            <Field label="Category"><Select value={f.cat} onChange={(e) => setF((x) => ({ ...x, cat: e.target.value, productId: '' }))} placeholder="All categories" options={CATEGORIES.filter((c) => c !== 'Spare Parts')} /></Field>
            <Field label="Product" required={!unit} error={err.productId} className="sm:col-span-2"><Select value={f.productId || unit?.productId || ''} onChange={set('productId')} placeholder="Select your product" options={prodOpts} /></Field>
          </div>
        </Section>
        <Section title="Problem">
          <div className="flex flex-wrap gap-2 mb-4">
            {ISSUES.map((i) => (
              <button key={i.value} type="button" onClick={() => setF((x) => ({ ...x, category: i.value }))} className={cx('text-sm px-3 py-1.5 rounded-full border', f.category === i.value ? 'bg-brand-500 border-brand-500 text-white' : 'border-slate-300 text-slate-600 hover:border-brand-300')}>{i.label}</button>
            ))}
          </div>
          <Field label="Describe the problem" required error={err.description}><Textarea rows={4} value={f.description} onChange={set('description')} placeholder="What happens, since when, any error sound or leakage…" /></Field>
          <div className="mt-4"><FileUpload compact accept="image/*,video/*" label="Add photos or a short video (optional)" onFiles={(a) => setFiles((x) => [...x, ...a])} /></div>
          {files.length > 0 && <div className="mt-2"><AttachmentList dense items={files} onRemove={(a) => setFiles((x) => x.filter((y) => y.id !== a.id))} /></div>}
        </Section>
        <button type="submit" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-xl"><Wrench className="w-4 h-4" />Submit service request</button>
        <p className="text-xs text-slate-500">By submitting, you agree to be contacted by Btali and its authorised service partner about this request.</p>
      </form>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5">
      <div className="text-sm font-semibold text-ink-900 mb-3">{title}</div>
      {children}
    </div>
  )
}
