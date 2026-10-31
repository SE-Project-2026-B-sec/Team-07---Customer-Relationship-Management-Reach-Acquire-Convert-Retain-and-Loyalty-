import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportLeads } from './ImportLeads';
import { MAX_IMPORT_ROWS, parseLeadsCsv, type ImportRow } from './importCsv';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const csv = (lines: string[]) => ['name,email,phone,company', ...lines].join('\n');
const people = (n: number) =>
  Array.from({ length: n }, (_, i) => `Person ${i + 1},p${i + 1}@example.test,,Acme`);

const csvFile = (text: string) => new File([text], 'leads.csv', { type: 'text/csv' });

/** A tiny fake of POST /leads/import: an email without "@" is rejected, "dup..." is flagged. */
function mockImportApi(failWith?: { status: number; message: string }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (failWith) {
      return json({ error: { code: 'FORBIDDEN', message: failWith.message } }, failWith.status);
    }
    if (String(input).endsWith('/leads/import') && init?.method === 'POST') {
      const { rows } = JSON.parse(String(init.body)) as { rows: ImportRow[] };
      const errors = rows.flatMap((r, i) =>
        r.email.includes('@')
          ? []
          : [{ row: i + 1, email: r.email, reason: 'Enter a valid email' }],
      );
      return json({
        received: rows.length,
        imported: rows.length - errors.length,
        duplicates: rows.filter((r) => r.email.startsWith('dup')).length,
        rejected: errors.length,
        errors,
      });
    }
    return json({}, 404);
  });
}

const renderPanel = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ImportLeads onClose={() => {}} />
    </QueryClientProvider>,
  );

const choose = (text: string) =>
  fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [csvFile(text)] } });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('parseLeadsCsv', () => {
  it('reads rows, ignoring header case, a BOM, extra columns and blank lines', () => {
    const result = parseLeadsCsv('\uFEFFName,EMAIL,Notes\nA,a@x.test,hi\n\nB,b@x.test,yo\n');
    expect(result).toEqual({
      ok: true,
      rows: [
        { name: 'A', email: 'a@x.test' },
        { name: 'B', email: 'b@x.test' },
      ],
    });
  });

  it('keeps phone and company only when they are filled in', () => {
    const result = parseLeadsCsv(csv(['A,a@x.test,+91 98765 43210,Acme', 'B,b@x.test,,']));
    expect(result).toEqual({
      ok: true,
      rows: [
        { name: 'A', email: 'a@x.test', phone: '+91 98765 43210', company: 'Acme' },
        { name: 'B', email: 'b@x.test' },
      ],
    });
  });

  it('explains a missing column, an empty file and a file over the limit', () => {
    const noEmail = parseLeadsCsv('name,phone\nA,123');
    const empty = parseLeadsCsv('name,email\n');
    const tooMany = parseLeadsCsv(csv(people(MAX_IMPORT_ROWS + 1)));
    expect(noEmail.ok).toBe(false);
    if (!noEmail.ok) expect(noEmail.error).toContain('"email"');
    expect(empty.ok).toBe(false);
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toContain('1,000');
  });
});

describe('Import leads panel', () => {
  it('previews the first 5 rows and the total', async () => {
    renderPanel();
    choose(csv(people(7)));

    expect(await screen.findByText(/Previewing the first 5 of 7 rows/)).toBeInTheDocument();
    expect(screen.getByText('Person 5')).toBeInTheDocument();
    expect(screen.queryByText('Person 6')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 7 leads' })).toBeInTheDocument();
  });

  it('TC-ACQ-03 sends big files in batches and reports imported, duplicate and rejected rows', async () => {
    const lines = people(250);
    lines[204] = 'Bad Person,not-an-email,,';
    lines[0] = 'Dup Person,dup1@example.test,,';
    const fetchMock = mockImportApi();
    renderPanel();
    choose(csv(lines));

    fireEvent.click(await screen.findByRole('button', { name: 'Import 250 leads' }));

    await waitFor(() => expect(screen.getByTestId('report-imported').textContent).toBe('249'));
    expect(screen.getByTestId('report-duplicates').textContent).toBe('1');
    expect(screen.getByTestId('report-rejected').textContent).toBe('1');

    const posts = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/leads/import'));
    const sizes = posts.map(([, init]) => JSON.parse(String(init?.body)).rows.length);
    expect(sizes).toEqual([200, 50]);

    // Row 5 of the second batch is row 205 of the file.
    const table = within(screen.getByRole('table', { name: 'Rejected rows' }));
    expect(table.getByText('205')).toBeInTheDocument();
    expect(table.getByText('Enter a valid email')).toBeInTheDocument();
  });

  it('shows the server message if the import is refused', async () => {
    mockImportApi({ status: 403, message: 'You do not have permission' });
    renderPanel();
    choose(csv(people(3)));

    fireEvent.click(await screen.findByRole('button', { name: 'Import 3 leads' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Stopped after 0 of 3 rows');
    expect(alert).toHaveTextContent('You do not have permission');
  });

  it('explains a file with the wrong columns', async () => {
    renderPanel();
    choose('full name,mail\nA,a@x.test');
    expect(await screen.findByRole('alert')).toHaveTextContent('"name" and a "email" column');
  });
});
