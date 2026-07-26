export function IconHeart({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
      fill="#c62828"
      stroke="#c62828"
      strokeWidth="1.2"
    >
      <path
        d="M12 20.4 4.8 13.5a4.8 4.8 0 0 1 0-6.9 4.7 4.7 0 0 1 6.7 0l.5.5.5-.5a4.7 4.7 0 0 1 6.7 0 4.8 4.8 0 0 1 0 6.9L12 20.4Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
