/*
  Paridade dos três dicionários.

  O `t()` cai em silêncio: chave faltando num idioma volta para o inglês, e
  chave inexistente volta a própria chave. Nada disso quebra o build, então um
  esquecimento só aparece quando alguém abre o app naquele idioma — se abrir.

  A suíte guarda quatro casos, todos vindos de defeito real desta base:
  23 chaves definidas e nunca usadas (69 linhas mortas), `app.retry` escrito em
  inglês dentro do dicionário português, e `{placeholder}` que existe num idioma
  e não no outro — `bridge.exited` perde o `{code}` e vira frase truncada.
*/
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/*
  Chaves montadas em tempo de execução: `t(`thinking.${nivel}`)` e parentes.
  A lista é declarada à mão de propósito — inferir o prefixo do código deixaria
  qualquer chave sob ele imune à checagem de chave morta.
*/
const PREFIXOS_DINAMICOS = [
  'thinking.',
  'welcome.',
  'queue.phase.',
  'sched.status.',
  'sched.kind.',
  'sched.error.'
]

const FONTE = 'src/renderer/src/i18n/index.ts'

export function setup() {
  // O módulo chama `detect()` na carga, que lê localStorage e navigator.
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {} }
  globalThis.navigator ??= { language: 'pt-BR' }
  globalThis.document ??= { documentElement: {} }
}

function arquivosDoRenderer(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) arquivosDoRenderer(p, out)
    else if (/\.tsx?$/.test(p) && !p.endsWith(join('i18n', 'index.ts'))) out.push(p)
  }
  return out
}

/** `{nome}` de dentro de um valor traduzido. */
function marcadores(texto) {
  return new Set([...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
}

export default function run(mod) {
  const dicts = mod.DICTS
  let falhas = 0
  const falhou = (msg) => {
    console.log('FALHOU  ' + msg)
    falhas++
  }
  const passou = (msg) => console.log('ok      ' + msg)

  const pt = Object.keys(dicts.pt)
  const en = Object.keys(dicts.en)
  const es = Object.keys(dicts.es)

  // 1. Mesmo conjunto e mesma ordem nos três.
  for (const [nome, chaves] of [
    ['en', en],
    ['es', es]
  ]) {
    const faltando = pt.filter((k) => !(k in dicts[nome]))
    const sobrando = chaves.filter((k) => !(k in dicts.pt))
    if (faltando.length || sobrando.length) {
      falhou(`${nome}: ${faltando.length} faltando, ${sobrando.length} sobrando`)
      for (const k of [...faltando, ...sobrando].slice(0, 8)) console.log('          ' + k)
    } else if (chaves.some((k, i) => pt[i] !== k)) {
      const i = chaves.findIndex((k, idx) => pt[idx] !== k)
      falhou(`${nome}: fora de ordem no índice ${i} (${pt[i]} vs ${chaves[i]})`)
    } else {
      passou(`${nome} tem as mesmas ${chaves.length} chaves, na mesma ordem`)
    }
  }

  // 2. Nenhum valor vazio.
  const vazias = []
  for (const [lang, d] of Object.entries(dicts)) {
    for (const [k, v] of Object.entries(d)) if (!v.trim()) vazias.push(`${lang}:${k}`)
  }
  if (vazias.length) falhou(`valores vazios: ${vazias.slice(0, 6).join(', ')}`)
  else passou('nenhum valor vazio')

  // 3. Todo marcador do pt existe no en e no es.
  const semMarcador = []
  for (const k of pt) {
    const esperados = marcadores(dicts.pt[k])
    if (!esperados.size) continue
    for (const lang of ['en', 'es']) {
      const tem = marcadores(dicts[lang][k] ?? '')
      for (const m of esperados) if (!tem.has(m)) semMarcador.push(`${lang}:${k} perdeu {${m}}`)
    }
  }
  if (semMarcador.length) {
    falhou(`marcador perdido em ${semMarcador.length} chave(s)`)
    for (const s of semMarcador.slice(0, 8)) console.log('          ' + s)
  } else {
    passou('todo {marcador} do pt sobrevive no en e no es')
  }

  // 4. Nenhuma chave definida e nunca usada.
  let todo = ''
  for (const f of arquivosDoRenderer('src/renderer/src')) todo += readFileSync(f, 'utf8')
  const usadas = new Set([...todo.matchAll(/['"`]([a-zA-Z][\w.]*)['"`]/g)].map((m) => m[1]))
  const mortas = pt.filter(
    (k) => !usadas.has(k) && !PREFIXOS_DINAMICOS.some((p) => k.startsWith(p))
  )
  if (mortas.length) {
    falhou(`${mortas.length} chave(s) definidas e nunca usadas (x3 idiomas)`)
    for (const k of mortas.slice(0, 12)) console.log('          ' + k)
  } else {
    passou(`nenhuma das ${pt.length} chaves está morta`)
  }

  // 5. O caso que motivou tudo: nada de inglês cru no dicionário português.
  const fonte = readFileSync(FONTE, 'utf8')
  if (/"app\.retry": "Retry"/.test(fonte.slice(0, fonte.indexOf('const en')))) {
    falhou('app.retry voltou a ser "Retry" em português')
  } else {
    passou('app.retry está traduzido em português')
  }

  return falhas === 0
}
