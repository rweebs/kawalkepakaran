// tsc has no type for an .astro module (Astro's editor plugin and `astro check` supply their own); the rendered-page
// tests hand one to the container, which renders it as a component factory.
declare module '*.astro' {
  import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
  const Component: AstroComponentFactory;
  export default Component;
}
