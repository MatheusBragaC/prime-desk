import { useAgent } from '@/store/agent'

/**
 * Diferenças de plataforma que a interface precisa respeitar.
 *
 * No macOS os controles de janela são os semáforos nativos, no canto superior
 * **esquerdo** — exatamente onde fica o cabeçalho da sidebar. Em Windows e
 * Linux eles são desenhados à direita, dentro do conteúdo. Reservar espaço no
 * lado errado deixa o título por baixo dos botões numa plataforma e um vão
 * inútil na outra.
 */
export function useIsMac(): boolean {
  return useAgent((s) => s.platform === 'darwin')
}

/** Tecla modificadora exibida nos atalhos. */
export function useMod(): string {
  return useIsMac() ? '⌘' : 'Ctrl'
}

/** Largura ocupada pelos semáforos do macOS, com folga. */
export const MAC_TRAFFIC_LIGHTS_WIDTH = 78

/** Largura ocupada pelos botões de janela em Windows/Linux. */
export const WIN_CONTROLS_WIDTH = 150

/**
 * Espaço a reservar no canto superior direito de quem encosta na borda direita
 * da janela.
 *
 * O `titleBarOverlay` desenha os botões de janela DENTRO do conteúdo, sempre no
 * topo à direita. Quem estiver ali embaixo fica coberto — foi o que acontecia
 * com o fechar dos painéis do dock: o botão existia, mas o overlay ficava por
 * cima e só o ícone da barra conseguia fechar o painel.
 *
 * `atRightEdge` é do chamador porque a borda direita muda de dono: com painel
 * aberto é o dock, sem painel é a barra de status.
 */
export function useWinControlsInset(atRightEdge: boolean): number {
  const isMac = useIsMac()
  return isMac || !atRightEdge ? 0 : WIN_CONTROLS_WIDTH
}
