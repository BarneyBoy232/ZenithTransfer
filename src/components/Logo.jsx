// The ZenithTransfer mark (option B): a ring with an up arrow and a down arrow,
// representing two-way transfer between devices. Colors use the app's accent
// variables so the logo always matches the current theme.
export default function Logo({ size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="ZenithTransfer"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--accent)" strokeWidth="2.6" />
      <path
        d="M15 27 L15 13 M11 17 L15 13 L19 17"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M25 13 L25 27 M21 23 L25 27 L29 23"
        fill="none"
        stroke="var(--accent-2)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
