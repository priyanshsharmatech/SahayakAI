/**
 * SahayakAI brand mark — the "Minimal bot": a friendly line-art assistant
 * (antenna, eyes, and a smile with a subtle S-curve). Drawn with `currentColor`
 * so it inherits the surrounding ink and looks right on both light and dark —
 * matching the app's monochrome theme. Pairs with the "Sahayak AI" wordmark.
 */
export default function Logo({
  size = 32,
  className = "",
  title = "Sahayak AI",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      {/* Antenna */}
      <path d="M16 9 V6" />
      <circle cx="16" cy="4.3" r="1.2" fill="currentColor" stroke="none" />
      {/* Head */}
      <rect x="5.5" y="9" width="21" height="16" rx="6" />
      {/* Eyes */}
      <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="20" cy="16" r="1.5" fill="currentColor" stroke="none" />
      {/* Smile — a subtle S-curve */}
      <path d="M11.5 20 C13.2 22 14.8 21.2 16 20.2 C17.2 19.2 18.8 18.8 20.5 20.4" />
    </svg>
  );
}
