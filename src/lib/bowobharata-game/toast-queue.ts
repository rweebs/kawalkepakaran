// The toasts' pacing (Task 34): one frame can close a step with two toasts (a record and its checkpoint, Antar's letter
// and its checkpoint), and a phone shows only the newest where two do not fit. So the island pushes a toast at least
// TOAST_GAP_MS after the one before, and the rest wait here, in order. Every toast is then the newest for at least that
// long, and the live region reads each once, when it is pushed. Pure: the island holds the queue and runs its clock.
import type { GameEvent } from './mission-run';

/** The least time between two pushes, in ms. */
export const TOAST_GAP_MS = 1500;
/** The waiting toasts the queue keeps before a wall or held toast gives way (a burst of five all wait their turn). The
 * lakon's own toasts never give way. */
export const TOAST_QUEUE_MAX = 5;

export interface Toast { type: GameEvent['type']; text: string }
/** The toasts waiting, oldest first, and when the last one was pushed (ms; null before the first). */
export interface ToastQueue { waiting: readonly Toast[]; last: number | null }

export const EMPTY_TOASTS: ToastQueue = { waiting: [], last: null };

/** The toasts that may give way: the edge's and the ranks', which come again while the chariot leans on them. */
const DROPPABLE: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>(['wall', 'held']);

/**
 * A frame's toasts join the queue in order. Past TOAST_QUEUE_MAX the oldest waiting wall or held toast gives way, one at
 * a time, while there is one; a record, filed, rewrite, letter, gate, lap or checkpoint toast is never dropped.
 */
export function queueToasts(q: ToastQueue, toasts: readonly Toast[]): ToastQueue {
  const waiting = [...q.waiting, ...toasts];
  while (waiting.length > TOAST_QUEUE_MAX) {
    const i = waiting.findIndex((t) => DROPPABLE.has(t.type));
    if (i < 0) break;
    waiting.splice(i, 1);
  }
  return { waiting, last: q.last };
}

/**
 * The toast to push at `now` (ms), if one waits and the gap since the last push has run, with the queue after it; and
 * how long to wait before asking again (null when nothing waits).
 */
export function takeToast(q: ToastQueue, now: number): { toast: Toast | null; queue: ToastQueue; wait: number | null } {
  if (q.waiting.length === 0) return { toast: null, queue: q, wait: null };
  if (q.last !== null && now < q.last + TOAST_GAP_MS) return { toast: null, queue: q, wait: q.last + TOAST_GAP_MS - now };
  const [toast, ...rest] = q.waiting;
  return { toast, queue: { waiting: rest, last: now }, wait: rest.length > 0 ? TOAST_GAP_MS : null };
}
