import React from 'react'
import { PageHeader, Card, EmptyState } from '../../../components/ui'

export default function Receipts() {
  return (
    <div>
      <PageHeader title="Receipts" subtitle="Coming up" />
      <Card><EmptyState title="Screen under construction" /></Card>
    </div>
  )
}
