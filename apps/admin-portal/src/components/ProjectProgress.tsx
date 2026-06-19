'use client';

import { getProjectProgress, getStageColor, DEFAULT_WORKFLOW_STAGES } from '@/lib/utils';

interface Stage {
  key: string;
  name: string;
  order: number;
}

interface ProjectProgressProps {
  currentStage?: string;
  status: string;
  stages?: Stage[];
  compact?: boolean;
  /** When provided, renders a simple filled bar using this percentage directly.
   *  Use this for multi-workflow projects where overall progress is pre-computed. */
  progressPct?: number | null;
  completedStages?: number;
  totalStages?: number;
}

/**
 * Multi-colored segmented progress bar showing project lifecycle stage.
 * - Each segment represents one workflow stage.
 * - Completed segments are filled with their stage color.
 * - Future segments are light gray.
 * - Compact mode shows only the bar (no labels), for use in tables/cards.
 * - When progressPct is provided directly, renders a single filled bar.
 */
export function ProjectProgress({
  currentStage,
  status,
  stages,
  compact = false,
  progressPct,
  completedStages,
  totalStages,
}: ProjectProgressProps) {
  const isCancelled = status === 'cancelled';

  // ── Direct progress mode (multi-workflow projects) ─────────────────────────
  if (progressPct !== undefined && progressPct !== null) {
    const pct = isCancelled ? 0 : progressPct;
    const barColor = isCancelled ? '#ef4444' : pct === 100 ? '#10b981' : pct >= 60 ? '#3b82f6' : pct >= 30 ? '#f59e0b' : '#94a3b8';
    const label = isCancelled
      ? 'Cancelled'
      : totalStages
      ? `${completedStages ?? 0} of ${totalStages} stages done`
      : `${pct}% complete`;

    return (
      <div className="w-full">
        <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
        </div>
        {!compact && (
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] text-slate-500 truncate max-w-[70%]">{label}</span>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: isCancelled ? '#ef4444' : barColor }}>
              {isCancelled ? '—' : `${pct}%`}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ── Segmented mode (single-workflow / legacy projects) ─────────────────────
  const stageList = stages && stages.length > 0 ? stages : DEFAULT_WORKFLOW_STAGES;
  const sorted = [...stageList].sort((a, b) => a.order - b.order);
  const { percent, stageIndex, stageName } = getProjectProgress(currentStage, status, sorted);

  const isCompleted = status === 'completed';

  return (
    <div className="w-full">
      {/* Segmented bar */}
      <div className="flex gap-0.5 rounded-full overflow-hidden h-2">
        {sorted.map((stage, i) => {
          const filled = isCompleted || i <= stageIndex;
          const isCurrent = !isCompleted && i === stageIndex;
          const color = getStageColor(i, sorted.length);

          return (
            <div
              key={stage.key}
              title={stage.name}
              className="flex-1 h-full rounded-sm transition-all duration-500"
              style={{
                backgroundColor: isCancelled ? '#e2e8f0' : filled ? color : '#e2e8f0',
                opacity: isCurrent ? 0.8 : 1,
              }}
            />
          );
        })}
      </div>

      {/* Labels */}
      {!compact && (
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-slate-500 truncate max-w-[70%]">
            {isCancelled ? 'Cancelled' : stageName}
          </span>
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: isCancelled ? '#ef4444' : getStageColor(Math.max(0, stageIndex), sorted.length) }}
          >
            {isCancelled ? '—' : `${percent}%`}
          </span>
        </div>
      )}
    </div>
  );
}
