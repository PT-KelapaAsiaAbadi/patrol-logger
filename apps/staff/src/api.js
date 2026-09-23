// @ts-check
/**
 * The staff app's only door to the backend.
 *
 * Today it is the in-browser mock backend from `dev/`. In Phase 6 this module
 * reads Supabase through row-level security and calls the admin RPCs, and
 * nothing else in the app changes: the screens import from here, never from `dev/`.
 */
export { loadPhoto, server } from '../../../dev/mock-backend/server.js';
