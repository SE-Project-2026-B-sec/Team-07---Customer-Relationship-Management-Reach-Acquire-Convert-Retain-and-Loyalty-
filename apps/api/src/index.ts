import { createApp } from './app';
import { loadConfig } from './common/config';
import { logger } from './common/logger';

const config = loadConfig();
const app = createApp({ corsOrigin: config.CORS_ORIGIN });

app.listen(config.PORT, () => {
  logger.info(`CRM API listening on http://localhost:${config.PORT}/api/v1`);
});
