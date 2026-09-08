import { createClient } from '@supabase/supabase-js'

// Die Werte können optional per Netlify-Umgebungsvariablen überschrieben werden.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://nquawdbqatnwpdnntnkb.supabase.co'
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_3Ryj3w0LaUON8gqn9NyIoA_6jYDSlwr'

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
