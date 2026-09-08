import { useEffect, useMemo, useRef, useState } from 'react'
import { AutoTextarea } from './AutoTextarea'
import { speechSupported, startSpeech, type SpeechHandle } from '../lib/speech'
import type { DueKind, Priority, TaskInput } from '../lib/types'
import { useStore } from '../lib/store'
import { parseQuick, type ParseResult } from '../lib/quick/parse'
import { DUE_KINDS, PRIORITIES, categoryShort } from '../lib/constants'
import { resolveDueDate, formatDate } from '../lib/dates'
import { Avatar } from './Avatar'
import { AppIcon } from './AppIcon'
import { IconPlus, IconX } from './Icons'

interface Props {
  onOpenForm?: (prefill: TaskInput) => void
}

/** Schnell erfassen mit regelbasierter Erkennung: Person · Termin · Uhrzeit · Kategorie · Priorität · Titel */
export function QuickCapture({ onOpenForm }: Props) {
  const { profile, profiles, categories, settings, quickKeywords, createTask, toast } = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<(ParseResult & { time: string | null }) | null>(null)
  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories])
  const [listening, setListening] = useState(false)
  const speechRef = useRef<SpeechHandle | null>(null)
  const canSpeak = useMemo(() => speechSupported(), [])

  useEffect(() => () => speechRef.current?.stop(), [])

  const toggleMic = () => {
    if (listening) {
      speechRef.current?.stop()
      return
    }
    setDraft(null)
    const h = startSpeech({
      onText: (t, final) => {
        setText(t)
        if (final) {
          // Diktat abgeschlossen → direkt die Vorschau öffnen
          window.setTimeout(() => analyzeText(t), 50)
        }
      },
      onEnd: () => setListening(false),
      onError: (msg) => toast(msg, 'error'),
    })
    if (!h) {
      toast('Spracheingabe auf diesem Gerät nicht verfügbar – bitte das Mikrofon der Tastatur nutzen.', 'info')
      return
    }
    speechRef.current = h
    setListening(true)
  }

  const analyzeText = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    const r = parseQuick(t, profiles, profile, quickKeywords.map((k) => ({ word: k.word, type: k.type, value: k.value })), categoryNames)
    setDraft(r)
  }
  const analyze = () => analyzeText(text)

  const toInput = (d: ParseResult): TaskInput => {
    const reminderAt = d.time && d.due_date && settings.reminders_enabled ? new Date(`${d.due_date}T${d.time}:00`).toISOString() : null
    return {
      title: d.title,
      description: '',
      link: '',
      cost: '',
      category: d.category,
      priority: settings.priorities_enabled ? d.priority : 'none',
      due_kind: d.due_kind,
      due_date: d.due_date ?? '',
      assignee_ids: d.assignee_ids,
      recurrence: 'none',
      recurrence_interval: 1,
      reminder_type: reminderAt ? 'custom' : 'none',
      reminder_at: reminderAt,
    }
  }

  const save = async () => {
    if (!draft || busy) return
    if (!draft.title.trim()) {
      toast('Bitte gib zuerst eine Aufgabe ein.', 'error')
      return
    }
    setBusy(true)
    const err = await createTask(toInput(draft))
    setBusy(false)
    if (err) {
      toast(err, 'error')
      return
    }
    const who = draft.is_pool ? 'im Familien-Pool' : draft.assignee_ids.map((id) => profiles.find((p) => p.id === id)?.display_name ?? '').filter(Boolean).join(' und ')
    toast(`Gespeichert – ${who}${draft.due_label ? ` · ${draft.due_label}` : ''}`, 'info')
    setText('')
    setDraft(null)
  }

  const set = <K extends keyof ParseResult>(key: K, value: ParseResult[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))
  const togglePerson = (id: string) =>
    setDraft((d) => {
      if (!d) return d
      const ids = d.assignee_ids.includes(id) ? d.assignee_ids.filter((x) => x !== id) : [...d.assignee_ids, id]
      return { ...d, assignee_ids: ids, is_pool: ids.length === 0 }
    })
  const setDue = (kind: DueKind) =>
    setDraft((d) => {
      if (!d) return d
      const date = kind === 'date' ? d.due_date : resolveDueDate(kind, '')
      const label = DUE_KINDS.find((x) => x.value === kind)?.label ?? ''
      return { ...d, due_kind: kind, due_date: date, due_label: kind === 'none' ? '' : kind === 'date' && date ? formatDate(date) : label }
    })

  return (
    <div className="quick-wrap">
      <div className="quick">
        <AutoTextarea
          value={text}
          onChange={setText}
          onEnter={analyze}
          placeholder={listening ? 'Ich höre zu …' : 'Schnell erfassen – z. B. Papa, Sonntag 9 Uhr Gartenlaube fertig machen'}
          ariaLabel="Schnell erfassen"
          maxRows={8}
        />
        {canSpeak && (
          <button className={`btn mic ${listening ? 'listening' : ''}`} onClick={toggleMic} aria-label={listening ? 'Aufnahme beenden' : 'Spracheingabe'} aria-pressed={listening}>
            <AppIcon name="mic" size={20} />
          </button>
        )}
        <button className="btn" onClick={analyze} disabled={!text.trim() || listening} aria-label="Prüfen">
          <IconPlus size={18} />
        </button>
      </div>
      {listening && <div className="muted small" style={{ marginTop: 6 }}>Sprich jetzt – die Aufnahme endet automatisch nach einer Pause. Zum Abbrechen erneut auf das Mikrofon tippen.</div>}

      {draft && (
        <div className="card quick-preview">
          <div className="card-head" style={{ marginBottom: 8 }}>
            <h2 style={{ fontSize: 16 }}>So habe ich das verstanden</h2>
            <button className="icon-btn" onClick={() => setDraft(null)} aria-label="Verwerfen">
              <IconX />
            </button>
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <span className="label">Aufgabe</span>
            <AutoTextarea value={draft.title} onChange={(v) => set('title', v)} ariaLabel="Aufgabe" maxRows={10} />
          </div>

          <div className="qp-row">
            <span className="label">Wer</span>
            <div className="chips wrap">
              {profiles.map((p) => (
                <button key={p.id} className={`chip ${draft.assignee_ids.includes(p.id) ? 'active' : ''}`} onClick={() => togglePerson(p.id)}>
                  <Avatar profile={p} size="sm" /> {p.display_name}
                </button>
              ))}
              <button className={`chip ${draft.is_pool ? 'active sage' : ''}`} onClick={() => setDraft((d) => (d ? { ...d, assignee_ids: [], is_pool: true } : d))}>
                Familien-Pool
              </button>
            </div>
          </div>

          <div className="qp-row">
            <span className="label">Wann</span>
            <div className="chips wrap">
              {DUE_KINDS.map((d) => (
                <button key={d.value} className={`chip ${draft.due_kind === d.value ? 'active' : ''}`} onClick={() => setDue(d.value)}>
                  {d.value === 'date' && draft.due_kind === 'date' && draft.due_date ? formatDate(draft.due_date) : d.label}
                </button>
              ))}
            </div>
            {draft.due_kind === 'date' && (
              <input className="input" type="date" value={draft.due_date ?? ''} onChange={(e) => setDraft((d) => (d ? { ...d, due_date: e.target.value || null, due_label: e.target.value ? formatDate(e.target.value) : '' } : d))} style={{ marginTop: 8 }} />
            )}
            {settings.reminders_enabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span className="muted small">Uhrzeit (Erinnerung)</span>
                <input className="input" type="time" style={{ width: 130 }} value={draft.time ?? ''} onChange={(e) => set('time', e.target.value || null)} disabled={!draft.due_date} />
                {draft.time && !draft.due_date && <span className="muted small">Bitte zuerst einen Tag wählen.</span>}
              </div>
            )}
          </div>

          <div className="qp-row">
            <span className="label">Kategorie</span>
            <div className="chips wrap">
              {categories.map((c) => (
                <button key={c.id} className={`chip ${draft.category === c.name ? 'active' : ''}`} onClick={() => set('category', c.name)}>
                  <AppIcon name={c.icon} size={15} /> {categoryShort(c.name)}
                </button>
              ))}
            </div>
          </div>

          {settings.priorities_enabled && (
            <div className="qp-row">
              <span className="label">Priorität</span>
              <div className="chips wrap">
                {PRIORITIES.map((p) => (
                  <button key={p.value} className={`chip ${draft.priority === p.value ? 'active' : ''}`} onClick={() => set('priority', p.value as Priority)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {draft.notes.length > 0 && <div className="notice" style={{ marginTop: 6 }}>{draft.notes.join(' · ')}</div>}

          <div className="task-actions" style={{ marginTop: 12 }}>
            <button className="btn" onClick={save} disabled={busy} style={{ flex: '1 1 auto' }}>
              {busy ? 'Speichern…' : 'Passt, speichern'}
            </button>
            {onOpenForm && (
              <button className="btn secondary" onClick={() => { onOpenForm(toInput(draft)); setDraft(null); setText('') }} disabled={busy}>
                Im Formular öffnen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
