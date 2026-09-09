import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarClock, RefreshCw, Plus, Trash2, Pause, Play, HeartPulse,
  AlertTriangle, Zap, Clock
} from 'lucide-react'
import type { AgentCronJob, AgentHeartbeatDeliveryMode } from '../../../shared/protocol'
import {
  useAgent, listSchedules, addSchedule, cancelSchedule,
  getHeartbeat, setHeartbeat, updateHeartbeat
} from '../store/agent'
import { useAsync } from '../lib/useAsync'
import { parseSchedule, SCHEDULE_EXAMPLES } from '../lib/schedule'
import { relTime, untilTime } from '../lib/format'
import { DockPanel } from './DockPanel'
import { PanelEmpty, PanelError, PanelLoading } from './PanelState'
import { useT } from '../i18n'

/**
 * Prompts agendados e heartbeat da conversa aberta.
 *
 * A maior funcionalidade do prime-agent que não tinha superfície: dá para
 * agendar um prompt uma vez, em intervalo, ou por expressão cron — e manter um
 * heartbeat que reentra na sessão periodicamente.
 *
 * Quatro coisas que o painel precisa DIZER, senão ele mente:
 *
 * 1. O escopo é a conversa aberta. `list_schedules` é filtrado por
 *    `activeSessionId` no servidor; não existe visão global pelo RPC. Trocar de
 *    conversa "faz sumir" os agendamentos, e sem a nota isso parece perda.
 * 2. Agendar promove a sessão a residente no daemon. Depois disso fechar a
 *    ponte deixa de liberá-la, e reabrir a conversa cai no caminho de
 *    "já ativa em outro worker".
 * 3. Sem daemon não é o mesmo que sem agendamentos. Nessa conexão o agente
 *    responde lista vazia e recusa a criação — mostrar "nada agendado" seria
 *    falso.
 * 4. Prompt agendado dispara turno sozinho, e heartbeat com entrega `steer`
 *    interrompe o turno em andamento.
 *
 * Agendamento comum não tem pausar/retomar: o RPC só oferece cancelar. Pausa
 * existe apenas para heartbeat. Por isso as duas seções têm ações diferentes.
 */

const HEARTBEAT_DEFAULT = 'every 5m'

/** Só o que o RPC deixa mudar depois de criado. */
function isFinished(job: AgentCronJob): boolean {
  return job.status === 'completed' || job.status === 'cancelled'
}

function StatusBadge({ status }: { status: AgentCronJob['status'] }) {
  const { t } = useT()
  const tone =
    status === 'active' ? 'bg-ok/12 text-ok'
    : status === 'paused' ? 'bg-warn/12 text-warn'
    : 'bg-white/[0.06] text-dim'
  return (
    <span className={'shrink-0 rounded px-1.5 py-[1px] text-micro ' + tone}>
      {t(`sched.status.${status}`)}
    </span>
  )
}

/**
 * Campo de agendamento com validação viva.
 *
 * A expressão é conferida no cliente contra a mesma gramática do agente, então
 * o erro aparece enquanto se digita — não depois de escrever o prompt inteiro e
 * apertar o botão.
 */
function ScheduleField({ value, onChange }: {
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useT()
  const parsed = useMemo(() => parseSchedule(value), [value])

  return (
    <div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={SCHEDULE_EXAMPLES[0]}
        className="w-full rounded border border-[var(--p-line)] bg-black/25 px-2 py-1 font-mono text-xs text-fg outline-none placeholder:text-dim focus:border-primary/40"
      />
      <div className="mt-1 min-h-[14px] text-micro leading-snug">
        {!value.trim() ? (
          <span className="text-dim">{t('sched.examples', { list: SCHEDULE_EXAMPLES.join(' · ') })}</span>
        ) : parsed.ok ? (
          <span className="text-dim">
            {t(`sched.kind.${parsed.parsed.kind}`)}
            {parsed.parsed.nextRunAt
              ? ` · ${t('sched.nextIn', { when: untilTime(parsed.parsed.nextRunAt.toISOString()) })}`
              : ` · ${t('sched.cronServer')}`}
          </span>
        ) : (
          <span className="text-err">{t(`sched.error.${parsed.error}`)}</span>
        )}
      </div>
    </div>
  )
}

export function SchedulesPanel({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const notify = useAgent((s) => s.notify)
  const requestConfirm = useAgent((s) => s.requestConfirm)
  const bridgeReady = useAgent((s) => s.status === 'ready')

  const [creating, setCreating] = useState(false)
  const [schedule, setSchedule] = useState(HEARTBEAT_DEFAULT)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  /** Aviso de sessão residente já mostrado nesta sessão de UI. */
  const [warned, setWarned] = useState(false)

  const [hbSchedule, setHbSchedule] = useState(HEARTBEAT_DEFAULT)
  const [hbPrompt, setHbPrompt] = useState('')
  const [hbDelivery, setHbDelivery] = useState<AgentHeartbeatDeliveryMode>('steer')

  /*
    Polling de 15 s enquanto o painel está montado, porque job cron comum não
    emite evento. Heartbeat emite `heartbeats_changed`, tratado abaixo.
  */
  const data = useAsync(
    async () => {
      const [jobs, hb] = await Promise.all([listSchedules(), getHeartbeat()])
      if (!jobs.ok) throw new Error(jobs.error ?? t('sched.loadFailed'))
      return {
        jobs: jobs.data?.jobs ?? [],
        heartbeat: hb.ok ? (hb.data?.heartbeat ?? null) : null
      }
    },
    [],
    { pollMs: 15_000, keepPrevious: true }
  )

  /*
    `heartbeats_changed` chega pelo assinante único de `lib/useBridge.ts`, que
    já descarta evento de ponte estacionada; o store só conta as mudanças. Um
    `window.prime.on('agent:event')` aqui recarregaria a lista com evento de
    outra ponte.
  */
  const heartbeatsRev = useAgent((s) => s.heartbeatsRev)
  const seenRev = useRef(heartbeatsRev)
  useEffect(() => {
    if (seenRev.current === heartbeatsRev) return
    seenRev.current = heartbeatsRev
    void data.reload()
    // `data.reload` é estável no hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heartbeatsRev])

  /**
   * Primeiro agendamento da sessão avisa que ela vira residente.
   *
   * Não é detalhe: depois disso `bridge:stop` deixa de liberar a sessão, e a
   * pessoa vai encontrar "já ativa em outro worker" ao reabrir a conversa. Se
   * ela souber por quê, é uma consequência; se não, é um bug aparente.
   */
  const withResidentWarning = useCallback((run: () => void) => {
    if (warned) return run()
    requestConfirm({
      title: t('sched.residentTitle'),
      message: t('sched.residentMsg'),
      confirmLabel: t('sched.residentOk'),
      onConfirm: () => {
        setWarned(true)
        run()
      }
    })
  }, [requestConfirm, t, warned])

  const create = useCallback(() => {
    const parsed = parseSchedule(schedule)
    if (!parsed.ok || !prompt.trim()) return

    withResidentWarning(async () => {
      setBusy(true)
      const r = await addSchedule(schedule.trim(), prompt.trim())
      setBusy(false)
      if (!r.ok) {
        notify('error', r.error ?? t('sched.createFailed'))
        return
      }
      setPrompt('')
      setCreating(false)
      notify('info', t('sched.created'))
      void data.reload()
    })
  }, [data, notify, prompt, schedule, t, withResidentWarning])

  const remove = useCallback((job: AgentCronJob) => {
    requestConfirm({
      title: t('sched.cancelTitle'),
      message: t('sched.cancelMsg'),
      detail: job.prompt.slice(0, 200),
      confirmLabel: t('sched.cancelRun'),
      danger: true,
      onConfirm: async () => {
        const r = await cancelSchedule(job.id)
        if (!r.ok) notify('error', r.error ?? t('sched.cancelFailed'))
        void data.reload()
      }
    })
  }, [data, notify, requestConfirm, t])

  const saveHeartbeat = useCallback(() => {
    const parsed = parseSchedule(hbSchedule)
    if (!parsed.ok || !hbPrompt.trim()) return

    withResidentWarning(async () => {
      setBusy(true)
      const r = await setHeartbeat(hbSchedule.trim(), hbPrompt.trim(), hbDelivery)
      setBusy(false)
      if (!r.ok) {
        notify('error', r.error ?? t('sched.hbFailed'))
        return
      }
      setHbPrompt('')
      void data.reload()
    })
  }, [data, hbDelivery, hbPrompt, hbSchedule, notify, t, withResidentWarning])

  const changeHeartbeat = useCallback(async (action: 'pause' | 'resume' | 'clear') => {
    const r = await updateHeartbeat(action)
    if (!r.ok) notify('error', r.error ?? t('sched.hbFailed'))
    void data.reload()
  }, [data, notify, t])

  /*
    Ponte estacionada devolve "Agente não está em execução". Com polling de
    15 s isso viraria erro vermelho piscando, então é estado neutro.
  */
  const offline = !bridgeReady
  const noDaemon = Boolean(data.error && /daemon/i.test(data.error))

  const jobs = (data.data?.jobs ?? []).filter((j) => j.source !== 'heartbeat')
  const heartbeat = data.data?.heartbeat ?? null

  return (
    <DockPanel
      storageKey="schedules"
      defaultWidth={380}
      min={300}
      max={760}
      icon={<CalendarClock size={16} strokeWidth={1.75} className="text-primarySoft" />}
      title={t('sched.title')}
      onClose={onClose}
      bodyClassName="min-h-0 flex-1 overflow-y-auto pb-2"
      actions={
        <>
          <button
            onClick={() => setCreating((v) => !v)}
            disabled={offline}
            className="no-drag rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
            title={t('sched.new')}
          >
            <Plus size={16} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => void data.reload()}
            className="no-drag rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-muted"
            title={t('common.refresh')}
          >
            <RefreshCw
              size={16} strokeWidth={1.75}
              className={data.loading || data.refreshing ? 'animate-spin' : ''}
            />
          </button>
        </>
      }
      footer={
        <div className="border-t border-[var(--p-line)] px-4 py-2 text-micro leading-snug text-dim">
          {t('sched.scopeNote')}
        </div>
      }
    >
      {offline && <PanelEmpty message={t('sched.offline')} />}

      {!offline && noDaemon && (
        <div className="mx-3 my-2 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/[0.06] p-2.5 text-xs leading-snug text-warn">
          <AlertTriangle size={14} strokeWidth={1.75} className="mt-[1px] shrink-0" />
          {t('sched.noDaemon')}
        </div>
      )}

      {!offline && data.error && !noDaemon && <PanelError message={data.error} />}
      {!offline && data.loading && <PanelLoading />}

      {!offline && !noDaemon && creating && (
        <div className="mx-3 my-2 rounded-lg border border-[var(--p-line)] bg-black/20 p-2.5">
          <div className="mb-1.5 text-micro uppercase tracking-wider text-dim">
            {t('sched.new')}
          </div>
          <ScheduleField value={schedule} onChange={setSchedule} />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('sched.promptPlaceholder')}
            rows={3}
            className="mt-1.5 w-full resize-none rounded border border-[var(--p-line)] bg-black/25 px-2 py-1 text-xs text-fg outline-none placeholder:text-dim focus:border-primary/40"
          />
          <div className="mt-1 flex items-start gap-1.5 text-micro leading-snug text-warn">
            <Zap size={12} strokeWidth={1.75} className="mt-[2px] shrink-0" />
            {t('sched.firesAlone')}
          </div>
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              onClick={() => setCreating(false)}
              className="rounded px-2 py-1 text-xs text-muted transition-colors hover:text-fg"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={create}
              disabled={busy || !parseSchedule(schedule).ok || !prompt.trim()}
              className="rounded border border-primary/30 bg-primary/15 px-2 py-1 text-xs text-fg transition-colors hover:bg-primary/25 disabled:border-[var(--p-line)] disabled:bg-transparent disabled:text-dim"
            >
              {t('sched.create')}
            </button>
          </div>
        </div>
      )}

      {!offline && !noDaemon && (
        <>
          {/* ---------- agendamentos ---------- */}
          <div className="px-4 pb-1 pt-2 text-micro uppercase tracking-wider text-dim">
            {t('sched.jobs', { n: jobs.length })}
          </div>

          {jobs.length === 0 && !data.loading && <PanelEmpty message={t('sched.noJobs')} />}

          {jobs.map((job) => (
            <div key={job.id} className="group mx-3 mb-1.5 rounded-lg bg-white/[0.02] p-2.5">
              <div className="flex items-center gap-2">
                <Clock size={13} strokeWidth={1.75} className="shrink-0 text-dim" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                  {job.schedule.expression}
                </span>
                <StatusBadge status={job.status} />
                {!isFinished(job) && (
                  <button
                    onClick={() => remove(job)}
                    title={t('sched.cancelRun')}
                    className="shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-err group-hover:opacity-100"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                )}
              </div>

              <div className="mt-1 line-clamp-3 text-xs leading-snug text-fg">{job.prompt}</div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-micro text-dim">
                {job.nextRunAt && <span>{t('sched.next', { when: untilTime(job.nextRunAt) })}</span>}
                {job.lastRunAt && <span>{t('sched.last', { when: relTime(job.lastRunAt) })}</span>}
                <span>{t('sched.runs', { n: job.runCount })}</span>
              </div>

              {job.lastError && (
                <div className="mt-1 rounded border border-err/25 bg-err/[0.07] px-2 py-1 text-micro leading-snug text-err">
                  {job.lastError}
                </div>
              )}
            </div>
          ))}

          {/* ---------- heartbeat ---------- */}
          <div className="mt-2 border-t border-[var(--p-line)] px-4 pb-1 pt-2 text-micro uppercase tracking-wider text-dim">
            {t('sched.heartbeat')}
          </div>

          {heartbeat ? (
            <div className="mx-3 mb-1.5 rounded-lg bg-white/[0.02] p-2.5">
              <div className="flex items-center gap-2">
                <HeartPulse size={13} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                  {heartbeat.schedule.expression}
                </span>
                <StatusBadge status={heartbeat.status} />
              </div>

              <div className="mt-1 line-clamp-3 text-xs leading-snug text-fg">
                {heartbeat.prompt}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-micro text-dim">
                <span>
                  {heartbeat.deliveryMode === 'follow_up'
                    ? t('sched.deliveryFollowUp')
                    : t('sched.deliverySteer')}
                </span>
                {heartbeat.nextRunAt && (
                  <span>{t('sched.next', { when: untilTime(heartbeat.nextRunAt) })}</span>
                )}
                <span>{t('sched.runs', { n: heartbeat.runCount })}</span>
              </div>

              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() => void changeHeartbeat(heartbeat.status === 'paused' ? 'resume' : 'pause')}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
                >
                  {heartbeat.status === 'paused'
                    ? <><Play size={12} strokeWidth={1.75} />{t('sched.resume')}</>
                    : <><Pause size={12} strokeWidth={1.75} />{t('sched.pause')}</>}
                </button>
                <button
                  onClick={() => requestConfirm({
                    title: t('sched.clearTitle'),
                    message: t('sched.clearMsg'),
                    confirmLabel: t('sched.clearRun'),
                    danger: true,
                    onConfirm: () => changeHeartbeat('clear')
                  })}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-err"
                >
                  <Trash2 size={12} strokeWidth={1.75} />
                  {t('sched.clear')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mx-3 mb-1.5 rounded-lg border border-[var(--p-line)] bg-black/20 p-2.5">
              <ScheduleField value={hbSchedule} onChange={setHbSchedule} />
              <textarea
                value={hbPrompt}
                onChange={(e) => setHbPrompt(e.target.value)}
                placeholder={t('sched.hbPromptPlaceholder')}
                rows={2}
                className="mt-1.5 w-full resize-none rounded border border-[var(--p-line)] bg-black/25 px-2 py-1 text-xs text-fg outline-none placeholder:text-dim focus:border-primary/40"
              />

              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-micro text-dim">{t('sched.delivery')}</span>
                <div className="flex gap-0.5 rounded-md bg-black/25 p-0.5">
                  {(['steer', 'follow_up'] as AgentHeartbeatDeliveryMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setHbDelivery(m)}
                      title={m === 'steer' ? t('sched.deliverySteerHint') : t('sched.deliveryFollowUpHint')}
                      className={
                        'rounded px-1.5 py-0.5 text-micro transition-colors ' +
                        (hbDelivery === m ? 'bg-elevated text-fg' : 'text-dim hover:text-muted')
                      }
                    >
                      {m === 'steer' ? t('sched.deliverySteer') : t('sched.deliveryFollowUp')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2 flex justify-end">
                <button
                  onClick={saveHeartbeat}
                  disabled={busy || !parseSchedule(hbSchedule).ok || !hbPrompt.trim()}
                  className="rounded border border-primary/30 bg-primary/15 px-2 py-1 text-xs text-fg transition-colors hover:bg-primary/25 disabled:border-[var(--p-line)] disabled:bg-transparent disabled:text-dim"
                >
                  {t('sched.hbCreate')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </DockPanel>
  )
}
