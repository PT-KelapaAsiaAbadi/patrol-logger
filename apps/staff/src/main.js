// @ts-check
/** Staff app entry point: load state and open the dashboard. */
import { server } from './api.js';
import { bindViewTabs, registerView, showView } from './navigation.js';
import { renderDashboard } from './dashboard/dashboard.js';
import { renderSetup } from './setup/setup.js';

server.load();

registerView('dashboard', renderDashboard);
registerView('setup', renderSetup);

bindViewTabs();
showView('dashboard');
