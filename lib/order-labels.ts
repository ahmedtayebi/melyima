export type LabelOrder = {
  id: string
  customer_name: string
  wilaya_name: string
  created_at: string
  status: string
  deleted_at: string | null
  ecotrack_status: string | null
  ecotrack_tracking: string | null
}

export function canPrintLabel(order: Pick<LabelOrder, 'status' | 'deleted_at' | 'ecotrack_status' | 'ecotrack_tracking'>) {
  return !order.deleted_at && order.status === 'confirmed' && order.ecotrack_status === 'draft'
    && Boolean(order.ecotrack_tracking?.trim())
}
