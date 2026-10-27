// Btali design system – every screen builds from these primitives.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import clsx from 'clsx'
import JsBarcode from 'jsbarcode'
import {
  X, Check, AlertTriangle, Info, CheckCircle2, XCircle, Upload, FileText, Image as ImageIcon, Film, Download, Eye, Search,
  ChevronDown, Inbox, Droplets, Wind, Sparkles, Waves, SprayCan, Cog, ArrowUpRight, ArrowDownRight, Loader2, Paperclip, Trash2,
} from 'lucide-react'
import { fmtSize, initials, titleCase, fmtDateTime, fileToAttachment, downloadText } from '../lib/format'

export const cx = clsx

// ------------------------------------------------------------------ toast + confirm (global UI store)
export const useUI = create((set, get) => ({
  toasts: [],
  confirm: null,
  prompt: null,
  pushToast: (t) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.duration || 3800)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  askConfirm: (opts) => new Promise((resolve) => set({ confirm: { ...opts, resolve } })),
  closeConfirm: (v) => {
    get().confirm?.resolve(v)
    set({ confirm: null })
  },
  askPrompt: (opts) => new Promise((resolve) => set({ prompt: { ...opts, resolve } })),
  closePrompt: (v) => {
    get().prompt?.resolve(v)
    set({ prompt: null })
  },
}))
export const toast = {
  success: (title, body) => useUI.getState().pushToast({ tone: 'success', title, body }),
  error: (title, body) => useUI.getState().pushToast({ tone: 'error', title, body, duration: 6000 }),
  info: (title, body) => useUI.getState().pushToast({ tone: 'info', title, body }),
  warn: (title, body) => useUI.getState().pushToast({ tone: 'warn', title, body, duration: 5000 }),
}
/** await confirm({title, message, confirmText, tone:'danger'}) -> boolean */
export const confirm = (opts) => useUI.getState().askConfirm(typeof opts === 'string' ? { title: opts } : opts)
/** await prompt({title, label, placeholder, required}) -> string | null */
export const prompt = (opts) => useUI.getState().askPrompt(opts)

export function UIRoot() {
  const { toasts, dismiss, confirm: c, closeConfirm, prompt: p, closePrompt } = useUI()
  const [val, setVal] = useState('')
  useEffect(() => setVal(p?.defaultValue || ''), [p])
  const icon = { success: CheckCircle2, error: XCircle, info: Info, warn: AlertTriangle }
  const color = { success: 'text-emerald-600', error: 'text-red-600', info: 'text-ink-600', warn: 'text-amber-600' }
  return (
    <>
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(380px,calc(100vw-32px))]">
        {toasts.map((t) => {
          const I = icon[t.tone] || Info
          return (
            <div key={t.id} className="bg-white border border-slate-200 shadow-lg rounded-xl p-3 flex gap-3 animate-[slidein_.2s_ease-out]">
              <I className={cx('w-5 h-5 shrink-0 mt-0.5', color[t.tone])} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">{t.title}</div>
                {t.body && <div className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">{t.body}</div>}
              </div>
              <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
          )
        })}
      </div>
      {c && (
        <Modal open onClose={() => closeConfirm(false)} title={c.title || 'Are you sure?'} size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => closeConfirm(false)}>{c.cancelText || 'Cancel'}</Button>
            <Button variant={c.tone === 'danger' ? 'danger' : 'primary'} onClick={() => closeConfirm(true)}>{c.confirmText || 'Confirm'}</Button>
          </>}>
          <p className="text-sm text-slate-600 whitespace-pre-line">{c.message}</p>
        </Modal>
      )}
      {p && (
        <Modal open onClose={() => closePrompt(null)} title={p.title} size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => closePrompt(null)}>Cancel</Button>
            <Button variant={p.tone === 'danger' ? 'danger' : 'primary'} disabled={p.required && !val.trim()} onClick={() => closePrompt(val)}>{p.confirmText || 'Submit'}</Button>
          </>}>
          {p.message && <p className="text-sm text-slate-600 mb-3">{p.message}</p>}
          <Field label={p.label || 'Remarks'}>
            {p.multiline === false ? <Input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder={p.placeholder} />
              : <Textarea autoFocus rows={3} value={val} onChange={(e) => setVal(e.target.value)} placeholder={p.placeholder} />}
          </Field>
        </Modal>
      )}
    </>
  )
}

// ------------------------------------------------------------------ buttons
const BTN = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
  dark: 'bg-ink-900 text-white hover:bg-ink-800 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  link: 'text-brand-600 hover:text-brand-700 hover:underline px-0',
}
export function Button({ variant = 'primary', size = 'md', icon: Icon, iconRight: IconR, loading, className, children, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' ? 'text-xs px-2.5 py-1.5' : size === 'lg' ? 'text-sm px-5 py-2.5' : 'text-sm px-3.5 py-2',
        variant === 'link' && '!px-0 !py-0',
        BTN[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
      {children}
      {IconR && <IconR className="w-4 h-4" />}
    </button>
  )
}
export function IconButton({ icon: Icon, title, className, tone = 'default', ...rest }) {
  return (
    <button type="button" title={title} aria-label={title} {...rest}
      className={cx('p-1.5 rounded-lg transition-colors disabled:opacity-40', tone === 'danger' ? 'text-red-500 hover:bg-red-50' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800', className)}>
      <Icon className="w-4 h-4" />
    </button>
  )
}

// ------------------------------------------------------------------ layout bits
export function PageHeader({ title, subtitle, actions, breadcrumb, children }) {
  return (
    <div className="mb-5">
      {breadcrumb && <div className="text-xs text-slate-500 mb-1">{breadcrumb}</div>}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
export function Card({ title, subtitle, actions, children, className, bodyClass, padded = true }) {
  return (
    <div className={cx('bg-white rounded-xl border border-slate-200 shadow-card', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cx(padded && 'p-4', title && padded && 'pt-2', bodyClass)}>{children}</div>
    </div>
  )
}
export function Grid({ cols = 4, children, className }) {
  const c = { 1: 'grid-cols-1', 2: 'grid-cols-1 md:grid-cols-2', 3: 'grid-cols-1 md:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4', 5: 'grid-cols-2 lg:grid-cols-5', 6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' }[cols]
  return <div className={cx('grid gap-4', c, className)}>{children}</div>
}

const TONES = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  ink: 'bg-ink-50 text-ink-700 ring-ink-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
}
export function Badge({ tone = 'gray', children, className, dot }) {
  return (
    <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', TONES[tone] || TONES.gray, className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  )
}
const STATUS_TONE = {
  DRAFT: 'gray', PENDING: 'amber', PENDING_APPROVAL: 'amber', PENDING_BOSS: 'amber', PENDING_REVIEW: 'amber', SUBMITTED: 'amber', UNDER_REVIEW: 'amber', REQUESTED: 'amber', LOGGED: 'amber', OPEN: 'amber', UNPAID: 'amber', AWAITING_VENDOR: 'amber', PROSPECT: 'amber', SCHEDULED: 'blue',
  APPROVED: 'green', ACTIVE: 'green', PAID: 'green', CONFIRMED: 'blue', COMPLETED: 'green', DONE: 'green', RESOLVED: 'green', CLOSED: 'gray', RECEIVED: 'green', DELIVERED: 'green', DISPATCHED: 'teal', MATCH: 'green', MATCHED: 'green', SENT: 'green', VALID: 'green', CURRENT: 'green', POSTED: 'green', SETTLED: 'green', SOLD: 'violet', IN_WAREHOUSE: 'green',
  REJECTED: 'red', CANCELLED: 'red', FAILED: 'red', OVERDUE: 'red', MISMATCH: 'red', EXPIRED: 'red', DEAD: 'red', INACTIVE: 'gray', SHORT: 'red', MISSING: 'red', CRITICAL: 'red', HIGH: 'red',
  IN_PROGRESS: 'blue', IN_PRODUCTION: 'blue', PI_RECEIVED: 'violet', QC_PENDING: 'amber', READY_TO_SHIP: 'teal', SHIPPED: 'blue', IN_TRANSIT: 'blue', AT_PORT: 'violet', INVOICED: 'violet', PARTIAL: 'amber', ISSUED: 'violet', VENDOR_ESCALATED: 'violet', EXTRA: 'amber', EXCESS: 'violet', MEDIUM: 'amber', LOW: 'gray',
  IN_DECISION: 'amber', AT_PARTNER: 'teal', GENERATED: 'gray', PACKED: 'blue', INVOICED_UNIT: 'violet', RUNNING: 'blue', PAUSED: 'amber', LIVE: 'green', HOT: 'red', WARM: 'amber', COLD: 'blue',
}
export function StatusBadge({ status, label, className }) {
  if (!status) return null
  return <Badge tone={STATUS_TONE[status] || 'gray'} className={className} dot>{label || titleCase(status)}</Badge>
}

export function Stat({ label, value, sub, icon: Icon, tone = 'brand', trend, onClick, className }) {
  const toneCls = { brand: 'bg-brand-50 text-brand-600', ink: 'bg-ink-50 text-ink-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', blue: 'bg-sky-50 text-sky-600', violet: 'bg-violet-50 text-violet-600' }[tone]
  return (
    <div onClick={onClick} className={cx('bg-white rounded-xl border border-slate-200 shadow-card p-4 flex gap-3 items-start', onClick && 'cursor-pointer hover:border-brand-300 transition-colors', className)}>
      {Icon && <div className={cx('p-2.5 rounded-lg shrink-0', toneCls)}><Icon className="w-5 h-5" /></div>}
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500 truncate">{label}</div>
        <div className="text-xl font-bold text-ink-900 mt-0.5 truncate">{value}</div>
        {(sub || trend != null) && (
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
            {trend != null && (
              <span className={cx('inline-flex items-center font-semibold', trend >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(trend).toFixed(1)}%
              </span>
            )}
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('flex gap-1 border-b border-slate-200 overflow-x-auto no-scrollbar', className)}>
      {tabs.map((t) => {
        const key = typeof t === 'string' ? t : t.key
        const label = typeof t === 'string' ? t : t.label
        const active = key === value
        return (
          <button key={key} type="button" onClick={() => onChange(key)}
            className={cx('px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors', active ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
            {label}
            {t.count != null && <span className={cx('ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full', active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600')}>{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
export function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
      {options.map((o) => {
        const key = typeof o === 'string' ? o : o.key
        const label = typeof o === 'string' ? o : o.label
        return (
          <button key={key} type="button" onClick={() => onChange(key)}
            className={cx('rounded-md font-medium transition-colors', size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1.5', value === key ? 'bg-white shadow-sm text-ink-900' : 'text-slate-500 hover:text-slate-800')}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ overlays
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl', full: 'max-w-[96vw]' }[size]
  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-2 sm:p-4 bg-ink-950/50 backdrop-blur-[1px] overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('bg-white rounded-2xl shadow-2xl w-full my-4 flex flex-col max-h-[calc(100vh-2rem)]', w)}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <IconButton icon={X} onClick={onClose} title="Close" />
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2 bg-slate-50/60 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  )
}
export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'max-w-2xl' }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-ink-950/40" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('bg-white h-full w-full shadow-2xl flex flex-col animate-[drawer_.2s_ease-out]', width)}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900 truncate">{title}</h2>
            {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
          </div>
          <IconButton icon={X} onClick={onClose} title="Close" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2 bg-slate-50/60">{footer}</div>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ form controls
export function Field({ label, hint, error, required, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="block text-xs font-medium text-slate-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</span>}
      {children}
      {hint && !error && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
      {error && <span className="block text-[11px] text-red-600 mt-1">{error}</span>}
    </label>
  )
}
const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:bg-slate-50 disabled:text-slate-500'
export const Input = React.forwardRef(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={cx(inputCls, className)} />
})
export function NumberInput({ value, onChange, className, ...rest }) {
  return <input type="number" {...rest} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={cx(inputCls, 'tabular-nums', className)} />
}
export function Textarea({ className, ...rest }) {
  return <textarea {...rest} className={cx(inputCls, className)} />
}
export function Select({ options = [], placeholder, className, ...rest }) {
  return (
    <div className="relative">
      <select {...rest} className={cx(inputCls, 'appearance-none pr-8', className)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o
          const l = typeof o === 'object' ? o.label : o
          return <option key={v} value={v}>{l}</option>
        })}
      </select>
      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  )
}
export function Checkbox({ label, checked, onChange, className }) {
  return (
    <label className={cx('inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none', className)}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500/30 accent-[#f2541f]" />
      {label}
    </label>
  )
}
export function Switch({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700">
      <button type="button" role="switch" aria-checked={!!checked} onClick={() => onChange(!checked)}
        className={cx('relative w-9 h-5 rounded-full transition-colors', checked ? 'bg-brand-500' : 'bg-slate-300')}>
        <span className={cx('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', checked && 'translate-x-4')} />
      </button>
      {label}
    </label>
  )
}
export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(inputCls, 'pl-9')} />
    </div>
  )
}
/** Searchable combobox. options: [{value,label,sub?}] */
export function Combobox({ options, value, onChange, placeholder = 'Select…', className, disabled }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const sel = options.find((o) => o.value === value)
  const list = useMemo(() => {
    const s = q.toLowerCase()
    return options.filter((o) => !s || `${o.label} ${o.sub || ''}`.toLowerCase().includes(s)).slice(0, 80)
  }, [options, q])
  return (
    <div ref={ref} className={cx('relative', className)}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className={cx(inputCls, 'text-left flex items-center justify-between gap-2')}>
        <span className={cx('truncate', !sel && 'text-slate-400')}>{sel ? sel.label : placeholder}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[260px] bg-white border border-slate-200 rounded-lg shadow-xl">
          <div className="p-2 border-b border-slate-100"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" className={cx(inputCls, 'py-1.5')} /></div>
          <div className="max-h-64 overflow-y-auto py-1">
            {list.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
            {list.map((o) => (
              <button type="button" key={o.value} onClick={() => { onChange(o.value); setOpen(false); setQ('') }}
                className={cx('w-full text-left px-3 py-1.5 text-sm hover:bg-brand-50', o.value === value && 'bg-brand-50')}>
                <div className="text-slate-800 truncate">{o.label}</div>
                {o.sub && <div className="text-[11px] text-slate-500 truncate">{o.sub}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
export function FormGrid({ cols = 2, children, className }) {
  return <div className={cx('grid gap-4', cols === 1 ? 'grid-cols-1' : cols === 3 ? 'grid-cols-1 md:grid-cols-3' : cols === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-2', className)}>{children}</div>
}

// ------------------------------------------------------------------ display
export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="p-3 rounded-full bg-slate-100 text-slate-400 mb-3"><Icon className="w-6 h-6" /></div>
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      {message && <div className="text-sm text-slate-500 mt-1 max-w-sm">{message}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
export function DescriptionList({ items, cols = 2 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3', cols === 1 ? 'grid-cols-1' : cols === 3 ? 'grid-cols-2 md:grid-cols-3' : cols === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2')}>
      {items.filter(Boolean).map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wide font-medium text-slate-400">{k}</dt>
          <dd className="text-sm text-slate-800 mt-0.5 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
export function Timeline({ items }) {
  if (!items?.length) return <div className="text-sm text-slate-400">No activity yet.</div>
  return (
    <ol className="relative border-l border-slate-200 ml-2 space-y-4">
      {items.map((it, i) => (
        <li key={i} className="ml-4">
          <span className={cx('absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full border-2 border-white', it.tone === 'red' ? 'bg-red-500' : it.tone === 'green' ? 'bg-emerald-500' : 'bg-brand-500')} />
          <div className="text-sm text-slate-800">{it.text || it.event}</div>
          <div className="text-[11px] text-slate-400">{fmtDateTime(it.ts)}{it.by ? ` · ${it.by}` : ''}{it.ref ? ` · ${it.ref}` : ''}</div>
        </li>
      ))}
    </ol>
  )
}
/** Horizontal status stepper. steps: [{key,label}], current key; done = index < current */
export function Stepper({ steps, current, className }) {
  const idx = steps.findIndex((s) => s.key === current)
  return (
    <div className={cx('flex items-center gap-1 overflow-x-auto no-scrollbar py-1', className)}>
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cx('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold', i < idx ? 'bg-emerald-500 text-white' : i === idx ? 'bg-brand-500 text-white ring-4 ring-brand-100' : 'bg-slate-200 text-slate-500')}>
              {i < idx ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </span>
            <span className={cx('text-xs font-medium whitespace-nowrap', i <= idx ? 'text-slate-800' : 'text-slate-400')}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className={cx('h-0.5 min-w-[16px] flex-1', i < idx ? 'bg-emerald-400' : 'bg-slate-200')} />}
        </React.Fragment>
      ))}
    </div>
  )
}
export function Progress({ value, max = 100, tone = 'brand', className, showLabel }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100))
  const c = { brand: 'bg-brand-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', ink: 'bg-ink-600', blue: 'bg-sky-500' }[tone]
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={cx('h-full rounded-full transition-all', c)} style={{ width: `${pct}%` }} /></div>
      {showLabel && <span className="text-xs tabular-nums text-slate-600 w-10 text-right">{pct.toFixed(0)}%</span>}
    </div>
  )
}
export function Avatar({ name, size = 'md', className }) {
  const s = size === 'sm' ? 'w-7 h-7 text-[11px]' : size === 'lg' ? 'w-11 h-11 text-sm' : 'w-9 h-9 text-xs'
  const hue = [...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6
  const bg = ['bg-brand-100 text-brand-700', 'bg-ink-100 text-ink-700', 'bg-emerald-100 text-emerald-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-800'][hue]
  return <div className={cx('rounded-full flex items-center justify-center font-semibold shrink-0', s, bg, className)}>{initials(name)}</div>
}
export function KV({ label, value, className }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 text-sm py-1.5', className)}>
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900 text-right">{value}</span>
    </div>
  )
}
export function Alert({ tone = 'info', title, children, className, action }) {
  const map = {
    info: ['bg-sky-50 border-sky-200 text-sky-900', Info],
    warn: ['bg-amber-50 border-amber-200 text-amber-900', AlertTriangle],
    error: ['bg-red-50 border-red-200 text-red-900', XCircle],
    success: ['bg-emerald-50 border-emerald-200 text-emerald-900', CheckCircle2],
  }
  const [cls, I] = map[tone]
  return (
    <div className={cx('border rounded-xl p-3 flex gap-3 items-start', cls, className)}>
      <I className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

// ------------------------------------------------------------------ product visuals
const CAT_VIS = {
  Pumps: [Droplets, 'from-sky-500 to-blue-700'],
  'Air Compressors': [Wind, 'from-amber-400 to-orange-600'],
  'Vacuum Cleaners': [Sparkles, 'from-slate-500 to-slate-800'],
  'Pressure Washers': [Waves, 'from-brand-400 to-brand-700'],
  'Spraying Equipment': [SprayCan, 'from-emerald-500 to-green-700'],
  'Spare Parts': [Cog, 'from-zinc-400 to-zinc-700'],
}
export function ProductImage({ product, size = 'md', className }) {
  const [I, grad] = CAT_VIS[product?.category] || [Cog, 'from-slate-400 to-slate-600']
  const s = { xs: 'w-8 h-8', sm: 'w-10 h-10', md: 'w-14 h-14', lg: 'w-24 h-24', xl: 'w-full aspect-[4/3]' }[size]
  const is = { xs: 'w-4 h-4', sm: 'w-5 h-5', md: 'w-7 h-7', lg: 'w-11 h-11', xl: 'w-16 h-16' }[size]
  return (
    <div className={cx('rounded-lg bg-gradient-to-br flex items-center justify-center text-white shrink-0 relative overflow-hidden', grad, s, className)}>
      <I className={is} strokeWidth={1.6} />
      {size === 'xl' && <span className="absolute bottom-2 right-3 text-white/90 font-black italic tracking-tight text-lg">BTALI</span>}
    </div>
  )
}

/** Renders a CODE128 barcode as SVG */
export function Barcode({ value, height = 40, width = 1.4, fontSize = 12, displayValue = true, className }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && value) {
      try { JsBarcode(ref.current, value, { format: 'CODE128', height, width, fontSize, margin: 4, displayValue, background: 'transparent' }) } catch { /* ignore */ }
    }
  }, [value, height, width, fontSize, displayValue])
  return <svg ref={ref} className={className} />
}

// ------------------------------------------------------------------ files
const fileIcon = (t = '', name = '') => (t.startsWith('image') || /\.(png|jpe?g|gif|webp)$/i.test(name) ? ImageIcon : t.startsWith('video') || /\.(mp4|mov)$/i.test(name) ? Film : FileText)
/** Dropzone. onFiles receives attachment objects. */
export function FileUpload({ onFiles, accept, multiple = true, label = 'Drop files here or click to upload', hint, compact }) {
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef(null)
  const handle = async (list) => {
    if (!list?.length) return
    setBusy(true)
    const atts = await Promise.all([...list].map((f) => fileToAttachment(f)))
    setBusy(false)
    onFiles(multiple ? atts : [atts[0]])
  }
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files) }}
      onClick={() => input.current?.click()}
      className={cx('border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors', compact ? 'p-3' : 'p-6', drag ? 'border-brand-400 bg-brand-50' : 'border-slate-300 hover:border-brand-300 hover:bg-slate-50')}
    >
      <input ref={input} type="file" className="hidden" accept={accept} multiple={multiple} onChange={(e) => { handle(e.target.files); e.target.value = '' }} />
      {busy ? <Loader2 className="w-5 h-5 mx-auto animate-spin text-brand-500" /> : <Upload className={cx('mx-auto text-slate-400', compact ? 'w-4 h-4' : 'w-6 h-6')} />}
      <div className={cx('text-slate-600 mt-1', compact ? 'text-xs' : 'text-sm')}>{label}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  )
}
/** Opens / downloads an attachment. Generated (url-less) files download a placeholder document. */
export const openAttachment = (a) => {
  if (a?.url) {
    const w = window.open()
    if (w) {
      if (a.type?.startsWith('image')) w.document.write(`<title>${a.name}</title><img src="${a.url}" style="max-width:100%"/>`)
      else if (a.type?.startsWith('video')) w.document.write(`<title>${a.name}</title><video src="${a.url}" controls style="max-width:100%"></video>`)
      else w.location.href = a.url
    }
    return
  }
  downloadText(a?.name?.replace(/\.(pdf|png|jpg|jpeg|mp4|xlsx)$/i, '') + '.txt', `Btali International – document\n\nFile: ${a?.name}\nType: ${a?.docType || a?.type || 'document'}\nUploaded: ${a?.uploadedAt || ''}\n\n(System-generated demo document)`)
}
export function AttachmentList({ items = [], onRemove, empty = 'No files attached.', dense }) {
  if (!items.length) return <div className="text-sm text-slate-400">{empty}</div>
  return (
    <ul className={cx('divide-y divide-slate-100 border border-slate-200 rounded-lg', dense && 'text-xs')}>
      {items.map((a) => {
        const I = fileIcon(a.type, a.name)
        return (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2">
            {a.url && a.type?.startsWith('image') ? <img src={a.url} alt="" className="w-8 h-8 rounded object-cover" /> : <I className="w-4 h-4 text-slate-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-800 truncate">{a.name}</div>
              <div className="text-[11px] text-slate-400">{[a.docType, fmtSize(a.size), a.uploadedAt && fmtDateTime(a.uploadedAt)].filter(Boolean).join(' · ')}</div>
            </div>
            <IconButton icon={Eye} title="Open" onClick={() => openAttachment(a)} />
            {onRemove && <IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => onRemove(a)} />}
          </li>
        )
      })}
    </ul>
  )
}
export function MediaGrid({ items = [], renderActions }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((m) => {
        const a = m.file || m
        const isImg = a.type?.startsWith('image') || /\.(png|jpe?g)$/i.test(a.name)
        const isVid = a.type?.startsWith('video') || /\.(mp4|mov)$/i.test(a.name)
        return (
          <div key={m.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <button type="button" onClick={() => openAttachment(a)} className="block w-full aspect-video bg-slate-100 relative">
              {a.url && isImg ? <img src={a.url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1">{isVid ? <Film className="w-7 h-7" /> : isImg ? <ImageIcon className="w-7 h-7" /> : <Paperclip className="w-7 h-7" />}<span className="text-[10px] px-2 truncate max-w-full">{a.name}</span></div>}
            </button>
            <div className="p-2">
              <div className="text-xs text-slate-700 line-clamp-2 min-h-[2rem]">{m.caption || a.name}</div>
              {renderActions && <div className="mt-2 flex items-center gap-1.5 flex-wrap">{renderActions(m)}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Kanban board. columns: [{key,label,tone}], items, getColumn(item), onMove(item, toKey), renderCard(item) */
export function Kanban({ columns, items, getColumn, onMove, renderCard, className }) {
  const [over, setOver] = useState(null)
  return (
    <div className={cx('flex gap-3 overflow-x-auto pb-2', className)}>
      {columns.map((col) => {
        const list = items.filter((i) => getColumn(i) === col.key)
        return (
          <div key={col.key}
            onDragOver={(e) => { e.preventDefault(); setOver(col.key) }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault(); setOver(null)
              const id = e.dataTransfer.getData('text/plain')
              const it = items.find((x) => String(x.id) === id)
              if (it && getColumn(it) !== col.key) onMove?.(it, col.key)
            }}
            className={cx('w-72 shrink-0 bg-slate-100/70 rounded-xl p-2 flex flex-col max-h-[70vh]', over === col.key && 'ring-2 ring-brand-300 bg-brand-50/50')}>
            <div className="flex items-center justify-between px-1.5 py-1 mb-1">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{col.label}</span>
              <Badge tone={col.tone || 'gray'}>{list.length}</Badge>
            </div>
            <div className="space-y-2 overflow-y-auto flex-1 pr-0.5">
              {list.map((it) => (
                <div key={it.id} draggable={!!onMove} onDragStart={(e) => e.dataTransfer.setData('text/plain', String(it.id))}
                  className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
                  {renderCard(it)}
                </div>
              ))}
              {list.length === 0 && <div className="text-xs text-slate-400 text-center py-6">Drop here</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Spinner({ className }) {
  return <Loader2 className={cx('w-5 h-5 animate-spin text-brand-500', className)} />
}
export function SectionTitle({ children, actions, className }) {
  return (
    <div className={cx('flex items-center justify-between mb-2 mt-1', className)}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</h4>
      {actions}
    </div>
  )
}
export { Download }
