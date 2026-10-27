import React from 'react'
import { PageHeader, Card, EmptyState } from '../../../components/ui'

export default function Profile() {
  return (
    <div>
      <PageHeader title="Profile" subtitle="Coming up" />
      <Card><EmptyState title="Screen under construction" /></Card>
    </div>
  )
}
