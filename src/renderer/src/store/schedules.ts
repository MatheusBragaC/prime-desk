import type { AgentCronJob, AgentHeartbeatDeliveryMode } from '@shared/protocol'
import { rpcCall, type RpcOutcome } from './rpc'

/*
  Agendamentos e heartbeats.

  Funções finas de propósito, sem estado no store: o painel é o único
  interessado e é dono dos dados via `useAsync`. Guardar aqui só criaria uma
  cópia para sincronizar.

  `rpcCall` e não `rpc`: o erro importa. Sem daemon, `add_schedule` responde
  "Cron jobs require daemon mode", e essa mensagem é a diferença entre a UI
  explicar o que aconteceu e mostrar uma lista vazia mentirosa.
*/
export async function listSchedules(): Promise<RpcOutcome<{ jobs: AgentCronJob[] }>> {
  return rpcCall<{ jobs: AgentCronJob[] }>('list_schedules')
}

export async function addSchedule(
  schedule: string,
  prompt: string
): Promise<RpcOutcome<{ job: AgentCronJob }>> {
  return rpcCall<{ job: AgentCronJob }>('add_schedule', { schedule, prompt })
}

export async function cancelSchedule(jobId: string): Promise<RpcOutcome<{ job: AgentCronJob }>> {
  return rpcCall<{ job: AgentCronJob }>('cancel_schedule', { jobId })
}

export async function getHeartbeat(): Promise<RpcOutcome<{ heartbeat: AgentCronJob | null }>> {
  return rpcCall<{ heartbeat: AgentCronJob | null }>('get_heartbeat')
}

export async function setHeartbeat(
  schedule: string,
  prompt: string,
  deliveryMode: AgentHeartbeatDeliveryMode
): Promise<RpcOutcome<{ heartbeat: AgentCronJob | null }>> {
  return rpcCall<{ heartbeat: AgentCronJob | null }>('set_heartbeat', {
    schedule,
    prompt,
    deliveryMode
  })
}

/** `clear` remove o heartbeat; `pause`/`resume` só mudam o estado. */
export async function updateHeartbeat(
  action: 'pause' | 'resume' | 'clear'
): Promise<RpcOutcome<{ heartbeat: AgentCronJob | null }>> {
  return rpcCall<{ heartbeat: AgentCronJob | null }>('update_heartbeat', { action })
}
