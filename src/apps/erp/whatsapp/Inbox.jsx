import React from 'react'
import { PageHeader, Card, EmptyState } from '../../../components/ui'

export default function Inbox() {
  return (
    <div>
      <PageHeader title="Inbox" subtitle="Coming up" />
      <Card><EmptyState title="Screen under construction" /></Card>
    </div>
  )
}
