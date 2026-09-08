import { useState } from 'react'
import { useStore } from '../lib/store'
import { categoryShort } from '../lib/constants'
import { Avatar } from './Avatar'
import { AppIcon } from './AppIcon'
import { IconX } from './Icons'

/** Familieneigene Stichwörter für die Schnelleingabe (Eltern): Namen/Kosenamen → Person, Wörter → Kategorie */
export function QuickKeywordManager() {
  const { quickKeywords, profiles, categories, addQuickKeyword, removeQuickKeyword, toast } = useStore()
  const [word, setWord] = useState('')
  const [type, setType] = useState<'person' | 'category'>('person')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (busy) return
    if (!value) {
      toast(type === 'person' ? 'Bitte eine Person wählen.' : 'Bitte eine Kategorie wählen.', 'error')
      return
    }
    setBusy(true)
    const err = await addQuickKeyword(word, type, value)
    setBusy(false)
    if (err) toast(err, 'error')
    else {
      setWord('')
      toast('Stichwort gespeichert', 'info')
    }
  }

  const label = (k: { type: string; value: string }) =>
    k.type === 'person' ? (profiles.find((p) => p.id === k.value)?.display_name ?? 'Unbekannt') : categoryShort(k.value)

  return (
    <div>
      <div className="muted small" style={{ marginBottom: 10 }}>
        Die Schnelleingabe kennt bereits Namen aus der Familie, Papa/Mama/Kinder, Wochentage, Uhrzeiten und mehrere hundert Alltagswörter. Hier ergänzt ihr eigene Wörter – z. B. Kosenamen („Benni“ → Benjamin) oder „Touareg“ → Auto.
      </div>
      {quickKeywords.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {quickKeywords.map((k) => (
            <div key={k.id} className="history-row">
              <span className="tag">{k.word}</span>
              <span className="muted small">→</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                {k.type === 'person' ? <Avatar profile={profiles.find((p) => p.id === k.value)} size="sm" /> : <AppIcon name={categories.find((c) => c.name === k.value)?.icon ?? 'sparkle'} size={16} />}
                {label(k)}
              </span>
              <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={async () => { const e = await removeQuickKeyword(k.id); if (e) toast(e, 'error') }} aria-label="Entfernen">
                <IconX />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="cat-edit" style={{ flexWrap: 'wrap' }}>
        <input className="input" placeholder="Wort, z. B. Benni" value={word} onChange={(e) => setWord(e.target.value)} maxLength={40} style={{ flex: '1 1 140px' }} />
        <select className="select" value={type} onChange={(e) => { setType(e.target.value as 'person' | 'category'); setValue('') }} style={{ width: 'auto' }}>
          <option value="person">bedeutet Person</option>
          <option value="category">bedeutet Kategorie</option>
        </select>
        <select className="select" value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: '1 1 140px' }}>
          <option value="">– wählen –</option>
          {type === 'person'
            ? profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))
            : categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
        </select>
        <button className="btn sm" onClick={add} disabled={busy || !word.trim() || !value}>
          Hinzufügen
        </button>
      </div>
    </div>
  )
}
