import type { PokerCard as PokerCardType, Suit } from '../../shared/types.ts';
import { getCardDescriptionDe, getRankDisplayLabel, SUIT_META } from '../utils/pokerLabels.ts';

interface PokerCardProps {
  card: PokerCardType;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  highlighted?: boolean;
  dimmed?: boolean;
}

function SuitVector({
  suit,
  color,
  className,
}: {
  suit: Suit;
  color: string;
  className: string;
}) {
  switch (suit) {
    case 'hearts':
      return (
        <svg viewBox="0 0 32 32" className={className} fill={color} aria-hidden="true">
          <path d="M16 28.2C16 28.2 4.5 20.6 4.5 11.8C4.5 7.9 7.5 5 11.2 5C13.4 5 15.1 6.1 16 7.7C16.9 6.1 18.6 5 20.8 5C24.5 5 27.5 7.9 27.5 11.8C27.5 20.6 16 28.2 16 28.2Z" />
        </svg>
      );
    case 'diamonds':
      return (
        <svg viewBox="0 0 32 32" className={className} fill={color} aria-hidden="true">
          <path d="M16 3.5L26.5 16L16 28.5L5.5 16L16 3.5Z" />
        </svg>
      );
    case 'spades':
      return (
        <svg viewBox="0 0 32 32" className={className} fill={color} aria-hidden="true">
          <path d="M16 3.5C16 3.5 5.2 12.2 5.2 18.2C5.2 21.8 8 24.3 11.2 24.3C13 24.3 14.5 23.4 15.3 22.1C15.1 24.8 14 26.9 11.8 28.5H20.2C18 26.9 16.9 24.8 16.7 22.1C17.5 23.4 19 24.3 20.8 24.3C24 24.3 26.8 21.8 26.8 18.2C26.8 12.2 16 3.5 16 3.5Z" />
        </svg>
      );
    case 'clubs':
      return (
        <svg viewBox="0 0 32 32" className={className} fill={color} aria-hidden="true">
          <circle cx="16" cy="9.6" r="5.1" />
          <circle cx="9.8" cy="18.2" r="5.1" />
          <circle cx="22.2" cy="18.2" r="5.1" />
          <path d="M14.2 18.5H17.8L19.4 28.2H12.6L14.2 18.5Z" />
        </svg>
      );
  }
}

export function PokerCard({
  card,
  size = 'md',
  highlighted = false,
  dimmed = false,
}: PokerCardProps) {
  const meta = SUIT_META[card.suit];
  const rankLabel = getRankDisplayLabel(card.rank);

  const sizeClasses = {
    xs: 'w-9 h-[52px] rounded-md p-1',
    sm: 'w-11 h-[62px] rounded-lg p-1.5',
    md: 'w-[76px] h-[110px] sm:w-[92px] sm:h-[134px] rounded-2xl p-2 sm:p-2.5',
    lg: 'w-[92px] h-[134px] sm:w-[110px] sm:h-[160px] rounded-[18px] sm:rounded-[20px] p-2.5 sm:p-3',
  }[size];

  const cornerRankSize = {
    xs: 'text-[10px]',
    sm: 'text-[11px]',
    md: 'text-sm sm:text-base',
    lg: 'text-base sm:text-lg',
  }[size];

  const cornerSuitSize = {
    xs: 'w-2 h-2',
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3 sm:w-3.5 sm:h-3.5',
    lg: 'w-3.5 h-3.5 sm:w-4 sm:h-4',
  }[size];

  const centerSuitSize = {
    xs: 'w-4 h-4',
    sm: 'w-5 h-5',
    md: 'w-6 h-6 sm:w-7 sm:h-7',
    lg: 'w-7 h-7 sm:w-8 sm:h-8',
  }[size];

  const centerRankSize = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-2xl sm:text-[28px]',
    lg: 'text-3xl sm:text-[34px]',
  }[size];

  const borderColor = highlighted
    ? 'rgba(255, 255, 255, 0.94)'
    : meta.border;

  const surfaceBackground = `radial-gradient(circle at 50% 48%, ${meta.glow} 0%, ${meta.tint} 44%, #0A0A0C 82%), linear-gradient(155deg, #16161B 0%, #08080A 100%)`;

  return (
    <div
      aria-label={getCardDescriptionDe(card)}
      style={{
        background: surfaceBackground,
        borderColor,
        boxShadow: highlighted
          ? '0 0 0 1.5px rgba(255,255,255,0.9), 0 18px 36px rgba(0,0,0,0.92)'
          : '0 12px 28px rgba(0,0,0,0.84)',
      }}
      className={`animate-card-pop relative flex flex-col justify-between border overflow-hidden select-none transition-all duration-200 ease-out shrink-0 ${sizeClasses} ${
        dimmed ? 'opacity-40' : 'opacity-100'
      }`}
    >
      {/* Subtle architectural inner frame */}
      {size !== 'xs' && size !== 'sm' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[5px] rounded-[inherit] border border-white/[0.06]"
        />
      )}

      {/* Top-left corner */}
      <div className="relative z-10 flex items-center justify-between w-full leading-none">
        <div className="flex flex-col items-center leading-none">
          <span
            className={`font-mono-code font-bold tracking-tight ${cornerRankSize}`}
            style={{ color: meta.text }}
          >
            {rankLabel}
          </span>
          <SuitVector suit={card.suit} color={meta.hex} className={`${cornerSuitSize} mt-0.5`} />
        </div>
      </div>

      {/* Center rank + suit emblem */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 gap-0.5">
        {(size === 'md' || size === 'lg') && (
          <span
            className={`font-mono-code font-bold tracking-tight leading-none ${centerRankSize}`}
            style={{ color: meta.text }}
          >
            {rankLabel}
          </span>
        )}
        <SuitVector suit={card.suit} color={meta.hex} className={centerSuitSize} />
      </div>

      {/* Bottom-right corner */}
      {size !== 'xs' && (
        <div className="relative z-10 flex items-center justify-end w-full leading-none">
          <div className="flex flex-col items-center leading-none rotate-180">
            <span
              className={`font-mono-code font-bold tracking-tight ${cornerRankSize}`}
              style={{ color: meta.text }}
            >
              {rankLabel}
            </span>
            <SuitVector suit={card.suit} color={meta.hex} className={`${cornerSuitSize} mt-0.5`} />
          </div>
        </div>
      )}
    </div>
  );
}
