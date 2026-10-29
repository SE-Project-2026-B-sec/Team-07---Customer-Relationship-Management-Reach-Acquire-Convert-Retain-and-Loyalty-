interface Props {
  title: string;
  owner: string;
  stories: string;
}

/** Temporary page. Replace with the real screen when the story is picked up. */
export function Placeholder({ title, owner, stories }: Props) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">
        Not built yet. Owner: {owner}. Stories: {stories}.
      </p>
    </div>
  );
}
