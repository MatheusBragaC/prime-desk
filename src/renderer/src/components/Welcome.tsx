import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { Butterfly } from './Butterfly'
import { Modal } from './Modal'
import { UsagePanel } from './UsagePanel'
import type { UsageStats } from '../../../shared/protocol'
import { firstNameFromHome } from '../lib/greeting'
import { useT } from '../i18n'

export function Welcome() {
  const { t } = useT()
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [name, setName] = useState('')
  const [usage, setUsage] = useState(false)

  useEffect(() => {
    let alive = true
    void window.prime.usageStats().then((r) => {
      if (alive && r?.ok) setStats(r.stats as UsageStats)
    })
    void window.prime.appInfo().then((info) => {
      if (alive) setName(firstNameFromHome(info.home))
    })
    return () => {
      alive = false
    }
  }, [])

  const hour = new Date().getHours()
  const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const greeting = t(`welcome.${period}`)

  return (
    // Sem altura própria: quem centraliza o conjunto é o palco, em App.tsx.
    <div className="flex flex-col items-center px-8 pb-8">
      <div className="animate-fade-up flex flex-col items-center">
        <Butterfly size={34} />
        {/*
          Saudação em serifa, como no Claude Desktop: é o único texto do app em
          `--font-display`, e por isso funciona como marco de "aqui começa".
        */}
        <h1 className="mt-5 text-center font-display text-display font-normal tracking-tight text-fg">
          {name ? `${greeting}, ${name}` : greeting}
        </h1>
        <p className="mt-2 text-base text-muted">{t('welcome.prompt')}</p>
      </div>

      {stats && stats.sessions > 0 && (
        <button
          onClick={() => setUsage(true)}
          style={{ animationDelay: '80ms' }}
          className="animate-fade-up mt-7 flex items-center gap-2 rounded-field px-3 py-1.5 text-sm text-dim transition-colors hover:bg-elevated hover:text-muted"
        >
          <BarChart3 size={16} strokeWidth={1.75} />
          {t('welcome.viewUsage')}
        </button>
      )}

      {stats && stats.sessions === 0 && (
        <p className="mt-7 text-sm text-dim">{t('usage.noneYet')}</p>
      )}

      {stats && (
        <Modal
          open={usage}
          title={t('welcome.usageTitle')}
          onClose={() => setUsage(false)}
          width={620}
        >
          <UsagePanel stats={stats} />
        </Modal>
      )}
    </div>
  )
}
