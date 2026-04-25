'use client'

import { useRef } from 'react'
import Image from 'next/image'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Star, Truck, ArrowDown, ShieldCheck } from 'lucide-react'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/* ── Small floating bento badge ── */
function Badge({
  children,
  className,
  delay = 0,
  floatClass = 'float-badge',
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  floatClass?: string
}) {
  return (
    <motion.div
      className={`absolute z-20 ${className}`}
      initial={{ opacity: 0, scale: 0.75 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.65, ease: EASE }}
    >
      <div className={floatClass}>{children}</div>
    </motion.div>
  )
}

export default function HeroSection() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })

  /* Parallax: logo moves slower than scroll → depth */
  const logoY    = useTransform(scrollYProgress, [0, 1], ['0%', '18%'])
  const textY    = useTransform(scrollYProgress, [0, 1], ['0%', '8%'])
  const fadeOut  = useTransform(scrollYProgress, [0, 0.55], [1, 0])

  return (
    <section
      ref={ref}
      className="relative w-full min-h-[100svh] flex flex-col justify-center overflow-hidden"
      style={{
        background: 'linear-gradient(158deg, #FFFBF4 0%, #FFF6E8 45%, #FFFAF2 100%)',
      }}
    >
      {/* ── Large ambient rings (purely decorative) ── */}
      <div
        className="absolute top-1/2 left-[38%] -translate-x-1/2 -translate-y-1/2 w-[660px] h-[660px] rounded-full pointer-events-none"
        style={{ border: '1px solid rgba(184,135,46,0.09)' }}
      />
      <div
        className="absolute top-1/2 left-[38%] -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] rounded-full pointer-events-none"
        style={{ border: '1px dashed rgba(184,135,46,0.07)' }}
      />

      {/* ── Warm gradient blobs ── */}
      <div
        className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(212,169,76,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }}
      />
      <div
        className="absolute -bottom-32 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(184,135,46,0.06) 0%, transparent 70%)', filter: 'blur(50px)' }}
      />

      {/* ── Grain overlay ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.78' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          opacity: 0.025,
        }}
      />

      {/* ── Main layout ── */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
        {/*
          RTL flex-row: first child → RIGHT side, second child → LEFT side.
          Mobile flex-col-reverse: visual on TOP, text on BOTTOM.
        */}
        <div className="flex flex-col-reverse lg:flex-row items-center gap-10 lg:gap-8 py-28 lg:py-0 min-h-[100svh]">

          {/* ─────────────────────────────────────────
              TEXT COLUMN — right in RTL, first in DOM
          ───────────────────────────────────────── */}
          <motion.div
            style={{ y: textY, opacity: fadeOut }}
            className="flex-1 flex flex-col gap-6 text-right"
          >
            {/* Eyebrow */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0  }}
              transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
              className="flex items-center justify-right gap-2.5"
            >
              <span
                className="font-body text-xs tracking-[0.18em] uppercase"
                style={{ color: '#B8872E' }}
              >
                موضة جزائرية عصرية
              </span>
              <div
                className="h-px w-10 origin-right"
                style={{
                  background: 'linear-gradient(90deg, transparent, #B8872E)',
                  animation: 'draw-line 0.8s ease 0.4s both',
                }}
              />
            </motion.div>

            {/* Brand name — large editorial gold */}
            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0  }}
              transition={{ duration: 0.85, delay: 0.15, ease: EASE }}
              className="font-heading font-black leading-none tracking-tight"
              style={{ fontSize: 'clamp(3.8rem, 9vw, 6.5rem)' }}
            >
              <span
                style={{
                  background: 'linear-gradient(140deg, #8B6420 0%, #C8963C 35%, #E8B850 55%, #B8872E 80%, #7A5518 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                MELY
              </span>
              <span style={{ color: '#D4A94C' }}>•</span>
              <span
                style={{
                  background: 'linear-gradient(140deg, #8B6420 0%, #C8963C 35%, #E8B850 55%, #B8872E 80%, #7A5518 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                IMA
              </span>
            </motion.h1>

            {/* Divider */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
              className="flex items-center justify-right gap-3 origin-right"
            >
              <div className="h-px w-14" style={{ background: 'linear-gradient(90deg, transparent, rgba(184,135,46,0.5))' }} />
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#B8872E', opacity: 0.6 }} />
            </motion.div>

            {/* Arabic tagline */}
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0  }}
              transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
              className="font-body text-lg lg:text-xl leading-relaxed max-w-xs mr-0"
              style={{ color: '#7A6A58' }}
            >
              عباءات مصممة بعناية للمرأة الجزائرية العصرية
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0  }}
              transition={{ duration: 0.7, delay: 0.45, ease: EASE }}
              className="flex flex-row gap-3"
            >
              <motion.a
                href="#products"
                whileHover={{ scale: 1.035, boxShadow: '0 8px 40px rgba(26,20,16,0.22)' }}
                whileTap={{ scale: 0.96 }}
                className="px-8 py-3.5 rounded-xl font-heading font-black text-sm text-white text-center flex-shrink-0"
                style={{ background: '#1A1410' }}
              >
                تسوقي الآن
              </motion.a>
              <motion.a
                href="#statement"
                whileHover={{ scale: 1.035, backgroundColor: 'rgba(184,135,46,0.07)' }}
                whileTap={{ scale: 0.96 }}
                className="px-8 py-3.5 rounded-xl font-heading font-black text-sm text-center flex-shrink-0 transition-colors duration-200"
                style={{ color: '#1A1410', border: '1.5px solid #E8DDD0' }}
              >
                لماذا نحن
              </motion.a>
            </motion.div>

            {/* Social proof row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.65 }}
              className="flex items-center justify-left gap-4 pt-1"
            >
              <span className="font-body text-xs" style={{ color: '#A08C78' }}>+500 زبونة راضية</span>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} size={12} fill="#D4A94C" stroke="#D4A94C" strokeWidth={1} />
                ))}
              </div>
              <div className="h-5 w-px" style={{ background: '#E8DDD0' }} />
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={13} style={{ color: '#B8872E' }} />
                <span className="font-body text-xs" style={{ color: '#A08C78' }}>ضمان الجودة</span>
              </div>
            </motion.div>
          </motion.div>

          {/* ─────────────────────────────────────────
              VISUAL COLUMN — left in RTL, second in DOM
          ───────────────────────────────────────── */}
          <motion.div
            style={{ y: logoY, opacity: fadeOut }}
            className="relative flex items-center justify-center w-full lg:w-[46%] flex-shrink-0"
          >
            <div className="relative w-[280px] h-[280px] sm:w-[340px] sm:h-[340px] lg:w-[400px] lg:h-[400px]">

              {/* Outer slowly spinning dashed ring */}
              <div
                className="spin-slow absolute inset-0 rounded-full"
                style={{ border: '1px dashed rgba(184,135,46,0.22)' }}
              />

              {/* Static outer ring */}
              <div
                className="absolute inset-4 rounded-full"
                style={{ border: '1px solid rgba(184,135,46,0.14)' }}
              />

              {/* Inner warm cream circle — the "stage" */}
              <div
                className="absolute inset-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'radial-gradient(circle at 38% 32%, #FFFDF5, #F5EBD8 80%)',
                  boxShadow: [
                    '0 16px 70px rgba(184,135,46,0.14)',
                    '0 4px 24px rgba(26,20,16,0.06)',
                    'inset 0 1px 0 rgba(255,255,255,0.9)',
                  ].join(', '),
                }}
              >
                <motion.div
                  className='w-full h-full relative justify-center'
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1,   opacity: 1 }}
                  transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
                >
                  <Image
                    src="/pogo.png"
                    alt="عباءة نسائية عصرية من MELY•IMA"
                    width={700}
                    height={300}
                    className="object-contain select-none"
                    style={{ width: '100%', height: 'auto' }}
                    priority
                  />
                </motion.div>
              </div>

              {/* ── Floating bento badge: 100% جودة ── */}
              {/* <Badge
                className="-bottom-5 -left-8 lg:-bottom-7 lg:-left-12"
                delay={0.85}
                floatClass="float-badge"
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
                  style={{
                    background: 'rgba(255,251,244,0.96)',
                    border: '1px solid rgba(232,221,208,0.9)',
                    boxShadow: '0 6px 30px rgba(26,20,16,0.08)',
                    backdropFilter: 'blur(14px)',
                  }}
                >
                  <ShieldCheck size={20} style={{ color: '#B8872E', flexShrink: 0 }} />
                  <div className="text-right">
                    <div
                      className="font-heading font-black text-lg leading-none"
                      style={{ color: '#B8872E' }}
                    >
                      100%
                    </div>
                    <div className="font-body text-[11px] mt-0.5" style={{ color: '#7A6A58' }}>
                      جودة مضمونة
                    </div>
                  </div>
                </div>
              </Badge> */}

              {/* ── Floating bento badge: توصيل يومي ── */}
              {/* <Badge
                className="-top-5 -right-8 lg:-top-7 lg:-right-12"
                delay={1.0}
                floatClass="float-badge-2"
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
                  style={{
                    background: 'rgba(255,251,244,0.96)',
                    border: '1px solid rgba(232,221,208,0.9)',
                    boxShadow: '0 6px 30px rgba(26,20,16,0.08)',
                    backdropFilter: 'blur(14px)',
                  }}
                >
                  <Truck size={20} style={{ color: '#1A1410', flexShrink: 0 }} />
                  <div className="text-right">
                    <div
                      className="font-heading font-black text-lg leading-none"
                      style={{ color: '#1A1410' }}
                    >
                      يومي
                    </div>
                    <div className="font-body text-[11px] mt-0.5" style={{ color: '#7A6A58' }}>
                      توصيل سريع
                    </div>
                  </div>
                </div>
              </Badge> */}

              {/* Small gold dots */}
              <motion.div
                className="absolute top-[22%] -left-10 w-2.5 h-2.5 rounded-full"
                style={{ background: '#D4A94C', opacity: 0.55 }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.55, 0.9, 0.55] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute bottom-[28%] -right-8 w-2 h-2 rounded-full"
                style={{ background: '#B8872E', opacity: 0.4 }}
                animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              />
              <div
                className="absolute bottom-[12%] -left-5 w-1.5 h-1.5 rounded-full"
                style={{ background: '#D4A94C', opacity: 0.3 }}
              />
            </div>
          </motion.div>

        </div>
      </div>      
    </section>
  )
}
