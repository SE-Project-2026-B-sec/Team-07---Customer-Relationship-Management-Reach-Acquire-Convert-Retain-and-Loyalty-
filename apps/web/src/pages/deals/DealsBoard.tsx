import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { ActivitiesPanel } from '../../components/activities/ActivitiesPanel';
import { NewDealForm } from './NewDealForm';
import {
  STAGES,
  STAGE_LABEL,
  formatInr,
  initials,
  isOpen,
  type Deal,
  type DealsPage,
  type Stage,
} from './types';

const DEALS_KEY = ['deals'];

interface DealCardProps {
  deal: Deal;
  onMove: (id: string, stage: Stage) => void;
  onShowActivities: (deal: Deal) => void;
}

function DealCard({ deal, onMove, onShowActivities }: DealCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded border border-slate-200 bg-white p-3 shadow-sm ${
        isDragging ? 'relative z-10 opacity-80 shadow-lg' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Only this handle starts a drag, so the dropdown below stays usable. */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          aria-label={`Drag ${deal.title}`}
          className="cursor-grab touch-none rounded px-1 text-slate-500 hover:bg-slate-100"
        >
          ⠿
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-slate-900">{deal.title}</h3>
          <p className="truncate text-xs text-slate-600">{deal.contactName}</p>
        </div>
        <span
          title={deal.ownerName}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-800"
        >
          {initials(deal.ownerName)}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-900">{formatInr(deal.value)}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
        <span aria-hidden="true">Move to</span>
        <select
          value={deal.stage}
          aria-label={`Move ${deal.title} to stage`}
          onChange={(e) => onMove(deal.id, e.target.value as Stage)}
          className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-1"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => onShowActivities(deal)}
        aria-label={`Activities for ${deal.title}`}
        className="mt-2 text-xs font-medium text-blue-800 underline"
      >
        Activities
      </button>
    </article>
  );
}

interface ColumnProps {
  stage: Stage;
  deals: Deal[];
  onMove: (id: string, stage: Stage) => void;
  onShowActivities: (deal: Deal) => void;
}

function Column({ stage, deals, onMove, onShowActivities }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = deals.reduce((sum, d) => sum + d.value, 0);

  return (
    <section
      ref={setNodeRef}
      aria-label={`${STAGE_LABEL[stage]} column`}
      className={`w-64 shrink-0 rounded border p-2 ${
        isOver ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-100'
      }`}
    >
      <header className="mb-2 px-1">
        <h2 className="text-sm font-semibold text-slate-800">{STAGE_LABEL[stage]}</h2>
        <p className="text-xs text-slate-600">
          <span data-testid={`count-${stage}`}>{deals.length}</span>{' '}
          {deals.length === 1 ? 'deal' : 'deals'} ·{' '}
          <span data-testid={`total-${stage}`}>{formatInr(total)}</span>
        </p>
      </header>
      <div className="flex min-h-16 flex-col gap-2">
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} onMove={onMove} onShowActivities={onShowActivities} />
        ))}
      </div>
    </section>
  );
}

export function DealsBoard() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [activitiesFor, setActivitiesFor] = useState<Deal | null>(null);

  const deals = useQuery({
    queryKey: DEALS_KEY,
    queryFn: () => api<DealsPage>('/deals?pageSize=100'),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) =>
      api<Deal>(`/deals/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) }),
    // Update the screen straight away; roll back if the server says no.
    onMutate: async ({ id, stage }) => {
      setError('');
      await queryClient.cancelQueries({ queryKey: DEALS_KEY });
      const previous = queryClient.getQueryData<DealsPage>(DEALS_KEY);
      queryClient.setQueryData<DealsPage>(DEALS_KEY, (old) =>
        old
          ? {
              ...old,
              data: old.data.map((d) =>
                d.id === id
                  ? { ...d, stage, wonAt: stage === 'WON' ? new Date().toISOString() : null }
                  : d,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(DEALS_KEY, context.previous);
      setError('Could not move the deal, so it was put back. Please try again.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: DEALS_KEY }),
  });

  const moveDeal = (id: string, stage: Stage) => move.mutate({ id, stage });

  const list = deals.data?.data ?? [];
  const openValue = list.filter((d) => isOpen(d.stage)).reduce((sum, d) => sum + d.value, 0);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const target = String(e.over.id);
    if (!(STAGES as readonly string[]).includes(target)) return;
    const deal = list.find((d) => d.id === String(e.active.id));
    if (deal && deal.stage !== target) moveDeal(deal.id, target as Stage);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Deals</h1>
          <p className="mt-1 text-sm text-slate-600">
            Open pipeline: <strong data-testid="open-pipeline">{formatInr(openValue)}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded bg-blue-700 px-4 py-2 text-sm text-white"
        >
          New deal
        </button>
      </div>

      {showForm && <NewDealForm onClose={() => setShowForm(false)} />}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {deals.isLoading && <p className="mt-4 text-sm text-slate-600">Loading deals…</p>}
      {deals.isError && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Could not load deals.
        </p>
      )}
      {deals.data && deals.data.total > list.length && (
        <p className="mt-4 text-sm text-slate-600">Showing the first {list.length} deals.</p>
      )}

      {deals.data && (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <Column
                key={stage}
                stage={stage}
                deals={list.filter((d) => d.stage === stage)}
                onMove={moveDeal}
                onShowActivities={setActivitiesFor}
              />
            ))}
          </div>
        </DndContext>
      )}

      {activitiesFor && (
        <section
          aria-label="Deal activities"
          className="mt-4 rounded border border-slate-200 bg-slate-50 p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Activities: {activitiesFor.title}
            </h2>
            <button
              type="button"
              onClick={() => setActivitiesFor(null)}
              className="rounded border border-slate-300 px-3 py-1 text-sm"
            >
              Close
            </button>
          </div>
          <ActivitiesPanel key={activitiesFor.id} link={{ dealId: activitiesFor.id }} />
        </section>
      )}
    </div>
  );
}
