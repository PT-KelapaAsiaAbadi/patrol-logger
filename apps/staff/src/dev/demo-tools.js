// @ts-check
/**
 * Development only: the demo site, wired to the staff app.
 *
 * `dev/demo-site.js` knows nothing about either app, so re-rendering after it
 * seeds is done here. Production builds exclude this module.
 */
import { refreshCurrentView } from '../navigation.js';
import { resetEverything, seedDemoSite as seed } from '../../../../dev/demo-site.js';

export async function seedDemoSite() {
  await seed();
  await refreshCurrentView();
}

export { resetEverything };
