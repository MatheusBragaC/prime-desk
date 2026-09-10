import { Butterfly } from '@/components/Butterfly'
import { useIsMac, MAC_TRAFFIC_LIGHTS_WIDTH } from '@/lib/platform'

/** Barra de título da sidebar: identidade do app e área de arraste da janela. */
export function SidebarHeader() {
  const isMac = useIsMac()

  return (
    /* No macOS os semáforos ficam aqui: o cabeçalho recua para não ficar sob eles. */
    <div
      className="drag-region flex h-[var(--p-titlebar)] items-center gap-2 pr-4"
      style={{ paddingLeft: isMac ? MAC_TRAFFIC_LIGHTS_WIDTH : 16 }}
    >
      <Butterfly size={19} />
      {/* A árvore de agentes migrou para a barra de ferramentas do topo. */}
      <span className="flex-1 text-sm font-semibold tracking-tight">Prime Desk</span>
    </div>
  )
}
