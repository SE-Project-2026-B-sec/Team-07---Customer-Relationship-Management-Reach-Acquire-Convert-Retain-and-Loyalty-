import { HEAT_STYLE, heatOf } from './scoring';

/** CRM-20: a lead's score (0–100) with a Hot / Warm / Cold label. */
export function ScoreBadge({ score }: { score: number }) {
  const heat = heatOf(score);
  return (
    <span
      title={`Lead score ${score} out of 100`}
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${HEAT_STYLE[heat]}`}
    >
      <span className="tabular-nums">{score}</span>
      <span>{heat}</span>
    </span>
  );
}
