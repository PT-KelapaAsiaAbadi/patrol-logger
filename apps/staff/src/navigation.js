// @ts-check
/** Switches between the three views and remembers which one is showing. */
import { $$ } from '../../../shared/lib/dom.js';

/** @type {Map<string, () => void | Promise<void>>} */
const renderers = new Map();
let currentView = '';

/** @param {string} name  Matches the view's element id and its tab's data-view. @param {() => void | Promise<void>} render */
export function registerView(name, render) {
  renderers.set(name, render);
}

/** @param {string} name */
export async function showView(name) {
  currentView = name;
  $$('.view-tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.view === name)));
  $$('.view').forEach((view) => view.classList.toggle('is-active', view.id === name));
  await renderers.get(name)?.();
  window.scrollTo(0, 0);
}

export function refreshCurrentView() {
  return showView(currentView);
}

export function bindViewTabs() {
  $$('.view-tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
}
