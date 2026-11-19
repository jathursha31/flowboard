import { useEffect, useRef } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';

export interface DropTarget {
  column: string;
  beforeId: string | null;
}
interface TouchDragHandlers {
  onStart: (id: string) => void;
  onOver: (target: DropTarget) => void;
  onDrop: () => void;
  onCancel: () => void;
}
interface DragState {
  id: string;
  startX: number;
  startY: number;
  active: boolean;
  ghost: HTMLDivElement | null;
  timer?: ReturnType<typeof setTimeout>;
  x: number; // kadaisi viral idam (auto-scroll ku)
  y: number;
  raf?: number;
}

// 📱 Phone la drag & drop: card ah konjam neram (0.3 sec) amukki pidichu, viral ah nagarthi, vidunga
// (Browser oda drag & drop phone la vela seiyaadhu, adhanaala touch events la naame seiyurom)
// onStart(id) = drag aarambam, onOver({ column, beforeId }) = enga vizhum, onDrop() = vittaachu, onCancel()
const HOLD_MS = 250;
const EDGE = 70; // screen orathula indha alavukku vandhaa thaane scroll
const MAX_SPEED = 18; // px / frame
const MOVE_TOLERANCE = 10; // indha alavukku mela nagarndhaa scroll nu artham, drag illa

export function useTouchDrag({ onStart, onOver, onDrop, onCancel }: TouchDragHandlers) {
  const state = useRef<DragState | null>(null); // { id, startX, startY, timer, active, ghost }
  const handlers = useRef({ onStart, onOver, onDrop, onCancel });
  handlers.current = { onStart, onOver, onDrop, onCancel };
  const scrollLoop = useRef<FrameRequestCallback>(() => {}); // effect kulla irukkura autoScroll (drag start la thodanga)

  useEffect(() => {
    // 👇 Viral keezha endha column / card irukku? (move layum, auto-scroll apram um)
    const findTarget = (s: DragState) => {
      const under = document.elementFromPoint(s.x, s.y);
      const column = under?.closest<HTMLElement>('[data-column]');
      if (!column) return;
      const card = under!.closest<HTMLElement>('[data-task-id]');
      let beforeId = null;
      if (card && card.dataset.taskId !== s.id) {
        const rect = card.getBoundingClientRect();
        if (s.y < rect.top + rect.height / 2) beforeId = card.dataset.taskId;
        else {
          const cards = [...column.querySelectorAll<HTMLElement>('[data-task-id]')].filter((c) => c.dataset.taskId !== s.id);
          beforeId = cards[cards.indexOf(card) + 1]?.dataset.taskId ?? null;
        }
      }
      handlers.current.onOver({ column: column.dataset.column ?? '', beforeId: beforeId ?? null });
    };

    // 📜 Screen mel / keezh orathula viral irundhaa page ah mella scroll pannu (keezha irukkura column ku poga)
    const speed = (pos: number, size: number) => (pos < EDGE ? -1 : pos > size - EDGE ? 1 : 0) * MAX_SPEED * Math.min(1, (EDGE - Math.min(pos, size - pos)) / EDGE);
    const autoScroll = () => {
      const s = state.current;
      if (!s?.active) return;
      const dy = speed(s.y, window.innerHeight);
      const board = document.querySelector<HTMLElement>('.board');
      const dx = board && board.scrollWidth > board.clientWidth ? speed(s.x, window.innerWidth) : 0;
      if (dy) window.scrollBy(0, dy);
      if (dx) board!.scrollLeft += dx;
      if (dx || dy) findTarget(s);
      s.raf = requestAnimationFrame(autoScroll);
    };

    scrollLoop.current = autoScroll;

    const cleanup = () => {
      const s = state.current;
      if (!s) return;
      clearTimeout(s.timer);
      if (s.raf) cancelAnimationFrame(s.raf);
      s.ghost?.remove();
      state.current = null;
    };

    const onMove = (e: TouchEvent) => {
      const s = state.current;
      if (!s) return;
      const touch = e.touches[0];
      if (!s.active) {
        // Hold aagura munnaadiye nagarndhaa = scroll pannuraanga, drag cancel
        if (Math.hypot(touch.clientX - s.startX, touch.clientY - s.startY) > MOVE_TOLERANCE) cleanup();
        return;
      }
      e.preventDefault(); // 🚫 drag pannumbodhu page scroll aagakoodaadhu (auto-scroll thaan)
      s.x = touch.clientX;
      s.y = touch.clientY;
      if (s.ghost) s.ghost.style.transform = `translate3d(${s.x - 40}px, ${s.y - 20}px, 0) rotate(2deg)`;
      findTarget(s);
    };

    const onEnd = (e: TouchEvent) => {
      const s = state.current;
      if (!s) return;
      if (s.active) {
        e.preventDefault(); // drag apram "click" (popup open) aagakoodaadhu
        handlers.current.onDrop();
      }
      cleanup();
    };

    const onCancelTouch = () => {
      if (state.current?.active) handlers.current.onCancel();
      cleanup();
    };

    // passive: false = preventDefault panna mudiyanum (scroll niruththa)
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: false });
    document.addEventListener('touchcancel', onCancelTouch);
    return () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancelTouch);
      cleanup();
    };
  }, []);

  // Card la podanum: <li onTouchStart={startTouch(task.id, task.title)}>
  return (id: string, label: string) => (e: ReactTouchEvent) => {
    if (e.touches.length !== 1 || (e.target as Element).closest('button:not(.task__title), input, select')) return;
    const touch = e.touches[0];
    const s: DragState = { id, startX: touch.clientX, startY: touch.clientY, x: touch.clientX, y: touch.clientY, active: false, ghost: null };
    s.timer = setTimeout(() => {
      s.active = true;
      navigator.vibrate?.(15); // 📳 chinna "dhak" (support irundhaa)
      const ghost = document.createElement('div');
      s.ghost = ghost;
      ghost.className = 'touch-ghost';
      ghost.textContent = label;
      ghost.style.transform = `translate3d(${s.startX - 40}px, ${s.startY - 20}px, 0) rotate(2deg)`;
      document.body.appendChild(ghost);
      handlers.current.onStart(id);
      s.raf = requestAnimationFrame(scrollLoop.current);
    }, HOLD_MS);
    state.current = s;
  };
}
