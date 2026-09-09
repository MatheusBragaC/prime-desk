#!/usr/bin/env node
/*
  Cruza todo comando RPC que o renderer chama contra as allowlists do main.

  Existe por causa de um bug real: `get_session_stats` entrou no código sem
  entrar em `RPC_SEND_ALLOWED`, então o indicador de ocupação de contexto nunca
  funcionou — e a recusa era indistinguível do `—` legítimo que aparece depois
  de uma compactação. Ninguém percebeu até alguém desconfiar do número.

  A falha é silenciosa por desenho: o main devolve `{ ok: false, error }` em vez
  de lançar, e o `rpc()` do renderer engole a recusa num `console.warn`. Só a
  leitura cruzada dos dois lados pega isso.

  Sai 1 quando encontra comando fora da allowlist, para poder entrar em CI.
  Entrada permitida sem chamada é aviso, não erro: não quebra nada, mas amplia
  de graça a superfície que o agente aceita — e o agente tem ferramenta `bash`.
*/

const fs = require('fs')
const path = require('path')

const MAIN = 'src/main/index.ts'
const RENDERER = 'src/renderer'

const main = fs.readFileSync(MAIN, 'utf8')

/** Lê `const NOME = new Set([...])`, com ou sem quebras de linha dentro. */
function allowlist(name) {
  const m = main.match(new RegExp(`${name}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`))
  if (!m) {
    console.error(`não achei ${name} em ${MAIN} — o script precisa ser atualizado`)
    process.exit(2)
  }
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))
}

const send = allowlist('RPC_SEND_ALLOWED')
const fire = allowlist('RPC_FIRE_ALLOWED')

const files = []
;(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(p)) files.push(p)
  }
})(RENDERER)

/*
  Só pega comando escrito como literal. `rpc(type)` com variável passa batido —
  é limitação conhecida, e o projeto não faz isso em lugar nenhum hoje.
*/
const CALL = /\b(rpc|rpcCall|fire)(?:<[^>]*>)?\(\s*'([^']+)'/g

/** comando -> { kinds: Set, sites: [] } */
const used = new Map()
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  for (const m of src.matchAll(CALL)) {
    const line = src.slice(0, m.index).split('\n').length
    const entry = used.get(m[2]) ?? { kinds: new Set(), sites: [] }
    entry.kinds.add(m[1])
    entry.sites.push(`${file}:${line}`)
    used.set(m[2], entry)
  }
}

let missing = 0
for (const [cmd, { kinds, sites }] of [...used].sort()) {
  for (const kind of kinds) {
    const list = kind === 'fire' ? fire : send
    const listName = kind === 'fire' ? 'RPC_FIRE_ALLOWED' : 'RPC_SEND_ALLOWED'
    if (!list.has(cmd)) {
      missing++
      console.error(`FORA DA ALLOWLIST  ${cmd}  (${kind}, falta em ${listName})`)
      for (const site of sites) console.error(`                   ${site}`)
    }
  }
}

const orphans = [
  ...[...send].filter((c) => !used.has(c)).map((c) => `${c} (send)`),
  ...[...fire].filter((c) => !used.has(c)).map((c) => `${c} (fire)`)
]
if (orphans.length) console.warn(`aviso: permitido sem chamada — ${orphans.join(', ')}`)

console.log(
  `${used.size} comando(s) em uso, ${send.size + fire.size} permitido(s), ${missing} fora da allowlist`
)
process.exit(missing > 0 ? 1 : 0)
