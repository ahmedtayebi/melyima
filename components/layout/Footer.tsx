'use client'

import Image from 'next/image'
import { Phone, Mail, MapPin } from 'lucide-react'
import { motion } from 'framer-motion'

const SOCIAL = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/mely_ima?igsh=cTFhcG5oa2lwNnl4',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/share/1KoHWcP4Dm/',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@mely__ima?_r=1&_t=ZS-958CfpcVh0U',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
      </svg>
    ),
  },
]

const QUICK_LINKS = [
  { label: 'التشكيلة', href: '/#products' },
  { label: 'الجديد', href: '/new-arrivals' },
  { label: 'الأكثر مبيعاً', href: '/best-sellers' },
  { label: 'التخفيضات', href: '/discounts' },
  { label: 'من نحن', href: '/#statement' },
]

const CONTACT = [
  { Icon: Phone, text: '0665967348', href: 'tel:0665967348' },
  { Icon: Mail, text: 'info@melyima.dz', href: 'mailto:info@melyima.dz' },
  { Icon: MapPin, text: 'بسكرة، الجزائر', href: '#' },
]

export default function Footer() {
  return (
    <footer
      className="relative overflow-hidden"
      style={{ background: 'linear-gradient(175deg, #F0E8DA 0%, #EDE0CC 100%)' }}
    >
      {/* ── Giant watermark text — purely decorative ── */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%]
                   font-heading font-black select-none pointer-events-none
                   whitespace-nowrap leading-none"
        style={{
          fontSize: 'clamp(80px, 15vw, 180px)',
          color: 'rgba(184,135,46,0.055)',
          letterSpacing: '-0.04em',
        }}
      >
        MELY•IMA
      </div>

      {/* ── Decorative ambient blobs ── */}
      <div
        className="absolute -top-20 right-0 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(184,135,46,0.07) 0%, transparent 70%)', filter: 'blur(40px)' }}
      />
      <div
        className="absolute -bottom-10 left-10 w-60 h-60 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(212,169,76,0.06) 0%, transparent 70%)', filter: 'blur(35px)' }}
      />

      {/* ── Top gold divider ── */}
      <div
        className="h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(184,135,46,0.5), transparent)' }}
      />

      {/* ── Content ── */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-16 lg:py-20">

        {/* Logo centered at top on mobile, left column on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-12">

          {/* Brand */}
          <div className="flex flex-col gap-5">
            <div className="flex justify-right w-full">
              <Image
                src="https://res.cloudinary.com/i8cdktit/image/fetch/f_auto,q_auto/https://www.melyima.com/logo.png"
                alt=""
                width={500}
                height={200}
                unoptimized
                style={{ width: 'auto', height: '100px' }}
                className="object-contain select-none"
              />
            </div>
            <p
              className="font-body text-sm leading-relaxed"
              style={{ color: '#7A6A58' }}
            >
              عباءات نسائية عصرية للمرأة الجزائرية الأنيقة
            </p>
            {/* Social icons */}
            <div className="flex gap-2.5">
              {SOCIAL.map(({ label, href, icon }) => (
                <motion.a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.92 }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center
                             transition-all duration-200"
                  style={{
                    background: 'rgba(255,251,244,0.75)',
                    border: '1px solid rgba(232,221,208,0.9)',
                    color: '#7A6A58',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = '#B8872E'
                      ; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(184,135,46,0.5)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = '#7A6A58'
                      ; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(232,221,208,0.9)'
                  }}
                >
                  {icon}
                </motion.a>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="flex flex-col gap-4 text-right" dir="rtl">
            <h3
              className="font-heading font-bold text-xs tracking-[0.18em] uppercase"
              style={{ color: '#B8872E' }}
            >
              روابط سريعة
            </h3>
            <div className="flex flex-col gap-2.5 items-end">
              {QUICK_LINKS.map(({ label, href }) => (
                <motion.a
                  key={label}
                  href={href}
                  whileHover={{ x: -5 }} // تغيير الاتجاه لليسار قليلاً أو لليمين حسب الرغبة
                  transition={{ duration: 0.2 }}
                  className="font-body text-sm transition-colors duration-200 w-fit ml-auto"
                  style={{ color: '#7A6A58' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#1A1410')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#7A6A58')}
                >
                  {label}
                </motion.a>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-4">
            <h3
              className="font-heading font-bold text-xs tracking-[0.18em] uppercase"
              style={{ color: '#B8872E' }}
            >
              تواصلي معنا
            </h3>
            <div className="flex flex-col gap-2.5">
              {CONTACT.map(({ Icon, text, href }) => (
                <motion.a
                  key={text}
                  href={href}
                  whileHover={{ x: -5 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2.5 font-body text-sm transition-colors duration-200"
                  style={{ color: '#7A6A58' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#1A1410')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#7A6A58')}
                >
                  <Icon size={14} style={{ color: '#B8872E', flexShrink: 0 }} />
                  <span>{text}</span>
                </motion.a>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div
        className="relative z-10 py-5 px-6"
        style={{ borderTop: '1px solid rgba(184,135,46,0.2)' }}
      >
        <p
          className="text-center font-body text-xs"
          style={{ color: 'rgba(122,106,88,0.7)' }}
        >
          © {new Date().getFullYear()} MELY•IMA — كل الحقوق محفوظة
        </p>
      </div>
    </footer>
  )
}
