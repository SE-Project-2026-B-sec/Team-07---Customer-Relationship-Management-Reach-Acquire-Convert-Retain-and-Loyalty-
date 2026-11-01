import type { SearchGroup } from './types';

interface Props {
  groups: SearchGroup[];
  isLoading: boolean;
  isError: boolean;
  onSelect: (path: string) => void;
}

/** CRM-15: results grouped by type, with a "No results" message when nothing matches. */
export function SearchDropdown({ groups, isLoading, isError, onSelect }: Props) {
  let body;
  if (isLoading) {
    body = <p className="px-3 py-2 text-sm text-slate-500">Searching…</p>;
  } else if (isError) {
    body = <p className="px-3 py-2 text-sm text-red-700">Search failed. Please try again.</p>;
  } else if (groups.length === 0) {
    body = <p className="px-3 py-2 text-sm text-slate-500">No results</p>;
  } else {
    body = groups.map((group) => (
      <section key={group.key} aria-label={group.title}>
        <h3 className="bg-slate-50 px-3 py-1 text-xs font-semibold uppercase text-slate-500">
          {group.title}
        </h3>
        <ul>
          {group.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-blue-50"
                onClick={() => onSelect(group.path)}
              >
                <span className="font-medium text-slate-900">{item.label}</span>
                {item.detail && <span className="text-xs text-slate-500">{item.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    ));
  }

  return (
    <div
      role="region"
      aria-label="Search results"
      className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded border border-slate-200 bg-white shadow-lg"
    >
      {body}
    </div>
  );
}
