import { describe, it, expect } from 'vitest';
import { findEnglishBlocks } from '../src/lib/translation';

const EN = 'This is the report of the investigation that was written by the author for the readers who want to know what happened and why it was done in this way';
const ID = 'Ini adalah laporan dari penyelidikan yang ditulis oleh penulis untuk para pembaca yang ingin mengetahui apa yang terjadi dan mengapa hal itu dilakukan dengan cara demikian';

describe('findEnglishBlocks', () => {
  it('passes an Indonesian paragraph', () => {
    expect(findEnglishBlocks(ID)).toEqual([]);
  });
  it('flags an English paragraph of 20+ words', () => {
    expect(findEnglishBlocks(EN)).toHaveLength(1);
  });
  it('ignores a short English phrase', () => {
    expect(findEnglishBlocks('This is the end of the story')).toEqual([]);
  });
  it('flags English inside a blockquote', () => {
    expect(findEnglishBlocks(`> ${EN}`)).toHaveLength(1);
  });
  it('flags English inside a table row', () => {
    expect(findEnglishBlocks(`| ${EN} | x |`)).toHaveLength(1);
  });
  it('ignores frontmatter and fenced code', () => {
    expect(findEnglishBlocks(`---\ntitle: "${EN}"\n---\n\n\`\`\`\n${EN}\n\`\`\`\n\n${ID}`)).toEqual([]);
  });
  it('flags an English tail appended to an Indonesian post', () => {
    expect(findEnglishBlocks(`${ID}\n\n${ID}\n\n${EN}`)).toHaveLength(1);
  });
});
