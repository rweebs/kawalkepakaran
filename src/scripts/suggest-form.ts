import { issueUrl, mailtoUrl, type Suggestion } from '../lib/suggest';
import type { Locale } from '../i18n';

// The suggest-a-claim form. Its submit buttons start hidden and disabled (the page offers plain email and GitHub links instead),
// so without JavaScript nothing is submitted anywhere. With it, the buttons appear and build a prefilled GitHub issue or email.
const form = document.querySelector<HTMLFormElement>('form[data-suggest-form]');
if (form) {
  const locale: Locale = form.dataset.locale === 'en' ? 'en' : 'id';
  for (const b of form.querySelectorAll<HTMLButtonElement>('button[data-target]')) {
    b.hidden = false;
    b.disabled = false;
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const f = new FormData(form);
    const get = (k: string) => String(f.get(k) ?? '');
    const s: Suggestion = { pakar: get('pakar'), claim: get('claim'), venueUrl: get('venueUrl'), evidence: get('evidence'), email: get('email') };
    const target = (e.submitter as HTMLButtonElement | null)?.dataset.target;
    window.location.assign(target === 'email' ? mailtoUrl(s, locale) : issueUrl(s, locale));
  });
}
