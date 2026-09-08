import { useState } from 'react'
import { useStore } from '../lib/store'
import { IconPlus } from './Icons'

/** Schnell erfassen: nur Titel → Familien-Pool, Kategorie Sonstiges, ohne Priorität/Termin */
export function QuickCapture() {
  const { createTask, toast } = useStore()
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    const err = await createTask({
      title: t,
      description: '',
      link: '',
      cost: '',
      category: 'Sonstiges',
      priority: 'none',
      due_kind: 'none',
      due_date: '',
      assignee_ids: [],
      recurrence: 'none',
      recurrence_interval: 1,
    })
    setBusy(false)
    if (err) {
      toast(err, 'error')
      return
    }
    setTitle('')
    toast('✓ Im Familien-Pool gespeichert', 'info')
  }

  return (
    <div className="quick">
      <input
        className="input"
        placeholder="Schnell erfassen – z. B. Rollo Bücherzimmer kaufen"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          }
        }}
        enterKeyHint="done"
        autoComplete="off"
        aria-label="Schnell erfassen"
      />
      <button className="btn" onClick={save} disabled={busy || !title.trim()} aria-label="Speichern">
        <IconPlus size={18} />
      </button>
    </div>
  )
}
