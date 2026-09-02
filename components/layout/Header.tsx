'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { ShoppingBag, Menu, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCartStore } from '@/lib/cart-store'

interface HeaderProps {
  onCartClick?: () => void
}

const NAV_LINKS = [
  { label: 'الرئيسية',      href: '/'           },
  { label: 'الأكثر مبيعاً', href: '/#best'      },
  { label: 'التشكيلة',      href: '/#products'  },
  { label: 'آراء العملاء',  href: '/#reviews'   },
  { label: 'من نحن',        href: '/#statement' },
]

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export default function Header({ onCartClick }: HeaderProps) {
  const [mounted, setMounted]   = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const cartCount = useCartStore((s) => s.totalItems())

  useEffect(() => {
    setMounted(true)
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    /* ── Outer: transparent sticky wrapper — creates "floating" effect ── */
    <div className="sticky top-0 z-50 px-4 pt-3 pointer-events-none">
      <div className="max-w-7xl mx-auto pointer-events-auto">

        {/* ── Floating pill ── */}
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          transition={{ duration: 0.75, ease: EASE }}
          className="rounded-2xl h-14 flex items-center justify-between px-5 transition-all duration-500"
          style={{
            background: scrolled
              ? 'rgba(255,251,244,0.97)'
              : 'rgba(255,251,244,0.82)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(232,221,208,0.85)',
            boxShadow: scrolled
              ? '0 4px 40px rgba(26,20,16,0.09), 0 1px 0 rgba(184,135,46,0.1) inset'
              : '0 2px 20px rgba(26,20,16,0.05)',
          }}
        >
          {/* Logo */}
          <motion.a
            href="/"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            className="flex items-center flex-shrink-0"
          >
            <Image
              src="https://res.cloudinary.com/i8cdktit/image/fetch/f_auto,q_auto/https://www.melyima.com/logo.png"
              alt="MELY•IMA"
              width={150}
              height={70}
              unoptimized
              style={{ width: 'auto', height: '60px' }}
              className="object-contain select-none"
              priority
            />
          </motion.a>

          {/* Desktop nav — centered */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1 justify-center">
            {NAV_LINKS.map(({ label, href }, i) => (
              <motion.a
                key={label}
                href={href}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1,  y: 0   }}
                transition={{ delay: 0.08 + i * 0.05, duration: 0.45, ease: EASE }}
                className="relative px-3.5 py-1.5 rounded-lg font-heading font-bold text-sm
                           transition-colors duration-200 group"
                style={{ color: '#7A6A58' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#1A1410')}
                onMouseLeave={e => (e.currentTarget.style.color = '#7A6A58')}
              >
                {label}
                {/* Animated gold underline */}
                <span
                  className="absolute bottom-0.5 inset-x-3.5 h-[1.5px] rounded-full origin-right
                             scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
                  style={{ background: 'linear-gradient(90deg, transparent, #B8872E, transparent)' }}
                />
              </motion.a>
            ))}
          </nav>

          {/* Cart + Hamburger */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <motion.button
              type="button"
              onClick={onCartClick}
              whileHover={{ scale: 1.09 }}
              whileTap={{ scale: 0.91 }}
              style={{ WebkitTapHighlightColor: 'transparent', color: '#1A1410' }}
              className="relative p-2.5 rounded-xl cursor-pointer transition-colors duration-200
                         hover:bg-surface/70"
              aria-label="عربة التسوق"
            >
              <ShoppingBag size={20} />
              <AnimatePresence>
                {mounted && cartCount > 0 && (
                  <motion.span
                    key={cartCount}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{   scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                    className="absolute -top-0.5 -left-0.5 min-w-[17px] h-[17px] px-1 rounded-full
                               flex items-center justify-center font-heading font-black text-[10px] text-white"
                    style={{ background: 'linear-gradient(135deg, #B8872E, #D4A94C)' }}
                  >
                    {cartCount > 99 ? '99+' : cartCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            <motion.button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              whileTap={{ scale: 0.91 }}
              className="lg:hidden p-2 rounded-xl transition-colors duration-200 hover:bg-surface/70"
              style={{ color: '#1A1410' }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={menuOpen ? 'x' : 'menu'}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0,   opacity: 1 }}
                  exit={{   rotate:  90,  opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {menuOpen ? <X size={20} /> : <Menu size={20} />}
                </motion.div>
              </AnimatePresence>
            </motion.button>
          </div>
        </motion.div>

        {/* ── Mobile dropdown — appears below pill ── */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 4,   scale: 1    }}
              exit={{   opacity: 0, y: -12,  scale: 0.96 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="lg:hidden mt-1 rounded-2xl overflow-hidden px-3 py-3"
              style={{
                background: 'rgba(255,251,244,0.98)',
                border: '1px solid rgba(232,221,208,0.9)',
                boxShadow: '0 8px 40px rgba(26,20,16,0.09)',
              }}
            >
              {NAV_LINKS.map(({ label, href }, i) => (
                <motion.a
                  key={label}
                  href={href}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0  }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-3 rounded-xl font-heading font-bold text-sm text-right
                             transition-all duration-200 hover:bg-surface/60"
                  style={{ color: '#7A6A58' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#1A1410')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#7A6A58')}
                >
                  {label}
                </motion.a>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
