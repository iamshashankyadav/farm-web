import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/features/auth/authContext'
import { LanguageSwitch } from '@/i18n/I18nProvider'
import { useI18n } from '@/i18n/i18n'
import { ThemeToggle } from './ThemeSwitch'

/** The round profile button for the top right; opens name, profile, theme, language and sign out. */
export function ProfileMenu() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null
  const row = 'flex w-full items-center rounded-md px-2 py-2 text-left text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface'

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('Account')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid size-9 place-items-center rounded-full bg-surface-container-high text-sm font-semibold transition-colors hover:bg-surface-container-highest"
      >
        {(user.name ?? '?').charAt(0).toUpperCase()}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label={t('Account')}
            className="absolute top-full right-0 z-50 mt-2 w-64 origin-top-right space-y-1 rounded-lg border border-border bg-surface-card p-2 shadow-lg"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
          >
            <div className="px-2 py-2">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-on-surface-variant">{user.phone}</span>
            </div>
            <div className="border-t border-border pt-1">
              <Link to="/profile" role="menuitem" onClick={() => setOpen(false)} className={row}>
                {t('Profile')}
              </Link>
              <div className="flex items-center justify-between gap-2 px-0 py-1">
                <ThemeToggle />
                <LanguageSwitch />
              </div>
            </div>
            <div className="border-t border-border pt-1">
              <button type="button" role="menuitem" onClick={() => void logout()} className={row}>
                {t('Sign out')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
