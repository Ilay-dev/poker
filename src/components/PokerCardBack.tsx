interface PokerCardBackProps {
  size?: 'xs' | 'sm' | 'md';
  dimmed?: boolean;
}

export function PokerCardBack({ size = 'xs', dimmed = false }: PokerCardBackProps) {
  const sizeClasses = {
    xs: 'w-7 h-10 rounded-md',
    sm: 'w-11 h-[62px] rounded-lg',
    md: 'w-[76px] h-[110px] sm:w-[92px] sm:h-[134px] rounded-2xl',
  }[size];

  return (
    <div
      aria-hidden="true"
      className={`relative border border-white/18 bg-[#0B0B0E] flex items-center justify-center select-none shadow-[0_8px_20px_rgba(0,0,0,0.75)] ${sizeClasses} ${
        dimmed ? 'opacity-30' : 'opacity-100'
      }`}
    >
      <span className="pointer-events-none absolute inset-[3px] rounded-[inherit] border border-white/[0.06]" />
      <svg
        viewBox="0 0 24 24"
        className={size === 'xs' ? 'w-3 h-3 text-white/25' : 'w-5 h-5 text-white/25'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M12 3L20 12L12 21L4 12L12 3Z" />
      </svg>
    </div>
  );
}

