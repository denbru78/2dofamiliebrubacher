"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toISODate = toISODate;
exports.todayISO = todayISO;
exports.addDays = addDays;
exports.startOfWeek = startOfWeek;
exports.endOfWeekISO = endOfWeekISO;
exports.nextSaturdayISO = nextSaturdayISO;
exports.resolveDueDate = resolveDueDate;
exports.formatDate = formatDate;
exports.formatDateTime = formatDateTime;
exports.dueState = dueState;
exports.dueLabel = dueLabel;
exports.sameDay = sameDay;
exports.nextDueDate = nextDueDate;
exports.weekKey = weekKey;
function pad(n) {
    return n < 10 ? `0${n}` : String(n);
}
function toISODate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function todayISO() {
    return toISODate(new Date());
}
function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
/** Montag der aktuellen Woche, 00:00 Uhr */
function startOfWeek(d = new Date()) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7; // Mo=0 ... So=6
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
}
function endOfWeekISO(d = new Date()) {
    return toISODate(addDays(startOfWeek(d), 6));
}
function nextSaturdayISO(d = new Date()) {
    const x = new Date(d);
    const day = x.getDay(); // So=0 ... Sa=6
    if (day === 6)
        return toISODate(x);
    if (day === 0)
        return toISODate(x); // Sonntag zählt noch als Wochenende
    return toISODate(addDays(x, 6 - day));
}
/** Löst eine Terminart in ein konkretes Datum auf (oder null). */
function resolveDueDate(kind, dateValue) {
    const now = new Date();
    switch (kind) {
        case 'today':
            return toISODate(now);
        case 'tomorrow':
            return toISODate(addDays(now, 1));
        case 'week':
            return endOfWeekISO(now);
        case 'weekend':
            return nextSaturdayISO(now);
        case 'date':
            return dateValue || null;
        default:
            return null;
    }
}
function formatDate(iso) {
    if (!iso)
        return '';
    const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatDateTime(iso) {
    if (!iso)
        return '';
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
        d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function dueState(dueKind, dueDate) {
    if (dueKind === 'someday')
        return 'someday';
    if (!dueDate)
        return 'none';
    const t = todayISO();
    if (dueDate < t)
        return 'overdue';
    if (dueDate === t)
        return 'today';
    if (dueDate === toISODate(addDays(new Date(), 1)))
        return 'tomorrow';
    if (dueDate <= endOfWeekISO())
        return 'soon';
    return 'later';
}
function dueLabel(dueKind, dueDate) {
    const s = dueState(dueKind, dueDate);
    switch (s) {
        case 'overdue':
            return `Überfällig · ${formatDate(dueDate)}`;
        case 'today':
            return 'Heute';
        case 'tomorrow':
            return 'Morgen';
        case 'soon': {
            const d = new Date(`${dueDate}T12:00:00`);
            return d.toLocaleDateString('de-DE', { weekday: 'long' });
        }
        case 'later':
            return formatDate(dueDate);
        case 'someday':
            return 'Irgendwann';
        default:
            return '';
    }
}
function sameDay(a, b) {
    if (!a || !b)
        return false;
    return toISODate(new Date(a)) === toISODate(new Date(b));
}
/** Nächster Termin einer wiederkehrenden Aufgabe (wie im Datenbank-Trigger). */
function nextDueDate(dueDate, rec, interval) {
    const n = Math.max(1, interval || 1);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    let base = dueDate ? new Date(`${dueDate}T12:00:00`) : today;
    if (base < today)
        base = today;
    const d = new Date(base);
    switch (rec) {
        case 'daily':
            d.setDate(d.getDate() + n);
            break;
        case 'weekly':
            d.setDate(d.getDate() + 7 * n);
            break;
        case 'monthly':
            d.setMonth(d.getMonth() + n);
            break;
        case 'yearly':
            d.setFullYear(d.getFullYear() + n);
            break;
        default:
            break;
    }
    return toISODate(d);
}
/** Wochenstatistik: erledigte Aufgaben pro Woche (Montag als Schlüssel), n Wochen zurück */
function weekKey(d) {
    return toISODate(startOfWeek(d));
}
