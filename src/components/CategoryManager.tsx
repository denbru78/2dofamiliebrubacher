import { useState } from 'react'
import type { Category } from '../lib/types'
import { useStore } from '../lib/store'
import { IconEdit, IconX } from './Icons'

function CategoryRow({ c, index, total }: { c: Category; index: number; total: number }) {
  const { allCategories, updateCategory, deleteCategory, toast } = useStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(c.name)
  const [icon, setIcon] = useState(c.icon)
  const [confirm, setConfirm] = useState(false)
  const sorted = allCategories.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const isDefaultOther = c.name === 'Sonstiges'

  const run = async (fn: () => Promise<string | null>, ok?: string) => {
    const err = await fn()
    if (err) toast(err, 'error')
    else if (ok) toast(ok, 'info')
  }

  const move = (dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= total) return
    const other = sorted[j]
    // Sortierwerte tauschen
    void run(async () => {
      const e1 = await updateCategory(c.id, { sort_order: other.sort_order === c.sort_order ? other.sort_order + dir : other.sort_order })
      if (e1) return e1
      return updateCategory(other.id, { sort_order: c.sort_order })
    })
  }

  const save = () =>
    run(async () => {
      const n = name.trim()
      if (!n) return 'Bitte einen Namen eingeben.'
      const err = await updateCategory(c.id, { name: n, icon: icon.trim() || '✨' })
      if (!err) setEditing(false)
      return err
    }, 'Kategorie gespeichert')

  return (
    <div className="cat-row">
      {editing ? (
        <div className="cat-edit">
          <input className="input" style={{ width: 64, textAlign: 'center' }} value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} aria-label="Symbol" />
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} aria-label="Name" disabled={isDefaultOther} />
          <button className="btn sm" onClick={save}>
            OK
          </button>
          <button className="icon-btn" onClick={() => setEditing(false)} aria-label="Abbrechen">
            <IconX />
          </button>
        </div>
      ) : (
        <>
          <span className="cat-icon" aria-hidden="true">
            {c.icon}
          </span>
          <span style={{ fontWeight: 600, flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' }} className={c.is_active ? '' : 'muted'}>
            {c.name}
            {!c.is_active && <span className="muted small"> · ausgeblendet</span>}
          </span>
          <button className="icon-btn" onClick={() => move(-1)} disabled={index === 0} aria-label="Nach oben">
            ↑
          </button>
          <button className="icon-btn" onClick={() => move(1)} disabled={index === total - 1} aria-label="Nach unten">
            ↓
          </button>
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Bearbeiten">
            <IconEdit />
          </button>
          {!isDefaultOther && (
            <button
              className={`switch small ${c.is_active ? 'on' : ''}`}
              onClick={() => run(() => updateCategory(c.id, { is_active: !c.is_active }))}
              role="switch"
              aria-checked={c.is_active}
              aria-label="Aktiv"
            />
          )}
          {!isDefaultOther &&
            (confirm ? (
              <button className="btn sm danger" onClick={() => run(() => deleteCategory(c.id), 'Kategorie gelöscht')}>
                Wirklich?
              </button>
            ) : (
              <button className="icon-btn" onClick={() => setConfirm(true)} aria-label="Löschen" style={{ color: 'var(--red)' }}>
                <IconX />
              </button>
            ))}
        </>
      )}
    </div>
  )
}

export function CategoryManager() {
  const { allCategories, addCategory, toast } = useStore()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('✨')
  const [busy, setBusy] = useState(false)
  const sorted = allCategories.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  const add = async () => {
    if (busy) return
    setBusy(true)
    const err = await addCategory(name, icon)
    setBusy(false)
    if (err) {
      toast(err, 'error')
      return
    }
    setName('')
    setIcon('✨')
    toast('Kategorie angelegt', 'info')
  }

  if (allCategories.length === 0) {
    return <div className="muted small">Die Kategorien-Tabelle ist noch nicht eingerichtet. Bitte das SQL-Update „Kategorien“ in Supabase ausführen.</div>
  }

  return (
    <div>
      {sorted.map((c, i) => (
        <CategoryRow key={c.id} c={c} index={i} total={sorted.length} />
      ))}
      <div className="cat-edit" style={{ marginTop: 12 }}>
        <input className="input" style={{ width: 64, textAlign: 'center' }} value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} aria-label="Symbol" />
        <input
          className="input"
          placeholder="Neue Kategorie"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button className="btn sm" onClick={add} disabled={busy || !name.trim()}>
          Hinzufügen
        </button>
      </div>
      <div className="muted small" style={{ marginTop: 8 }}>Beim Löschen einer Kategorie wandern ihre Aufgaben nach „Sonstiges“. Ausgeblendete Kategorien bleiben bei alten Aufgaben sichtbar.</div>
    </div>
  )
}
