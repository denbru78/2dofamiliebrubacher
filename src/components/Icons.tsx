interface IconProps {
  size?: number
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export function IconHome({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  )
}

export function IconList({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="3.5" width="16" height="17" rx="3" />
      <path d="M8 9h8M8 12.5h8M8 16h5" />
    </svg>
  )
}

export function IconPool({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="9" cy="8" r="3.2" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M15.5 18.5c.3-2.1 1.2-3.4 3-3.5 1.4 0 2.3 1 2.5 3.5" />
    </svg>
  )
}

export function IconTrophy({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5.5a1 1 0 0 0-1 1c0 2.2 1.6 3.5 3.5 3.8M16 6h2.5a1 1 0 0 1 1 1c0 2.2-1.6 3.5-3.5 3.8" />
      <path d="M12 13v4M8.5 20h7M9.5 17h5" />
    </svg>
  )
}

export function IconUser({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c.9-3.8 3.7-6 7.5-6s6.6 2.2 7.5 6" />
    </svg>
  )
}

export function IconPlus({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.5}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconCheck({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={3}>
      <path d="m5 12.5 4.2 4L19 7" />
    </svg>
  )
}

export function IconEdit({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m13.5 6.5 3 3" />
    </svg>
  )
}

export function IconX({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function IconSearch({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  )
}

export function IconChevron({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
