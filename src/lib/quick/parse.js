"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalize = normalize;
exports.parseQuick = parseQuick;
const dates_1 = require("../dates");
const dictionary_1 = require("./dictionary");
// ---------- Normalisierung ----------------------------------------------
function normalize(s) {
    // längenerhaltend, damit Positionen im Originaltext gültig bleiben
    return s.toLowerCase();
}
function clean(s) {
    return s.replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();
}
function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Wortgrenzen-Suche: Treffer nur am Wortanfang (Wortstämme erlaubt, z. B. "wasch" trifft "waschen") */
function findWord(text, word, wholeWord = false) {
    const w = normalize(word);
    const short = w.length <= 3;
    const re = new RegExp(`(^|[^a-zäöü0-9-])(${escapeRe(w)})${wholeWord || short ? '(?![a-zäöü0-9])' : ''}`, 'i');
    const m = re.exec(text);
    if (!m)
        return null;
    return { index: m.index + m[1].length, length: m[2].length };
}
const MONTHS = {
    januar: 1, jan: 1, februar: 2, feb: 2, märz: 3, mär: 3, maerz: 3, april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7,
    august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12,
};
const NUMWORDS = {
    eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
};
const BUY_VERBS = ['kaufen', 'kauf', 'besorg', 'bestell', 'nachkauf', 'holen', 'hol ', 'mitbring', 'einkauf'];
const SCHOOL_STRONG = ['hausaufgabe', 'klassenarbeit', 'elternabend', 'elternsprechtag', 'schulranzen', 'stundenplan', 'klausur', 'zeugnis', 'vokabel', 'schule', 'schultasche', 'unterricht', 'lehrer', 'referat'];
const SCHOOL_VERBS = ['lern', 'üb', 'hausaufgab', 'arbeit', 'test', 'unterricht', 'buch', 'heft', 'schul', 'vokabel', 'klasse'];
const CAR_CTX = ['auto', 'wagen', 'fahrzeug', 'reifen', 'tank', 'öl', 'werkstatt', 'tüv', 'motor', 'touareg', 'fahrrad', 'bahn', 'bus '];
const CHILD_CTX = ['kind', 'kinder', 'sohn', 'tochter', 'schule', 'hort', 'kita'];
const GARDEN_CTX = ['garten', 'hecke', 'rasen', 'baum', 'strauch', 'rose', 'busch'];
const POOL_OBJ = ['pool reinig', 'poolwasser', 'swimmingpool', 'pool sauber', 'pool putz'];
function pad(n) {
    return n < 10 ? `0${n}` : String(n);
}
function weekdayLabel(d) {
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
}
// ---------- Hauptfunktion -----------------------------------------------
function parseQuick(input, profiles, me, extra, categoryNames, today = new Date()) {
    const original = clean(input);
    const raw = ` ${original} `;
    const text = normalize(raw);
    const notes = [];
    const matched = { persons: [], due: [], time: [], priority: [], category: [] };
    const spans = []; // zu entfernende Bereiche (im normalisierten Text)
    const cut = (index, length) => spans.push({ index, length });
    // ---- 2) Personen -----------------------------------------------------
    const admins = profiles.filter((p) => p.role === 'admin');
    const members = profiles.filter((p) => p.role === 'member');
    const byAvatar = (file) => profiles.find((p) => p.avatar === `/avatars/${file}`);
    const byName = (n) => profiles.find((p) => normalize(p.display_name) === normalize(n));
    const aliases = [];
    for (const p of profiles) {
        aliases.push({ word: p.display_name, ids: [p.id] });
        const first = p.display_name.split(/\s+/)[0];
        if (first && first !== p.display_name)
            aliases.push({ word: first, ids: [p.id] });
    }
    const papa = byAvatar('papa.png') ?? byName('papa');
    const mama = byAvatar('mama.png') ?? byName('mama');
    const tochter = byAvatar('mia.png') ?? byName('tochter');
    const sohn = byAvatar('leo.png') ?? byName('sohn');
    if (papa)
        aliases.push({ word: 'papa', ids: [papa.id] }, { word: 'vater', ids: [papa.id] });
    if (mama)
        aliases.push({ word: 'mama', ids: [mama.id] }, { word: 'mutter', ids: [mama.id] });
    if (tochter)
        aliases.push({ word: 'tochter', ids: [tochter.id] });
    if (sohn)
        aliases.push({ word: 'sohn', ids: [sohn.id] });
    if (members.length)
        aliases.push({ word: 'die kinder', ids: members.map((p) => p.id) }, { word: 'beide kinder', ids: members.map((p) => p.id) }, { word: 'kinder', ids: members.map((p) => p.id) });
    if (admins.length)
        aliases.push({ word: 'mama und papa', ids: admins.map((p) => p.id) }, { word: 'papa und mama', ids: admins.map((p) => p.id) }, { word: 'eltern', ids: admins.map((p) => p.id) });
    if (me)
        aliases.push({ word: 'ich', ids: [me.id] });
    for (const k of extra)
        if (k.type === 'person')
            aliases.push({ word: k.word, ids: [k.value] });
    aliases.push({ word: 'alle', ids: profiles.map((p) => p.id) });
    aliases.sort((a, b) => b.word.length - a.word.length);
    const ids = new Set();
    let poolSignal = false;
    for (const a of aliases) {
        const hit = findWord(text, a.word, true);
        if (!hit)
            continue;
        const beforeTxt = text.slice(0, hit.index);
        const isGroup = a.ids.length > 1;
        // „für die Kinder“ / „für alle“ beschreibt das Objekt (z. B. Zahnarzttermin für die Kinder), keine Zuständigkeit
        const objectOnly = isGroup && /(\s(für|an|von|mit)\s*)$/.test(beforeTxt);
        if (!objectOnly)
            a.ids.forEach((id) => ids.add(id));
        matched.persons.push(a.word);
        if (objectOnly)
            continue;
        let len = hit.length;
        // Komma/„und“/„für“/„an“ drumherum mit entfernen
        const after = text.slice(hit.index + hit.length);
        const m1 = /^(\s*,|\s+(soll|sollst|sollte|sollen|sollt|muss|musst|müssen|müsst|kann|kannst|könnt|bitte|und))/.exec(after);
        if (m1 && !/^(\s+und)$/.test(m1[0]))
            len += m1[0].length;
        const before = text.slice(0, hit.index);
        const m2 = /(\s(für|an|von)\s*)$/.exec(before);
        const start = m2 ? hit.index - m2[1].length : hit.index;
        cut(start, hit.index + len - start);
    }
    for (const w of ['wir müssen', 'wir sollten', 'wir sollen', 'wir', 'jemand', 'wer kann', 'wer macht', 'einer von uns', 'irgendwer', 'kann jemand']) {
        const hit = findWord(text, w, true);
        if (hit) {
            poolSignal = true;
            cut(hit.index, hit.length);
            matched.persons.push(w);
            break;
        }
    }
    const assignee_ids = poolSignal ? [] : Array.from(ids);
    // ---- 3) Datum / Zeit -------------------------------------------------
    let due_kind = 'none';
    let due_date = null;
    let due_label = '';
    let time = null;
    // Uhrzeiten zuerst (damit "um 9" nicht als Datum gilt)
    const timeRules = [
        [/\bhalb (\d{1,2}|[a-zäöü]+)\b/, (m) => { const n = NUMWORDS[m[1]] ?? Number(m[1]); return Number.isFinite(n) ? `${pad((n - 1 + 24) % 24)}:30` : null; }],
        [/\bviertel vor (\d{1,2}|[a-zäöü]+)\b/, (m) => { const n = NUMWORDS[m[1]] ?? Number(m[1]); return Number.isFinite(n) ? `${pad((n - 1 + 24) % 24)}:45` : null; }],
        [/\bviertel nach (\d{1,2}|[a-zäöü]+)\b/, (m) => { const n = NUMWORDS[m[1]] ?? Number(m[1]); return Number.isFinite(n) ? `${pad(n % 24)}:15` : null; }],
        [/\b(\d{1,2}|[a-zäöü]+) (nach|vor) (\d{1,2}|[a-zäöü]+)\b/, (m) => {
                const mins = NUMWORDS[m[1]] ?? Number(m[1]);
                const h = NUMWORDS[m[3]] ?? Number(m[3]);
                if (!Number.isFinite(mins) || !Number.isFinite(h) || mins > 59)
                    return null;
                return m[2] === 'nach' ? `${pad(h % 24)}:${pad(mins)}` : `${pad((h - 1 + 24) % 24)}:${pad(60 - mins)}`;
            }],
        [/\bum (\d{1,2})[:.](\d{2})( uhr)?\b/, (m) => `${pad(Number(m[1]))}:${m[2]}`],
        [/\b(\d{1,2})[:.](\d{2}) uhr\b/, (m) => `${pad(Number(m[1]))}:${m[2]}`],
        [/\bum (\d{1,2})( uhr)?\b/, (m) => (Number(m[1]) <= 24 ? `${pad(Number(m[1]))}:00` : null)],
        [/\b(\d{1,2}) uhr\b/, (m) => `${pad(Number(m[1]))}:00`],
        [/\bum (zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|eins)( uhr)?\b/, (m) => `${pad(NUMWORDS[m[1]])}:00`],
    ];
    let eveningShift = false;
    for (const [re, fn] of timeRules) {
        const m = re.exec(text);
        if (m) {
            const t = fn(m);
            if (t) {
                time = t;
                matched.time.push(m[0].trim());
                cut(m.index, m[0].length);
                break;
            }
        }
    }
    // Tageszeiten (Bucket) – „abends um 7“ → 19:00
    const buckets = [['morgens', '09:00'], ['früh', '09:00'], ['vormittags', '10:00'], ['mittags', '12:00'], ['nachmittags', '15:00'], ['abends', '19:00'], ['abend', '19:00']];
    for (const [w, t] of buckets) {
        const hit = findWord(text, w, true);
        if (hit && !/heute|morgen/.test(text.slice(Math.max(0, hit.index - 7), hit.index))) {
            if (!time)
                time = t;
            else if ((w === 'abends' || w === 'abend' || w === 'nachmittags') && Number(time.slice(0, 2)) < 12)
                eveningShift = true;
            cut(hit.index, hit.length);
            matched.time.push(w);
            break;
        }
    }
    if (eveningShift && time)
        time = `${pad(Number(time.slice(0, 2)) + 12)}${time.slice(2)}`;
    const setDate = (d, kind, label, span, phrase) => {
        due_kind = kind;
        due_date = (0, dates_1.toISODate)(d);
        due_label = label;
        cut(span.index, span.length);
        matched.due.push(phrase);
    };
    // Relative Tage (längste Phrase zuerst)
    const rel = dictionary_1.DUE_RELATIVE.slice().sort((a, b) => b[0].length - a[0].length);
    let dateFound = false;
    for (const [w, v] of rel) {
        const hit = findWord(text, w, true);
        if (!hit)
            continue;
        if (v === 'end_of_month') {
            const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            setDate(d, 'date', `Monatsende (${weekdayLabel(d)})`, hit, w);
        }
        else {
            const m = /^\+(\d)d(?:@(\d{2}:\d{2}))?$/.exec(v);
            if (!m)
                continue;
            const d = (0, dates_1.addDays)(today, Number(m[1]));
            const kind = m[1] === '0' ? 'today' : m[1] === '1' ? 'tomorrow' : 'date';
            setDate(d, kind, m[1] === '0' ? 'Heute' : m[1] === '1' ? 'Morgen' : `Übermorgen (${weekdayLabel(d)})`, hit, w);
            if (m[2] && !time)
                time = m[2];
        }
        dateFound = true;
        break;
    }
    // Konkretes Datum: 14.9. / 14.09.2026 / 14. September
    if (!dateFound) {
        const m1 = /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})?\b/.exec(text);
        const m2 = /\b(\d{1,2})\.? ?(januar|jan|februar|feb|märz|mär|april|apr|mai|juni|jun|juli|jul|august|aug|september|sept|sep|oktober|okt|november|nov|dezember|dez)\b\.?/.exec(text);
        const mm = m1 ?? m2;
        if (mm) {
            const day = Number(mm[1]);
            const month = m1 ? Number(m1[2]) : MONTHS[mm[2]];
            let year = m1 && m1[3] ? Number(m1[3]) : today.getFullYear();
            if (year < 100)
                year += 2000;
            let d = new Date(year, month - 1, day, 12);
            if (!(m1 && m1[3]) && d < new Date(today.getFullYear(), today.getMonth(), today.getDate()))
                d = new Date(year + 1, month - 1, day, 12);
            if (d.getMonth() === month - 1) {
                const span = { index: mm.index, length: mm[0].length };
                const before = text.slice(0, mm.index);
                const am = /(\sam\s*)$/.exec(before);
                if (am) {
                    span.index -= am[1].length;
                    span.length += am[1].length;
                }
                setDate(d, 'date', weekdayLabel(d), span, mm[0].trim());
                dateFound = true;
            }
        }
    }
    // Zeiträume (Buckets)
    if (!dateFound) {
        const bk = dictionary_1.DUE_BUCKETS.slice().sort((a, b) => b[0].length - a[0].length);
        for (const [w, v] of bk) {
            const hit = findWord(text, w, true);
            if (!hit)
                continue;
            const dow = (today.getDay() + 6) % 7; // Mo=0
            const monday = (0, dates_1.addDays)(today, -dow);
            if (v === 'this_week' || v === 'end_this_week') {
                setDate((0, dates_1.addDays)(monday, 6), 'week', 'Diese Woche', hit, w);
            }
            else if (v === 'weekend') {
                setDate((0, dates_1.addDays)(monday, dow <= 5 ? 5 : dow), 'weekend', 'Wochenende', hit, w);
            }
            else if (v === 'next_weekend') {
                setDate((0, dates_1.addDays)(monday, 12), 'date', 'Nächstes Wochenende', hit, w);
            }
            else if (v === 'next_week') {
                setDate((0, dates_1.addDays)(monday, 13), 'date', 'Nächste Woche (bis So)', hit, w);
                notes.push('„nächste Woche“ als Frist bis Sonntag der nächsten Woche gesetzt');
            }
            else if (v === 'week_after_next') {
                setDate((0, dates_1.addDays)(monday, 20), 'date', 'Übernächste Woche', hit, w);
            }
            else if (v === 'this_month') {
                setDate(new Date(today.getFullYear(), today.getMonth() + 1, 0), 'date', 'Diesen Monat', hit, w);
            }
            else if (v === 'next_month') {
                setDate(new Date(today.getFullYear(), today.getMonth() + 2, 0), 'date', 'Nächsten Monat', hit, w);
            }
            else if (v === 'beginning_next_month') {
                setDate(new Date(today.getFullYear(), today.getMonth() + 1, 5), 'date', 'Anfang nächsten Monats', hit, w);
            }
            else if (v === 'middle_month') {
                setDate(new Date(today.getFullYear(), today.getMonth(), 15), 'date', 'Mitte des Monats', hit, w);
            }
            else
                continue;
            dateFound = true;
            break;
        }
    }
    // Wochentage: "am Sonntag" = nächster zukünftiger Sonntag; Kurzformen nur nach "am"
    if (!dateFound) {
        const wd = dictionary_1.WEEKDAYS.slice().sort((a, b) => b[0].length - a[0].length);
        for (const [w, n] of wd) {
            const shortForm = w.length <= 2;
            const re = shortForm ? new RegExp(`\\bam ${escapeRe(w)}\\b`) : new RegExp(`\\b(am |diesen |nächsten |kommenden )?${escapeRe(w)}\\b`);
            const m = re.exec(text);
            if (!m)
                continue;
            const cur = (today.getDay() + 6) % 7 + 1; // Mo=1..So=7
            let diff = n - cur;
            if (diff <= 0)
                diff += 7;
            if (/diesen/.test(m[0]) && n === cur)
                diff = 0;
            const d = (0, dates_1.addDays)(today, diff);
            setDate(d, 'date', weekdayLabel(d), { index: m.index, length: m[0].length }, m[0].trim());
            dateFound = true;
            break;
        }
    }
    // Unklare Ausdrücke → keine Fälligkeit, Hinweis
    if (!dateFound) {
        for (const w of ['irgendwann', 'bei gelegenheit', 'gelegentlich']) {
            const hit = findWord(text, w, true);
            if (hit) {
                due_kind = 'someday';
                due_label = 'Irgendwann';
                cut(hit.index, hit.length);
                matched.due.push(w);
                dateFound = true;
                break;
            }
        }
    }
    if (!dateFound) {
        for (const w of ['später', 'demnächst', 'bald', 'nachher', 'anfang der woche', 'mitte der woche', 'nach dem essen', 'nach der schule', 'nach der arbeit']) {
            if (findWord(text, w, true)) {
                notes.push(`Zeit nicht eindeutig erkannt („${w}“) – bitte Termin wählen`);
                break;
            }
        }
    }
    if (time && !dateFound) {
        // Uhrzeit ohne Datum → heute
        due_kind = 'today';
        due_date = (0, dates_1.toISODate)(today);
        due_label = 'Heute';
    }
    // ---- 4) Priorität (Negationen/längste zuerst) -----------------------
    let priority = 'none';
    const pr = dictionary_1.PRIORITY_PHRASES.slice().sort((a, b) => b[0].length - a[0].length);
    const negated = /\bnicht (dringend|wichtig|eilig)\b/.exec(text);
    if (negated) {
        cut(negated.index, negated[0].length);
        matched.priority.push(negated[0]);
    }
    else {
        for (const [w, v] of pr) {
            if (w === 'muss' || w === 'muss noch' || w === 'irgendwann' || w === 'normal')
                continue; // "muss" ist Titel-Noise, nicht Priorität (Beispiel 7 ausgenommen)
            const hit = findWord(text, w, true);
            if (!hit)
                continue;
            priority = v === 'Dringend' ? 'urgent' : v === 'Wichtig' ? 'important' : v === 'Normal' ? 'normal' : 'none';
            cut(hit.index, hit.length);
            matched.priority.push(w);
            break;
        }
        // "wir müssen" → Wichtig (Beispiel 7)
        if (priority === 'none' && matched.persons.includes('wir müssen'))
            priority = 'important';
    }
    // ---- 5/6) Kategorie ---------------------------------------------------
    const scores = new Map();
    const has = (list) => list.some((w) => !!findWord(text, w));
    const buyMain = has(BUY_VERBS);
    const schoolCtx = has(SCHOOL_VERBS) || has(SCHOOL_STRONG);
    const carCtx = has(CAR_CTX);
    const childCtx = has(CHILD_CTX) || assignee_ids.some((id) => members.some((m) => m.id === id));
    const gardenCtx = has(GARDEN_CTX);
    const poolObj = has(POOL_OBJ);
    const add = (cat, n, w) => {
        if (!categoryNames.includes(cat))
            return;
        scores.set(cat, (scores.get(cat) ?? 0) + n);
        matched.category.push(`${w}→${cat}`);
    };
    const words = [...dictionary_1.CATEGORY_WORDS, ...extra.filter((k) => k.type === 'category').map((k) => ({ w: k.word, cat: k.value, weight: 3 }))];
    for (const cw of words) {
        if (cw.w === 'pool' && !poolObj)
            continue;
        const hit = findWord(text, cw.w, cw.w.length <= 3);
        if (!hit)
            continue;
        if (cw.ctx === 'school' && !schoolCtx)
            continue;
        if (cw.ctx === 'buy' && !buyMain)
            continue;
        if (cw.ctx === 'car' && !carCtx)
            continue;
        if (cw.ctx === 'child' && !childCtx)
            continue;
        if (cw.ctx === 'garden' && !gardenCtx)
            continue;
        if (cw.ctx === 'poolobj' && !poolObj)
            continue;
        add(cw.cat, cw.w.includes(' ') ? 5 : cw.weight, cw.w);
    }
    // Hauptaktionsregeln
    if (buyMain)
        add('Besorgen & Kaufen', 6, 'Kaufverb');
    if (has(['ölstand', 'ölwechsel', 'tüv', 'inspektion', 'reifen', 'tanken', 'aussaugen']))
        add('Auto & Mobilität', 5, 'Fahrzeugwartung');
    if (has(SCHOOL_STRONG) && !buyMain)
        add('Schule', 5, 'Schulbegriff');
    if (has(['recherchier', 'vergleich', 'nachsehen', 'nachschau', 'googeln', 'rausfinden', 'herausfinden', 'ausmessen', 'suchen']) && !buyMain)
        add('Prüfen & Recherchieren', 4, 'Prüfverb');
    if (has(['prüf', 'check']) && !carCtx && !buyMain)
        add('Prüfen & Recherchieren', 3, 'Prüfverb');
    if (has(['anmelden', 'vereinbaren', 'termin machen', 'kündig', 'überweis', 'bezahl']) && !has(SCHOOL_STRONG))
        add('Organisation', 3, 'Organisationsverb');
    if (has(['zum arzt', 'zum zahnarzt', 'zum kinderarzt', 'zahnarzttermin', 'arzttermin']) && childCtx)
        add('Familie & Kinder', 5, 'Kind+Arzt');
    if (has(['wegbring', 'entsorg', 'wertstoffhof', 'zurückschick']))
        add('Organisation', 2, 'Entsorgung/Versand');
    if (has(['sperrmüll']) && has(['anmeld']))
        add('Organisation', 3, 'Sperrmüll anmelden');
    // Personenwörter zählen nicht als Kategorie (Vorrang Personenerkennung)
    if (assignee_ids.length && !childCtx)
        scores.delete('Familie & Kinder');
    let category = 'Sonstiges';
    let best = 0;
    for (const [c, s] of scores)
        if (s > best) {
            best = s;
            category = c;
        }
    if (best < 1)
        category = categoryNames.includes('Sonstiges') ? 'Sonstiges' : (categoryNames[0] ?? 'Sonstiges');
    // ---- 7) Titel: Metadaten entfernen -----------------------------------
    // Wir arbeiten auf dem normalisierten Text; Originalschreibweise ist nicht rekonstruierbar,
    // deshalb wird der Titel danach sauber groß geschrieben.
    let t = raw; // Originalschreibweise
    const sorted = spans.slice().sort((a, b) => b.index - a.index);
    for (const s of sorted)
        t = t.slice(0, s.index) + ' ' + t.slice(s.index + s.length);
    const removeAll = (w) => {
        let hit = findWord(normalize(t), w, true);
        while (hit) {
            t = t.slice(0, hit.index) + ' ' + t.slice(hit.index + hit.length);
            hit = findWord(normalize(t), w, true);
        }
    };
    // Noise-Phrasen (längste zuerst), Höflichkeitsfloskeln
    const noise = dictionary_1.TITLE_NOISE.slice().sort((a, b) => b[0].length - a[0].length);
    for (const [w, v] of noise)
        if (v !== 'optional_remove')
            removeAll(w);
    for (const w of ['ganz', 'mal', 'noch', 'einfach', 'doch', 'eben', 'wenn du zeit hast', 'wenn zeit ist', 'wenn wir zeit haben', 'wenn möglich', 'ihr', 'du', 'dann'])
        removeAll(w);
    t = t.replace(/[,;:!?]+/g, ' ').replace(/\s+/g, ' ').trim();
    // Verwaiste Präpositionen nach dem Entfernen von Zeit/Person
    t = t.replace(/^(um|am|an|für)\s+/i, '').replace(/\s+(um|am)$/i, '').replace(/\s(um|am)\s(?=[a-zäöü])/gi, ' ');
    // ---- 8) Verb normalisieren (Imperativ → Infinitiv ans Ende) ----------
    const rewrites = [
        [/^(mach|macht|mache)\s+(.+?)\s+fertig$/, '$2 fertig machen'],
        [/^(räum|räumt|räume)\s+(.+?)\s+auf$/, '$2 aufräumen'],
        [/^(räum|räumt|räume)\s+(.+?)\s+weg$/, '$2 wegräumen'],
        [/^(bring|bringt|bringe)\s+(.+?)\s+weg$/, '$2 wegbringen'],
        [/^(bring|bringt|bringe)\s+(.+?)\s+mit$/, '$2 mitbringen'],
        [/^(wirf|werft)\s+(.+?)\s+weg$/, '$2 wegwerfen'],
        [/^(meld|meldet|melde)\s+(.+?)\s+an$/, '$2 anmelden'],
        [/^(ruf|ruft|rufe)\s+(.+?)\s+an$/, '$2 anrufen'],
        [/^(trag|tragt|trage)\s+(.+?)\s+ein$/, '$2 eintragen'],
        [/^(mach|macht|mache)\s+(.+?)\s+sauber$/, '$2 sauber machen'],
        [/^(mach|macht|mache)\s+(hausaufgaben.*)$/, '$2 machen'],
        [/^(kauf|kauft|kaufe)\s+(.+)$/, '$2 kaufen'],
        [/^(hol|holt|hole)\s+(.+)$/, '$2 holen'],
        [/^(besorg|besorgt|besorge)\s+(.+)$/, '$2 besorgen'],
        [/^(prüf|prüft|prüfe|check|checkt)\s+(.+)$/, '$2 prüfen'],
        [/^(putz|putzt|putze)\s+(.+)$/, '$2 putzen'],
        [/^(wasch|wascht|wasche)\s+(.+)$/, '$2 waschen'],
        [/^(schreib|schreibt|schreibe)\s+(.+)$/, '$2 schreiben'],
        [/^(bestell|bestellt|bestelle)\s+(.+)$/, '$2 bestellen'],
        [/^(giess|gieß|giesst|gießt)\s+(.+)$/, '$2 gießen'],
        [/^(mäh|mäht|mähe)\s+(.+)$/, '$2 mähen'],
        [/^(lern|lernt|lerne)\s+(.+)$/, '$2 lernen'],
        [/^(üb|übt|übe)\s+(.+)$/, '$2 üben'],
        [/^(pack|packt|packe)\s+(.+)$/, '$2 packen'],
        [/^(such|sucht|suche)\s+(.+)$/, '$2 suchen'],
        [/^(repariere|reparier|repariert)\s+(.+)$/, '$2 reparieren'],
        [/^(sortier|sortiert|sortiere)\s+(.+)$/, '$2 sortieren'],
        [/^(saug|saugt|sauge)\s+(.+?)\s+aus$/, '$2 aussaugen'],
        [/^(mach|macht|mache)\s+(.+)$/, '$2 machen'],
    ];
    for (const [re, rep] of rewrites) {
        const rei = new RegExp(re.source, 'i');
        if (rei.test(t)) {
            t = t.replace(rei, rep);
            break;
        }
    }
    // „nach einem neuen Rollo suchen“ → „neuen Rollo suchen“, Artikel am Anfang entfernen
    t = t.replace(/^nach (einem|einer|dem|der|den) /i, '');
    t = t.replace(/^(die|der|das|den|dem|des|eure|euer|eurer|deine|deinen|dein|meine|mein|unsere|unser|einen|eine|ein|das ganze|die ganze) /i, '');
    t = t.replace(/\s+/g, ' ').trim();
    // Ersten Buchstaben und bekannte Eigennamen/Substantive groß (Vorschau ist korrigierbar)
    t = capitalizeTitle(t);
    if (!t)
        t = original;
    return { title: t, assignee_ids, is_pool: assignee_ids.length === 0, due_kind, due_date, due_label, time, category, priority, notes, matched };
}
/** Nur den Satzanfang groß schreiben – die Originalschreibweise bleibt erhalten */
function capitalizeTitle(t) {
    if (!t)
        return t;
    return t.charAt(0).toUpperCase() + t.slice(1);
}
