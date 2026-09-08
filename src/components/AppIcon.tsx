/* Einheitliche Line-Icon-Familie (24er Raster, 2px, runde Enden).
   Wird für Kategorien, Erfolge, Navigation und Leerzustände verwendet. */
import type { ReactNode } from 'react'

interface Props {
  name: string
  size?: number
  className?: string
}

const PATHS: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-13 14-13 0 9-5 14-13 14" />
      <path d="M5 19c3-4 6-7 10-9" />
    </>
  ),
  car: (
    <>
      <path d="M4 15v-3l2-5h12l2 5v3" />
      <path d="M3 15h18v3H3z" />
      <circle cx="7.5" cy="18.5" r="1.6" />
      <circle cx="16.5" cy="18.5" r="1.6" />
      <path d="M7 12h10" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.4 11h10.2L20 7H6.2" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="16" cy="19" r="1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  family: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M15.5 18.5c.3-2.1 1.2-3.4 3-3.5 1.4 0 2.3 1 2.5 3.5" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2.5" />
      <path d="M9 4.5V3h6v1.5" />
      <path d="M9 10h6M9 13.5h6M9 17h3" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8.5 13.6 12 17 13.5 13.6 15 12 18.5 10.4 15 7 13.5l3.4-1.5z" />
    </>
  ),
  tool: (
    <>
      <path d="M14.5 6.5a4 4 0 0 0 5 5l-8.2 8.2a2 2 0 0 1-2.8-2.8L16.7 8.7" />
      <path d="M14.5 6.5 17 4l3 3-2.5 2.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
  check: <path d="m5 12.5 4.2 4L19 7" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />,
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5.5a1 1 0 0 0-1 1c0 2.2 1.6 3.5 3.5 3.8M16 6h2.5a1 1 0 0 1 1 1c0 2.2-1.6 3.5-3.5 3.8" />
      <path d="M12 13v4M8.5 20h7M9.5 17h5" />
    </>
  ),
  hand: (
    <>
      <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 11V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M17 12v1a1.5 1.5 0 0 1 3 0v3a5 5 0 0 1-5 5h-3a5 5 0 0 1-4.3-2.4L5 14.5a1.5 1.5 0 0 1 2.5-1.7L8 13.5" />
    </>
  ),
  bolt: <path d="M13 3 5 13.5h6L11 21l8-10.5h-6z" />,
  repeat: (
    <>
      <path d="M17 2.5 20.5 6 17 9.5" />
      <path d="M3.5 11V9.5a3.5 3.5 0 0 1 3.5-3.5h13" />
      <path d="M7 21.5 3.5 18 7 14.5" />
      <path d="M20.5 13v1.5a3.5 3.5 0 0 1-3.5 3.5h-13" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.8" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </>
  ),
  euro: (
    <>
      <path d="M18 6.5A7 7 0 0 0 7 12a7 7 0 0 0 11 5.5" />
      <path d="M4 10h9M4 14h9" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </>
  ),
  basket: (
    <>
      <path d="M4 10h16l-1.5 9.5h-13z" />
      <path d="M8.5 10 12 4l3.5 6" />
      <path d="M9.5 13.5v3M14.5 13.5v3" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H5z" />
      <path d="M19 4.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z" />
    </>
  ),
  balloon: (
    <>
      <ellipse cx="12" cy="9" rx="5.5" ry="6.5" />
      <path d="M12 15.5 11 17h2zM12 17c0 2-1.5 2.5-1.5 4.5" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z" />,
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4h11l-2.5 4L17 12H6" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
}

export const ICON_KEYS = Object.keys(PATHS)

export function AppIcon({ name, size = 22, className }: Props) {
  const p = PATHS[name]
  if (!p) {
    // Unbekannter Schlüssel (z. B. altes Emoji): als Text anzeigen
    return (
      <span className={className} style={{ fontSize: size * 0.85, lineHeight: 1 }} aria-hidden="true">
        {name}
      </span>
    )
  }
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {p}
    </svg>
  )
}
