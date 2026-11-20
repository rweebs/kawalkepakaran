// tsc has no type for an .astro module (Astro's editor plugin and `astro check` supply their own); the rendered-page
// tests hand one to the container, which renders it as a component factory. Only the pages the tests import are declared,
// so an import of any other .astro file (one missing or misspelt) still fails the typecheck.
declare module '*/src/pages/pantau/bowobharata.astro' {
  import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
  const Component: AstroComponentFactory;
  export default Component;
}
