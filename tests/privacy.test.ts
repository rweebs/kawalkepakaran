import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findPersonalData } from '../src/lib/privacy';

const ALLOWED = new Set(['abil@assai.id', 'rahmat.wibowo21@gmail.com', 'ditjen-pd@kemdikbud.go.id', 'rektor@itb.ac.id']);
const DIRS = ['src/content/posts', 'src/content/arsip'];

describe('no personal data in content', () => {
  for (const dir of DIRS) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      it(`${join(dir, f)} has no personal data`, () => {
        expect(findPersonalData(readFileSync(join(dir, f), 'utf8'), ALLOWED)).toEqual([]);
      });
    }
  }
});
