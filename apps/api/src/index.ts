import { createApp } from './app';
import { loadConfig } from './common/config';
import { logger } from './common/logger';
import { churnService } from './modules/retain/churn.service';

const config = loadConfig();
const app = createApp({ corsOrigin: config.CORS_ORIGIN });

app.listen(config.PORT, () => {
  logger.info(`CRM API listening on http://localhost:${config.PORT}/api/v1`);
});

// CRM-23: the 90-day "no recent order" rule changes with time, so refresh every churn flag
// on start-up and then once a day. A failure is logged and retried at the next run.
const refreshChurnFlags = () =>
  churnService
    .recompute()
    .then((changed) => logger.info({ changed }, 'Churn-risk flags refreshed'))
    .catch((err) => logger.error({ err }, 'Churn-risk refresh failed'));
void refreshChurnFlags();
setInterval(refreshChurnFlags, 24 * 60 * 60 * 1000).unref();
