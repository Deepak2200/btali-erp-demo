import React from 'react'
import { PageHeader, Card, EmptyState } from '../../../components/ui'

export default function Expenses() {
  return (
    <div>
      <PageHeader title="Expenses" subtitle="Coming up" />
      <Card><EmptyState title="Screen under construction" /></Card>
    </div>
  )
}
