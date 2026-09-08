export function HeroIllustration() {
  return (
    <svg className="hero-illu" viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="80" cy="102" rx="78" ry="10" fill="#DFEAE2" />
      <ellipse cx="30" cy="80" rx="18" ry="16" fill="#A9C7B2" />
      <ellipse cx="22" cy="86" rx="14" ry="12" fill="#8FB39A" />
      <rect x="55" y="58" width="56" height="40" rx="4" fill="#FBF7EF" />
      <path d="M50 60 L83 32 L116 60 Z" fill="#EF8A6A" />
      <rect x="96" y="40" width="7" height="14" rx="1.5" fill="#D9705A" />
      <rect x="77" y="76" width="12" height="22" rx="3" fill="#E7A94F" />
      <rect x="61" y="68" width="10" height="10" rx="2" fill="#C9DAF0" />
      <rect x="95" y="68" width="10" height="10" rx="2" fill="#C9DAF0" />
      <path d="M83 63 c-3 -4 -8 -1 -5 3 l5 5 l5 -5 c3 -4 -2 -7 -5 -3z" fill="#EF8A6A" />
    </svg>
  )
}

/** Sonne mit Strahlen – dient als Mitteilungs-Glocke; bei neuen Mitteilungen breiten sich die Strahlen aus */
export function SunBell({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <button className={`sun-bell ${unread > 0 ? 'has-unread' : ''}`} onClick={onClick} aria-label={unread > 0 ? `Mitteilungen, ${unread} neu` : 'Mitteilungen'}>
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g className="rays" stroke="#F1C65E" strokeWidth="5" strokeLinecap="round">
          <line x1="50" y1="6" x2="50" y2="16" />
          <line x1="50" y1="84" x2="50" y2="94" />
          <line x1="6" y1="50" x2="16" y2="50" />
          <line x1="84" y1="50" x2="94" y2="50" />
          <line x1="19" y1="19" x2="26" y2="26" />
          <line x1="74" y1="74" x2="81" y2="81" />
          <line x1="81" y1="19" x2="74" y2="26" />
          <line x1="26" y1="74" x2="19" y2="81" />
        </g>
        <circle className="disc" cx="50" cy="50" r="27" fill="#F6D27A" />
        <g fill="none" stroke="#5A4410" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" transform="translate(50 50) scale(1.15) translate(-12 -12)">
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
          <path d="M10 20.5a2 2 0 0 0 4 0" />
        </g>
      </svg>
      {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
    </button>
  )
}
