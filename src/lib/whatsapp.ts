/** WhatsApp-Link mit vorbereitetem Text. Ohne Nummer öffnet sich die Kontaktauswahl. */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? '').replace(/[^\d]/g, '').replace(/^00/, '')
  const normalized = digits.startsWith('0') ? `49${digits.slice(1)}` : digits
  const base = normalized ? `https://wa.me/${normalized}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(text)}`
}

export function openWhatsApp(phone: string | null | undefined, text: string): void {
  window.open(whatsappLink(phone, text), '_blank', 'noopener')
}
