'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import AdminSidebar from './AdminSidebar'
import AdminBottomNav from './AdminBottomNav'
import { cn } from '@/lib/utils'

const SIDEBAR_STORAGE_KEY = 'admin-sidebar-collapsed'

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedState = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
      setSidebarCollapsed(savedState === null ? true : savedState === 'true')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const toggleSidebar = () => {
    setSidebarCollapsed(current => {
      const next = !current
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      return next
    })
  }

  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-[#fffbf1]" dir="rtl">
      <AdminSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <main className={cn(
        'min-h-screen p-5 lg:p-8 pb-24 lg:pb-8 transition-[margin] duration-200 ease-out',
        sidebarCollapsed ? 'lg:mr-[72px]' : 'lg:mr-64'
      )}>
        {children}
      </main>
      <AdminBottomNav />
    </div>
  )
}
