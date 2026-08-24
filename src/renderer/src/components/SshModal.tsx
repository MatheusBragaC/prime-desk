import { useState } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, Plug } from 'lucide-react'
import { Modal, Field, Button, inputClass } from './Modal'

export interface SshForm {
  name: string
  host: string
  port: string
  identity: string
  remotePath: string
}

const EMPTY: SshForm = { name: '', host: '', port: '', identity: '', remotePath: '' }

export function SshModal({
  open,
  onClose,
  onSubmit
}: {
  open: boolean
  onClose: () => void
  onSubmit: (form: SshForm) => void
}) {
  const [form, setForm] = useState<SshForm>(EMPTY)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function set<K extends keyof SshForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setResult(null)
  }

  const hostOk = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.test(form.host.trim())

  async function test() {
    setTesting(true)
    setResult(null)
    const r = await window.prime.testSsh({
      host: form.host.trim(),
      port: form.port ? Number(form.port) : undefined,
      identity: form.identity.trim() || undefined
    })
    setTesting(false)
    setResult(r as { ok: boolean; message: string })
  }

  function submit() {
    onSubmit({ ...form, name: form.name.trim() || form.host.trim() })
    setForm(EMPTY)
    setResult(null)
  }

  return (
    <Modal
      open={open}
      title="Adicionar conexão SSH"
      description={
        <>
          Conecte a uma máquina remota para executar o{' '}
          <span className="font-mono text-primarySoft">prime-agent</span>. As ferramentas{' '}
          <span className="font-mono">bash</span> e <span className="font-mono">edit</span> passam a
          rodar lá.
        </>
      }
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={!hostOk}>
            Adicionar conexão
          </Button>
        </>
      }
    >
      <Field label="Nome" hint="Um apelido para identificar esta conexão">
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Meu servidor"
        />
      </Field>

      <Field label="Host SSH" hint="usuario@servidor.com, ou um host do seu ~/.ssh/config">
        <input
          className={inputClass}
          value={form.host}
          onChange={(e) => set('host', e.target.value)}
          placeholder="usuario@servidor"
          spellCheck={false}
        />
      </Field>

      <Field label="Porta" hint="Vazio usa a padrão (22) ou o que estiver no ~/.ssh/config">
        <input
          className={inputClass}
          value={form.port}
          onChange={(e) => set('port', e.target.value.replace(/\D/g, '').slice(0, 5))}
          placeholder="22"
          inputMode="numeric"
        />
      </Field>

      <Field label="Chave privada" hint="Vazio usa a chave padrão ou o ~/.ssh/config">
        <input
          className={inputClass}
          value={form.identity}
          onChange={(e) => set('identity', e.target.value)}
          placeholder="~/.ssh/id_rsa"
          spellCheck={false}
        />
      </Field>

      <Field label="Diretório remoto" hint="Opcional. Vazio usa o diretório inicial do usuário">
        <input
          className={inputClass}
          value={form.remotePath}
          onChange={(e) => set('remotePath', e.target.value)}
          placeholder="/opt/projeto"
          spellCheck={false}
        />
      </Field>

      <div className="flex items-center gap-2.5">
        <Button variant="subtle" onClick={() => void test()} disabled={!hostOk || testing}>
          {testing ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              Testando
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Plug size={12} />
              Testar conexão
            </span>
          )}
        </Button>

        {result && (
          <span
            className={
              'flex items-start gap-1.5 text-[11.5px] leading-snug ' +
              (result.ok ? 'text-ok' : 'text-err')
            }
          >
            {result.ok ? (
              <CheckCircle2 size={12} className="mt-[1px] shrink-0" />
            ) : (
              <AlertTriangle size={12} className="mt-[1px] shrink-0" />
            )}
            {result.message}
          </span>
        )}
      </div>

      <p className="mt-3 rounded-lg border border-white/[0.07] bg-black/20 p-2.5 text-[11px] leading-relaxed text-dim">
        A conexão precisa funcionar por chave, sem pedir senha — um prompt interativo travaria o
        agente. O teste usa <span className="font-mono">BatchMode</span>, então falha em vez de
        perguntar.
      </p>
    </Modal>
  )
}
