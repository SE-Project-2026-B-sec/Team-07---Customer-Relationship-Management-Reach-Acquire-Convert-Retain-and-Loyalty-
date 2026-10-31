// apps/web/src/components/TopBarSearch.tsx
import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { SearchDropdown } from './SearchDropdown';

/**
 * Global search box placed in the top bar.
 * Debounces user input (300 ms) before hitting the backend.
 * Shows a dropdown with grouped results.
 */
export function TopBarSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api<{ leads: any[]; contacts: any[]; accounts: any[]; deals: any[]; tickets: any[] }>(`/analytics/search?q=${encodeURIComponent(query)}`);
        setResults(data);
        setError(null);
      } catch (e: any) {
        setError(e.message ?? 'Search failed');
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    // cleanup on unmount
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <div className="relative">
      <input
        className="rounded border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <div className="absolute inset-y-0 right-2 flex items-center">🔄</div>}
      {error && <div className="absolute top-full left-0 mt-1 text-sm text-red-600">{error}</div>}
      {results && (
        <SearchDropdown results={results} onSelect={() => setQuery('')} />
      )}
    </div>
  );
}
