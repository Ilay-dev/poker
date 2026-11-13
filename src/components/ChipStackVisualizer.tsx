import { type ChipStackColumn, type ChipTone, pickPokerStacks } from '../utils/chipStacks.ts';
import { formatMoney } from '../utils/pokerLabels.ts';

interface ChipStackVisualizerProps {
  chips: number;
  startingStack: number;
  compact?: boolean;
  isAllIn?: boolean;
}

const CHIP_PALETTE: Record<
  ChipTone,
  { face: string; rim: string; spot: string; ring: string; stroke: string }
> = {
  ivory: {
    face: '#f4f4f5',
    rim: '#d4d4d8',
    spot: '#18181b',
    ring: 'rgba(24, 24, 27, 0.32)',
    stroke: 'rgba(24, 24, 27, 0.28)',
  },
  crimson: {
    face: '#991b1b',
    rim: '#7f1d1d',
    spot: '#f4f4f5',
    ring: 'rgba(255, 255, 255, 0.35)',
    stroke: 'rgba(0, 0, 0, 0.45)',
  },
  slate: {
    face: '#52525b',
    rim: '#3f3f46',
    spot: '#e4e4e7',
    ring: 'rgba(255, 255, 255, 0.28)',
    stroke: 'rgba(0, 0, 0, 0.5)',
  },
  obsidian: {
    face: '#27272a',
    rim: '#18181b',
    spot: '#a1a1aa',
    ring: 'rgba(255, 255, 255, 0.24)',
    stroke: 'rgba(255, 255, 255, 0.14)',
  },
};

function SingleChipStackSvg({
  column,
  compact,
}: {
  column: ChipStackColumn;
  compact: boolean;
}) {
  const palette = CHIP_PALETTE[column.tone];
  const rx = compact ? 13.5 : 17;
  const ry = compact ? 3.8 : 5;
  const thickness = compact ? 3.5 : 4.6;
  const stepY = compact ? 3.8 : 5;

  const width = rx * 2 + 4;
  const cx = width / 2;
  const topPad = ry + 2;
  const bottomPad = ry + thickness + 2;
  const stackHeight = (column.visualCount - 1) * stepY;
  const height = Math.ceil(topPad + stackHeight + bottomPad);
  const baseCy = height - bottomPad;

  // Front edge spot offsets symmetrically across left, center, and right of the curved rim
  const spotOffsets = [-rx * 0.54, 0, rx * 0.54];
  const spotW = compact ? 2.8 : 3.5;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="overflow-visible transition-all duration-300"
    >
      {Array.from({ length: column.visualCount }).map((_, idx) => {
        const cy = baseCy - idx * stepY;
        const isTopChip = idx === column.visualCount - 1;
        const rimPath = [
          `M ${cx - rx} ${cy}`,
          `L ${cx - rx} ${cy + thickness}`,
          `A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy + thickness}`,
          `L ${cx + rx} ${cy}`,
          `A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy}`,
          'Z',
        ].join(' ');

        return (
          <g key={idx}>
            <path d={rimPath} fill={palette.rim} />
            {spotOffsets.map((dx, sIdx) => {
              const curveDrop = ry * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2));
              const sy = cy + curveDrop + 0.3;
              const sh = Math.max(1.5, thickness - 0.6);
              return (
                <rect
                  key={sIdx}
                  x={cx + dx - spotW / 2}
                  y={sy}
                  width={spotW}
                  height={sh}
                  rx={0.5}
                  fill={palette.spot}
                  opacity={0.9}
                />
              );
            })}
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              fill={palette.face}
              stroke={palette.stroke}
              strokeWidth={0.7}
            />
            {isTopChip && (
              <ellipse
                cx={cx}
                cy={cy}
                rx={rx * 0.58}
                ry={ry * 0.58}
                fill="none"
                stroke={palette.ring}
                strokeWidth={0.8}
                strokeDasharray="2 1.8"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function ChipStackVisualizer({
  chips,
  startingStack,
  compact = false,
  isAllIn = false,
}: ChipStackVisualizerProps) {
  const columns = pickPokerStacks(chips, startingStack);

  return (
    <div
      className={`flex flex-col items-end select-none ${compact ? 'gap-1' : 'gap-1.5'}`}
      aria-label={`Deine Chips: ${formatMoney(chips)}`}
    >
      {columns.length === 0 ? (
        <div className="flex flex-col items-end gap-1.5">
          <div
            className={`${
              compact ? 'w-7 h-3.5' : 'w-9 h-4'
            } rounded-full border border-dashed border-white/15`}
            aria-hidden="true"
          />
          <span className="font-mono-code text-[11px] text-zinc-500">
            {isAllIn ? 'All-In' : '$0'}
          </span>
        </div>
      ) : (
        <>
          <div className={`flex items-end ${compact ? 'gap-1.5' : 'gap-2'}`}>
            {columns.map((col) => (
              <div
                key={col.denomination}
                title={`${col.count} × ${formatMoney(col.denomination)}`}
                className="flex flex-col items-center gap-1"
              >
                <SingleChipStackSvg column={col} compact={compact} />
                <span className="font-mono-code text-[10px] text-zinc-500 leading-none">
                  {col.label}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              Stack
            </span>
            <span className="font-mono-code text-xs font-semibold text-zinc-200">
              {formatMoney(chips)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
