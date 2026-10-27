import React, { useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { Menu, X, Phone, Mail, MapPin, LogIn } from 'lucide-react'
import { cx } from '../../components/ui'
import { UIRoot } from '../../components/ui'

const LINKS = [
  ['home', 'Home'],
  ['warranty', 'Verify Warranty'],
  ['service', 'Request Service'],
  ['track', 'Track Request'],
  ['documents', 'Invoice & LR'],
]

export default function SiteLayout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <UIRoot />
      <div className="bg-ink-950 text-white/70 text-xs">
        <div className="max-w-6xl mx-auto px-4 py-1.5 flex justify-between gap-4">
          <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" />Toll-free 1800 266 7700 · Mon–Sat 9:30–18:30</span>
          <span className="hidden sm:flex items-center gap-1.5"><Mail className="w-3 h-3" />care@btali.in</span>
        </div>
      </div>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-6">
          <Link to="/site/home" className="text-2xl font-black italic tracking-tighter"><span className="text-ink-900">B</span><span className="text-brand-500">TALI</span></Link>
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {LINKS.map(([p, l]) => (
              <NavLink key={p} to={`/site/${p}`} className={({ isActive }) => cx('px-3 py-2 rounded-lg text-sm font-medium', isActive ? 'text-brand-600 bg-brand-50' : 'text-slate-600 hover:text-slate-900')}>{l}</NavLink>
            ))}
          </nav>
          <Link to="/login" className="hidden md:inline-flex items-center gap-1.5 text-sm font-medium text-white bg-ink-900 hover:bg-ink-800 px-3.5 py-2 rounded-lg"><LogIn className="w-4 h-4" />Partner login</Link>
          <button className="md:hidden ml-auto p-2" onClick={() => setOpen((o) => !o)}>{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
        </div>
        {open && (
          <nav className="md:hidden border-t border-slate-100 px-4 py-2 flex flex-col">
            {LINKS.map(([p, l]) => <NavLink key={p} onClick={() => setOpen(false)} to={`/site/${p}`} className="py-2 text-sm text-slate-700">{l}</NavLink>)}
            <Link to="/login" className="py-2 text-sm font-medium text-brand-600">Partner login</Link>
          </nav>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="bg-ink-950 text-white/60 text-sm">
        <div className="max-w-6xl mx-auto px-4 py-10 grid sm:grid-cols-3 gap-8">
          <div>
            <div className="text-2xl font-black italic tracking-tighter text-white">B<span className="text-brand-500">TALI</span></div>
            <p className="mt-2 text-xs leading-relaxed">Pumps, air compressors, vacuum cleaners, pressure washers and spraying equipment, backed by genuine spares and nationwide service.</p>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="text-white font-semibold text-sm mb-2">Customer care</div>
            <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" />1800 266 7700</div>
            <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" />care@btali.in</div>
            <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" />Turbhe MIDC, Navi Mumbai 400705</div>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="text-white font-semibold text-sm mb-2">Self-service</div>
            {LINKS.slice(1).map(([p, l]) => <Link key={p} to={`/site/${p}`} className="block hover:text-white">{l}</Link>)}
          </div>
        </div>
        <div className="border-t border-white/10 text-center text-[11px] py-3">© {new Date().getFullYear()} Btali International Pvt. Ltd.</div>
      </footer>
    </div>
  )
}
