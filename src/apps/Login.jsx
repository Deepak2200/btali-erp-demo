import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, User, ArrowRight, ShieldCheck, Factory, Store, Warehouse, Building2, Globe2 } from 'lucide-react'
import { useStore } from '../store'
import { homePathFor, ROLE_LABEL } from '../nav'
import { Avatar, Button, Input, Field, Alert, cx } from '../components/ui'

const GROUPS = [
  { label: 'Btali team (ERP)', icon: Building2, roles: ['ADMIN', 'FINANCE_HEAD', 'PURCHASE', 'SALES_MANAGER', 'SALES_EXEC', 'DISPATCH', 'ACCOUNTS', 'HR', 'SERVICE'] },
  { label: 'Vendor Portal', icon: Factory, roles: ['VENDOR'] },
  { label: 'Dealer & Franchise', icon: Store, roles: ['DEALER', 'FRANCHISE'] },
  { label: 'Btali Warehouse', icon: Warehouse, roles: ['BTALI'] },
]

export default function Login() {
  const users = useStore((s) => s.users)
  const login = useStore((s) => s.login)
  const nav = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const go = (u) => { login(u.id); nav(homePathFor(u)) }
  const submit = (e) => {
    e.preventDefault()
    const u = users.find((x) => x.username === username.trim().toLowerCase() || x.email === username.trim().toLowerCase())
    if (!u || password !== 'demo123') return setErr('Invalid username or password. Use any listed user with password demo123.')
    go(u)
  }
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-white">
      <div className="relative hidden lg:flex flex-col justify-between p-10 bg-ink-950 text-white overflow-hidden">
        <div className="absolute -right-32 -top-32 w-[520px] h-[520px] rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -left-20 bottom-0 w-[400px] h-[400px] rounded-full bg-ink-600/40 blur-3xl" />
        <div className="relative">
          <div className="text-4xl font-black italic tracking-tighter"><span>B</span><span className="text-brand-500">TALI</span><sup className="text-sm not-italic font-normal ml-1">®</sup></div>
          <div className="text-white/60 text-sm mt-1">Btali International · Connected ERP Platform</div>
        </div>
        <div className="relative space-y-6 max-w-lg">
          <h1 className="text-4xl font-bold leading-tight">One platform from the factory floor in China to the dealer's counter.</h1>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Procurement & imports', 'PO → PI → QC → container → landed cost'],
              ['Dealer & franchise sales', 'Live stock, schemes, portal ordering, POS'],
              ['Dispatch & Btali', 'Invoice stock-check, LR, reconciliation'],
              ['Warranty & service', 'Barcode-driven warranty and ticketing'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="font-semibold">{t}</div>
                <div className="text-white/55 text-xs mt-1">{d}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-white/40">Powered by Northstar Technologies</div>
      </div>

      <div className="flex flex-col justify-center p-6 sm:p-10 overflow-y-auto">
        <div className="w-full max-w-xl mx-auto">
          <div className="lg:hidden text-3xl font-black italic tracking-tighter mb-6"><span className="text-ink-900">B</span><span className="text-brand-500">TALI</span></div>
          <h2 className="text-2xl font-bold text-ink-900">Sign in</h2>
          <p className="text-sm text-slate-500 mt-1">Use your Btali credentials, or pick a user below to sign in instantly.</p>
          <form onSubmit={submit} className="mt-6 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Field label="Username or email">
              <div className="relative"><User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><Input className="pl-9" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. arjun" /></div>
            </Field>
            <Field label="Password">
              <div className="relative"><Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><Input className="pl-9" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="demo123" /></div>
            </Field>
            <Button type="submit" iconRight={ArrowRight} onClick={submit}>Sign in</Button>
          </form>
          {err && <Alert tone="error" className="mt-3">{err}</Alert>}

          <div className="mt-8 space-y-5">
            {GROUPS.map((g) => {
              const list = users.filter((u) => g.roles.includes(u.role))
              const I = g.icon
              return (
                <div key={g.label}>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2"><I className="w-3.5 h-3.5" />{g.label}</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {list.map((u) => (
                      <button key={u.id} onClick={() => go(u)} className={cx('flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 text-left transition-colors group')}>
                        <Avatar name={u.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-800 truncate">{u.name}</span>
                          <span className="block text-[11px] text-slate-500 truncate">{u.title}</span>
                        </span>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2"><Globe2 className="w-3.5 h-3.5" />Customers (no login)</div>
              <button onClick={() => nav('/site/home')} className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 text-left">
                <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><ShieldCheck className="w-4 h-4" /></span>
                <span className="flex-1"><span className="block text-sm font-semibold text-slate-800">btali.in customer pages</span><span className="block text-[11px] text-slate-500">Warranty verification · service request · ticket tracking · invoice download</span></span>
                <ArrowRight className="w-4 h-4 text-slate-300" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
