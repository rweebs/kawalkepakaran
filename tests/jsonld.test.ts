import { describe, it, expect } from 'vitest';
import { serializeJsonLd } from '../src/lib/jsonld';

describe('serializeJsonLd', () => {
  it('escapes < so a title cannot close the script tag', () => {
    const out = serializeJsonLd({ headline: '</script><b>x' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out).headline).toBe('</script><b>x');
  });
  it('escapes U+2028 and U+2029', () => {
    const out = serializeJsonLd({ a: 'x\u2028y\u2029z' });
    expect(out).not.toMatch(/[\u2028\u2029]/);
  });
});
