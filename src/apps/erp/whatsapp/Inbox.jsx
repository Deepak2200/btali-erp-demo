import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bot, CheckCircle2, FileText, Hand, MessageSquarePlus, Package, Paperclip, Send, Sparkles, UserRound, Zap, Download, Ticket } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import { Button, IconButton, PageHeader, Badge, Avatar, SearchInput, Segmented, Modal, Field, Input, Combobox, Select, toast, confirm, cx, Alert, KV, Tabs } from '../../../components/ui'
import { fmtINR, fmtDate, timeAgo } from '../../../lib/format'
import { quotePrice } from '../../../lib/pricing'
import { stockLabel } from '../../../store/slices/ai'
import { ChatMessages, ConvBadge, useWaRunners, downloadTranscript, intentLabel } from './_shared'

const AGENT_QUICK = [
  'Namaste! Main Btali sales team se baat kar raha/rahi hoon. Kaise madad karun?',
  'Sure, I am checking this with our warehouse and will update you in 10 minutes.',
  'Your order has been dispatched. LR copy is attached for your reference.',
  'Please share your GST number and shop address so we can complete your dealer registration.',
  'Payment received, thank you! Dispatch will happen today.',
  'Our service engineer will call you within 24 hours.',
]

export default function Inbox() {
  useWaRunners()
  const user = useUser()
  const convs = useStore((s) => s.waConversations) || []
  const contacts = useStore((s) => s.waContacts) || []
  const users = useStore((s) => s.users)
  const partners = useStore((s) => s.partners)
  const salesOrders = useStore((s) => s.salesOrders)
  const warranties = useStore((s) => s.warranties)
  const tickets = useStore((s) => s.tickets)
  const sendMessage = useStore((s) => s.waSendMessage)
  const setTakeover = useStore((s) => s.waSetTakeover)
  const resolve = useStore((s) => s.waResolveConversation)
  const markRead = useStore((s) => s.waMarkRead)
  const startConv = useStore((s) => s.waStartConversation)
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState('ALL')
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const [modal, setModal] = useState(null)
  const selId = params.get('c') || null
  const conv = convs.find((c) => c.id === selId) || null

  useEffect(() => { if (conv?.unread) markRead(conv.id) }, [conv?.id, conv?.unread]) // eslint-disable-line
  useEffect(() => {
    if (!selId && convs.length && window.innerWidth >= 1024) setParams({ c: [...convs].sort((a, b) => b.lastAt.localeCompare(a.lastAt))[0].id }, { replace: true })
  }, []) // eslint-disable-line

  const counts = useMemo(() => ({
    ALL: convs.length, BOT: convs.filter((c) => c.status === 'BOT').length, WAITING_AGENT: convs.filter((c) => c.status === 'WAITING_AGENT').length,
    AGENT: convs.filter((c) => c.status === 'AGENT').length, RESOLVED: convs.filter((c) => c.status === 'RESOLVED').length,
  }), [convs])
  const list = useMemo(() => {
    const s = q.toLowerCase()
    return [...convs]
      .filter((c) => filter === 'ALL' || c.status === filter)
      .filter((c) => !s || `${c.name} ${c.phone} ${c.city}`.toLowerCase().includes(s) || c.messages.some((m) => (m.text || '').toLowerCase().includes(s)))
      .sort((a, b) => (b.status === 'WAITING_AGENT') - (a.status === 'WAITING_AGENT') || b.lastAt.localeCompare(a.lastAt))
  }, [convs, filter, q])

  const select = (id) => { setParams({ c: id }); setText('') }
  const agentMode = !!conv?.takeover
  const send = (t = text) => {
    const v = String(t).trim()
    if (!v || !conv) return
    sendMessage(conv.id, { from: agentMode ? 'agent' : 'customer', text: v })
    setText('')
  }
  const toggleTakeover = () => {
    setTakeover(conv.id, !conv.takeover)
    toast.success(conv.takeover ? 'Chat handed back to Btali Assistant' : 'You are now chatting as agent', conv.takeover ? 'The bot will answer the next customer message.' : 'The bot is paused for this conversation.')
  }
  const doResolve = async () => {
    if (!(await confirm({ title: 'Mark conversation resolved?', message: 'The customer will receive a feedback (CSAT) prompt.', confirmText: 'Resolve' }))) return
    resolve(conv.id)
    toast.success('Conversation resolved', 'CSAT prompt sent to customer')
  }

  // test hints for the selected conversation
  const hints = useMemo(() => {
    if (!conv) return []
    const cur = salesOrders.filter((s) => s.number.includes('26-27') && s.status !== 'CANCELLED')
    const so = (conv.partnerId && cur.find((s) => s.partnerId === conv.partnerId)) || (!conv.partnerId && cur[0]) || null
    const w = (conv.partnerId && warranties.find((x) => x.partnerId === conv.partnerId)) || warranties[0]
    return ['Hi', 'Price of BT-PW22', 'Battery sprayer stock?', so && `${so.number} status`, w && `Warranty ${w.barcode}`, 'Motor not working, leakage', 'Dealership chahiye', 'Talk to executive'].filter(Boolean)
  }, [conv?.id, conv?.partnerId]) // eslint-disable-line

  const partner = conv?.partnerId ? partners.find((p) => p.id === conv.partnerId) : null
  const contact = conv?.contactId ? contacts.find((c) => c.id === conv.contactId) : contacts.find((c) => c.phone === conv?.phone)

  return (
    <div>
      <PageHeader title="Live Conversations" subtitle="WhatsApp Business · +91 98200 11000 · Btali Assistant answers 24×7, agents take over when needed"
        actions={<Button icon={MessageSquarePlus} onClick={() => setModal('new')}>New chat</Button>} />
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden flex h-[calc(100dvh-250px)] sm:h-[calc(100vh-190px)] min-h-[440px] sm:min-h-[560px]">
        {/* list */}
        <div className={cx('w-full lg:w-80 xl:w-[340px] border-r border-slate-200 flex-col shrink-0', conv ? 'hidden lg:flex' : 'flex')}>
          <div className="p-3 space-y-2 border-b border-slate-100">
            <SearchInput value={q} onChange={setQ} placeholder="Search name, phone, message…" />
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {[['ALL', 'All'], ['WAITING_AGENT', 'Needs agent'], ['BOT', 'Bot'], ['AGENT', 'Agent'], ['RESOLVED', 'Resolved']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setFilter(k)}
                  className={cx('text-xs px-2.5 py-1 rounded-full whitespace-nowrap border', filter === k ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                  {l} <span className="opacity-75">{counts[k]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {list.length === 0 && <div className="text-sm text-slate-400 text-center py-10">No conversations</div>}
            {list.map((c) => {
              const last = c.messages[c.messages.length - 1]
              return (
                <button key={c.id} type="button" onClick={() => select(c.id)} className={cx('w-full text-left px-3 py-2.5 flex gap-2.5 hover:bg-slate-50', c.id === selId && 'bg-emerald-50/70')}>
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800 truncate">{c.name}</span>
                      <span className={cx('text-[10px] shrink-0', c.unread ? 'text-emerald-600 font-semibold' : 'text-slate-400')}>{timeAgo(c.lastAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-slate-500 truncate">{c.botTyping ? <span className="text-emerald-600">typing…</span> : `${last?.from === 'customer' ? '' : last?.from === 'agent' ? 'You: ' : last?.from === 'bot' ? 'Bot: ' : ''}${last?.text || last?.attachment?.name || ''}`}</span>
                      {c.unread > 0 && <span className="bg-emerald-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">{c.unread}</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5"><ConvBadge status={c.status} />{c.partnerId && <Badge tone="ink">Dealer</Badge>}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* chat */}
        {conv ? (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="bg-[#075e54] text-white px-3 py-2 flex items-center gap-2">
              <button type="button" className="lg:hidden p-1 -ml-1" onClick={() => setParams({})}><ArrowLeft className="w-5 h-5" /></button>
              <Avatar name={conv.name} size="sm" className="ring-2 ring-white/30" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{conv.name}</div>
                <div className="text-[11px] opacity-80 truncate">{conv.phone}{conv.city ? ` · ${conv.city}` : ''} · {conv.takeover ? `Agent: ${users.find((u) => u.id === conv.agentId)?.name || 'you'}` : conv.status === 'RESOLVED' ? 'Resolved' : 'Btali Assistant active'}</div>
              </div>
              <div className="flex items-center gap-1.5">
                {conv.status !== 'RESOLVED' && (
                  <button type="button" onClick={toggleTakeover} className={cx('text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1', conv.takeover ? 'bg-white/15 hover:bg-white/25' : 'bg-white text-[#075e54] hover:bg-emerald-50')}>
                    {conv.takeover ? <><Bot className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Hand back to bot</span></> : <><Hand className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Take over</span></>}
                  </button>
                )}
                {conv.status !== 'RESOLVED' && <button type="button" title="Resolve" onClick={doResolve} className="p-1.5 rounded-lg hover:bg-white/15"><CheckCircle2 className="w-4 h-4" /></button>}
                <button type="button" title="Download transcript" onClick={() => downloadTranscript(conv, users)} className="p-1.5 rounded-lg hover:bg-white/15"><Download className="w-4 h-4" /></button>
              </div>
            </div>
            {conv.status === 'WAITING_AGENT' && !conv.takeover && (
              <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                <Hand className="w-4 h-4 shrink-0" /><span className="flex-1"><b>Handover requested</b> – {conv.escalationReason}</span>
                <Button size="sm" variant="success" onClick={toggleTakeover}>Take over</Button>
              </div>
            )}
            <ChatMessages conv={conv} onQuick={agentMode ? undefined : (qr) => send(qr)} className="flex-1" />
            {/* composer */}
            <div className="border-t border-slate-200 bg-[#f0f2f5] p-2 space-y-2">
              {agentMode ? (
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-1" />
                  {AGENT_QUICK.map((t) => <button key={t} type="button" onClick={() => setText(t)} className="text-[11px] px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-600 whitespace-nowrap hover:border-emerald-400">{t.length > 42 ? `${t.slice(0, 40)}…` : t}</button>)}
                </div>
              ) : (
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar items-center">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 shrink-0">Try</span>
                  {hints.map((t) => <button key={t} type="button" onClick={() => send(t)} className="text-[11px] px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-600 whitespace-nowrap hover:border-sky-400">{t}</button>)}
                </div>
              )}
              <div className="flex items-end gap-1.5">
                {agentMode && (
                  <div className="flex">
                    <IconButton icon={Package} title="Send product card" onClick={() => setModal('product')} />
                    <IconButton icon={Paperclip} title="Send invoice / LR / brochure" onClick={() => setModal('doc')} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className={cx('text-[10px] font-semibold mb-0.5 px-1 flex items-center gap-1', agentMode ? 'text-emerald-700' : 'text-sky-700')}>
                    {agentMode ? <><UserRound className="w-3 h-3" /> Replying as agent ({user?.name})</> : <><Sparkles className="w-3 h-3" /> Typing as customer – Btali Assistant will reply</>}
                  </div>
                  <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder={agentMode ? 'Type a reply to the customer…' : 'Type a customer message to test the bot…'}
                    className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500" />
                </div>
                <button type="button" onClick={() => send()} disabled={!text.trim()} className={cx('w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-50', agentMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-sky-600 hover:bg-sky-700')}><Send className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center bg-[#f0f2f5] text-center p-8">
            <div><div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3"><Bot className="w-8 h-8" /></div><div className="font-semibold text-slate-700">Select a conversation</div><div className="text-sm text-slate-500 mt-1">Pick a chat on the left or start a new one to test Btali Assistant.</div></div>
          </div>
        )}

        {/* profile */}
        {conv && (
          <div className="hidden xl:block w-72 border-l border-slate-200 overflow-y-auto p-4 shrink-0">
            <div className="text-center">
              <Avatar name={conv.name} size="lg" className="mx-auto" />
              <div className="font-semibold text-slate-800 mt-2">{conv.name}</div>
              <div className="text-xs text-slate-500">{conv.phone}</div>
              <div className="mt-2 flex justify-center gap-1.5 flex-wrap"><ConvBadge status={conv.status} />{contact?.optOut && <Badge tone="red">Opted out</Badge>}{conv.csat && <Badge tone="amber">CSAT {conv.csat}/5</Badge>}</div>
            </div>
            <div className="mt-4 text-sm divide-y divide-slate-100">
              <KV label="City" value={conv.city || '—'} />
              <KV label="Language" value={conv.language || '—'} />
              <KV label="Type" value={contact?.type ? contact.type.replace('_', ' ').toLowerCase() : '—'} />
              <KV label="Last intent" value={conv.lastIntent ? intentLabel(conv.lastIntent) : '—'} />
              {conv.escalationReason && <KV label="Escalation" value={<span className="text-amber-700 text-xs">{conv.escalationReason}</span>} />}
            </div>
            {partner && (
              <div className="mt-4">
                <div className="text-[11px] uppercase font-semibold text-slate-400 mb-1">Linked dealer</div>
                <div className="text-sm font-medium text-slate-800">{partner.name}</div>
                <div className="text-xs text-slate-500">{partner.code} · {partner.city} · Tier {partner.tier}</div>
                <div className="mt-2 space-y-1">
                  {salesOrders.filter((s) => s.partnerId === partner.id).slice(0, 4).map((s) => (
                    <div key={s.id} className="flex justify-between text-xs"><span className="text-slate-600">{s.number}</span><span className="text-slate-500">{fmtINR(s.total)} · {s.status.toLowerCase().replace('_', ' ')}</span></div>
                  ))}
                </div>
              </div>
            )}
            {(conv.ticketIds || []).length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase font-semibold text-slate-400 mb-1">Service tickets</div>
                {conv.ticketIds.map((id) => { const t = tickets.find((x) => x.id === id); return t && <div key={id} className="text-xs flex items-center gap-1.5 py-0.5"><Ticket className="w-3 h-3 text-slate-400" />{t.number} · <span className="text-slate-500 truncate">{t.stage.toLowerCase().replace('_', ' ')}</span></div> })}
              </div>
            )}
            {(conv.tags || []).length > 0 && <div className="mt-4 flex gap-1 flex-wrap">{conv.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
          </div>
        )}
      </div>

      {modal === 'new' && <NewChatModal contacts={contacts} onClose={() => setModal(null)} onStart={(data) => { const c = startConv(data); setModal(null); select(c.id); toast.success('Conversation opened', 'Type as the customer to test the bot') }} />}
      {modal === 'product' && conv && <ProductCardModal conv={conv} onClose={() => setModal(null)} />}
      {modal === 'doc' && conv && <DocModal conv={conv} onClose={() => setModal(null)} />}
    </div>
  )
}

function NewChatModal({ contacts, onClose, onStart }) {
  const [tab, setTab] = useState('contact')
  const [cid, setCid] = useState('')
  const [f, setF] = useState({ name: '', phone: '', city: '' })
  const ok = tab === 'contact' ? !!cid : f.name.trim() && f.phone.replace(/\D/g, '').length >= 10
  return (
    <Modal open onClose={onClose} title="Start a WhatsApp conversation" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!ok} onClick={() => onStart(tab === 'contact' ? { contactId: cid } : f)}>Open chat</Button></>}>
      <Tabs tabs={[{ key: 'contact', label: 'Existing contact' }, { key: 'new', label: 'New number' }]} value={tab} onChange={setTab} className="mb-4" />
      {tab === 'contact' ? (
        <Field label="Contact" required><Combobox value={cid} onChange={setCid} options={contacts.map((c) => ({ value: c.id, label: c.name, sub: `${c.phone} · ${c.city}${c.business ? ` · ${c.business}` : ''}` }))} placeholder="Search contacts…" /></Field>
      ) : (
        <div className="space-y-3">
          <Field label="Customer name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="WhatsApp number" required hint="10-digit Indian mobile"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="98xxxxxxxx" /></Field>
          <Field label="City"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        </div>
      )}
    </Modal>
  )
}

function ProductCardModal({ conv, onClose }) {
  const products = useStore((s) => s.products)
  const sendMessage = useStore((s) => s.waSendMessage)
  const [pid, setPid] = useState('')
  const info = useMemo(() => {
    if (!pid) return null
    const st = useStore.getState()
    const p = products.find((x) => x.id === pid)
    const price = conv.partnerId ? quotePrice(st, { productId: pid, partnerId: conv.partnerId }).unitPrice : p.mrp
    return { p, price, stock: stockLabel(st, pid) }
  }, [pid]) // eslint-disable-line
  const send = () => {
    const { p, price, stock } = info
    sendMessage(conv.id, { from: 'agent', kind: 'product', productId: p.id, price, mrp: p.mrp, stock: stock.label, stockTone: stock.tone, text: conv.partnerId ? `${p.name} – your dealer price ${fmtINR(price)} + GST.` : `${p.name} – MRP ${fmtINR(p.mrp)}.`, quick: ['Place order', 'Talk to executive'] })
    toast.success('Product card sent')
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Send product card" size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Send} disabled={!info} onClick={send}>Send</Button></>}>
      <Field label="Product" required><Combobox value={pid} onChange={setPid} options={products.filter((p) => p.active !== false).map((p) => ({ value: p.id, label: p.name, sub: `${p.sku} · MRP ${fmtINR(p.mrp)}` }))} /></Field>
      {info && (
        <div className="mt-4 border border-slate-200 rounded-lg p-3 text-sm">
          <KV label={conv.partnerId ? 'Dealer price' : 'MRP'} value={fmtINR(info.price)} />
          <KV label="Availability" value={<span className={info.stock.tone === 'red' ? 'text-red-600' : info.stock.tone === 'amber' ? 'text-amber-600' : 'text-emerald-600'}>{info.stock.label}</span>} />
        </div>
      )}
    </Modal>
  )
}

function DocModal({ conv, onClose }) {
  const invoices = useStore((s) => s.invoices)
  const sendMessage = useStore((s) => s.waSendMessage)
  const mine = useMemo(() => invoices.filter((i) => i.partnerId === conv.partnerId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30), [invoices, conv.partnerId])
  const [kind, setKind] = useState(mine.length ? 'INVOICE' : 'BROCHURE')
  const [invId, setInvId] = useState(mine[0]?.id || '')
  const inv = mine.find((i) => i.id === invId)
  const canSend = kind === 'BROCHURE' || (inv && (kind === 'INVOICE' || inv.lr))
  const send = () => {
    if (kind === 'BROCHURE') sendMessage(conv.id, { from: 'agent', kind: 'document', docType: 'Brochure', attachment: { name: 'Btali-Product-Catalogue-2026.pdf', size: 2480000 }, text: 'Here is our latest product catalogue. 📄' })
    else if (kind === 'INVOICE') sendMessage(conv.id, { from: 'agent', kind: 'document', docType: 'Tax invoice', attachment: { name: `${inv.number.replace(/\//g, '-')}.pdf`, size: 214000 }, text: `Invoice ${inv.number} dated ${fmtDate(inv.date)} – ${fmtINR(inv.total)}.` })
    else sendMessage(conv.id, { from: 'agent', kind: 'document', docType: 'Lorry receipt', attachment: { name: `LR-${inv.lr.number}.pdf`, size: 168000 }, text: `LR ${inv.lr.number} (${fmtDate(inv.lr.date)}) for invoice ${inv.number}.` })
    toast.success('Document sent on WhatsApp')
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Send document" size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Send} disabled={!canSend} onClick={send}>Send</Button></>}>
      <div className="space-y-3">
        <Segmented value={kind} onChange={setKind} options={[{ key: 'INVOICE', label: 'Invoice' }, { key: 'LR', label: 'LR copy' }, { key: 'BROCHURE', label: 'Brochure' }]} />
        {kind !== 'BROCHURE' && (mine.length ? (
          <Field label="Invoice"><Select value={invId} onChange={(e) => setInvId(e.target.value)} options={mine.map((i) => ({ value: i.id, label: `${i.number} · ${fmtDate(i.date)} · ${fmtINR(i.total)}${i.lr ? ' · LR ✓' : ''}` }))} /></Field>
        ) : <Alert tone="info">This contact is not linked to a dealer account, so there are no invoices to share.</Alert>)}
        {kind === 'LR' && inv && !inv.lr && <Alert tone="warn">LR not uploaded yet for {inv.number}.</Alert>}
        <div className="flex items-center gap-2 text-xs text-slate-500"><FileText className="w-4 h-4" /> Sent as PDF via WhatsApp Business API</div>
      </div>
    </Modal>
  )
}
