/**
 * Primeiro nome do usuário, deduzido do diretório home.
 *
 * Não há cadastro no Prime Desk — a única identidade disponível é a conta do
 * sistema. `/home/ana-souza` vira "Ana". Quando o nome não é alfabético ou é um
 * usuário genérico de container, a saudação fica sem nome em vez de chamar
 * alguém de "Ubuntu".
 *
 * Mora aqui, e não em Welcome.tsx, porque exportar algo que não é componente do
 * mesmo arquivo de um componente derruba o Fast Refresh do Vite.
 */
const GENERIC = new Set(['root', 'user', 'admin', 'ubuntu', 'debian', 'ec2', 'vagrant', 'node'])

export function firstNameFromHome(home: string): string {
  const base = home.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? ''
  const token = base.split(/[^A-Za-zÀ-ÿ]+/).filter(Boolean)[0] ?? ''
  if (token.length < 2 || GENERIC.has(token.toLowerCase())) return ''
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}
