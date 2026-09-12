// Small inline icon set (stroked, currentColor). Inline SVG rather than an icon
// font so nothing has to load from a CDN — important on locked-down networks.
const PATHS = {
  upload: "M12 16V5 M7 10l5-5 5 5 M5 19h14",
  download: "M12 5v11 M7 12l5 5 5-5 M5 20h14",
  copy: "M9 9h9a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1v-9a1 1 0 011-1z M5 15a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1",
  close: "M6 6l12 12 M18 6L6 18",
  arrowRight: "M5 12h13 M12 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  link: "M9 14a3.5 3.5 0 005 0l3-3a3.5 3.5 0 00-5-5l-1 1 M15 10a3.5 3.5 0 00-5 0l-3 3a3.5 3.5 0 005 5l1-1",
  file: "M6 3h8l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z M14 3v4h4",
  text: "M6 6h12 M6 10h12 M6 14h8",
  settings: "M4 8h8 M18 8h2 M4 16h2 M12 16h8",
  plus: "M12 5v14 M5 12h14",
};

// Icons that also need small circles drawn (can't be one path cleanly).
const EXTRA = {
  settings: [
    { cx: 15, cy: 8, r: 2.2 },
    { cx: 9, cy: 16, r: 2.2 },
  ],
  image: [{ cx: 9, cy: 10, r: 1.6 }],
};

export default function Icon({ name, size = 20, className = "" }) {
  const d = PATHS[name];
  const imageBox =
    name === "image"
      ? [
          { rect: true, x: 4, y: 5, w: 16, h: 14 },
          "M4 16l4-4 3 3 4-4 5 5",
        ]
      : null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {imageBox ? (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M4 16l4-4 3 3 4-4 5 5" />
        </>
      ) : (
        <path d={d} />
      )}
      {(EXTRA[name] || []).map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />
      ))}
    </svg>
  );
}
