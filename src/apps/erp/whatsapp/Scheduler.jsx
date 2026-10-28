import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CalendarClock, Send, XCircle, Plus, Megaphone } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Button, StatusBadge, Modal, Field, Input, EmptyState, DescriptionList, Alert, toast, confirm, cx } from '../../../components/ui'
import { fmtDateTime, fmtNum } from '../../../lib/format'
import { useWaRunners } from './_shared'

const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const localDay = (iso) => new Date(iso).toLocaleDateString('en-CA')
const DOT = { SENT: 'bg-emerald-500', SENDING: 'bg-emerald-400', SCHEDULED: 'bg-sky-500', APPROVED: 'bg-teal-500', PENDING_APPROVAL: 'bg-amber-500', DRAFT: 'bg-slate-400', REJECTED: 'bg-red-500' }

export default function WaScheduler() {
  useWaRunners()
  const nav = useNavigate()
  const camps = useStore((s) => s.waCampaigns) || []
  const segment = useStore((s) => s.waSegment)
  const schedule = useStore((s) => s.waScheduleCampaign)
  const sendNow = useStore((s) => s.waSendCampaign)
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [sel, setSel] = useState(null)
  const [when, setWhen] = useState('')

  const events = useMemo(() => camps.map((c) => ({ c, at: c.status === 'SENT' ? c.sentAt || c.scheduledAt : c.scheduledAt })).filter((e) => e.at), [camps])
  const days = useMemo(() => {
    const first = new Date(month)
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [month])
  const todayKey = new Date().toLocaleDateString('en-CA')
  const unscheduled = camps.filter((c) => c.status === 'APPROVED' && !c.scheduledAt)
  const upcoming = camps.filter((c) => ['SCHEDULED', 'PENDING_APPROVAL'].includes(c.status) && c.scheduledAt).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  const cur = camps.find((c) => c.id === sel)
  const recips = (c) => (c.stats?.targeted ?? segment(c.segment).filter((x) => !x.optOut).length)

  const openCamp = (c) => { setSel(c.id); setWhen(toLocalInput(c.scheduledAt) || toLocalInput(new Date(Date.now() + 86400000).toISOString().slice(0, 11) + '04:30:00.000Z')) }
  const doSchedule = () => {
    if (!when) return
    const iso = new Date(when).toISOString()
    if (iso <= new Date().toISOString()) { toast.error('Pick a future time', 'Broadcasts can only be scheduled ahead'); return }
    const h = new Date(when).getHours()
    if (h < 9 || h >= 21) { toast.warn('Outside messaging window', 'Promotional WhatsApp messages are allowed 9 AM – 9 PM'); return }
    schedule(cur.id, iso)
    toast.success(cur.scheduledAt ? 'Broadcast rescheduled' : 'Broadcast scheduled', fmtDateTime(iso))
    setSel(null)
  }
  const doCancel = async () => {
    if (!(await confirm({ title: 'Cancel this schedule?', message: 'The campaign stays approved and can be sent manually or rescheduled.', tone: 'danger', confirmText: 'Cancel schedule' }))) return
    schedule(cur.id, null)
    toast.success('Schedule cancelled')
    setSel(null)
  }
  const doSend = async () => {
    if (!(await confirm({ title: 'Send now?', message: `${recips(cur)} contacts will receive "${cur.name}".`, confirmText: 'Send now' }))) return
    if (sendNow(cur.id)) toast.success('Broadcast started')
    setSel(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Broadcast Scheduler" subtitle="Plan approved WhatsApp broadcasts – sends go out automatically at the scheduled time"
        actions={<Button icon={Plus} onClick={() => nav('/erp/whatsapp/campaigns')}>New campaign</Button>} />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <Card padded={false}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="font-semibold text-slate-800">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
              <Button size="sm" variant="secondary" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Today</Button>
              <Button size="sm" variant="ghost" icon={ChevronRight} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-7 text-[11px] font-semibold uppercase text-slate-400 border-b border-slate-100">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {days.map((d) => {
                  const key = d.toLocaleDateString('en-CA')
                  const ev = events.filter((e) => localDay(e.at) === key)
                  const inMonth = d.getMonth() === month.getMonth()
                  return (
                    <div key={key} className={cx('min-h-[96px] border-b border-r border-slate-100 p-1.5', !inMonth && 'bg-slate-50/60')}>
                      <div className={cx('text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full', key === todayKey ? 'bg-brand-500 text-white font-bold' : inMonth ? 'text-slate-700' : 'text-slate-300')}>{d.getDate()}</div>
                      <div className="space-y-1">
                        {ev.map(({ c, at }) => (
                          <button key={c.id} type="button" onClick={() => openCamp(c)} className="w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded bg-white border border-slate-200 hover:border-emerald-400 shadow-sm">
                            <div className="flex items-center gap-1"><span className={cx('w-1.5 h-1.5 rounded-full shrink-0', DOT[c.status] || 'bg-slate-400')} /><span className="text-slate-500">{new Date(at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></div>
                            <div className="font-medium text-slate-800 truncate">{c.name}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 px-4 py-2.5 text-[11px] text-slate-500 border-t border-slate-100">
            {[['SENT', 'Sent'], ['SCHEDULED', 'Scheduled'], ['PENDING_APPROVAL', 'Awaiting approval'], ['DRAFT', 'Draft']].map(([k, l]) => <span key={k} className="flex items-center gap-1"><span className={cx('w-2 h-2 rounded-full', DOT[k])} />{l}</span>)}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Approved – not scheduled" subtitle="Pick a date and time to release">
            {unscheduled.length === 0 ? <EmptyState icon={CalendarClock} title="Nothing waiting" message="Approved campaigns without a time appear here." /> : (
              <ul className="space-y-2">
                {unscheduled.map((c) => <li key={c.id} className="flex items-center gap-2 border border-slate-200 rounded-lg p-2.5"><Megaphone className="w-4 h-4 text-slate-400" /><div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{c.name}</div><div className="text-[11px] text-slate-500">{fmtNum(recips(c))} recipients</div></div><Button size="sm" onClick={() => openCamp(c)}>Schedule</Button></li>)}
              </ul>
            )}
          </Card>
          <Card title="Upcoming broadcasts">
            {upcoming.length === 0 ? <EmptyState icon={CalendarClock} title="No upcoming broadcasts" /> : (
              <ul className="space-y-2">
                {upcoming.map((c) => <li key={c.id} onClick={() => openCamp(c)} className="cursor-pointer border border-slate-200 rounded-lg p-2.5 hover:border-emerald-300"><div className="flex items-start justify-between gap-2"><div className="text-sm font-medium">{c.name}</div><StatusBadge status={c.status} /></div><div className="text-[11px] text-slate-500 mt-0.5">{fmtDateTime(c.scheduledAt)} · {fmtNum(recips(c))} recipients</div></li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <Modal open={!!cur} onClose={() => setSel(null)} title={cur?.name} subtitle={cur?.number} size="sm"
        footer={cur && (cur.status === 'SENT' || cur.status === 'SENDING' ? <Button variant="secondary" onClick={() => setSel(null)}>Close</Button> : <>
          {cur.scheduledAt && <Button variant="ghost" icon={XCircle} className="mr-auto text-red-600" onClick={doCancel}>Cancel schedule</Button>}
          {['APPROVED', 'SCHEDULED'].includes(cur.status) && <Button variant="secondary" icon={Send} onClick={doSend}>Send now</Button>}
          <Button icon={CalendarClock} onClick={doSchedule}>{cur.scheduledAt ? 'Reschedule' : 'Schedule'}</Button>
        </>)}>
        {cur && (
          <div className="space-y-4">
            <DescriptionList cols={1} items={[['Status', <StatusBadge status={cur.status} />], ['Recipients', fmtNum(recips(cur))], [cur.status === 'SENT' ? 'Sent at' : 'Scheduled for', fmtDateTime(cur.sentAt || cur.scheduledAt) || 'Not scheduled'], cur.stats && ['Results', `${cur.stats.delivered} delivered · ${cur.stats.read} read · ${cur.stats.replied} replies`]]} />
            <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-line">{cur.message}</p>
            {!['SENT', 'SENDING'].includes(cur.status) && (
              <>
                {cur.status === 'PENDING_APPROVAL' && <Alert tone="warn">Awaiting approval – it will only go out once approved.</Alert>}
                {cur.status === 'DRAFT' && <Alert tone="info">Draft – submit it for approval from Campaigns before the scheduled time.</Alert>}
                <Field label="Broadcast date & time" hint="Allowed window 9 AM – 9 PM IST"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
