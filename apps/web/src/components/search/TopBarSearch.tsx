import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { SearchDropdown } from './SearchDropdown';
import { toGroups, type SearchResults } from './types';

/** Wait this long after the last keystroke before calling the API (CRM-15). */
export const DEBOUNCE_MS = 300;
/** The API answers 400 for anything shorter, so we do not even ask. */
const MIN_LENGTH = 2;

/** CRM-15: global search box for the top bar. */
export function TopBarSearch() {
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);

  // Only update the term that triggers the search once typing has paused.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // Close the dropdown when clicking elsewhere or pressing Escape.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const typed = text.trim();
  const { data, isError, isFetching } = useQuery({
    queryKey: ['search', term],
    queryFn: () => api<SearchResults>(`/search?q=${encodeURIComponent(term)}`),
    enabled: term.length >= MIN_LENGTH,
  });

  // The results on screen are for `term`; while the user is still typing, show "Searching…".
  const waiting = typed.length >= MIN_LENGTH && (typed !== term || isFetching || !data);
  const showDropdown = open && typed.length >= MIN_LENGTH;

  const select = (path: string) => {
    setOpen(false);
    setText('');
    setTerm('');
    navigate(path);
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <input
        type="search"
        value={text}
        placeholder="Search leads, contacts, deals…"
        aria-label="Global search"
        autoComplete="off"
        className="w-full rounded border border-slate-300 px-3 py-1 text-sm"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showDropdown && (
        <SearchDropdown
          groups={data ? toGroups(data) : []}
          isLoading={waiting && !isError}
          isError={isError && typed === term}
          onSelect={select}
        />
      )}
    </div>
  );
}
