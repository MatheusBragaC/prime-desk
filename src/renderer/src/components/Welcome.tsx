import { Butterfly } from './Butterfly'
import { sendPrompt } from '../store/agent'

const SUGGESTIONS = [
  { title: 'Explorar este diretório', prompt: 'Faça um resumo da estrutura e do propósito deste diretório de trabalho.' },
  { title: 'Analisar um script', prompt: 'Liste os scripts deste projeto e explique o que cada um faz.' },
  { title: 'Diagnóstico do sistema', prompt: 'Mostre uso de disco, memória e os 10 maiores diretórios do meu home.' },
  { title: 'Revisar código', prompt: 'Encontre problemas de qualidade e segurança nos arquivos deste diretório.' }
]

export function Welcome() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8">
      <div className="animate-fade-up flex flex-col items-center">
        <Butterfly size={64} />
        <h1 className="mt-5 text-[26px] font-semibold tracking-tight">Prime Desk</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Interface gráfica para o <span className="font-mono text-primarySoft">prime-agent</span>
        </p>
      </div>

      <div className="mt-9 grid w-full max-w-[620px] grid-cols-2 gap-2.5">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.title}
            onClick={() => void sendPrompt(s.prompt)}
            style={{ animationDelay: `${60 + i * 45}ms` }}
            className="animate-fade-up rounded-xl border border-white/[0.07] bg-[var(--p-surface)] p-3.5 text-left transition-all hover:border-primary/35 hover:bg-primary/[0.06]"
          >
            <div className="text-[13px] font-medium text-fg">{s.title}</div>
            <div className="mt-1 line-clamp-2 text-[11.8px] leading-snug text-dim">{s.prompt}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
