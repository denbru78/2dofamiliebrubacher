/* Spracheingabe über die im Browser eingebaute Erkennung (Web Speech API).
   Kein externer Dienst. Wird nur angeboten, wenn das Gerät sie unterstützt. */

interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((ev: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((ev: { error?: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function ctor(): (new () => RecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechSupported(): boolean {
  return !!ctor()
}

export interface SpeechHandle {
  stop: () => void
}

/** Startet die Erkennung; liefert laufend Zwischentexte und am Ende den finalen Text. */
export function startSpeech(opts: { onText: (text: string, final: boolean) => void; onEnd: () => void; onError: (msg: string) => void }): SpeechHandle | null {
  const C = ctor()
  if (!C) return null
  const rec = new C()
  rec.lang = 'de-DE'
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1
  let finalText = ''
  rec.onresult = (ev) => {
    let interim = ''
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i]
      const t = r[0]?.transcript ?? ''
      if (r.isFinal) finalText += t
      else interim += t
    }
    opts.onText((finalText + ' ' + interim).trim(), false)
  }
  rec.onend = () => {
    if (finalText.trim()) opts.onText(finalText.trim(), true)
    opts.onEnd()
  }
  rec.onerror = (ev) => {
    const e = ev.error ?? ''
    if (e === 'not-allowed' || e === 'service-not-allowed') opts.onError('Mikrofon nicht erlaubt. Bitte in den Handy-Einstellungen für diese App freigeben.')
    else if (e === 'no-speech') opts.onError('Nichts gehört – bitte noch einmal versuchen.')
    else if (e === 'network') opts.onError('Spracherkennung braucht Internet.')
    else if (e !== 'aborted') opts.onError('Spracheingabe hat nicht geklappt. Du kannst auch das Mikrofon der Tastatur nutzen.')
    opts.onEnd()
  }
  try {
    rec.start()
  } catch {
    return null
  }
  return { stop: () => { try { rec.stop() } catch { /* ignorieren */ } } }
}
