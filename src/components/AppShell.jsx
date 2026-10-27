import React, { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Bell, ChevronDown, LogOut, RotateCcw, Search, X, Users, ExternalLink, CheckCheck } from 'lucide-react'
import { useStore, useUser } from '../store'
import { APPS, navFor, ROLE_LABEL, homePathFor } from '../nav'
import { cx, Avatar, Badge, confirm, toast } from './ui'
import { pendingApprovals } from '../lib/approvals'
import { timeAgo } from '../lib/format'

export const notificationVisible = (n, user) => {
  if (!user) return false
  if (n.userIds?.includes(user.id)) return true
  if (n.partnerId) return n.partnerId === user.partnerId
  if (n.vendorId) return n.vendorId === user.vendorId
  if (!n.roles?.length) return false
  if (user.role === 'ADMIN') return !n.roles.every((r) => ['VENDOR', 'DEALER', 'FRANCHISE', 'STAREX'].includes(r))
  return n.roles.includes(user.role)
}

function Logo({ app }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="text-[22px] font-black italic tracking-tighter leading-none"><span className="text-white">B</span><span className="text-brand-500">TALI</span></div>
      <div className="leading-tight border-l border-white/15 pl-2.5">
        <div className="text-[11px] font-semibold text-white/90">{app.name}</div>
        <div className="text-[10px] text-white/45">{app.tagline}</div>
      </div>
    </div>
  )
}

function Sidebar({ appKey, user, open, onClose }) {
  const app = APPS[appKey]
  const sections = navFor(appKey, user)
  const state = useStore()
  const approvals = useMemo(() => (appKey === 'erp' ? pendingApprovals(state, user).length : 0), [state, user, appKey])
  const cartCount = (state.carts?.[user?.partnerId] || []).length
  const loc = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`btali-nav-${appKey}`) || '{}') } catch { return {} }
  })
  const toggle = (label) => setCollapsed((c) => {
    const n = { ...c, [label]: !c[label] }
    try { localStorage.setItem(`btali-nav-${appKey}`, JSON.stringify(n)) } catch { /* ignore */ }
    return n
  })
  return (
    <>
      {open && <div className="fixed inset-0 bg-ink-950/50 z-40 lg:hidden" onClick={onClose} />}
      <aside className={cx('fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-ink-950 flex flex-col transition-transform lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/10 shrink-0">
          <Logo app={app} />
          <button onClick={onClose} className="lg:hidden text-white/60"><X className="w-5 h-5" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 sidebar-scroll">
          {sections.map((s) => {
            const isCollapsed = collapsed[s.label] && !s.items.some((it) => loc.pathname.startsWith(`${app.base}/${it.path}`))
            return (
              <div key={s.label} className="mb-2">
                {sections.length > 1 && (
                  <button onClick={() => toggle(s.label)} className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/40 hover:text-white/70">
                    <span className="flex items-center gap-1.5">{s.label}{s.phase === 2 && <span className="text-[9px] px-1 py-px rounded bg-brand-500/20 text-brand-300 normal-case tracking-normal">Phase 2</span>}</span>
                    <ChevronDown className={cx('w-3 h-3 transition-transform', isCollapsed && '-rotate-90')} />
                  </button>
                )}
                {!isCollapsed && s.items.map((it) => {
                  const I = it.icon
                  const badge = it.badge === 'approvals' ? approvals : it.badge === 'cart' ? cartCount : 0
                  return (
                    <NavLink key={it.path} to={`${app.base}/${it.path}`} end={!it.path.includes('/') && appKey === 'erp' && ['purchase', 'sales', 'dispatch', 'accounts', 'management', 'franchise', 'ai-calling', 'whatsapp'].includes(it.path)}
                      onClick={onClose}
                      className={({ isActive }) => cx('flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] transition-colors', isActive ? 'bg-brand-500 text-white font-medium shadow-sm' : 'text-white/65 hover:bg-white/5 hover:text-white')}>
                      <I className="w-4 h-4 shrink-0" />
                      <span className="flex-1 truncate">{it.label}</span>
                      {badge > 0 && <span className="text-[10px] font-bold bg-white/15 text-white rounded-full px-1.5 py-px">{badge}</span>}
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>
        <div className="p-3 border-t border-white/10 text-[10px] text-white/35 shrink-0">Btali International · Powered by Northstar Technologies</div>
      </aside>
    </>
  )
}

function GlobalSearch() {
  const state = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const out = []
    state.products.filter((p) => `${p.sku} ${p.name}`.toLowerCase().includes(s)).slice(0, 5).forEach((p) => out.push({ k: `p${p.id}`, group: 'Product', label: `${p.sku} – ${p.shortName}`, to: `/erp/masters/products?id=${p.id}` }))
    state.partners.filter((p) => `${p.name} ${p.city} ${p.code}`.toLowerCase().includes(s)).slice(0, 5).forEach((p) => out.push({ k: `d${p.id}`, group: p.type === 'EXPORT' ? 'Export customer' : p.type === 'FRANCHISE' ? 'Franchise' : 'Dealer', label: `${p.name} · ${p.city}`, to: `/erp/sales/dealers/${p.id}` }))
    state.salesOrders.filter((x) => x.number.toLowerCase().includes(s)).slice(0, 4).forEach((x) => out.push({ k: `s${x.id}`, group: 'Sales order', label: x.number, to: `/erp/sales/orders/${x.id}` }))
    state.purchaseOrders.filter((x) => x.number.toLowerCase().includes(s)).slice(0, 4).forEach((x) => out.push({ k: `o${x.id}`, group: 'Purchase order', label: x.number, to: `/erp/purchase/orders/${x.id}` }))
    state.invoices.filter((x) => x.number.toLowerCase().includes(s)).slice(0, 4).forEach((x) => out.push({ k: `i${x.id}`, group: 'Invoice', label: x.number, to: `/erp/dispatch/invoices?id=${x.id}` }))
    state.units.filter((u) => u.code.toLowerCase().includes(s)).slice(0, 3).forEach((u) => out.push({ k: `u${u.code}`, group: 'Barcode', label: u.code, to: `/erp/inventory/trace?code=${u.code}` }))
    state.tickets.filter((t) => `${t.number} ${t.subject}`.toLowerCase().includes(s)).slice(0, 3).forEach((t) => out.push({ k: `t${t.id}`, group: 'Ticket', label: `${t.number} – ${t.subject}`, to: `/erp/service/tickets?id=${t.id}` }))
    return out
  }, [q, state])
  return (
    <div ref={ref} className="relative hidden md:block w-full max-w-md">
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} placeholder="Search products, dealers, orders, barcodes…"
        className="w-full bg-slate-100 border border-transparent focus:bg-white focus:border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none" />
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 max-h-96 overflow-y-auto">
          {results.map((r) => (
            <button key={r.k} onClick={() => { nav(r.to); setOpen(false); setQ('') }} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 w-24 shrink-0">{r.group}</span>
              <span className="text-sm text-slate-800 truncate">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NotificationBell({ user, appBase }) {
  const notifications = useStore((s) => s.notifications)
  const markRead = useStore((s) => s.markNotificationRead)
  const markAll = useStore((s) => s.markAllNotificationsRead)
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const mine = notifications.filter((n) => notificationVisible(n, user))
  const unread = mine.filter((n) => !n.read)
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Notifications">
        <Bell className="w-5 h-5" />
        {unread.length > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[min(380px,calc(100vw-24px))] bg-white border border-slate-200 rounded-xl shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold">Notifications</span>
            {unread.length > 0 && <button onClick={() => markAll(unread.map((n) => n.id))} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" />Mark all read</button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
            {mine.length === 0 && <div className="text-sm text-slate-400 text-center py-8">You're all caught up.</div>}
            {mine.slice(0, 30).map((n) => (
              <button key={n.id} onClick={() => { markRead(n.id); setOpen(false); if (n.link) nav(n.link) }} className={cx('w-full text-left px-4 py-3 hover:bg-slate-50 flex gap-3', !n.read && 'bg-brand-50/40')}>
                <span className={cx('mt-1.5 w-2 h-2 rounded-full shrink-0', n.read ? 'bg-transparent' : n.type === 'warning' ? 'bg-amber-500' : 'bg-brand-500')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{n.body}</span>
                  <span className="block text-[11px] text-slate-400 mt-1">{timeAgo(n.ts)}</span>
                </span>
              </button>
            ))}
          </div>
          {appBase === '/erp' && <button onClick={() => { setOpen(false); nav('/erp/notifications') }} className="w-full text-center text-xs text-brand-600 py-2.5 border-t border-slate-100 hover:bg-slate-50">View all notifications & alerts</button>}
        </div>
      )}
    </div>
  )
}

function UserMenu({ user }) {
  const users = useStore((s) => s.users)
  const login = useStore((s) => s.login)
  const logout = useStore((s) => s.logout)
  const resetDemo = useStore((s) => s.resetDemo)
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && (setOpen(false), setSwitching(false))
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100">
        <Avatar name={user.name} size="sm" />
        <span className="hidden sm:block text-left leading-tight">
          <span className="block text-sm font-medium text-slate-800">{user.name}</span>
          <span className="block text-[11px] text-slate-500">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-sm font-semibold">{user.name}</div>
            <div className="text-xs text-slate-500">{user.title}</div>
            <div className="text-xs text-slate-400">{user.email}</div>
          </div>
          {!switching ? (
            <div className="py-1">
              <button onClick={() => setSwitching(true)} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50"><Users className="w-4 h-4 text-slate-400" />Switch persona</button>
              <a href="#/site/home" target="_blank" rel="noreferrer" className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50"><ExternalLink className="w-4 h-4 text-slate-400" />Open customer website</a>
              <button onClick={async () => {
                if (await confirm({ title: 'Reset demo data?', message: 'All changes made in this browser will be discarded and the original sample data restored.', confirmText: 'Reset data', tone: 'danger' })) {
                  resetDemo(); toast.success('Demo data restored'); setOpen(false)
                }
              }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50"><RotateCcw className="w-4 h-4 text-slate-400" />Reset demo data</button>
              <button onClick={() => { logout(); nav('/login') }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 text-red-600"><LogOut className="w-4 h-4" />Sign out</button>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto py-1">
              {users.map((u) => (
                <button key={u.id} onClick={() => { login(u.id); setOpen(false); setSwitching(false); nav(homePathFor(u)) }}
                  className={cx('w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-slate-50', u.id === user.id && 'bg-brand-50')}>
                  <Avatar name={u.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm text-slate-800 truncate">{u.name}</span>
                    <span className="block text-[11px] text-slate-500 truncate">{ROLE_LABEL[u.role]} · {u.title}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }) }
  render() {
    if (this.state.error) {
      return (
        <div data-error-boundary className="max-w-xl mx-auto mt-16 bg-white border border-red-200 rounded-xl p-6">
          <div className="text-base font-semibold text-red-700">Something went wrong on this screen</div>
          <pre className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{String(this.state.error?.message || this.state.error)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function AppShell({ appKey }) {
  const user = useUser()
  const app = APPS[appKey]
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  const partner = useStore((s) => s.partners.find((p) => p.id === user?.partnerId))
  const vendor = useStore((s) => s.vendors.find((v) => v.id === user?.vendorId))
  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar appKey={appKey} user={user} open={open} onClose={() => setOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center gap-3 px-3 sm:px-5">
          <button onClick={() => setOpen(true)} className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-slate-100"><Menu className="w-5 h-5" /></button>
          {appKey === 'erp' ? <GlobalSearch /> : (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink-900 truncate">{partner?.name || vendor?.name || app.name}</div>
              <div className="text-[11px] text-slate-500 truncate">{partner ? `${partner.code} · ${partner.city}` : vendor ? `${vendor.code} · ${vendor.city}, ${vendor.country}` : app.tagline}</div>
            </div>
          )}
          <div className="flex-1" />
          {appKey !== 'erp' && <Badge tone="ink" className="hidden sm:inline-flex">{app.name}</Badge>}
          <NotificationBell user={user} appBase={app.base} />
          <UserMenu user={user} />
        </header>
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          <ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
