/**
 * Tipos de UI compartilhados entre `lib/` e `components/`.
 *
 * Existe para quebrar uma inversão de camada: `lib/useDock.ts`,
 * `lib/useAppShortcuts.ts` e `lib/useExecutionTarget.ts` importavam tipo de
 * dentro de `components/`, então o hook passava a depender do componente. Aqui
 * o tipo mora abaixo dos dois. Contrato com o main continua em
 * `shared/protocol.ts`; isto é só o que a interface inventa para si.
 */

/** Painel lateral direito. `null` = nenhum aberto. */
export type Dock = 'files' | 'agents' | 'diff' | 'terminal' | 'schedules' | 'document' | null

/**
 * Formulário de conexão SSH.
 *
 * Não é `SshConnection`: os campos são texto porque vêm de `<input>` — `port`
 * só vira número na hora de montar a conexão.
 */
export interface SshForm {
  name: string
  host: string
  port: string
  identity: string
  remotePath: string
}
