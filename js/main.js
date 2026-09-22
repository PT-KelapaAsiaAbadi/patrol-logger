// @ts-check
/** Entry point: load saved data, wire up the three views, and open the dashboard. */
import { bindViewTabs, registerView, showView } from './app/navigation.js';
import { renderDashboard } from './dashboard/dashboard.js';
import { device } from './guard/device.js';
import { initGuardApp, showGuardApp } from './guard/guard-app.js';
import { uploadQueued } from './guard/uploads.js';
import { server } from './server/server.js';
import { renderSetup } from './setup/setup.js';

server.load();
device.load();

registerView('guard', showGuardApp);
registerView('dashboard', renderDashboard);
registerView('setup', renderSetup);

initGuardApp();
bindViewTabs();
window.addEventListener('online', () => {
  if (device.hasActiveShift && !device.state.offline) uploadQueued();
});

showView('dashboard');
