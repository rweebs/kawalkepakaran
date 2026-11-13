import { describe, it, expect } from 'vitest';
import { relasiProps } from '../src/lib/pantau-props';
import { buildLinks, layout3d, offCentre, centreRank, CENTER_ID } from '../src/lib/relasi-3d';
import type { GEdge, GNode } from '../src/lib/relasi';

const node = (id: string, parent?: string): GNode => ({ id, kind: 'member', source: 'perkara', label: id, count: 1, parent });

describe('buildLinks', () => {
  it('links a member to its parent and keeps one link per pair', () => {
    const nodes = [node('g'), node('a', 'g'), node('b', 'g')];
    const edges: GEdge[] = [{ from: 'a', to: 'b', kind: 'cross-fact', weight: 2 }, { from: 'b', to: 'a', kind: 'cross-fact', weight: 3 }];
    const { links } = buildLinks(nodes, edges);
    expect(links).toHaveLength(3);
    const ab = links.find((l) => Math.min(l.a, l.b) === 1 && Math.max(l.a, l.b) === 2)!;
    expect(ab.kind).toBe('cross-fact');
    expect(ab.weight).toBe(3);
  });
  it('ignores edges to unknown nodes and self links', () => {
    const { links } = buildLinks([node('a')], [{ from: 'a', to: 'zz', kind: 'in-fact', weight: 1 }, { from: 'a', to: 'a', kind: 'in-fact', weight: 1 }]);
    expect(links).toHaveLength(0);
  });
});

describe('layout3d', () => {
  it('is deterministic and finite', () => {
    const nodes = [node('g'), node('a', 'g'), node('b', 'g'), node('c')];
    const a = layout3d(nodes, [], { iterations: 40 });
    const b = layout3d(nodes, [], { iterations: 40 });
    expect([...a.positions]).toEqual([...b.positions]);
    expect([...a.positions].every(Number.isFinite)).toBe(true);
  });
  it('handles an empty graph', () => {
    expect(layout3d([], []).positions).toHaveLength(0);
  });
  it('does not put Rahmat at the centre of the real graph', () => {
    const { nodes, edges } = relasiProps();
    const l = layout3d(nodes, edges);
    expect(l.index.has(CENTER_ID)).toBe(true);
    expect(centreRank(l, CENTER_ID)).toBeGreaterThan(nodes.length * 0.3);
    expect(offCentre(l, CENTER_ID)).toBeGreaterThan(0.4);
  }, 60_000);
});
