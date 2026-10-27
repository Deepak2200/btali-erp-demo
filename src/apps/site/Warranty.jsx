import React, { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ShieldCheck, ShieldX, ShieldAlert, Wrench, Store, Phone, Info, CalendarDays, CheckCircle2 } from 'lucide-react'
import { useStore } from '../../store'
import { ProductImage, Progress, cx } from '../../components/ui'
import { ScanInput } from '../../components/business'
import { checkWarranty } from '../../lib/warranty'
import { fmtDate } from '../../lib/format'

export function SiteHero({ title, text, icon: I }) {
  return (
    <section className="bg-ink-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-12">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center"><I className="w-5 h-5" /></div><h1 className="text-2xl sm:text-3xl font-black tracking-tight">{title}</h1></div>
        <p className="text-white/70 text-sm sm:text-base mt-3 max-w-xl">{text}</p>
      </div>
    </section>
  )
}

export default function Warranty() {
  const units = useStore((s) => s.units)
  const warranties = useStore((s) => s.warranties)
  const claims = useStore((s) => s.warrantyClaims)
  const [params, setParams] = useSearchParams()
  const code = params.get('code') || ''
  const state = useStore.getState()
  const res = useMemo(() => (code ? checkWarranty({ ...state, units, warranties, warrantyClaims: claims }, code) : null), [code, units, warranties, claims]) // eslint-disable-line
  const suggestions = useMemo(() => units.filter((u) => u.status === 'SOLD').slice(0, 30).map((u) => u.code).concat(units.filter((u) => u.status === 'AT_PARTNER').slice(0, 3).map((u) => u.code)), [units])

  return (
    <div className="bg-slate-50 min-h-full">
      <SiteHero icon={ShieldCheck} title="Verify your warranty" text="Every Btali product carries a unique barcode. Scan or type it to see your warranty status instantly." />
      <div className="max-w-3xl mx-auto px-4 -mt-6 pb-14">
        <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-4 sm:p-5">
          <div className="text-sm font-semibold text-ink-900 mb-2">Product barcode</div>
          <ScanInput onScan={(c) => setParams({ code: c })} placeholder="e.g. SPRY001007 – scan or type and press Enter" suggestions={suggestions} className="flex-wrap sm:flex-nowrap [&>div:first-child]:basis-full sm:[&>div:first-child]:basis-auto" />
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1"><Info className="w-3 h-3" />The barcode is printed on the silver Btali sticker on the product body and the carton.</div>
        </div>

        {res && !res.found && (
          <div className="mt-5 bg-white rounded-2xl border border-red-200 p-5 flex gap-3">
            <ShieldX className="w-6 h-6 text-red-500 shrink-0" />
            <div>
              <div className="font-semibold text-ink-900">We couldn’t find “{code}”</div>
              <p className="text-sm text-slate-600 mt-1">Please check the code on the sticker and try again. Products without a Btali barcode may not be genuine – call 1800 266 7700 for help.</p>
            </div>
          </div>
        )}

        {res?.found && <Result res={res} />}
      </div>
    </div>
  )
}

function Result({ res }) {
  const c = res.customer
  const reg = c.registered
  const valid = reg && c.valid
  const total = res.warranty ? Math.max(1, (new Date(res.warranty.endDate) - new Date(res.warranty.startDate)) / 86400000) : 1
  const replaced = res.unit?.status === 'REPLACED'
  return (
    <div className="mt-5 space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className={cx('px-5 py-4 flex items-center gap-3', !reg ? 'bg-amber-50' : valid ? 'bg-emerald-50' : 'bg-red-50')}>
          {!reg ? <ShieldAlert className="w-7 h-7 text-amber-600" /> : valid ? <ShieldCheck className="w-7 h-7 text-emerald-600" /> : <ShieldX className="w-7 h-7 text-red-600" />}
          <div>
            <div className={cx('text-lg font-bold', !reg ? 'text-amber-800' : valid ? 'text-emerald-800' : 'text-red-800')}>{!reg ? 'Warranty not yet registered' : valid ? 'Under warranty' : 'Warranty expired'}</div>
            <div className="text-sm text-slate-600">{reg ? (valid ? `${c.daysLeft} days remaining · valid till ${fmtDate(c.end)}` : `Expired on ${fmtDate(c.end)}`) : 'This product has not been registered against a customer purchase.'}</div>
          </div>
        </div>
        <div className="p-5">
          <div className="flex gap-4 items-center">
            <ProductImage product={res.product} size="lg" />
            <div className="min-w-0">
              <div className="font-semibold text-ink-900">{res.product?.name}</div>
              <div className="text-xs text-slate-500">{res.product?.sku} · Barcode <span className="font-mono">{res.code}</span></div>
              {res.warranty && <div className="text-xs text-slate-500 mt-0.5">Warranty card {res.warranty.number}</div>}
            </div>
          </div>
          {replaced && <div className="mt-4 text-sm rounded-xl bg-sky-50 text-sky-900 p-3">This unit was replaced under warranty{res.warranty?.replacementBarcode ? ` by barcode ${res.warranty.replacementBarcode}` : ''}. Please check the new unit’s barcode for continued cover.</div>}
          {reg && (
            <>
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[['Purchase date', fmtDate(res.warranty.saleDate)], ['Warranty period', `${res.warranty.months || res.terms.months} months`], ['Valid from', fmtDate(c.start)], ['Valid till', fmtDate(c.end)]].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-slate-500">{k}</div><div className="font-semibold text-ink-900 mt-0.5">{v}</div></div>
                ))}
              </div>
              <Progress className="mt-4" value={Math.max(0, c.daysLeft)} max={total} tone={valid ? (c.daysLeft < 30 ? 'amber' : 'green') : 'red'} />
              <div className="mt-4 text-sm text-slate-600 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-slate-400" />Registered to {res.warranty.customer?.name}{res.warranty.customer?.city ? `, ${res.warranty.customer.city}` : ''}</div>
            </>
          )}
          {res.partner && (
            <div className="mt-4 rounded-xl border border-slate-200 p-3 flex items-start gap-3">
              <Store className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-ink-900">{reg ? 'Purchased from' : 'Supplied to dealer'}: {res.partner.name}</div>
                <div className="text-slate-500 text-xs">{res.partner.address || res.partner.city}</div>
                <a href={`tel:${res.partner.phone}`} className="text-xs font-semibold text-brand-600 inline-flex items-center gap-1 mt-1"><Phone className="w-3 h-3" />{res.partner.phone}</a>
              </div>
            </div>
          )}
          {!reg && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
              <div className="font-semibold">How to activate your warranty</div>
              <ol className="list-decimal ml-5 mt-1 space-y-0.5">
                <li>Contact the dealer you purchased from{res.partner ? ` (${res.partner.name})` : ''} with your bill.</li>
                <li>The dealer registers your product barcode on the Btali partner portal.</li>
                <li>You will receive an SMS with your warranty card number.</li>
              </ol>
              <div className="mt-2">Need help? Call toll-free <b>1800 266 7700</b>.</div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="font-semibold text-ink-900">Coverage</div>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Manufacturing defects in motor, pump and electrical parts – free repair or replacement.</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Service at any authorised Btali dealer or store across India.</li>
          {res.terms.extended && <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Extended warranty available: {res.terms.extended}</li>}
        </ul>
        {res.terms.exclusions && (
          <>
            <div className="font-semibold text-ink-900 mt-4">Not covered</div>
            <p className="text-sm text-slate-600 mt-1">{res.terms.exclusions}. Physical damage, unauthorised repair and use outside rated specifications are also excluded.</p>
          </>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link to={`/site/service?code=${res.code}`} className="flex-1 inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-5 py-3 rounded-xl"><Wrench className="w-4 h-4" />Raise service request</Link>
        <a href="tel:18002667700" className="flex-1 inline-flex items-center justify-center gap-2 bg-white border border-slate-300 text-ink-900 font-semibold px-5 py-3 rounded-xl"><Phone className="w-4 h-4" />Call 1800 266 7700</a>
      </div>
    </div>
  )
}
