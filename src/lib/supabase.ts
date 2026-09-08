import { createClient } from '@supabase/supabase-js'

// Die Werte können optional per Netlify-Umgebungsvariablen überschrieben werden.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://nquawdbqatnwpdnntnkb.supabase.co'
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_3Ryj3w0LaUON8gqn9NyIoA_6jYDSlwr'

const REMEMBER_KEY = 'familie.remember'

/** „Angemeldet bleiben“ – Standard: ja */
export function getRemember(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== 'no'
  } catch {
    return true
  }
}

export function setRemember(value: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, value ? 'yes' : 'no')
    if (!value) {
      // Bereits dauerhaft gespeicherte Sitzung entfernen
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach((k) => localStorage.removeItem(k))
    }
  } catch {
    /* Speicher nicht verfügbar */
  }
}

function store(): Storage {
  return getRemember() ? localStorage : sessionStorage
}

// Speicher-Adapter: dauerhaft (localStorage) oder nur bis zum Schließen (sessionStorage)
const sessionStore = {
  getItem: (key: string): string | null => {
    try {
      return store().getItem(key) ?? localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      store().setItem(key, value)
    } catch {
      /* ignorieren */
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      /* ignorieren */
    }
  },
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: sessionStore },
})
