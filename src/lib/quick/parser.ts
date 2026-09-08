/* Regelbasierte Schnelleingabe – ohne KI. Wortlisten + Vorrangregeln aus der Master-Wortliste.
   Reihenfolge: normalisieren → Personen → Datum/Zeit → Priorität → Kategorie → Titel bereinigen → Verb normalisieren */
import type { Priority, Profile, DueKind } from '../types'
import { addDays, toISODate, endOfWeekISO, nextSaturdayISO } from '../dates'
import {
  BUY_VERBS,
  CATEGORY_KEYWORDS,
  CATEGORY_TIEBREAK,
  DUE_BUCKETS,
  LEADING_ARTICLES,
  PRIORITY_PHRASES,
  RELATIVE_DAYS,
  SCHOOL_CONTEXT,
  TIME_BUCKETS,
  TITLE_NOISE,
  VERB_REWRITES,
  WEEKDAYS,
} from './keywords'

export interface QuickKeyword {
  word: string
  typ: 'person_alias' | 'category'
  value: string // profile_id oder Kategoriename
}

export interface ParseResult {
  title: string
  assignee_ids: string[]
  isPool: boolean
  category: string
  priority: Priority
  due_kind: DueKind
  due_date: string | null
  time: string | null // HH:MM
  notes: string[] // Hinweise für die Vorschau (z. B. "Zeit nicht eindeutig")
  matched: { person?: string; due?: string; time?: string; priority?: string; category?: string }
}

const REPL: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** Umlaute/ß vereinheitlichen, Kleinschreibung, Bindestriche/Anführungszeichen als Leerzeichen.
    Liefert zusätzlich eine Positionszuordnung normalisiert → Original. */
export function normWithMap(s: string): { text: string; map: number[] } {
  const lower = s.toLowerCase()
  let text = ''
  const map: number[] = []
  let lastSpace = true
  for (let i = 0; i < lower.length; i++) {
    let ch = lower[i]
    if (/[‐‑‒–—\-„“"'’´`\s]/.test(ch)) ch = ' '
    if (ch === ' ') {
      if (lastSpace) continue
      lastSpace = true
      text += ' '
      map.push(i)
      continue
    }
    lastSpace = false
    const r = REPL[ch]
    if (r) {
      for (const c of r) {
        text += c
        map.push(i)
      }
    } else {
      text += ch
      map.push(i)
    }
  }
  // Trim
  let a = 0
  let b = text.length
  while (a < b && text[a] === ' ') a++
  while (b > a && text[b - 1] === ' ') b--
  return { text: text.slice(a, b), map: map.slice(a, b) }
}

export function norm(s: string): string {
  return normWithMap(s).text
}

const B = '(?:^|[^a-z0-9])' // Wortgrenze davor
const A = '(?=$|[^a-z0-9])' // Wortgrenze danach

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Phrase mit Wortgrenzen finden; Wortstamm = am Wortanfang (kurze Tokens ≤ 3 nur exakt) */
function findPhrase(text: string, phrase: string, stem = true): { start: number; end: number } | null {
  const p = norm(phrase)
  if (!p) return null
  const exact = p.length <= 3 || !stem || p.includes(' ')
  const re = new RegExp(`${B}(${esc(p)}${exact ? '' : '[a-z]*'})${A}`)
  const m = re.exec(text)
  if (!m || m.index === undefined) return null
  const start = m.index + (m[0].length - m[1].length)
  return { start, end: start + m[1].length }
}

interface Span {
  start: number
  end: number
}

function cut(text: string, spans: Span[]): string {
  if (spans.length === 0) return text
  const sorted = spans.slice().sort((a, b) => a.start - b.start)
  let out = ''
  let pos = 0
  for (const s of sorted) {
    if (s.start > pos) out += text.slice(pos, s.start)
    out += ' '
    pos = Math.max(pos, s.end)
  }
  out += text.slice(pos)
  return out
}

const NUM_WORDS: Record<string, number> = {
  eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12,
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function nextWeekday(iso: number, from: Date): Date {
  // iso: 1 = Montag … 7 = Sonntag; strikt in der Zukunft
  const d = new Date(from)
  const cur = ((d.getDay() + 6) % 7) + 1
  let diff = iso - cur
  if (diff <= 0) diff += 7
  d.setDate(d.getDate() + diff)
  return d
}

function endOfMonth(d: Date, plusMonths = 0): Date {
  return new Date(d.getFullYear(), d.getMonth() + plusMonths + 1, 0)
}

const MONTHS: Record<string, number> = {
  januar: 1, jan: 1, februar: 2, feb: 2, maerz: 3, mrz: 3, april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12,
}

interface DateHit extends Span {
  date: string | null
  kind: DueKind
  time?: string
  label: string
}

/** Konkrete Datums-/Zeitraumangaben erkennen */
function parseDate(text: string, now: Date): DateHit | null {
  // Relative Tage (längste zuerst, evtl. mit Uhrzeit)
  for (const [phrase, val] of RELATIVE_DAYS) {
    const hit = findPhrase(text, phrase, false)
    if (!hit) continue
    if (val === 'end_of_month') {
      return { ...hit, date: toISODate(endOfMonth(now)), kind: 'date', label: 'Ende des Monats' }
    }
    const m = /^\+(\d+)d(?:@(\d\d:\d\d))?$/.exec(val)
    if (!m) continue
    const d = addDays(now, Number(m[1]))
    const days = Number(m[1])
    return { ...hit, date: toISODate(d), kind: days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'date', time: m[2], label: days === 0 ? 'Heute' : days === 1 ? 'Morgen' : 'Übermorgen' }
  }
  // Zeiträume
  for (const [phrase, val] of DUE_BUCKETS) {
    const hit = findPhrase(text, phrase, false)
    if (!hit) continue
    switch (val) {
      case 'this_week':
      case 'end_this_week':
        return { ...hit, date: endOfWeekISO(now), kind: 'week', label: 'Diese Woche' }
      case 'weekend':
        return { ...hit, date: nextSaturdayISO(now), kind: 'weekend', label: 'Wochenende' }
      case 'next_weekend': {
        const sat = new Date(`${nextSaturdayISO(now)}T12:00:00`)
        return { ...hit, date: toISODate(addDays(sat, 7)), kind: 'date', label: 'Nächstes Wochenende' }
      }
      case 'next_week': {
        const end = new Date(`${endOfWeekISO(now)}T12:00:00`)
        return { ...hit, date: toISODate(addDays(end, 7)), kind: 'date', label: 'Nächste Woche' }
      }
      case 'week_after_next': {
        const end = new Date(`${endOfWeekISO(now)}T12:00:00`)
        return { ...hit, date: toISODate(addDays(end, 14)), kind: 'date', label: 'Übernächste Woche' }
      }
      case 'this_month':
        return { ...hit, date: toISODate(endOfMonth(now)), kind: 'date', label: 'Diesen Monat' }
      case 'next_month':
        return { ...hit, date: toISODate(endOfMonth(now, 1)), kind: 'date', label: 'Nächsten Monat' }
      case 'beginning_next_month':
        return { ...hit, date: toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 5)), kind: 'date', label: 'Anfang nächsten Monats' }
      case 'middle_month':
        return { ...hit, date: toISODate(new Date(now.getFullYear(), now.getMonth(), 15)), kind: 'date', label: 'Mitte des Monats' }
      default:
        break
    }
  }
  // Konkretes Datum: 14.9. | 14.09.2026 | 14. September | 14 Sept.
  const num = /(?:^|[^0-9])(\d{1,2})\.(\d{1,2})\.?(?:(\d{2}|\d{4}))?(?=$|[^0-9])/.exec(text)
  if (num && num.index !== undefined) {
    const day = Number(num[1])
    const mon = Number(num[2])
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      let year = num[3] ? Number(num[3].length === 2 ? `20${num[3]}` : num[3]) : now.getFullYear()
      let d = new Date(year, mon - 1, day)
      if (!num[3] && d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(++year, mon - 1, day)
      const start = num.index + (num[0].length - num[0].trimStart().length) + (/^[^0-9]/.test(num[0]) ? 1 : 0)
      return { start, end: num.index + num[0].length, date: toISODate(d), kind: 'date', label: d.toLocaleDateString('de-DE') }
    }
  }
  const named = new RegExp(`${B}(?:am )?(\\d{1,2})\\.? ?(${Object.keys(MONTHS).join('|')})\\.?${A}`).exec(text)
  if (named && named.index !== undefined) {
    const day = Number(named[1])
    const mon = MONTHS[named[2]]
    let year = now.getFullYear()
    let d = new Date(year, mon - 1, day)
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(++year, mon - 1, day)
    const lead = named[0].length - named[0].trimStart().length
    return { start: named.index + lead, end: named.index + named[0].length, date: toISODate(d), kind: 'date', label: d.toLocaleDateString('de-DE') }
  }
  // Wochentage (strikt nächster zukünftiger)
  for (const [phrase, iso] of WEEKDAYS) {
    // kurze Kürzel (mo, di, …) nur mit "am " davor
    const needsAm = phrase.length <= 2
    const hit = findPhrase(text, needsAm ? `am ${phrase}` : phrase, false)
    if (!hit) continue
    const d = nextWeekday(iso, now)
    const names = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
    // "am " / "diesen " davor mitschneiden
    let start = hit.start
    const pre = text.slice(Math.max(0, start - 8), start)
    const m = /(?:^|\s)(am|diesen|diese|naechsten|kommenden) $/.exec(pre)
    if (m) start -= m[1].length + 1
    return { start, end: hit.end, date: toISODate(d), kind: 'date', label: `${names[iso - 1]}, ${d.toLocaleDateString('de-DE')}` }
  }
  // "irgendwann" / "bei gelegenheit"
  for (const phrase of ['irgendwann mal', 'irgendwann', 'bei gelegenheit']) {
    const hit = findPhrase(text, phrase, false)
    if (hit) return { ...hit, date: null, kind: 'someday', label: 'Irgendwann' }
  }
  return null
}

interface TimeHit extends Span {
  time: string
}

/** Uhrzeiten: "um 9 uhr", "9:30", "halb zehn", "viertel vor zehn", "abends" */
function parseTime(text: string): TimeHit | null {
  const numOrWord = (s: string): number | null => (/^\d+$/.test(s) ? Number(s) : (NUM_WORDS[s] ?? null))
  const words = '(\\d{1,2}|' + Object.keys(NUM_WORDS).join('|') + ')'
  let m: RegExpExecArray | null
  // halb zehn
  m = new RegExp(`${B}((?:um |gegen )?halb ${words})${A}`).exec(text)
  if (m && m.index !== undefined) {
    const h = numOrWord(m[2])
    if (h !== null) return { start: m.index + (m[0].length - m[1].length), end: m.index + m[0].length, time: `${pad2((h + 23) % 24)}:30` }
  }
  // viertel nach / viertel vor / zehn nach / zehn vor
  m = new RegExp(`${B}((?:um |gegen )?(viertel|zehn|fuenf|zwanzig) (nach|vor) ${words})${A}`).exec(text)
  if (m && m.index !== undefined) {
    const amt = m[2] === 'viertel' ? 15 : m[2] === 'zehn' ? 10 : m[2] === 'fuenf' ? 5 : 20
    const h = numOrWord(m[4])
    if (h !== null) {
      const total = m[3] === 'nach' ? h * 60 + amt : h * 60 - amt
      return { start: m.index + (m[0].length - m[1].length), end: m.index + m[0].length, time: `${pad2(Math.floor(((total + 1440) % 1440) / 60))}:${pad2(((total + 1440) % 1440) % 60)}` }
    }
  }
  // um 9:30 | um 9.30 uhr | 09:00 uhr | um 9 uhr | um 9 | 9 uhr
  m = new RegExp(`${B}((?:um |gegen )?(\\d{1,2})(?:[:.](\\d{2}))? ?uhr)${A}`).exec(text) ?? new RegExp(`${B}((?:um )(\\d{1,2})(?:[:.](\\d{2}))?)${A}`).exec(text) ?? new RegExp(`${B}((\\d{1,2}):(\\d{2}))${A}`).exec(text)
  if (m && m.index !== undefined) {
    const h = Number(m[2])
    const min = m[3] ? Number(m[3]) : 0
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      const s = m.index + (m[0].length - m[1].length)
      // Abends-Kontext: "abends um 7" → 19:00
      const pre = text.slice(Math.max(0, s - 12), s)
      const evening = /abends |heute abend |morgen abend |nachmittags /.test(pre) && h < 12
      return { start: s, end: m.index + m[0].length, time: `${pad2(evening ? h + 12 : h)}:${pad2(min)}` }
    }
  }
  // Tagesabschnitte
  for (const [phrase, t] of TIME_BUCKETS) {
    const hit = findPhrase(text, phrase, false)
    if (hit) return { ...hit, time: t }
  }
  return null
}

const PRIO_MAP: Record<string, Priority> = { Dringend: 'urgent', Wichtig: 'important', Normal: 'normal', Keine: 'none' }

export function parseQuick(input: string, profiles: Profile[], keywords: QuickKeyword[], now = new Date()): ParseResult {
  const original = input.trim()
  const { text, map } = normWithMap(original)
  const spans: Span[] = []
  const notes: string[] = []
  const matched: ParseResult['matched'] = {}

  // ---- 1) Personen ---------------------------------------------------------
  const admins = profiles.filter((p) => p.role === 'admin').map((p) => p.id)
  const members = profiles.filter((p) => p.role === 'member').map((p) => p.id)
  const aliasMap: { alias: string; ids: string[]; label: string }[] = []
  for (const p of profiles) {
    aliasMap.push({ alias: norm(p.display_name), ids: [p.id], label: p.display_name })
    if (p.avatar === '/avatars/papa.png') aliasMap.push({ alias: 'papa', ids: [p.id], label: p.display_name }, { alias: 'vater', ids: [p.id], label: p.display_name })
    if (p.avatar === '/avatars/mama.png') aliasMap.push({ alias: 'mama', ids: [p.id], label: p.display_name }, { alias: 'mutter', ids: [p.id], label: p.display_name })
    if (p.avatar === '/avatars/mia.png') aliasMap.push({ alias: 'tochter', ids: [p.id], label: p.display_name })
    if (p.avatar === '/avatars/leo.png') aliasMap.push({ alias: 'sohn', ids: [p.id], label: p.display_name })
  }
  for (const k of keywords) {
    if (k.typ === 'person_alias') {
      const p = profiles.find((x) => x.id === k.value)
      if (p) aliasMap.push({ alias: norm(k.word), ids: [p.id], label: p.display_name })
    }
  }
  if (members.length) {
    for (const g of ['die kinder', 'beide kinder', 'kinder']) aliasMap.push({ alias: g, ids: members, label: 'die Kinder' })
  }
  if (admins.length) {
    for (const g of ['mama und papa', 'papa und mama', 'die eltern', 'eltern']) aliasMap.push({ alias: g, ids: admins, label: 'Mama und Papa' })
  }
  aliasMap.sort((a, b) => b.alias.length - a.alias.length)

  let assignee: string[] = []
  const labels: string[] = []
  for (const a of aliasMap) {
    if (!a.alias) continue
    const hit = findPhrase(text, a.alias, false)
    if (!hit) continue
    // Anrede-Muster: NAME, … | für NAME | an NAME | NAME soll/bitte
    let start = hit.start
    let end = hit.end
    const pre = text.slice(Math.max(0, start - 5), start)
    const pm = /(?:^|\s)(fuer|an|auch) $/.exec(pre)
    if (pm && a.ids.length > 1 && a.alias.startsWith('die ')) continue // "für die Kinder" = Objekt der Aufgabe
    if (pm) start -= pm[1].length + 1
    const post = text.slice(end, end + 12)
    const postM = /^(,| und| bitte| soll(?:st|t|en)?| muss(?:t)?| kann(?:st)?| koennt(?:est)?)/.exec(post)
    if (postM && postM[1] !== ' und') end += postM[1].length
    // Gruppenwörter wie "kinder" nur als Person werten, wenn sie als Anrede/Zuweisung stehen
    if (a.ids.length > 1 && !pm && !postM && !/^kinder|^eltern/.test(text.slice(hit.start))) continue
    for (const id of a.ids) if (!assignee.includes(id)) assignee.push(id)
    labels.push(a.label)
    spans.push({ start, end })
  }
  // "wir", "jemand", "wer kann", "alle" → Pool
  for (const g of ['einer von uns', 'wer kann', 'wer macht', 'irgendwer', 'jemand', 'wir', 'alle']) {
    const hit = findPhrase(text, g, false)
    if (hit && assignee.length === 0) {
      spans.push(hit)
      break
    }
  }
  const isPool = assignee.length === 0
  if (labels.length) matched.person = labels.join(', ')

  // ---- 2) Datum / Zeit -----------------------------------------------------
  const dateHit = parseDate(text, now)
  let due_kind: DueKind = 'none'
  let due_date: string | null = null
  let time: string | null = null
  if (dateHit) {
    spans.push(dateHit)
    due_kind = dateHit.kind
    due_date = dateHit.date
    if (dateHit.time) time = dateHit.time
    matched.due = dateHit.label
  }
  const textNoDate = cut(text, dateHit ? [dateHit] : [])
  const timeHit = parseTime(textNoDate)
  if (timeHit) {
    // Positionen aus textNoDate stimmen bis zum Datumsbereich; deshalb erneut im Originaltext suchen
    const raw = textNoDate.slice(timeHit.start, timeHit.end)
    const again = findPhrase(text, raw, false) ?? { start: -1, end: -1 }
    if (again.start >= 0) spans.push(again)
    time = timeHit.time
    matched.time = time
  }
  for (const vague of ['nach der schule', 'nach dem essen', 'nach der arbeit', 'spaeter', 'bald', 'nachher', 'demnaechst']) {
    if (findPhrase(text, vague, false)) {
      notes.push('Zeit nicht eindeutig erkannt')
      break
    }
  }

  // ---- 3) Priorität (negierte/längste Phrasen zuerst) -----------------------
  let priority: Priority = 'none'
  for (const [phrase, label] of PRIORITY_PHRASES) {
    const hit = findPhrase(text, phrase, false)
    if (!hit) continue
    // "jetzt"/"gleich" nur als Priorität, nicht als Zeit
    priority = PRIO_MAP[label] ?? 'none'
    matched.priority = label
    if (!['muss', 'müssen', 'müsst', 'jetzt', 'gleich'].includes(phrase)) spans.push(hit)
    break
  }

  // ---- 4) Kategorie (gewichtete Treffer + Hauptaktionsregeln) --------------
  const scores = new Map<string, number>()
  const add = (c: string, s: number) => scores.set(c, (scores.get(c) ?? 0) + s)
  const tokens = text.split(' ').filter(Boolean)
  const hasSchoolCtx = SCHOOL_CONTEXT.some((c) => tokens.some((t) => t.startsWith(norm(c))))
  const hasBuy = BUY_VERBS.some((v) => tokens.some((t) => t === norm(v) || (norm(v).length > 3 && t.startsWith(norm(v)))))
  const customCats = keywords.filter((k) => k.typ === 'category')
  for (const k of customCats) if (findPhrase(text, k.word)) add(k.value, 3)
  for (const kw of CATEGORY_KEYWORDS) {
    if (kw.ctx === 'school' && !hasSchoolCtx) continue
    if (kw.w === 'pool' && !/pool ?(reinigen|wasser|saeubern|abdecken|winterfest|putzen)|swimmingpool/.test(text)) continue
    if (findPhrase(text, kw.w)) add(kw.c, kw.s)
  }
  if (hasBuy) add('Besorgen & Kaufen', 6)
  let category = 'Sonstiges'
  let best = 0
  for (const c of CATEGORY_TIEBREAK) {
    const s = scores.get(c) ?? 0
    if (s > best) {
      best = s
      category = c
    }
  }
  for (const [c, s] of scores) if (s > best) { best = s; category = c }
  if (best < 1) category = 'Sonstiges'
  matched.category = category

  // ---- 5) Titel bereinigen (Spans vom normalisierten Text auf das Original übertragen) ----
  const origSpans: Span[] = spans
    .filter((sp) => sp.start >= 0 && sp.end > sp.start && sp.start < map.length)
    .map((sp) => ({ start: map[sp.start], end: map[Math.min(sp.end, map.length) - 1] + 1 }))
  let title = cut(original, origSpans)
  title = title.replace(/\s+/g, ' ').replace(/^[\s,.:;!-]+|[\s,.:;!-]+$/g, '').trim()

  // Höflichkeits- und Füllwörter (umlautfähige Wortgrenzen)
  const W = 'A-Za-zÄÖÜäöüß0-9'
  for (const noise of TITLE_NOISE.slice().sort((a, b) => b.length - a.length)) {
    title = title.replace(new RegExp(`(^|[^${W}])${esc(noise)}(?=$|[^${W}])`, 'gi'), '$1 ')
  }
  title = title.replace(/\s+/g, ' ').replace(/^[\s,.:;!-]+|[\s,.:;!-]+$/g, '').trim()

  // Verb-Normalisierung: "mach … fertig" → "… fertig machen"
  let words = title.split(' ').filter(Boolean)
  if (words.length > 1) {
    const first = norm(words[0])
    for (const [forms, particle, result] of VERB_REWRITES) {
      if (!forms.map(norm).includes(first)) continue
      const last = norm(words[words.length - 1])
      if (particle && last !== norm(particle)) continue
      let rest = particle ? words.slice(1, -1) : words.slice(1)
      while (rest.length > 1 && LEADING_ARTICLES.includes(norm(rest[0]))) rest = rest.slice(1)
      if (rest.length === 0) break
      words = [...rest, ...result.split(' ')]
      break
    }
  }
  while (words.length > 1 && LEADING_ARTICLES.includes(norm(words[0]))) words = words.slice(1)
  title = words.join(' ')
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1)
  if (!title) title = original

  return { title, assignee_ids: assignee, isPool, category, priority, due_kind, due_date, time, notes, matched }
}

/** Erinnerungszeitpunkt aus Datum + Uhrzeit (lokale Zeit → ISO) */
export function reminderAtFrom(due_date: string | null, time: string | null): string | null {
  if (!time) return null
  const d = due_date ? new Date(`${due_date}T${time}:00`) : new Date(`${toISODate(new Date())}T${time}:00`)
  return d.toISOString()
}
