type MineLogoProps = {
  className?: string;
};

// One SVG for both the navbar and coach header, so their logos stay identical.
// The browser tab uses public/favicon.svg; update that too if the mark changes.
export function MineLogo({ className }: MineLogoProps) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M20 3v34M3 20h34M8 8l24 24M8 32L32 8"
        stroke="#e83b45"
        strokeWidth="3.5"
        strokeLinecap="square"
      />
      <circle cx="20" cy="20" r="12" fill="#e83b45" />
      <path d="M20 8a12 12 0 0 1 0 24V8Z" fill="#bf2333" />
      <rect x="13" y="12" width="6" height="6" rx="1" fill="white" />
      <path d="M26 21v5h-5" stroke="#111111" strokeWidth="3" />
    </svg>
  );
}
