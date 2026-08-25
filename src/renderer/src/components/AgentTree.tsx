import { useState } from 'react'
import {
  ChevronRight, GitBranch, Loader2, CheckCircle2, Circle, CornerDownRight,
  MessageSquare, X, Code2, RefreshCw, Eye, Radio
} from 'lucide-react'
import type { AgentNode } from '../../../shared/protocol'
import { useAgent, observeSession } from '../store/agent'
import { Butterfly } from './Butterfly'
import { relTime } from '../lib/format'
import { useResizable } from '../lib/useResizable'
import { ResizeHandle } from './ResizeHandle'
import { useT } from '../i18n'

function StatusDot({ node }: { node: AgentNode }) {
  if (node.status === 'working') {
    return <Loader2 size={14} strokeWidth={1.75} className="shrink-0 animate-spin text-primary" />
  }
  if (node.kind === 'subagent' && node.replied) {
    return <CheckCircle2 size={14} strokeWidth={1.75} className="shrink-0 text-ok" />
  }
  if (node.status === 'idle') {
    return <Circle size={14} strokeWidth={1.75} className="shrink-0 text-dim" />
  }
  return <Circle size={14} strokeWidth={1.75} className="shrink-0 text-grid" />
}

function TaskBadge({ node }: { node: AgentNode }) {
  const { t } = useT()
  if (node.status === 'working') {
    return <span className="shrink-0 rounded bg-primary/15 px-1.5 py-[1px] text-micro text-primarySoft">{t('tree.active')}</span>
  }
  if (node.taskState === 'needs_input') {
    return <span className="shrink-0 rounded bg-warn/12 px-1.5 py-[1px] text-micro text-warn">{t('tree.waiting')}</span>
  }
  if (node.kind === 'subagent' && node.replied) {
    return <span className="shrink-0 rounded bg-ok/12 px-1.5 py-[1px] text-micro text-ok">{t('tree.replied')}</span>
  }
  return null
}

function Node({ node, level }: { node: AgentNode; level: number }) {
  const { t } = useT()
  const [open, setOpen] = useState(level < 2)
  const [showCode, setShowCode] = useState(false)
  const hasChildren = node.children.length > 0
  const watching = useAgent((s) => Boolean(s.observed[node.activeSessionId]))

  const label =
    node.name || (node.kind === 'root' ? t('tree.rootName') : node.rlmChildId || 'subagent')

  return (
    <div>
      <div
        className="group flex items-start gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]"
        style={{ paddingLeft: 8 + level * 15 }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={!hasChildren}
          className="mt-[3px] shrink-0 disabled:opacity-0"
        >
          <ChevronRight
            size={14} strokeWidth={1.75}
            className={'text-dim transition-transform duration-200 ' + (open ? 'rotate-90' : '')}
          />
        </button>

        {level === 0 ? (
          <Butterfly size={13} className="mt-[3px] shrink-0" />
        ) : (
          <CornerDownRight size={14} strokeWidth={1.75} className="mt-[3px] shrink-0 text-grid" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <StatusDot node={node} />
            <span className="truncate text-sm text-fg">{label}</span>
            <TaskBadge node={node} />
            {watching ? (
              <span className="ml-auto flex shrink-0 items-center gap-1 text-micro text-ok">
                <Radio size={12} strokeWidth={1.75} className="animate-pulse-soft" />
                {t('tree.watching')}
              </span>
            ) : (
              <button
                onClick={() => void observeSession(node.activeSessionId, label)}
                className="ml-auto shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-primarySoft group-hover:opacity-100"
                title={t('tree.watch')}
              >
                <Eye size={14} strokeWidth={1.75} />
              </button>
            )}
          </div>

          <div className="mt-0.5 flex items-center gap-2 text-micro text-dim">
            {node.depth > 0 && <span className="font-mono">d{node.depth}</span>}
            <span className="flex items-center gap-1">
              <MessageSquare size={12} strokeWidth={1.75} />
              {node.messageCount}
            </span>
            {node.modelName && <span className="truncate">{node.modelName}</span>}
            {node.lastActivityAt && <span>{relTime(node.lastActivityAt)}</span>}
          </div>

          {node.firstMessage && (
            <div className="mt-1 line-clamp-2 text-xs leading-snug text-dim">
              {node.firstMessage}
            </div>
          )}

          {node.spawnCode && (
            <>
              <button
                onClick={() => setShowCode((v) => !v)}
                className="mt-1 flex items-center gap-1 text-micro text-dim transition-colors hover:text-muted"
              >
                <Code2 size={12} strokeWidth={1.75} />
                {showCode ? t('tree.hideSpawn') : t('tree.showSpawn')}
              </button>
              {showCode && (
                <pre className="mt-1 max-h-32 animate-fade-up overflow-auto rounded-md border border-[var(--p-line)] bg-[#08080a] p-2 font-mono text-micro leading-relaxed text-mint">
                  {node.spawnCode.trim()}
                </pre>
              )}
            </>
          )}
        </div>
      </div>

      {open && hasChildren && (
        <div className="border-l border-[var(--p-line)]" style={{ marginLeft: 14 + level * 15 }}>
          {node.children.map((c) => (
            <Node key={c.activeSessionId} node={c} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function AgentTree({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const tree = useAgent((s) => s.tree)
  const error = useAgent((s) => s.treeError)
  const size = useResizable('agent-tree', 310, 240, 680, 'left')

  return (
    <aside
      style={{ width: size.width }}
      className="relative flex shrink-0 flex-col border-l border-[var(--p-line)] bg-[var(--p-surface)]"
    >
      <ResizeHandle
        side="left"
        dragging={size.dragging}
        onMouseDown={size.onMouseDown}
        onReset={size.reset}
      />
      <div className="drag-region flex h-[var(--p-titlebar)] items-center gap-2 border-b border-[var(--p-line)] px-4">
        <GitBranch size={16} strokeWidth={1.75} className="text-primarySoft" />
        <span className="flex-1 text-sm font-semibold">{t('tree.title')}</span>
        <button
          onClick={() => void window.prime.refreshAgentTree()}
          className="no-drag text-dim transition-colors hover:text-muted"
          title={t('common.refresh')}
        >
          <RefreshCw size={14} strokeWidth={1.75} />
        </button>
        <button onClick={onClose} className="no-drag text-dim transition-colors hover:text-fg">
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="border-b border-[var(--p-line)] px-4 py-2 text-xs text-dim">
        {tree ? (
          t('tree.summary', { total: tree.total, subs: tree.subagents })
        ) : (
          t('common.loading')
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {error && (
          <div className="mx-3 my-2 rounded-lg border border-err/25 bg-err/[0.07] p-2.5 text-xs text-err">
            {error}
          </div>
        )}
        {tree?.roots.length === 0 && !error && (
          <div className="px-4 py-8 text-center text-sm text-dim">
            {t('tree.none')}
          </div>
        )}
        {tree?.roots.map((r) => (
          <Node key={r.activeSessionId} node={r} level={0} />
        ))}
      </div>

      <div className="border-t border-[var(--p-line)] px-4 py-2.5 text-micro leading-snug text-dim">
        {t('tree.note')}
      </div>
    </aside>
  )
}
