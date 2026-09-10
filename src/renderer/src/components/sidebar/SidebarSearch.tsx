import { Search } from 'lucide-react'
import { useT } from '@/i18n'

export function SidebarSearch({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useT()

  return (
    <div className="px-2 pb-1">
      <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors focus-within:bg-elevated hover:bg-elevated">
        <Search size={16} strokeWidth={1.75} className="shrink-0 text-dim" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('sidebar.search')}
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-dim"
        />
      </div>
    </div>
  )
}
