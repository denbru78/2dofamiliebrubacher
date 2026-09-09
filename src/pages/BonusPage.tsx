import { useMemo, useState } from 'react'
import type { Profile, Task } from '../lib/types'
import { useStore } from '../lib/store'
import { BONUS_LEVELS, BONUS_MILESTONES } from '../lib/constants'
import { formatDate, formatDateTime, startOfWeek } from '../lib/dates'
import { Avatar } from '../components/Avatar'
import { AppIcon } from '../components/AppIcon'
import { IconBack } from '../components/Icons'

function euro(points: number, value: number): string {
  return (points * value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

/** Kinder-Ansicht „Mein Bonus“ + Eltern-Ansicht mit Bestätigungen, Budget und Auszahlungen */
export function BonusPage({ onBack }: { onBack: () => void }) {
  const { profile, profiles, isAdmin, settings, tasks, bonusLedger, bonusPayouts, bonusBalance, bonusDecide, bonusPayoutRequest, bonusPayoutDecide, openTask, toast } = useStore()
  const [showValue, setShowValue] = useState(false)
  const [payout, setPayout] = useState('')
  const [rejecting, setRejecting] = useState<Task | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [rules, setRules] = useState(false)
  const members = profiles.filter((p) => p.role === 'member')
  const weekStart = startOfWeek().getTime()

  const run = async (key: string, fn: () => Promise<string | null>, ok?: string) => {
    if (busy) return
    setBusy(key)
    const err = await fn()
    setBusy(null)
    if (err) toast(err, 'error')
    else if (ok) toast(ok, 'info')
  }

  const pendingTasks = useMemo(() => tasks.filter((t) => t.bonus_status === 'pending'), [tasks])
  const pendingPayouts = bonusPayouts.filter((p) => p.status === 'pending')

  const weekEarned = (pid: string) => bonusLedger.filter((l) => l.profile_id === pid && l.kind === 'earned' && new Date(l.created_at).getTime() >= weekStart).reduce((s, l) => s + l.delta, 0)
  const weekBudgetUsed = (pid: string) =>
    tasks.filter((t) => t.bonus_points > 0 && t.assignee_ids.includes(pid) && new Date(t.created_at).getTime() >= weekStart && t.bonus_status !== 'rejected').reduce((s, t) => s + t.bonus_points, 0)
  const totalEarned = (pid: string) => bonusLedger.filter((l) => l.profile_id === pid && l.delta > 0).reduce((s, l) => s + l.delta, 0)
  const milestone = (earned: number) => {
    const reached = BONUS_MILESTONES.filter((m) => earned >= m.at)
    const next = BONUS_MILESTONES.find((m) => earned < m.at)
    return { reached: reached[reached.length - 1], next }
  }

  const rulesCard = (
    <div className="card">
      <button className="card-title-btn" onClick={() => setRules(!rules)} style={{ width: '100%' }}>
        <div className="card-head" style={{ marginBottom: 0, width: '100%' }}>
          <h2>So funktioniert der Bonus</h2>
          <span className="muted">{rules ? '▾' : '▸'}</span>
        </div>
      </button>
      {rules && (
        <div className="small" style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 8px' }}>Normale Familienpflichten bringen keine Punkte. Nur Aufgaben, die Mama oder Papa als Bonus anlegen, zählen. Gleiche Aufgabe = gleiche Punkte für alle.</p>
          {BONUS_LEVELS.filter((l) => l.points > 0).map((l) => (
            <div key={l.points} className="history-row" style={{ padding: '5px 0' }}>
              <span className="tag pool" style={{ minWidth: 64, justifyContent: 'center' }}>{l.points} P</span>
              <span>
                <strong>{l.label.split(' · ')[0]}</strong> – {l.hint}
              </span>
            </div>
          ))}
          <p className="muted" style={{ margin: '8px 0 0' }}>Bewertet werden Aufwand, Selbstständigkeit und Verantwortung. Nach dem Erledigen schaut ein Elternteil kurz drauf und bestätigt die Punkte. Punkte kannst du sammeln und auszahlen lassen – sie verfallen nicht.</p>
        </div>
      )}
    </div>
  )

  // ---------- Kinder-Ansicht --------------------------------------------------
  const kidView = (p: Profile) => {
    const balance = bonusBalance(p.id)
    const earned = totalEarned(p.id)
    const wk = weekEarned(p.id)
    const ms = milestone(earned)
    const pendingPts = pendingPayouts.filter((x) => x.profile_id === p.id).reduce((s, x) => s + x.points, 0)
    const available = balance - pendingPts
    const mine = pendingTasks.filter((t) => t.completed_by === p.id)
    const ledger = bonusLedger.filter((l) => l.profile_id === p.id).slice(0, 15)
    const progress = ms.next ? Math.min(100, Math.round((earned / ms.next.at) * 100)) : 100
    return (
      <>
        <div className="card bonus-hero">
          <div className="bonus-points">{balance}</div>
          <div className="bonus-sub">{balance === 1 ? 'Punkt' : 'Punkte'} auf deinem Bonuskonto</div>
          <div className="muted small">diese Woche +{wk}{ms.reached ? ` · ${ms.reached.text}` : ''}</div>
          {ms.next && (
            <>
              <div className="progress-bar" style={{ margin: '12px 0 6px' }}>
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="muted small">Nächste Stufe „{ms.next.text}“ bei {ms.next.at} gesammelten Punkten</div>
            </>
          )}
          <button className="link-btn" style={{ marginTop: 8 }} onClick={() => setShowValue(!showValue)}>
            Was sind meine Punkte wert?
          </button>
          {showValue && (
            <div className="notice" style={{ marginTop: 4 }}>
              1 Punkt = {euro(1, settings.bonus_point_value)} · {balance} Punkte = {euro(balance, settings.bonus_point_value)}
            </div>
          )}
        </div>

        {mine.length > 0 && (
          <div className="card">
            <h2 style={{ marginBottom: 6 }}>Wartet auf Bestätigung</h2>
            {mine.map((t) => (
              <button key={t.id} className="history-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => openTask(t.id)}>
                <span className="tag pool">{t.bonus_points} P</span>
                <span style={{ fontWeight: 600 }}>{t.title}</span>
                <span className="muted small" style={{ marginLeft: 'auto' }}>Mama oder Papa schauen drauf</span>
              </button>
            ))}
          </div>
        )}

        <div className="card">
          <h2 style={{ marginBottom: 6 }}>Auszahlen</h2>
          {available <= 0 ? (
            <div className="muted small">{pendingPts > 0 ? `${pendingPts} Punkte sind angefragt und warten auf Mama oder Papa.` : 'Noch keine Punkte zum Auszahlen – sammel weiter!'}</div>
          ) : (
            <>
              <div className="muted small" style={{ marginBottom: 8 }}>Verfügbar: {available} {available === 1 ? 'Punkt' : 'Punkte'}{pendingPts > 0 ? ` (${pendingPts} bereits angefragt)` : ''}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" inputMode="numeric" placeholder={`bis ${available}`} value={payout} onChange={(e) => setPayout(e.target.value)} style={{ width: 110 }} />
                <button className="btn" disabled={!!busy || !payout} onClick={() => run('payout', () => bonusPayoutRequest(Math.max(1, Math.min(available, Math.round(Number(payout) || 0)))), 'Anfrage ist bei Mama und Papa')}>
                  {busy === 'payout' ? 'Bitte warten…' : 'Auszahlung anfragen'}
                </button>
                <button className="btn secondary" disabled={!!busy} onClick={() => setPayout(String(available))}>
                  Alles
                </button>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 6 }}>Verlauf</h2>
          {ledger.length === 0 ? (
            <div className="muted small">Noch nichts gebucht.</div>
          ) : (
            ledger.map((l) => (
              <div key={l.id} className="history-row">
                <span className={`tag ${l.delta > 0 ? 'pool' : ''}`}>{l.delta > 0 ? `+${l.delta}` : l.delta} P</span>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{l.note ?? (l.kind === 'payout' ? 'Auszahlung' : 'Buchung')}</span>
                <span className="muted small" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{formatDate(l.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </>
    )
  }

  // ---------- Eltern-Ansicht -----------------------------------------------
  const parentView = (
    <>
      {pendingTasks.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 6 }}>Bestätigungen offen ({pendingTasks.length})</h2>
          {pendingTasks.map((t) => {
            const kid = profiles.find((p) => p.id === t.completed_by)
            return (
              <div key={t.id} className="bonus-pending">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {kid && <Avatar profile={kid} size="sm" />}
                  <button className="task-title" style={{ fontWeight: 600, flex: '1 1 auto', textAlign: 'left' }} onClick={() => openTask(t.id)}>
                    {t.title}
                  </button>
                  <span className="tag pool">{t.bonus_points} P</span>
                </div>
                <div className="muted small">{kid?.display_name ?? 'Jemand'} · erledigt {formatDateTime(t.completed_at)}</div>
                <div className="task-actions" style={{ marginTop: 6 }}>
                  <button className="btn sm" disabled={!!busy} onClick={() => run(t.id, () => bonusDecide(t.id, true), `${t.bonus_points} Punkte für ${kid?.display_name ?? ''} gutgeschrieben`)}>
                    {busy === t.id ? 'Bitte warten…' : 'Bestätigen'}
                  </button>
                  <button className="btn sm secondary" disabled={!!busy} onClick={() => { setRejecting(t); setNote('') }}>
                    Noch nicht
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {pendingPayouts.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 6 }}>Auszahlungsanfragen</h2>
          {pendingPayouts.map((x) => {
            const kid = profiles.find((p) => p.id === x.profile_id)
            return (
              <div key={x.id} className="bonus-pending">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {kid && <Avatar profile={kid} size="sm" />}
                  <span style={{ fontWeight: 600, flex: '1 1 auto' }}>
                    {kid?.display_name ?? 'Jemand'} · {x.points} Punkte = {euro(x.points, settings.bonus_point_value)}
                  </span>
                </div>
                <div className="muted small">angefragt {formatDateTime(x.requested_at)}</div>
                <div className="task-actions" style={{ marginTop: 6 }}>
                  <button className="btn sm" disabled={!!busy} onClick={() => run(x.id, () => bonusPayoutDecide(x.id, true), 'Auszahlung gebucht')}>
                    Ausgezahlt
                  </button>
                  <button className="btn sm secondary" disabled={!!busy} onClick={() => run(x.id, () => bonusPayoutDecide(x.id, false), 'Anfrage zurückgestellt')}>
                    Später
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="member-grid">
        {members.map((p) => {
          const used = weekBudgetUsed(p.id)
          return (
            <div key={p.id} className="member-card">
              <div className="member-card-main">
                <Avatar profile={p} size="lg" />
                <span className="member-name">{p.display_name}</span>
                <span className="member-open">{bonusBalance(p.id)} Punkte</span>
                <span className="muted small">diese Woche +{weekEarned(p.id)} · gesamt {totalEarned(p.id)}</span>
                <span className={`small ${used > settings.bonus_weekly_budget ? '' : 'muted'}`} style={used > settings.bonus_weekly_budget ? { color: 'var(--prio-important)' } : undefined}>
                  Budget: {used} von {settings.bonus_weekly_budget} P vergeben
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 6 }}>Letzte Buchungen</h2>
        {bonusLedger.length === 0 ? (
          <div className="muted small">Noch keine Buchungen.</div>
        ) : (
          bonusLedger.slice(0, 20).map((l) => {
            const p = profiles.find((x) => x.id === l.profile_id)
            return (
              <div key={l.id} className="history-row">
                {p && <Avatar profile={p} size="sm" />}
                <span className={`tag ${l.delta > 0 ? 'pool' : ''}`}>{l.delta > 0 ? `+${l.delta}` : l.delta} P</span>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{l.note ?? l.kind}</span>
                <span className="muted small" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{formatDate(l.created_at)}</span>
              </div>
            )
          })
        )}
      </div>
    </>
  )

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>
        <IconBack /> Familie
      </button>
      <div className="page-head">
        <div>
          <h1>{isAdmin ? 'Bonus' : 'Mein Bonus'}</h1>
          <p className="subtitle">{isAdmin ? 'Zusatztaschengeld – Bestätigungen, Konten, Auszahlungen' : 'Extra-Aufgaben, extra Punkte – ohne Wettbewerb'}</p>
        </div>
        <span className="tile-icon bg-sage" style={{ flex: '0 0 auto' }}>
          <AppIcon name="star" size={20} />
        </span>
      </div>

      {isAdmin ? parentView : profile ? kidView(profile) : null}
      {rulesCard}

      {rejecting && (
        <div className="sheet-backdrop" onClick={() => setRejecting(null)}>
          <div className="confirm-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: 6 }}>Noch nicht ganz</h2>
            <p className="muted small" style={{ margin: '0 0 10px' }}>Die Aufgabe geht zurück auf offen. Ein kurzer Grund hilft dem Kind, es fertig zu machen.</p>
            <input className="input" placeholder="z. B. Fußraum hinten fehlt noch" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
            <div className="confirm-actions" style={{ marginTop: 12 }}>
              <button className="btn secondary" onClick={() => setRejecting(null)}>
                Abbrechen
              </button>
              <button className="btn" disabled={!!busy} onClick={async () => { const t = rejecting; setRejecting(null); await run(t.id, () => bonusDecide(t.id, false, note), 'Zurück auf offen') }}>
                Zurückgeben
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
