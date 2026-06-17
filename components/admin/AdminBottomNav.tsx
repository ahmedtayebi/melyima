'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingBag, Package, LogOut, MessageSquare, Settings, BarChart2 } from 'lucide-react'
import { signOut } from '@/app/admin/actions'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/admin', label: 'الطلبات', icon: ShoppingBag, exact: true },
  { href: '/admin/reviews', label: 'التقييمات', icon: MessageSquare, exact: true },
  { href: '/admin/products', label: 'المنتجات', icon: Package, exact: false },
  { href: '/admin/inventory', label: 'المخزون', icon: Package, exact: true },
  { href: '/admin/stats',    label: 'إحصاءات',   icon: BarChart2, exact: true },
  { href: '/admin/settings', label: 'الإعدادات', icon: Settings,  exact: true },
]

export default function AdminBottomNav() {
  const pathname = usePathname()

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href) && !pathname.startsWith('/admin/products/new')
  }

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-brand border-t border-white/10 z-30 flex">
      {tabs.map(({ href, label, icon: Icon, exact }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[10px] font-heading font-bold transition-colors',
            isActive(href, exact) ? 'text-accent' : 'text-white/50'
          )}
        >
          <Icon size={20} />
          <span>{label}</span>
        </Link>
      ))}

      {/* Logout */}
      <form action={signOut} className="flex-1">
        <button
          type="submit"
          className="w-full h-full flex flex-col items-center justify-center py-3 gap-1 text-[10px] font-heading font-bold text-white/50 hover:text-red-400 transition-colors"
        >
          <LogOut size={20} />
          <span>خروج</span>
        </button>
      </form>
    </nav>
  )
}
