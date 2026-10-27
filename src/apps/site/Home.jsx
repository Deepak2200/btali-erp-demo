import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShieldCheck, Wrench, Search, FileText, PhoneCall, MapPin, Store, ArrowRight, ScanLine, BadgeCheck, Truck, Headphones, Phone } from 'lucide-react'
import { useStore } from '../../store'
import { ProductImage, Badge, cx } from '../../components/ui'
import { CATEGORIES } from '../../store/seed/core'

const TILES = [
  { to: 'warranty', icon: ShieldCheck, title: 'Verify warranty', text: 'Scan or type the barcode on your product to check cover and days left.', tone: 'from-emerald-500 to-teal-600' },
  { to: 'service', icon: Wrench, title: 'Request service', text: 'Log a complaint – we route it to the nearest authorised service partner.', tone: 'from-brand-500 to-brand-700' },
  { to: 'track', icon: Search, title: 'Track request', text: 'Follow your service request from logging to closure.', tone: 'from-sky-500 to-blue-700' },
  { to: 'documents', icon: FileText, title: 'Invoice & LR copy', text: 'Dealers can download invoice and transport LR copies instantly.', tone: 'from-ink-600 to-ink-900' },
]

export default function Home() {
  const products = useStore((s) => s.products)
  const partners = useStore((s) => s.partners)
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [city, setCity] = useState('')
  const cats = CATEGORIES.map((c) => ({ c, items: products.filter((p) => p.category === c && p.active !== false) }))
  const stores = useMemo(() => partners.filter((p) => (p.type === 'DEALER' || p.type === 'FRANCHISE') && p.status === 'ACTIVE'), [partners])
  const shown = stores.filter((p) => !city.trim() || `${p.city} ${p.state} ${p.region}`.toLowerCase().includes(city.trim().toLowerCase())).sort((a, b) => (a.type === b.type ? a.city.localeCompare(b.city) : a.type === 'FRANCHISE' ? -1 : 1))
  const cities = [...new Set(stores.map((p) => p.city))]

  return (
    <div>
      {/* hero */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 80% 20%, #f2541f 0, transparent 45%), radial-gradient(circle at 10% 90%, #2f416b 0, transparent 50%)' }} />
        <div className="relative max-w-6xl mx-auto px-4 py-14 sm:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <Badge tone="brand" className="!bg-white/10 !text-white !ring-white/20">Trusted by 1,200+ dealers across India</Badge>
            <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-tight leading-[1.05]">Power that works<br /><span className="text-brand-500">as hard as you do.</span></h1>
            <p className="mt-4 text-white/70 text-base sm:text-lg max-w-lg">Pumps, air compressors, vacuum cleaners, pressure washers and sprayers – every unit barcoded, every warranty traceable, every service request tracked.</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link to="/site/service" className="inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-5 py-3 rounded-xl"><Wrench className="w-4 h-4" />Request service</Link>
              <a href="tel:18002667700" className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-3 rounded-xl"><PhoneCall className="w-4 h-4" />1800 266 7700</a>
            </div>
          </div>
          <div className="bg-white text-slate-900 rounded-2xl p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold"><ScanLine className="w-5 h-5 text-brand-500" />Quick warranty check</div>
            <p className="text-xs text-slate-500 mt-1">Enter the barcode printed on the Btali sticker (e.g. PUMP001071)</p>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) nav(`/site/warranty?code=${encodeURIComponent(code.trim().toUpperCase())}`) }}>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Barcode" className="flex-1 min-w-0 rounded-xl border border-slate-300 px-3 py-2.5 font-mono uppercase placeholder:normal-case text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
              <button className="bg-ink-900 hover:bg-ink-800 text-white px-4 rounded-xl text-sm font-semibold">Check</button>
            </form>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              {[[BadgeCheck, 'Genuine', 'barcoded units'], [Truck, 'Pan-India', 'dealer network'], [Headphones, '24 h', 'service response']].map(([I, a, b]) => (
                <div key={a} className="rounded-xl bg-slate-50 p-3"><I className="w-5 h-5 mx-auto text-brand-500" /><div className="text-sm font-bold mt-1">{a}</div><div className="text-[11px] text-slate-500">{b}</div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* self-service */}
      <section className="max-w-6xl mx-auto px-4 -mt-0 py-12">
        <h2 className="text-2xl font-bold text-ink-900">Self-service</h2>
        <p className="text-sm text-slate-500 mt-1">Everything you need, without waiting on a call.</p>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TILES.map((t) => (
            <Link key={t.to} to={`/site/${t.to}`} className="group rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all bg-white">
              <div className={cx('w-11 h-11 rounded-xl bg-gradient-to-br text-white flex items-center justify-center', t.tone)}><t.icon className="w-5 h-5" /></div>
              <div className="mt-4 font-semibold text-ink-900">{t.title}</div>
              <p className="text-sm text-slate-500 mt-1">{t.text}</p>
              <div className="mt-3 text-sm font-semibold text-brand-600 inline-flex items-center gap-1">Continue <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></div>
            </Link>
          ))}
        </div>
      </section>

      {/* categories */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-bold text-ink-900">Our range</h2>
          <p className="text-sm text-slate-500 mt-1">Built for farms, homes, workshops and industry.</p>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
            {cats.map(({ c, items }) => (
              <div key={c} className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                <ProductImage product={{ category: c }} size="xl" className="!rounded-none" />
                <div className="p-4">
                  <div className="font-semibold text-ink-900">{c}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{items.length} models</div>
                  <div className="text-xs text-slate-600 mt-2 line-clamp-2">{items.slice(0, 3).map((p) => p.shortName || p.name).join(' · ')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* toll free */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="rounded-2xl bg-gradient-to-r from-brand-500 to-brand-700 text-white p-6 sm:p-8 flex flex-col md:flex-row md:items-center gap-6 justify-between">
          <div>
            <div className="text-sm text-white/80">Customer care toll-free</div>
            <div className="text-3xl sm:text-4xl font-black tracking-tight mt-1">1800 266 7700</div>
            <div className="text-sm text-white/80 mt-1">Mon–Sat, 9:30 am – 6:30 pm · Hindi, English, Marathi, Gujarati, Tamil</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="tel:18002667700" className="inline-flex items-center justify-center gap-2 bg-white text-brand-700 font-semibold px-5 py-3 rounded-xl"><Phone className="w-4 h-4" />Call now</a>
            <Link to="/site/service" className="inline-flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 font-semibold px-5 py-3 rounded-xl">Raise request online</Link>
          </div>
        </div>
      </section>

      {/* dealer locator */}
      <section className="max-w-6xl mx-auto px-4 pb-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-ink-900">Find a dealer or Btali store</h2>
            <p className="text-sm text-slate-500 mt-1">{stores.length} authorised sales & service points in {cities.length} cities</p>
          </div>
          <div className="relative sm:w-72">
            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={city} onChange={(e) => setCity(e.target.value)} list="btali-cities" placeholder="Search city or state" className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            <datalist id="btali-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.length === 0 && <div className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No partner in “{city}” yet. Call 1800 266 7700 – our service team covers your area directly.</div>}
          {shown.slice(0, 12).map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 p-4 bg-white">
              <div className="flex items-start gap-3">
                <div className={cx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', p.type === 'FRANCHISE' ? 'bg-brand-50 text-brand-600' : 'bg-ink-50 text-ink-600')}><Store className="w-4 h-4" /></div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-ink-900">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.type === 'FRANCHISE' ? 'Btali exclusive store · Sales & service' : 'Authorised dealer'}</div>
                  <div className="text-xs text-slate-600 mt-2">{p.address}, {p.state}</div>
                  <a href={`tel:${p.phone}`} className="text-xs font-semibold text-brand-600 mt-1 inline-flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</a>
                </div>
              </div>
            </div>
          ))}
        </div>
        {shown.length > 12 && <div className="text-center text-xs text-slate-500 mt-3">Showing 12 of {shown.length} – refine by city</div>}
      </section>
    </div>
  )
}
