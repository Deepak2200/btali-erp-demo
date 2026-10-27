import React, { useMemo, useState } from 'react'
import { Mail, Send, RefreshCw, Paperclip, MessageSquare, Smartphone, Eye, Download, Calendar } from 'lucide-react'
import { PageHeader, Grid, Stat, Badge, StatusBadge, Button, IconButton, Drawer, DescriptionList, AttachmentList, SectionTitle, Segmented, toast, confirm } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { useStore } from '../../../store'
import { fmtDateTime, timeAgo, today, daysAgo, titleCase, exportCSV } from '../../../lib/format'

const channelOf = (k = '') => (/WHATSAPP|WA_/.test(k) ? 'WhatsApp' : /SMS/.test(k) ? 'SMS' : 'Email')
const sameDay = (ts) => String(ts || '').slice(0, 10)
const KIND_LABEL = { EMAIL: 'Transactional', STAREX_PUSH: 'Starex dispatch push', USER_INVITE: 'User invite', PASSWORD_RESET: 'Password reset', TEST: 'Template test', COMPLIANCE: 'Compliance reminder', SMS: 'SMS alert', WHATSAPP: 'WhatsApp message' }
const kindLabel = (k) => KIND_LABEL[k] || titleCase(k || 'EMAIL')
const ChannelIcon = ({ c }) => (c === 'WhatsApp' ? <MessageSquare className="w-4 h-4 text-emerald-600" /> : c === 'SMS' ? <Smartphone className="w-4 h-4 text-sky-600" /> : <Mail className="w-4 h-4 text-ink-500" />)

export default function Outbox() {
  const live = useStore((s) => s.emails)
  const archive = useStore((s) => s.emailArchive)
  const emails = useMemo(() => [...live, ...(archive || [])], [live, archive])
  const users = useStore((s) => s.users)
  const resend = useStore((s) => s.resendEmail)
  const [sel, setSel] = useState(null)
  const [range, setRange] = useState('ALL')

  const rows = useMemo(() => {
    const from = range === 'TODAY' ? today() : range === '7D' ? daysAgo(7) : range === '30D' ? daysAgo(30) : ''
    return emails
      .filter((e) => !from || sameDay(e.ts) >= from)
      .map((e) => ({ ...e, channel: channelOf(e.kind), kindLabel: kindLabel(e.kind), sender: users.find((u) => u.id === e.by)?.name || 'System', attCount: (e.attachments || []).length }))
  }, [emails, users, range])
  const current = sel ? emails.find((e) => e.id === sel) : null
  const kinds = [...new Set(emails.map((e) => e.kind || 'EMAIL'))]

  const doResend = async (e) => {
    const ok = await confirm({ title: 'Re-send this message?', message: `"${e.subject}"\nwill be sent again to ${e.to}.`, confirmText: 'Re-send' })
    if (!ok) return
    resend(e.id)
    toast.success('Message re-sent', e.to)
  }

  return (
    <div>
      <PageHeader title="Communication Log" subtitle="Every email, SMS and WhatsApp message sent by Btali ERP to dealers, vendors, Starex and staff"
        actions={<Segmented value={range} onChange={setRange} options={[{ key: 'TODAY', label: 'Today' }, { key: '7D', label: '7 days' }, { key: '30D', label: '30 days' }, { key: 'ALL', label: 'All' }]} />} />
      <Grid cols={4} className="mb-5">
        <Stat label="Messages in period" value={rows.length} sub={`${emails.length} all-time`} icon={Send} />
        <Stat label="Sent today" value={emails.filter((e) => sameDay(e.ts) === today()).length} icon={Calendar} tone="blue" />
        <Stat label="With attachments" value={rows.filter((r) => r.attCount).length} sub="Invoices, POs, LR copies" icon={Paperclip} tone="violet" />
        <Stat label="Re-sent" value={rows.filter((r) => r.resentOf).length} icon={RefreshCw} tone="amber" />
      </Grid>
      <DataTable
        rows={rows}
        searchPlaceholder="Search recipient, subject, reference…"
        initialSort={{ key: 'ts', dir: 'desc' }}
        pageSize={15}
        onRowClick={(r) => setSel(r.id)}
        filters={[
          { key: 'kind', label: 'types', value: (r) => r.kind || 'EMAIL', options: kinds.map((k) => ({ value: k, label: kindLabel(k) })) },
          { key: 'channel', label: 'channels', options: ['Email', 'SMS', 'WhatsApp'] },
        ]}
        toolbar={<Button variant="secondary" size="sm" icon={Download} onClick={() => exportCSV(`btali-communication-log-${today()}.csv`, rows, [
          { header: 'Sent at', value: (r) => fmtDateTime(r.ts) }, { header: 'Channel', key: 'channel' }, { header: 'Type', key: 'kindLabel' }, { header: 'To', key: 'to' }, { header: 'Cc', key: 'cc' },
          { header: 'Subject', key: 'subject' }, { header: 'Reference', key: 'ref' }, { header: 'Attachments', value: (r) => (r.attachments || []).map((a) => a.name).join('; ') }, { header: 'Sent by', key: 'sender' }, { header: 'Status', key: 'status' }, { header: 'Body', key: 'body' },
        ])}>Export</Button>}
        empty={<div className="text-center py-12 text-sm text-slate-400">No messages in this period. Order confirmations, invoices, LR copies and PO emails appear here as soon as they are sent.</div>}
        columns={[
          { key: 'ts', header: 'Sent', render: (r) => <div className="whitespace-nowrap"><div className="text-sm">{fmtDateTime(r.ts)}</div><div className="text-[11px] text-slate-400">{timeAgo(r.ts)}</div></div> },
          { key: 'channel', header: 'Channel', render: (r) => <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><ChannelIcon c={r.channel} />{r.channel}</span> },
          { key: 'to', header: 'To', render: (r) => <span className="text-xs block max-w-[190px] truncate" title={r.to}>{r.to}</span> },
          { key: 'subject', header: 'Subject', render: (r) => <div className="min-w-[220px]"><div className="font-medium text-slate-800 line-clamp-1">{r.subject}</div><div className="text-[11px] text-slate-400 line-clamp-1">{(r.body || '').replace(/\n+/g, ' ')}</div></div> },
          { key: 'kindLabel', header: 'Type', render: (r) => <Badge tone={r.kind === 'STAREX_PUSH' ? 'teal' : r.kind === 'TEST' ? 'gray' : 'ink'}>{r.kindLabel}</Badge> },
          { key: 'ref', header: 'Reference', render: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.ref || '—'}</span> },
          { key: 'attCount', header: 'Files', align: 'right', render: (r) => (r.attCount ? <span className="inline-flex items-center gap-1 text-slate-600"><Paperclip className="w-3.5 h-3.5" />{r.attCount}</span> : '—') },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status || 'SENT'} label={r.resentOf ? 'Re-sent' : undefined} /> },
          { key: 'act', header: '', sortable: false, export: false, render: (r) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><IconButton icon={Eye} title="View" onClick={() => setSel(r.id)} /><IconButton icon={RefreshCw} title="Re-send" onClick={() => doResend(r)} /></div> },
        ]}
      />
      <Drawer open={!!current} onClose={() => setSel(null)} title={current?.subject} subtitle={current && `${channelOf(current.kind)} · ${kindLabel(current.kind)} · ${fmtDateTime(current.ts)}`}
        footer={current && <><Button variant="secondary" onClick={() => setSel(null)}>Close</Button><Button icon={RefreshCw} onClick={() => doResend(current)}>Re-send</Button></>}>
        {current && (
          <div className="space-y-5">
            <DescriptionList items={[
              ['To', current.to], ['Cc', current.cc || '—'], ['Reference', current.ref || '—'], ['Sent by', users.find((u) => u.id === current.by)?.name || 'System'],
              ['Status', <StatusBadge key="s" status={current.status || 'SENT'} />], ['Re-sent', current.resentAt ? fmtDateTime(current.resentAt) : current.resentOf ? 'This is a re-sent copy' : '—'],
            ]} />
            <div>
              <SectionTitle>Message</SectionTitle>
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                <div className="text-sm font-semibold text-slate-800 mb-2">{current.subject}</div>
                <div className="text-sm text-slate-700 whitespace-pre-line">{current.body || '—'}</div>
              </div>
            </div>
            <div>
              <SectionTitle>Attachments</SectionTitle>
              <AttachmentList items={current.attachments || []} empty="No attachments." />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
