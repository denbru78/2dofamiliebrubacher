import { useState } from 'react'
import { IconX } from './Icons'

interface Props {
  title: string
  text?: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

/** Ruhiger Bestätigungsdialog im Designsystem (kein rotes Vollbild) */
export function ConfirmDialog({ title, text, confirmLabel, cancelLabel = 'Abbrechen', danger = false, onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sheet-backdrop" onClick={onCancel} style={{ alignItems: 'center', padding: 24 }}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head" style={{ marginBottom: 6 }}>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Schließen">
            <IconX />
          </button>
        </div>
        {text && <p className="muted" style={{ margin: '0 0 16px' }}>{text}</p>}
        <div className="confirm-actions">
          <button className="btn secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={`btn ${danger ? 'danger' : ''}`} onClick={run} disabled={busy}>
            {busy ? 'Bitte warten…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
