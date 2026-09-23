// @ts-check
/**
 * The guard app's only door to the backend.
 *
 * Today it is the in-browser mock backend from `dev/`. In Phase 5 this module
 * calls the Edge Functions instead, and nothing else in the app changes: the
 * screens import from here, never from `dev/`.
 *
 * The screens still read `server.state` for the home screen. Phase 5 replaces
 * those reads with one `guard-home` request.
 */
export { server } from '../../../dev/mock-backend/server.js';
