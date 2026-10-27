import React from 'react'
import { PageHeader, Card, EmptyState } from '../../../components/ui'

export default function Notes() {
  return (
    <div>
      <PageHeader title="Notes" subtitle="Coming up" />
      <Card><EmptyState title="Screen under construction" /></Card>
    </div>
  )
}
