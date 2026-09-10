/*
  Casca de react com slots de hook.

  Diferente das outras duas cascas daqui, esta guarda estado entre renders: o
  `useRef` tem que devolver o MESMO objeto na segunda chamada (é disso que a ref
  de `onClose` do useDialogA11y depende) e o `useSyncExternalStore` tem que
  entregar à suíte o `subscribe` que recebeu, que é o alvo do teste de contagem.
  Os efeitos ficam guardados em vez de rodar: quem decide quando montar,
  desmontar e re-renderizar é a suíte.
*/
export const hooks = { effects: [], store: null, slots: [], i: 0 }

/** Começo de um render: os slots continuam, a lista de efeitos não. */
export function beginRender() {
  hooks.i = 0
  hooks.effects.length = 0
}

/** Zera os slots — equivale a um componente novo, não a um re-render. */
export function resetHooks() {
  hooks.slots.length = 0
  hooks.effects.length = 0
  hooks.i = 0
  hooks.store = null
}

export const useRef = (init) => {
  const k = hooks.i++
  if (!hooks.slots[k]) hooks.slots[k] = { current: init }
  return hooks.slots[k]
}
export const useState = (init) => [typeof init === 'function' ? init() : init, () => {}]
export const useEffect = (fn, deps) => {
  hooks.effects.push({ fn, deps })
}
export const useSyncExternalStore = (subscribe, snapshot) => {
  hooks.store = { subscribe, snapshot }
  return snapshot()
}
