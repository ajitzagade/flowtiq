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
}

/**
 * Multi-colored segmented progress bar showing project lifecycle stage.
 * - Each segment represents one workflow stage.
 * - Completed segments are filled with their stage color.
 * - Future segments are light gray.
 * - Compact mode shows only the bar (no labels), for use in tables/cards.
 */
export function ProjectProgress({
  currentStage,
  status,
  stages,
  compact = false,
}: ProjectProgressProps) {
  const stageList = stages && stages.length > 0 ? stages : DEFAULT_WORKFLOW_STAGES;
  const sorted = [...stageList].sort((a, b) => a.order - b.order);
  const { percent, stageIndex, stageName } = getProjectProgress(currentStage, status, sorted);

  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled';

  return (
    <div className="w-full">
      {/* Segmented bar */}
      <div className="flex gap-0.5 rounded-full overflow-hidden h-1.5">
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
                backgroundColor: isCancelled
                  ? '#e2e8f0'
                  : filled
                  ? color
                  : '#e2e8f0',
                opacity: isCurrent ? 0.85 : 1,
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
