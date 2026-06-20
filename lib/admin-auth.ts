type AdminCandidate = {
  id?: string
  email?: string | null
  app_metadata?: Record<string, unknown> | null
}

function csvEnv(name: string) {
  return new Set(
    (process.env[name] ?? '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  )
}

function metadataHasAdminRole(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return false

  const role = metadata.role
  if (typeof role === 'string' && role.toLowerCase() === 'admin') return true

  const roles = metadata.roles
  if (Array.isArray(roles) && roles.some(item => String(item).toLowerCase() === 'admin')) {
    return true
  }

  return metadata.is_admin === true
}

export function isAdminUser(user: AdminCandidate | null | undefined) {
  if (!user?.id) return false

  const adminUserIds = csvEnv('ADMIN_USER_IDS')
  if (adminUserIds.has(user.id.toLowerCase())) return true

  const adminEmails = csvEnv('ADMIN_EMAILS')
  const email = user.email?.toLowerCase()
  if (email && adminEmails.has(email)) return true

  return metadataHasAdminRole(user.app_metadata)
}
