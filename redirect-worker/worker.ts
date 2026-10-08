import { legacyTarget } from '../src/lib/legacy-redirects';

const NEW_ORIGIN = 'https://kawalkepakaran.org';

export default {
  fetch(req: Request): Response {
    const u = new URL(req.url);
    return Response.redirect(`${NEW_ORIGIN}${legacyTarget(u.pathname)}${u.search}`, 301);
  },
};
