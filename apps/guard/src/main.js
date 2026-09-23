// @ts-check
/** Guard app entry point: load state, wire the screens, show whichever one fits. */
import { server } from './api.js';
import { device } from './device.js';
import { initGuardApp, showGuardApp } from './guard-app.js';
import { uploadQueued } from './uploads.js';

server.load();
device.load();

initGuardApp();
showGuardApp();

window.addEventListener('online', () => {
  if (device.hasActiveShift && !device.state.offline) uploadQueued();
});
