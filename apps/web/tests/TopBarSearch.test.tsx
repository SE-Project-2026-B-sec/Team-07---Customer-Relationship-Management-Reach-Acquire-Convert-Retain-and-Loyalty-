// apps/web/tests/TopBarSearch.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TopBarSearch } from '../src/components/TopBarSearch';
import * as apiModule from '../src/api/client';

jest.mock('../src/api/client');

const mockedApi = apiModule.api as jest.MockedFunction<typeof apiModule.api>;

describe('TopBarSearch component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedApi.mockReset();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('does not call API for queries shorter than 2 chars', async () => {
    render(<TopBarSearch />);
    const input = screen.getByPlaceholderText('Search…');
    fireEvent.change(input, { target: { value: 'a' } });
    jest.advanceTimersByTime(300);
    await waitFor(() => {
      expect(mockedApi).not.toHaveBeenCalled();
    });
  });

  it('debounces API calls and displays results', async () => {
    const fakeData = { leads: [], contacts: [], accounts: [], deals: [], tickets: [] };
    mockedApi.mockResolvedValueOnce(fakeData);
    render(<TopBarSearch />);
    const input = screen.getByPlaceholderText('Search…');
    fireEvent.change(input, { target: { value: 'ac' } });
    // advance less than debounce – should not call yet
    jest.advanceTimersByTime(200);
    expect(mockedApi).not.toHaveBeenCalled();
    // now finish debounce
    jest.advanceTimersByTime(200);
    await waitFor(() => expect(mockedApi).toHaveBeenCalledTimes(1));
    // dropdown should appear (No results message)
    expect(screen.getByText('No results')).toBeInTheDocument();
  });
});
