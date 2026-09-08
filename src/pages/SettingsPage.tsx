import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { Avatar } from '../components/Avatar'
import { AvatarPicker, ColorPicker } from '../components/MemberEditSheet'
import { memberColorKey } from '../lib/colors'
import { CategoryManager } from '../components/CategoryManager'
import { formatDateTime } from '../lib/dates'

const ACTION_LABEL: Record<string, string> = {
  created: 'hat angelegt',
  claimed: 'hat übernommen',
  released: 'hat zurück in den Pool gelegt',
  done: 'hat erledigt',
  reopened: 'hat wieder geöffnet',
  updated: 'hat bearbeitet',
  deleted: 'hat gelöscht',
  archived: 'hat archiviert',
}

export function SettingsPage() {
  const { profile, isAdmin, settings, activities, profileById, updateProfile, updateSettings, familyName, updateFamilyName, signOut, toast } = useStore()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [goal, setGoal] = useState(String(settings.weekly_goal))
  const [fam, setFam] = useState(familyName)
  const [busy, setBusy] = useState(false)

  useEffect(() => setName(profile?.display_name ?? ''), [profile?.display_name])
  useEffect(() => setGoal(String(settings.weekly_goal)), [settings.weekly_goal])
  useEffect(() => setFam(familyName), [familyName])

  if (!profile) return null

  const saveName = async () => {
    if (!name.trim() || name.trim() === profile.display_name) return
    setBusy(true)
    const err = await updateProfile({ display_name: name.trim() })
    setBusy(false)
    toast(err ?? 'Name gespeichert', err ? 'error' : 'info')
  }

  const pickAvatar = async (a: string) => {
    if (a === profile.avatar) return
    const err = await updateProfile({ avatar: a })
    if (err) toast(err, 'error')
  }

  const toggle = async (key: 'priorities_enabled' | 'kids_can_claim_pool' | 'achievements_enabled') => {
    const err = await updateSettings({ [key]: !settings[key] })
    if (err) toast(err, 'error')
  }

  const saveFam = async () => {
    if (!fam.trim() || fam.trim() === familyName) return
    const err = await updateFamilyName(fam)
    toast(err ?? 'Familienname gespeichert', err ? 'error' : 'info')
  }

  const share = async () => {
    const text = `Unsere Familien-Liste: ${window.location.origin}\nAnmelden mit deiner Familien-E-Mail (z. B. name@familie.local) und dem Passwort von Mama oder Papa. Auf dem Handy am besten „Zum Home-Bildschirm“ hinzufügen.`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Familien-Liste', text })
      } else {
        await navigator.clipboard.writeText(text)
        toast('Einladungstext kopiert', 'info')
      }
    } catch {
      /* abgebrochen */
    }
  }

  const saveGoal = async () => {
    const n = Math.max(1, Math.min(200, Math.round(Number(goal) || 0)))
    if (n === settings.weekly_goal) return
    const err = await updateSettings({ weekly_goal: n })
    toast(err ?? `Wochenziel: ${n} Aufgaben`, err ? 'error' : 'info')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Einstellungen</h1>
          <p className="subtitle">Angemeldet als {profile.display_name} · {isAdmin ? 'Elternteil (Admin)' : 'Mitglied'}</p>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Avatar profile={profile} size="lg" />
          <h2>Mein Profil</h2>
        </div>
        <div className="field">
          <label htmlFor="myname">Name</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="myname" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
            <button className="btn" onClick={saveName} disabled={busy || !name.trim() || name.trim() === profile.display_name}>
              Speichern
            </button>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <span className="label">Avatar</span>
          <AvatarPicker value={profile.avatar} onPick={pickAvatar} name={profile.display_name} color={profile.color} />
        </div>
        <div className="field" style={{ marginBottom: 0, marginTop: 14 }}>
          <span className="label">Meine Farbe</span>
          <ColorPicker
            value={memberColorKey(profile)}
            onPick={async (c) => {
              const err = await updateProfile({ color: c })
              if (err) toast(err, 'error')
            }}
          />
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Familie</h2>
          <div className="field">
            <label htmlFor="famname">Familienname</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="famname" className="input" value={fam} onChange={(e) => setFam(e.target.value)} maxLength={40} />
              <button className="btn" onClick={saveFam} disabled={!fam.trim() || fam.trim() === familyName}>
                Speichern
              </button>
            </div>
          </div>
          <div className="toggle-row">
            <div>
              <div style={{ fontWeight: 600 }}>Prioritäten verwenden</div>
              <div className="muted small">Ausgeblendet, wenn deaktiviert. Daten bleiben erhalten.</div>
            </div>
            <button className={`switch ${settings.priorities_enabled ? 'on' : ''}`} onClick={() => toggle('priorities_enabled')} role="switch" aria-checked={settings.priorities_enabled} aria-label="Prioritäten verwenden" />
          </div>
          <div className="toggle-row">
            <div>
              <div style={{ fontWeight: 600 }}>Kinder dürfen Pool-Aufgaben übernehmen</div>
              <div className="muted small">Wenn aus, verteilen nur Eltern die Pool-Aufgaben.</div>
            </div>
            <button className={`switch ${settings.kids_can_claim_pool ? 'on' : ''}`} onClick={() => toggle('kids_can_claim_pool')} role="switch" aria-checked={settings.kids_can_claim_pool} aria-label="Kinder dürfen Pool übernehmen" />
          </div>
          <div className="toggle-row">
            <div>
              <div style={{ fontWeight: 600 }}>Erfolge anzeigen</div>
              <div className="muted small">Kleine Erfolge auf der Startseite und unter Familie.</div>
            </div>
            <button className={`switch ${settings.achievements_enabled ? 'on' : ''}`} onClick={() => toggle('achievements_enabled')} role="switch" aria-checked={settings.achievements_enabled} aria-label="Erfolge anzeigen" />
          </div>
          <div className="toggle-row">
            <div>
              <div style={{ fontWeight: 600 }}>Wochenziel</div>
              <div className="muted small">Aufgaben pro Woche für den Fortschrittsbalken</div>
            </div>
            <input className="input" style={{ width: 84, textAlign: 'center' }} inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} onBlur={saveGoal} aria-label="Wochenziel" />
          </div>
          <div className="task-actions" style={{ marginTop: 12 }}>
            <button className="btn sm secondary" onClick={share}>
              Einladung teilen
            </button>
          </div>
          <div className="muted small" style={{ marginTop: 10 }}>Mitglieder verwalten (Name, Avatar, Rolle, deaktivieren): unter „Familie“ → „Mitglied verwalten“. Neue Logins legst du in Supabase an.</div>
        </div>
      )}

      <div className="card">
        <div className="toggle-row" style={{ paddingTop: 0 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Benachrichtigungen</div>
            <div className="muted small">Kommt in einer späteren Version (neue Aufgabe, heute fällig, Wochenziel erreicht).</div>
          </div>
          <button className="switch" disabled aria-label="Benachrichtigungen (noch nicht verfügbar)" style={{ opacity: 0.4 }} />
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Kategorien</h2>
          <CategoryManager />
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 6 }}>Zuletzt passiert</h2>
        {activities.length === 0 ? (
          <div className="muted small">Noch keine Aktivität.</div>
        ) : (
          activities.slice(0, 20).map((a) => {
            const who = profileById(a.actor_id)
            return (
              <div key={a.id} className="history-row">
                {who && <Avatar profile={who} size="sm" />}
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <strong>{who?.display_name ?? 'Jemand'}</strong> {ACTION_LABEL[a.action] ?? a.action}: {a.task_title ?? ''}
                </span>
                <span className="muted small" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  {formatDateTime(a.created_at)}
                </span>
              </div>
            )
          })
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 6 }}>App installieren</h2>
        <p className="muted small" style={{ margin: '0 0 10px' }}>
          iPhone: In Safari „Teilen“ → „Zum Home-Bildschirm“. Android: Menü → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.
        </p>
        <button className="btn secondary block" onClick={signOut}>
          Abmelden
        </button>
      </div>
    </div>
  )
}
