'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingBag, Package, PlusCircle, LogOut, MessageSquare, Settings, BarChart2 } from 'lucide-react'
import { signOut } from '@/app/admin/actions'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/admin', label: 'الطلبات', icon: ShoppingBag, exact: true },
  { href: '/admin/reviews', label: 'التقييمات', icon: MessageSquare, exact: true },
  { href: '/admin/products', label: 'المنتجات', icon: Package, exact: false },
  { href: '/admin/products/new', label: 'إضافة منتج', icon: PlusCircle, exact: true },
  { href: '/admin/stats',    label: 'الإحصاءات', icon: BarChart2, exact: true },
  { href: '/admin/settings', label: 'الإعدادات', icon: Settings,  exact: true },
]

export default function AdminSidebar() {
  const pathname = usePathname()

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href
    // Products link: active on products list and edit, not on /new
    return pathname.startsWith(href) && !pathname.startsWith('/admin/products/new')
  }

  return (
    <aside className="hidden lg:flex fixed inset-y-0 right-0 w-64 bg-brand flex-col z-30">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <Image
          src="/logo.png"
          alt="MELY•IMA"
          width={130}
          height={52}
          className="h-10 w-auto brightness-200"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {navItems.map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-heading font-bold transition-colors',
              isActive(href, exact)
                ? 'bg-accent/20 text-accent'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            )}
          >
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-3 border-t border-white/10">
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-heading font-bold text-white/60 hover:text-red-400 hover:bg-red-400/10 w-full transition-colors"
          >
            <LogOut size={18} />
            <span>تسجيل الخروج</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
