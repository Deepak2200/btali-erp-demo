import React from 'react'
import { PageHeader, Card, EmptyState } from '../../components/ui'

export default function Tickets() {
  return (
    <div>
      <PageHeader title="Tickets" subtitle="Coming up" />
      <Card><EmptyState title="Screen under construction" /></Card>
    </div>
  )
}
