'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ShoppingBag,
  Package,
  PlusCircle,
  LogOut,
  MessageSquare,
  Settings,
  BarChart2,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { signOut } from '@/app/admin/actions'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/admin', label: 'الطلبات', icon: ShoppingBag, exact: true },
  { href: '/admin/reviews', label: 'التقييمات', icon: MessageSquare, exact: true },
  { href: '/admin/products', label: 'المنتجات', icon: Package, exact: false },
  { href: '/admin/inventory', label: 'المخزون', icon: Package, exact: true },
  { href: '/admin/products/new', label: 'إضافة منتج', icon: PlusCircle, exact: true },
  { href: '/admin/stats',    label: 'الإحصاءات', icon: BarChart2, exact: true },
  { href: '/admin/settings', label: 'الإعدادات', icon: Settings,  exact: true },
]

interface Props {
  collapsed: boolean
  onToggle: () => void
}

export default function AdminSidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname()

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href
    // Products link: active on products list and edit, not on /new
    return pathname.startsWith(href) && !pathname.startsWith('/admin/products/new')
  }

  return (
    <aside className={cn(
      'hidden lg:flex fixed inset-y-0 right-0 bg-brand flex-col z-30 transition-[width] duration-200 ease-out',
      collapsed ? 'w-[72px]' : 'w-64'
    )}>
      <button
        type="button"
        onClick={onToggle}
        className="absolute top-6 -left-3 z-40 w-7 h-7 grid place-items-center rounded-full border border-white/15 bg-brand text-white/70 shadow-md hover:text-accent hover:border-accent/50 transition-colors"
        aria-label={collapsed ? 'فتح القائمة الجانبية' : 'طي القائمة الجانبية'}
        aria-expanded={!collapsed}
        title={collapsed ? 'فتح القائمة' : 'طي القائمة'}
      >
        {collapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
      </button>

      {/* Logo */}
      <div className={cn(
        'h-[81px] flex items-center border-b border-white/10 transition-[padding] duration-200',
        collapsed ? 'justify-center px-3' : 'px-6'
      )}>
        <Image
          src={collapsed ? '/logo2.png' : '/logo.png'}
          alt="MELY•IMA"
          width={collapsed ? 40 : 130}
          height={collapsed ? 40 : 52}
          className={cn(
            'object-contain brightness-200 transition-all duration-200',
            collapsed ? 'h-10 w-10' : 'h-10 w-auto'
          )}
        />
      </div>

      {/* Navigation */}
      <nav className={cn(
        'flex-1 py-4 flex flex-col gap-0.5 transition-[padding] duration-200',
        collapsed ? 'px-2' : 'px-3'
      )}>
        {navItems.map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            aria-label={label}
            className={cn(
              'group relative flex items-center h-11 rounded-lg text-sm font-heading font-bold transition-colors',
              collapsed ? 'justify-center px-0' : 'gap-3 px-4',
              isActive(href, exact)
                ? 'bg-accent/20 text-accent'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            )}
          >
            <Icon size={19} className="flex-shrink-0" />
            {!collapsed && <span className="whitespace-nowrap">{label}</span>}
            {collapsed && (
              <span className="pointer-events-none absolute right-full mr-2 px-2.5 py-1.5 rounded-lg bg-white text-brand text-xs shadow-lg opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all whitespace-nowrap z-50">
                {label}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className={cn('py-3 border-t border-white/10', collapsed ? 'px-2' : 'px-3')}>
        <form action={signOut}>
          <button
            type="submit"
            title={collapsed ? 'تسجيل الخروج' : undefined}
            aria-label="تسجيل الخروج"
            className={cn(
              'group relative flex items-center h-11 rounded-lg text-sm font-heading font-bold text-white/60 hover:text-red-400 hover:bg-red-400/10 w-full transition-colors',
              collapsed ? 'justify-center px-0' : 'gap-3 px-4'
            )}
          >
            <LogOut size={19} className="flex-shrink-0" />
            {!collapsed && <span className="whitespace-nowrap">تسجيل الخروج</span>}
            {collapsed && (
              <span className="pointer-events-none absolute right-full mr-2 px-2.5 py-1.5 rounded-lg bg-white text-brand text-xs shadow-lg opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all whitespace-nowrap z-50">
                تسجيل الخروج
              </span>
            )}
          </button>
        </form>
      </div>
    </aside>
  )
}
