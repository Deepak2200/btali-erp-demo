import React from 'react'
import { PageHeader, Card, EmptyState } from '../../components/ui'

export default function Stock() {
  return (
    <div>
      <PageHeader title="Stock" subtitle="Coming up" />
      <Card><EmptyState title="Screen under construction" /></Card>
    </div>
  )
}
