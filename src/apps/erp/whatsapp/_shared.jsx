// Shared WhatsApp chatbot UI: chat bubbles, chat window, phone preview, metrics.
import React, { useEffect, useMemo, useRef } from 'react'
import { Check, CheckCheck, FileText, Bot, UserRound, Download } from 'lucide-react'
import { useStore } from '../../../store'
import { cx, Badge, ProductImage, openAttachment } from '../../../components/ui'
import { fmtINR, fmtSize, downloadText, fmtDateTime, daysAgo, today } from '../../../lib/format'

export const CONV_STATUS = {
  BOT: { label: 'Bot', tone: 'teal' },
  WAITING_AGENT: { label: 'Needs agent', tone: 'amber' },
  AGENT: { label: 'Agent', tone: 'blue' },
  RESOLVED: { label: 'Resolved', tone: 'gray' },
}
export const ConvBadge = ({ status }) => <Badge tone={CONV_STATUS[status]?.tone || 'gray'} dot>{CONV_STATUS[status]?.label || status}</Badge>
export const intentLabel = (i = '') => i.toLowerCase().split('_').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ')

/** Re-attach background runners (broadcasts, scheduler) whenever a WhatsApp page mounts. */
export const useWaRunners = () => {
  const resume = useStore((s) => s.aiResumeRunners)
  useEffect(() => { resume?.() }, [resume])
}

const time = (ts) => new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
const dayLabel = (ts) => {
  const d = ts.slice(0, 10)
  const local = new Date(ts).toLocaleDateString('en-CA')
  if (local === new Date().toLocaleDateString('en-CA')) return 'Today'
  if (local === new Date(Date.now() - 86400000).toLocaleDateString('en-CA')) return 'Yesterday'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
export function Ticks({ status }) {
  if (!status) return null
  if (status === 'sent') return <Check className="w-3.5 h-3.5 text-slate-400" />
  return <CheckCheck className={cx('w-3.5 h-3.5', status === 'read' ? 'text-sky-500' : 'text-slate-400')} />
}

export function Bubble({ m, onQuick, products }) {
  if (m.from === 'system') {
    return <div className="flex justify-center my-2"><span className="text-[11px] bg-white/90 text-slate-600 px-3 py-1 rounded-lg shadow-sm">{m.text}</span></div>
  }
  const mine = m.from !== 'customer'
  const product = m.productId ? products?.find((p) => p.id === m.productId) : null
  return (
    <div className={cx('flex mb-1.5', mine ? 'justify-end' : 'justify-start')}>
      <div className={cx('max-w-[85%] sm:max-w-[75%] rounded-lg shadow-sm px-2.5 pt-1.5 pb-1 text-[13px] leading-snug relative', mine ? (m.from === 'agent' ? 'bg-[#d9fdd3]' : 'bg-[#e7f6ff]') : 'bg-white')}>
        {mine && (
          <div className={cx('text-[10px] font-semibold mb-0.5 flex items-center gap-1', m.from === 'agent' ? 'text-emerald-700' : 'text-sky-700')}>
            {m.from === 'agent' ? <UserRound className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
            {m.from === 'agent' ? m.byName || 'Sales team' : 'Btali Assistant'}
            {m.intent && m.from === 'bot' && <span className="font-normal text-slate-400">· {intentLabel(m.intent)}</span>}
          </div>
        )}
        {m.kind === 'product' && product && (
          <div className="bg-white/80 border border-slate-200 rounded-md p-2 mb-1.5 flex gap-2 items-center">
            <ProductImage product={product} size="sm" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 truncate">{product.name}</div>
              <div className="text-[11px] text-slate-500">{product.sku} · MRP {fmtINR(m.mrp ?? product.mrp)}</div>
              <div className="text-xs font-bold text-emerald-700">{fmtINR(m.price ?? product.mrp)}</div>
              {m.stock && <div className={cx('text-[10px] font-medium', m.stockTone === 'red' ? 'text-red-600' : m.stockTone === 'amber' ? 'text-amber-600' : 'text-emerald-600')}>{m.stock}</div>}
            </div>
          </div>
        )}
        {m.attachment && (
          <button type="button" onClick={() => openAttachment({ ...m.attachment, docType: m.docType })} className="w-full bg-white/80 border border-slate-200 rounded-md p-2 mb-1.5 flex gap-2 items-center text-left hover:bg-white">
            <div className="w-8 h-9 rounded bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">PDF</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-800 truncate">{m.attachment.name}</div>
              <div className="text-[10px] text-slate-500">{[m.docType, fmtSize(m.attachment.size)].filter(Boolean).join(' · ')}</div>
            </div>
            <Download className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}
        {m.text && <div className="whitespace-pre-line break-words text-slate-800">{m.text.replace(/\*([^*]+)\*/g, '$1')}</div>}
        <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 mt-0.5">
          {time(m.ts)}
          {mine && <Ticks status={m.status} />}
        </div>
        {m.quick?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 pb-0.5">
            {m.quick.map((q) => (
              <button key={q} type="button" disabled={!onQuick} onClick={() => onQuick?.(q)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-sky-300 text-sky-700 bg-white hover:bg-sky-50 disabled:opacity-70 disabled:hover:bg-white">{q}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Message list with WhatsApp wallpaper, date separators and typing indicator. */
export function ChatMessages({ conv, onQuick, className }) {
  const products = useStore((s) => s.products)
  const users = useStore((s) => s.users)
  const ref = useRef(null)
  const n = conv?.messages?.length || 0
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [n, conv?.id, conv?.botTyping])
  if (!conv) return null
  let lastDay = ''
  return (
    <div ref={ref} className={cx('overflow-y-auto px-3 py-3 bg-[#efeae2]', className)}
      style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
      {conv.messages.map((m) => {
        const d = dayLabel(m.ts)
        const sep = d !== lastDay
        lastDay = d
        return (
          <React.Fragment key={m.id}>
            {sep && <div className="flex justify-center my-2"><span className="text-[10px] uppercase tracking-wide bg-white/90 text-slate-500 px-2.5 py-0.5 rounded-md shadow-sm">{d}</span></div>}
            <Bubble m={{ ...m, byName: m.by ? users.find((u) => u.id === m.by)?.name : undefined }} onQuick={onQuick} products={products} />
          </React.Fragment>
        )
      })}
      {conv.botTyping && (
        <div className="flex justify-end mb-1.5">
          <div className="bg-[#e7f6ff] rounded-lg shadow-sm px-3 py-2 flex items-center gap-1.5 text-[11px] text-sky-700">
            <Bot className="w-3 h-3" /> typing
            <span className="flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="w-1 h-1 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Phone mockup to preview an outbound template message. */
export function PhonePreview({ text, attachment, buttons = [], product }) {
  return (
    <div className="mx-auto w-[260px] rounded-[28px] border-[6px] border-ink-900 bg-ink-900 shadow-xl overflow-hidden">
      <div className="bg-[#075e54] text-white px-3 py-2 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-white text-[#075e54] text-[10px] font-black flex items-center justify-center">BT</div>
        <div><div className="text-xs font-semibold">Btali International</div><div className="text-[9px] opacity-80">Business account</div></div>
      </div>
      <div className="bg-[#efeae2] min-h-[300px] p-2.5">
        <div className="bg-white rounded-lg shadow-sm p-2 text-[12px] text-slate-800">
          {product && <div className="flex items-center gap-2 border border-slate-200 rounded p-1.5 mb-1.5"><ProductImage product={product} size="xs" /><div className="min-w-0"><div className="text-[11px] font-semibold truncate">{product.name}</div><div className="text-[10px] text-slate-500">MRP {fmtINR(product.mrp)}</div></div></div>}
          {attachment && <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded p-1.5 mb-1.5"><FileText className="w-4 h-4 text-red-500" /><span className="text-[11px] truncate">{attachment.name}</span></div>}
          <div className="whitespace-pre-line break-words">{text || 'Your message will appear here…'}</div>
          <div className="text-[9px] text-slate-400 text-right mt-1">10:00</div>
        </div>
        {buttons.filter(Boolean).map((b) => <div key={b} className="bg-white rounded-lg shadow-sm mt-1 py-1.5 text-center text-[12px] text-sky-600 font-medium">{b}</div>)}
      </div>
    </div>
  )
}

export const fillVars = (text = '', c = {}) => text.replace(/\{\{name\}\}/g, (c.name || 'Customer').split(' ')[0]).replace(/\{\{city\}\}/g, c.city || 'your city').replace(/\{\{business\}\}/g, c.business || c.name || '')

export const transcriptText = (conv, users = []) => [
  `Btali International – WhatsApp transcript`,
  `Customer: ${conv.name} (${conv.phone})${conv.city ? ` · ${conv.city}` : ''}`,
  `Status: ${CONV_STATUS[conv.status]?.label || conv.status}${conv.escalationReason ? ` · Escalation: ${conv.escalationReason}` : ''}${conv.csat ? ` · CSAT ${conv.csat}/5` : ''}`,
  '',
  ...conv.messages.map((m) => `[${fmtDateTime(m.ts)}] ${m.from === 'customer' ? conv.name : m.from === 'bot' ? 'Btali Assistant' : m.from === 'agent' ? users.find((u) => u.id === m.by)?.name || 'Agent' : 'System'}: ${m.text || ''}${m.attachment ? ` [${m.attachment.name}]` : ''}`),
].join('\n')
export const downloadTranscript = (conv, users) => downloadText(`WhatsApp-${conv.name.replace(/\W+/g, '-')}-${today()}.txt`, transcriptText(conv, users))

/** Conversation metrics used by Dashboard + Analytics. */
export const waMetrics = (convs = [], days = 14) => {
  const total = convs.length
  const hasAgent = (c) => c.messages.some((m) => m.from === 'agent')
  const resolved = convs.filter((c) => c.status === 'RESOLVED')
  const botResolved = resolved.filter((c) => !hasAgent(c))
  const handed = convs.filter((c) => c.escalationReason || hasAgent(c))
  const csats = convs.filter((c) => c.csat).map((c) => c.csat)
  const firstResp = []
  const agentResp = []
  for (const c of convs) {
    const i = c.messages.findIndex((m) => m.from === 'customer')
    if (i < 0) continue
    const r = c.messages.slice(i + 1).find((m) => m.from === 'bot' || m.from === 'agent')
    if (r) firstResp.push((new Date(r.ts) - new Date(c.messages[i].ts)) / 1000)
    const a = c.messages.find((m) => m.from === 'agent')
    const esc = c.escalatedAt || c.takeoverAt
    if (a && esc) agentResp.push(Math.max(0, (new Date(a.ts) - new Date(esc)) / 1000))
  }
  const intents = {}
  for (const c of convs) for (const m of c.messages) if (m.from === 'bot' && m.intent && !['CAMPAIGN', 'CSAT_PROMPT', 'OUTBOUND_FOLLOW_UP', 'FOLLOW_UP'].includes(m.intent)) intents[m.intent] = (intents[m.intent] || 0) + 1
  const daily = []
  for (let k = days - 1; k >= 0; k--) {
    const d = daysAgo(k)
    const msgs = convs.flatMap((c) => c.messages.filter((m) => new Date(m.ts).toLocaleDateString('en-CA') === d))
    daily.push({ label: new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), date: d, inbound: msgs.filter((m) => m.from === 'customer').length, bot: msgs.filter((m) => m.from === 'bot').length, agent: msgs.filter((m) => m.from === 'agent').length, conversations: convs.filter((c) => new Date(c.createdAt).toLocaleDateString('en-CA') === d).length })
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
  return {
    total, open: convs.filter((c) => c.status !== 'RESOLVED').length, waiting: convs.filter((c) => c.status === 'WAITING_AGENT').length,
    resolved: resolved.length, botResolved: botResolved.length,
    botResolutionRate: resolved.length ? (botResolved.length / resolved.length) * 100 : 0,
    handoverRate: total ? (handed.length / total) * 100 : 0,
    csat: avg(csats), csatCount: csats.length, csatDist: [5, 4, 3, 2, 1].map((v) => ({ name: `${v} ★`, value: csats.filter((x) => x === v).length })),
    firstResponseSec: avg(firstResp), agentResponseSec: avg(agentResp),
    intents: Object.entries(intents).map(([k, v]) => ({ label: intentLabel(k), key: k, value: v })).sort((a, b) => b.value - a.value),
    status: Object.keys(CONV_STATUS).map((k) => ({ name: CONV_STATUS[k].label, value: convs.filter((c) => c.status === k).length })).filter((x) => x.value),
    daily,
  }
}
export const fmtSecs = (s) => (s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`)

export const useCampaignTotals = () => {
  const camps = useStore((s) => s.waCampaigns) || []
  return useMemo(() => {
    const t = { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, optedOut: 0 }
    for (const c of camps) if (c.stats) for (const k of Object.keys(t)) t[k] += c.stats[k] || 0
    return t
  }, [camps])
}

