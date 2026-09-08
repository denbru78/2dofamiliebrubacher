# Familien-Liste – Einrichtung in 4 Schritten

Du brauchst nichts zu programmieren. Alles, was du tun musst, ist Klicken und Einfügen.

---

## Schritt 1 – Datenbank in Supabase einrichten (einmalig)

1. Öffne https://supabase.com und melde dich an.
2. Wähle dein Projekt (`nquawdbqatnwpdnntnkb`).
3. Klicke links auf **SQL Editor** → **New query**.
4. Öffne die Datei `supabase/schema.sql` aus diesem Ordner, kopiere den **gesamten** Inhalt und füge ihn in das Textfeld ein.
5. Klicke auf **Run** (grüner Button, rechts unten).
   Unten muss „Success. No rows returned“ erscheinen.

Der Block darf jederzeit erneut ausgeführt werden – nichts geht dabei verloren.

---

## Schritt 2 – Die vier Familienmitglieder anlegen (einmalig)

Kinder brauchen keine echte E-Mail-Adresse. Die App nutzt vier feste „Familien-Adressen“, die nur zum Anmelden dienen.

1. Klicke in Supabase links auf **Authentication** → **Users**.
2. Klicke oben rechts auf **Add user** → **Create new user**.
3. Lege nacheinander diese vier Benutzer an. **Die E-Mail-Adressen müssen genau so lauten** (das Passwort wählst du selbst, mindestens 6 Zeichen):

   | Person  | E-Mail                    | Rolle  |
   |---------|---------------------------|--------|
   | Papa    | `papa@familie.local`      | Admin  |
   | Mama    | `mama@familie.local`      | Admin  |
   | Tochter | `tochter@familie.local`   | Mitglied |
   | Sohn    | `sohn@familie.local`      | Mitglied |

4. Setze bei jedem Benutzer den Haken **Auto Confirm User** (wichtig!). Dann **Create user**.

Fertig – die Profile mit Namen, Rolle und Avatar (Papa, Mama, Mia, Leo) entstehen automatisch.
Namen und Avatare könnt ihr später in der App unter **Profil** ändern.

> Hinweis: Falls du die Benutzer **vor** Schritt 1 angelegt hast, führe einfach Schritt 1 noch einmal aus – die fehlenden Profile werden dann nachgetragen.

---

## Schritt 3 – App bei Netlify veröffentlichen

Netlify baut die App selbst – dafür wird der Ordner über GitHub eingebunden (kostenlos, kein Programmieren nötig):

1. Lade den entpackten Ordner als neues Repository auf https://github.com hoch (Button **Add file → Upload files**, alle Dateien inkl. Unterordner hineinziehen).
2. In Netlify: **Add new site** → **Import an existing project** → **GitHub** → Repository auswählen.
3. Build-Einstellungen (werden aus `netlify.toml` automatisch übernommen, zur Sicherheit prüfen):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Node version:** 20 (steht in `netlify.toml`)
4. **Deploy site** klicken. Nach 1–2 Minuten ist die App online unter `https://<name>.netlify.app`.

Optional: Unter **Site configuration → Domain management** kannst du einen schöneren Namen wählen, z. B. `familien-liste`.

Optional (nur falls du das Supabase-Projekt später wechselst): Unter **Site configuration → Environment variables** kannst du `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` setzen. Sonst werden die fest eingebauten Werte benutzt.

---

## Schritt 4 – App auf dem Handy installieren

1. Öffne die Netlify-Adresse auf dem Handy.
2. **iPhone (Safari):** Teilen-Symbol → **Zum Home-Bildschirm**.
   **Android (Chrome):** Menü (⋮) → **App installieren** bzw. **Zum Startbildschirm hinzufügen**.
3. Anmelden mit der jeweiligen E-Mail (z. B. `sohn@familie.local`) und dem Passwort.

---

## Passwort vergessen

Auf der Anmeldeseite „Passwort vergessen“ → E-Mail eingeben → Link in der Mail öffnen → neues Passwort setzen. Damit der Link zur App zurückführt, einmalig in Supabase unter **Authentication → URL Configuration** die **Site URL** auf eure Netlify-Adresse setzen (z. B. `https://2dofamilie.netlify.app`) und dieselbe Adresse bei **Redirect URLs** eintragen.

## Weitere Mitglieder einladen (z. B. Oma, Opa)

In der App unter **Familie → Mitglied einladen**: Rolle wählen, Link erstellen, per WhatsApp teilen oder kopieren.
Der Link ist 7 Tage gültig und funktioniert genau einmal. Wer ihn öffnet, registriert sich mit eigener E-Mail und tritt automatisch eurer Familie bei.

Damit die Registrierung ohne E-Mail-Bestätigung klappt: Supabase → **Authentication → Providers → Email** → **Confirm email** ausschalten (optional; sonst muss der Eingeladene erst den Bestätigungslink in seiner E-Mail öffnen).

## Was kann wer?

| Aktion | Eltern (Admin) | Kinder (Mitglied) |
|---|---|---|
| Alle Aufgaben sehen | ✅ | ✅ |
| Aufgaben anlegen / bearbeiten / löschen | ✅ | ❌ (serverseitig gesperrt) |
| Eigene Aufgaben abhaken | ✅ | ✅ |
| Pool-Aufgabe übernehmen („Ich übernehme“) | ✅ | ✅ |
| Aufgabe zurück in den Pool | ✅ | ❌ |
| Aufgabe wieder öffnen | ✅ | ❌ |
| Prioritäten ein-/ausschalten, Wochenziel | ✅ | ❌ |
| Eigenen Namen / Avatar ändern | ✅ | ✅ |

**Schnelleingabe:** Als Admin auf „+ Aufgabe“, nur den Titel tippen, Enter – die Aufgabe liegt sofort im Familien-Pool.

---

## Ordnerstruktur (nur zur Info)

```
familien-liste/
├── supabase/schema.sql      ← SQL-Block für Schritt 1
├── README_DE.md             ← diese Anleitung
├── netlify.toml             ← Netlify-Einstellungen
├── index.html, package.json, vite.config.ts, tsconfig.json
├── public/                  ← Manifest, Service Worker, Icons, Avatare
└── src/                     ← App-Code (React + TypeScript)
```

## Probleme?

- **„Profil fehlt“ nach dem Anmelden:** Schritt 1 (SQL) erneut ausführen, dann in der App „Neu laden“.
- **„E-Mail oder Passwort ist falsch“:** In Supabase unter Authentication → Users beim Benutzer **Reset password** nutzen, oder prüfen, ob „Auto Confirm User“ gesetzt war.
- **Änderungen erscheinen nicht auf einem anderen Gerät:** App kurz in den Hintergrund und wieder öffnen – dann wird neu geladen. Live-Updates funktionieren, sobald Realtime im Supabase-Projekt aktiv ist (ist im SQL-Block enthalten).

## Datenschutz & Sicherheit (Version 1)

- Gespeichert wird nur, was die App braucht: E-Mail (nur für die Anmeldung), Anzeigename, optional Handynummer für WhatsApp-Erinnerungen, Familie, Rolle, Aufgaben, Kategorien, Erfolge, Historie.
- Nicht erfasst: Standort, Kontakte, Werbe-IDs, Geräte-Fingerprinting, Telemetrie, Tracking (kein Google Analytics, kein Meta Pixel, keine Marketing-SDKs).
- Jede Familie ist über Row Level Security vollständig von anderen getrennt; Kinder-Rechte sind serverseitig durchgesetzt.
- Im Frontend liegt nur der öffentliche Supabase-Publishable-Key. Der `service_role`-Key darf nirgends in Code, Repository oder Netlify-Einstellungen auftauchen.
- Mitglieder werden nur deaktiviert, nie hart gelöscht; Historie bleibt erhalten.
- Prüfen: In Supabase → SQL Editor `select * from public.security_check();` ausführen – jede Tabelle muss `rls_aktiv = true` zeigen.
