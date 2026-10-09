import './config/bootServer';
import { getConfig } from './config';
import { createApp } from './app';
import { checkConfiguredCookieTransport } from './middleware/cookieTransport';
import { startSchedulers } from './schedulers';

const config = getConfig();

// Warn when SECURE_COOKIES disagrees with the configured public origin.
checkConfiguredCookieTransport();

export const app = createApp(config);

startSchedulers(config);

export default {
  port: config.runtime.port,
  hostname: config.runtime.host,
  fetch: app.fetch,
};
