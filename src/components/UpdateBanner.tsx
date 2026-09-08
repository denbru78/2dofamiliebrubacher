import { useEffect, useState } from 'react'
import { applyUpdate, onUpdate } from '../lib/sw'
import { AppIcon } from './AppIcon'

export function UpdateBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => onUpdate(setShow), [])
  if (!show) return null
  return (
    <div className="update-banner" role="status">
      <AppIcon name="sparkle" size={18} />
      <span style={{ flex: '1 1 auto' }}>Neue Version verfügbar</span>
      <button className="btn sm" onClick={applyUpdate}>
        Aktualisieren
      </button>
    </div>
  )
}
