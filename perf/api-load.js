// CRM-32 TC-PERF-01 (CRM-NF-001): 50 virtual users for 2 minutes against the list and detail
// endpoints. Pass = p95 latency < 500 ms and error rate < 1%.
//
// Run locally (API on port 4000, database seeded), with Docker:
//   docker run --rm -i -e API_URL=http://host.docker.internal:4000/api/v1 \
//     -v "$PWD/perf:/perf" grafana/k6:0.54.0 run --summary-export /perf/k6-summary.json - < perf/api-load.js
// Against the deployed API, set API_URL to https://<render-host>/api/v1 (read-only requests).
// Logs in ONCE in setup(), so the login rate limit (100/min, CRM-SR-006) is not hit.
import { check, sleep } from 'k6';
import http from 'k6/http';

const API = __ENV.API_URL || 'http://localhost:4000/api/v1';
const EMAIL = __ENV.EMAIL || 'manager@crm.test';
const PASSWORD = __ENV.PASSWORD || 'Password@123';

export const options = {
  scenarios: {
    steady: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 50),
      duration: __ENV.DURATION || '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
};

// Read-only requests a Sales Manager makes during a normal day.
const PATHS = [
  '/leads?pageSize=20',
  '/contacts?pageSize=20',
  '/accounts?pageSize=20',
  '/deals?pageSize=100',
  '/tickets?pageSize=20',
  '/search?q=an',
  '/dashboard/kpis',
  '/reports/funnel',
  '/churn-risk?pageSize=20',
];

export function setup() {
  const res = http.post(`${API}/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status !== 200) throw new Error(`Login failed: ${res.status} ${res.body}`);
  return { token: res.json('token') };
}

export default function (data) {
  const path = PATHS[Math.floor(Math.random() * PATHS.length)];
  const res = http.get(`${API}${path}`, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { endpoint: path.split('?')[0] },
  });
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(0.5 + Math.random()); // think time between clicks
}
