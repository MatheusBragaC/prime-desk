import { create } from 'zustand'

/**
 * Abas do painel de terminal.
 *
 * Mora no store, e não no `TerminalPanel`, porque o dock tem slot único: fechar
 * o dock desmonta o painel. Com o estado dentro do componente, a lista de abas
 * sumia junto e `killTerminal` — que só é chamado ao fechar uma aba — nunca
 * rodava, deixando o PTY vivo no processo principal sem nenhuma superfície que
 * pudesse encerrá-lo. Aqui a lista sobrevive ao desmonte: reabrir o dock mostra
 * as mesmas abas, e todo fechamento continua passando por `closeTab`.
 */

export interface TerminalTab {
  id: string
  kind: 'shell' | 'file'
  title: string
  /** Caminho relativo à raiz do workspace. Só em abas de arquivo. */
  path?: string
  /** Digitado no shell assim que ele sobe. Só em abas de shell. */
  command?: string
}

let seq = 0
const nextId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${seq++}`

interface TerminalTabsStore {
  tabs: TerminalTab[]
  /** Vazio até a primeira aba existir; sempre um id válido depois disso. */
  activeId: string

  setActive: (id: string) => void
  /** Cria a primeira aba quando o painel abre sem nenhuma. */
  ensureShell: () => void
  addShell: () => void
  /** Reabrir o mesmo arquivo foca a aba existente em vez de duplicar. */
  openFile: (path: string) => void
  /**
   * Atende ao `terminalRequest`: mesmo comando pedido de novo reusa a aba, em
   * vez de empilhar abas idênticas. O shell continua vivo depois que o processo
   * termina, então reenviar o comando ali é a repetição natural.
   */
  runCommand: (command: string, title: string) => void
  /** Encerra o PTY da aba de shell e devolve quantas abas sobraram. */
  closeTab: (id: string) => number
}

function focusAfterClose(tabs: TerminalTab[], id: string, activeId: string): string {
  if (activeId !== id) return activeId
  const next = tabs.filter((tb) => tb.id !== id)
  if (next.length === 0) return ''
  const wasAt = tabs.findIndex((tb) => tb.id === id)
  return (next[wasAt] ?? next[next.length - 1]).id
}

export const useTerminalTabs = create<TerminalTabsStore>((set, get) => ({
  tabs: [],
  activeId: '',

  setActive: (activeId) => set({ activeId }),

  ensureShell: () => {
    if (get().tabs.length > 0) return
    get().addShell()
  },

  addShell: () =>
    set((st) => {
      const n = st.tabs.filter((tb) => tb.kind === 'shell').length + 1
      const tab: TerminalTab = { id: nextId('sh'), kind: 'shell', title: `Shell ${n}` }
      return { tabs: [...st.tabs, tab], activeId: tab.id }
    }),

  openFile: (path) =>
    set((st) => {
      const found = st.tabs.find((tb) => tb.kind === 'file' && tb.path === path)
      if (found) return { activeId: found.id }
      const tab: TerminalTab = {
        id: nextId('file'),
        kind: 'file',
        title: path.split('/').pop() ?? path,
        path
      }
      return { tabs: [...st.tabs, tab], activeId: tab.id }
    }),

  runCommand: (command, title) => {
    const found = get().tabs.find((tb) => tb.kind === 'shell' && tb.command === command)
    if (found) {
      set({ activeId: found.id })
      void window.prime.writeTerminal(found.id, command + '\r')
      return
    }
    const tab: TerminalTab = { id: nextId('sh'), kind: 'shell', title, command }
    set((st) => ({ tabs: [...st.tabs, tab], activeId: tab.id }))
  },

  closeTab: (id) => {
    const st = get()
    const tab = st.tabs.find((tb) => tb.id === id)
    if (!tab) return st.tabs.length
    // Fechar a aba encerra o shell: deixá-lo vivo sem superfície só vazaria
    // processo, já que não há como voltar a ele.
    if (tab.kind === 'shell') void window.prime.killTerminal(id)

    const tabs = st.tabs.filter((tb) => tb.id !== id)
    set({ tabs, activeId: focusAfterClose(st.tabs, id, st.activeId) })
    return tabs.length
  }
}))
