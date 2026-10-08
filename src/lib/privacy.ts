export function findPersonalData(text: string, allowedEmails: ReadonlySet<string>): string[] {
  const hits: string[] = [];

  for (const m of text.matchAll(/\+?\d[\d\s.\-()]{6,}\d/g)) {
    const digits = m[0].replace(/\D/g, '');
    const mobile = /^(62|0)8\d{7,11}$/.test(digits);
    const landline = /^(0|62)(21|22|24|31|61|274|251)\d{6,8}$/.test(digits);
    if (mobile || landline || /^\d{16}$/.test(digits)) hits.push(m[0].trim());
  }

  for (const m of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) {
    const email = m[0].replace(/\.+$/, '').toLowerCase();
    if (!allowedEmails.has(email)) hits.push(email);
  }
  for (const m of text.matchAll(/[\w.+-]+\s*[\[(]\s*at\s*[\])]\s*[\w-]+(?:\.[\w-]+)+/gi)) hits.push(m[0]);

  return hits;
}
