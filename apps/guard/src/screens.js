// @ts-check
/** Switching between the guard's screens, and the shared result screen. */
import { $, $$ } from '../../../shared/lib/dom.js';

export const Screen = Object.freeze({
  ENROLL: 'screen-enroll',
  LOGIN: 'screen-login',
  HOME: 'screen-home',
  SIMULATE: 'screen-simulate',
  REPORT: 'screen-report',
  RESULT: 'screen-result',
});

/** @param {string} id */
export function showScreen(id) {
  $$('#guard .screen').forEach((screen) => screen.classList.toggle('is-active', screen.id === id));
  window.scrollTo(0, 0);
}

/** @typedef {'ok' | 'warn' | 'bad'} Tone */

/**
 * @param {{ status: string, tone: Tone, title: string, message: string }} result
 */
export function showResult({ status, tone, title, message }) {
  const statusElement = $('#result-status');
  statusElement.className = `result-status tone-${tone}`;
  statusElement.textContent = status;
  $('#result-title').textContent = title;
  $('#result-message').textContent = message;
  showScreen(Screen.RESULT);
}
