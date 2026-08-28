'use client'

import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { useLockScroll } from '@/lib/use-lock-scroll'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'default' | 'wide'
}

export default function Modal({ isOpen, onClose, title, children, size = 'default' }: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useLockScroll(isOpen)

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className={`relative bg-white w-full mx-3 sm:mx-4 shadow-xl max-h-[94vh] flex flex-col ${
              size === 'wide' ? 'max-w-6xl rounded-lg' : 'max-w-lg rounded-2xl'
            }`}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? 'نافذة منبثقة'}
          >
            {/* Close button — top-left (RTL visual) */}
            <button
              onClick={onClose}
              className="absolute top-4 left-4 p-1.5 rounded-lg text-muted hover:text-brand hover:bg-surface transition-colors duration-200 z-10"
              aria-label="إغلاق"
            >
              <X size={20} />
            </button>

            {/* Scrollable content area */}
            <div className="overflow-y-auto p-6">
              {title && (
                <h2 className="font-heading font-bold text-lg text-brand mb-4 pl-8">
                  {title}
                </h2>
              )}
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
