import { cn } from '@/lib/utils';

export function SkeletonLine({
  width,
  height = '14px',
  className,
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('skeleton-shimmer', className)}
      style={{ width: width ?? '100%', height }}
    />
  );
}

export function SkeletonAvatar({ size = 36 }: { size?: number }) {
  return (
    <div
      className="skeleton-shimmer flex-shrink-0"
      style={{ width: size, height: size, borderRadius: '50%' }}
    />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card p-4 space-y-3">
      <SkeletonLine width="60%" height="16px" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} width={i % 2 === 0 ? '100%' : '75%'} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  const widths = ['40%', '60%', '80%', '50%', '70%'];
  return (
    <>
      {Array.from({ length: rows }).map((_, ri) => (
        <tr key={ri}>
          {Array.from({ length: cols }).map((_, ci) => (
            <td key={ci} className="py-3 px-4">
              <SkeletonLine width={widths[(ri + ci) % widths.length]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
