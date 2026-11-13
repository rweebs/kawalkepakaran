// Hydrates a /pantau dashboard without shipping its dataset inside the HTML. On the server (and until the data
// arrives) it shows the server-rendered dashboard passed as children; once visible it fetches the island's JSON
// (src/pages/pantau-data/[name].json.ts) and swaps in the interactive component with the same props. If the fetch
// fails, the static version simply stays, so nothing breaks without JavaScript or network.
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import RelasiGraph3D from './RelasiGraph3D';
import SitemapDashboard from './SitemapDashboard';
import PerkaraDashboard from './PerkaraDashboard';
import FomoDashboard from './FomoDashboard';

const COMPONENTS: Record<string, ComponentType<any>> = { relasi: RelasiGraph3D, situs: SitemapDashboard, perkara: PerkaraDashboard, fomo: FomoDashboard };

export interface PantauLazyProps { kind: 'relasi' | 'situs' | 'perkara' | 'fomo'; src: string; props?: Record<string, unknown>; children?: ReactNode }

export default function PantauLazy({ kind, src, props = {}, children }: PantauLazyProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let live = true;
    fetch(src).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d) setData(d); }).catch(() => {});
    return () => { live = false; };
  }, [src]);
  const C = COMPONENTS[kind];
  // A real block wrapper: client:visible observes the island's child elements, and a bare <astro-slot> (display:
  // contents) has no box, so it would never be seen and never hydrate.
  return <div className="pantau-lazy" data-ready={data ? 'yes' : 'no'}>{data && C ? <C {...data} {...props} /> : children}</div>;
}
