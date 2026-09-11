#!/usr/bin/env node
/*
  Checa o que o ESLint não vê: convenções visuais e de i18n do docs/REDESIGN.md.

  Existe porque o repo já regrediu nisso. O caso duro é o byte NUL literal que
  entrou em `ObservedPanel.tsx` (achado D da auditoria, corrigido em 260ee75):
  passou pelo typecheck, pelo build e pelo review, porque nenhum dos três olha
  para bytes de controle no fonte.

  As outras três medidas são dívida herdada, não defeito novo. Corrigi-las
  exigiria reescrever dezenas de arquivos, então aqui elas viram CATRACA: o
  número atual está congelado em `scripts/ui-baseline.json` e o script falha
  apenas se PIORAR. Quem paga a dívida baixa o número no baseline junto.

  Sai 1 quando alguma medida piora, para poder entrar em CI.
  Uso: node scripts/checkui.cjs [--update]   (--update reescreve o baseline)
*/

const fs = require('fs')
const path = require('path')

const ROOT = 'src/renderer/src'
/* NUL é tolerância zero e vale para os três processos, não só para a UI. */
const ROOT_NUL = 'src'
const BASELINE = path.join('scripts', 'ui-baseline.json')
const UPDATE = process.argv.includes('--update')

/**
 * Escala tipográfica do docs/REDESIGN.md 3.1, em px. Fora dela é ad hoc.
 *
 * 10.5 é o degrau `text-micro`, e estava de fora por acidente: a regex abaixo
 * só enxerga `text-[Npx]` literal, então os 63 usos da classe nomeada nunca
 * foram contados e ninguém notou a ausência. Preferir sempre `text-micro`.
 */
const SCALE = new Set([10.5, 11.5, 13, 15, 18, 24, 30])

function collect(root) {
  const out = []
  ;(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) out.push(p)
    }
  })(root)
  return out
}

const files = collect(ROOT)
const filesNul = collect(ROOT_NUL)

/** name -> { count, sites: [] } */
const found = {
  nul: hits(/\x00/g, () => true, filesNul),
  alpha: hits(/(?:white|black)\/(?:\[[0-9.]+\]|\d+)/g, () => true),
  offscale: hits(/text-\[([0-9.]+)px\]/g, (m) => !SCALE.has(Number(m[1]))),
  i18nInline: hits(/\b(?:lang|locale)\s*===\s*'[a-z]{2}'\s*\?/g, (_m, file) =>
    file.includes(`${path.sep}components${path.sep}`)
  ),
  hardcoded: hits(
    /(?:>\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ,.'!?—-]{2,})\s*<|\b(?:title|placeholder|aria-label|alt)="([^"{}]{3,})")/g,
    (m, file) => file.includes(`${path.sep}components${path.sep}`) && /[A-Za-zÀ-ÿ]{3}/.test(m[0])
  ),
  /*
    Escondido até o ponteiro passar, e invisível para quem usa teclado.

    O anel de foco global existe (`:focus-visible` no theme.css), mas `opacity: 0`
    o desenha a zero por cento. São dois casos com correções diferentes: o
    próprio controle escondido quer `focus-visible:opacity-100` (padrão já
    comentado em TerminalPanel.tsx); ícone ou adorno escondido DENTRO de um
    controle focável quer `group-focus-within:opacity-100`, porque ele mesmo
    nunca recebe foco — é o caso do chevron que indica grupo aberto ou fechado.

    `disabled:opacity-0` é outra coisa (controle desabilitado, que não recebe
    foco) e sai da conta antes do teste.
  */
  ghostFocus: hits(/["'`][^"'`]*\bopacity-0\b[^"'`]*["'`]/g, (m) => {
    const cls = m[0].replace(/disabled:opacity-0/g, '')
    if (!/\bopacity-0\b/.test(cls)) return false
    /*
      Prosa que CITA a classe não é uso dela.

      A regex não distingue string de comentário, e `opacity-0` entre crases num
      comentário parece template literal — foi o que aconteceu no próprio
      primitivo de botão, que explica a regra e caiu nela. Atributo de classe
      real sempre tem mais de uma classe; menção isolada, não.
    */
    if (!/\s/.test(cls.slice(1, -1).trim())) return false
    return !/(?:focus-visible|group-focus-within(?:\/[a-z]+)?):opacity-100/.test(cls)
  }),
  /*
    Locale cravado em chamada de formatação.

    `relTime` caía num `toLocaleDateString('pt-BR')` fixo, então a data
    absoluta saía em português com a interface em inglês, e não havia como
    perceber sem trocar de idioma na mão. Formatação passa pelo `lang` da
    interface — ver `locale()` em lib/format.ts.
  */
  intlBypass: hits(/(?:toLocale\w*|Intl\.\w+)\(\s*['"][a-z]{2}(?:-[A-Z]{2})?['"]/g, () => true),
  /*
    `<button>` cru, fora dos primitivos de `components/ui`.

    Sem semântica de propósito: não tenta distinguir botão migrável de botão
    que precisa ficar cru. Mede o total. Migrar baixa o número e o aviso pede
    o `--update`; criar um botão cru novo sobe e derruba o build. Era o que
    faltava para o primitivo parar de perder para a cópia e cola — ele existia
    com 4 variantes e cobria 8 lugares, contra 113 botões crus em 35 arquivos.
  */
  rawButton: hits(
    /<button\b/g,
    (_m, file) => !file.includes(`${path.sep}components${path.sep}ui${path.sep}`)
  )
}

function hits(re, keep, scope = files) {
  const out = { count: 0, sites: [] }
  for (const file of scope) {
    const src = fs.readFileSync(file, 'utf8')
    for (const m of src.matchAll(new RegExp(re.source, re.flags))) {
      if (!keep(m, file)) continue
      out.count++
      out.sites.push(`${file}:${src.slice(0, m.index).split('\n').length}`)
    }
  }
  return out
}

const MEASURES = [
  {
    key: 'nul',
    label: 'byte NUL literal em fonte',
    mode: 'zero',
    fix: 'troque o byte por \\u0000 no literal (ver 260ee75)'
  },
  {
    key: 'alpha',
    label: 'alpha cru de cor (white/[0.06], black/40, ...)',
    mode: 'ratchet',
    fix: 'use o token de papel (hover, chip, well, codeWell, scrim, ...) do tailwind.config.js'
  },
  {
    key: 'offscale',
    label: 'tamanho de fonte fora da escala do REDESIGN 3.1',
    mode: 'ratchet',
    fix: 'use text-xs/sm/base/lg/xl/display'
  },
  {
    key: 'i18nInline',
    label: 'i18n por ternario inline no JSX',
    mode: 'ratchet',
    fix: 'crie a chave em src/renderer/src/i18n e chame t()'
  },
  {
    key: 'hardcoded',
    label: 'string de UI hardcoded em componente',
    mode: 'ratchet',
    fix: 'passe pelo t() do i18n'
  },
  {
    key: 'ghostFocus',
    label: 'escondido por opacity-0 sem foco visivel',
    mode: 'ratchet',
    fix: 'controle: focus-visible:opacity-100; adorno dentro de controle: group-focus-within:opacity-100'
  },
  {
    key: 'intlBypass',
    label: 'locale cravado em toLocale*() ou new Intl.*()',
    mode: 'zero',
    fix: 'passe o lang da interface (ver locale() em lib/format.ts)'
  },
  {
    key: 'rawButton',
    label: 'botao cru fora de components/ui',
    mode: 'ratchet',
    fix: 'use o <Button> de components/ui/Button.tsx'
  }
]

if (UPDATE) {
  const next = {}
  for (const m of MEASURES) next[m.key] = found[m.key].count
  fs.writeFileSync(
    BASELINE,
    JSON.stringify({ '//': 'Divida congelada. Ver docs/auditoria/README.md.', ...next }, null, 2) +
      '\n'
  )
  console.log(`baseline atualizado em ${BASELINE}: ${JSON.stringify(next)}`)
  process.exit(0)
}

if (!fs.existsSync(BASELINE)) {
  console.error(`não achei ${BASELINE} — rode 'node scripts/checkui.cjs --update' para criar`)
  process.exit(2)
}
const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))

let failures = 0
const summary = []
for (const measure of MEASURES) {
  const { count, sites } = found[measure.key]
  const limit = measure.mode === 'zero' ? 0 : (baseline[measure.key] ?? 0)
  summary.push(`${measure.key} ${count}/${limit}`)
  if (count <= limit) continue
  failures++
  console.error(`PIOROU  ${measure.label}: ${count} (limite ${limit}) — ${measure.fix}`)
  for (const site of sites.slice(0, 12)) console.error(`        ${site}`)
  if (sites.length > 12) console.error(`        ... +${sites.length - 12} ocorrência(s)`)
}

for (const measure of MEASURES) {
  const { count } = found[measure.key]
  const limit = baseline[measure.key] ?? 0
  if (measure.mode === 'ratchet' && count < limit) {
    console.warn(
      `aviso: ${measure.key} caiu de ${limit} para ${count} — baixe o baseline com 'npm run check:ui -- --update'`
    )
  }
}

console.log(
  `${files.length} arquivo(s) em ${ROOT} (+${filesNul.length} em ${ROOT_NUL} para NUL), ` +
    `${summary.join(', ')} (atual/limite), ${failures} medida(s) pioraram`
)
process.exit(failures > 0 ? 1 : 0)
