import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Apple / iOS style floating overlay scrollbar:
 * - Hidden by default.
 * - Appears as a sleek rounded pill when scrolling or when the mouse moves near the right edge.
 * - Smoothly fades out when inactive.
 * - Supports dragging the pill and clicking the track to scroll.
 */
export function OverlayScrollbar() {
  const [thumb, setThumb] = useState<{ top: number; height: number; visible: boolean }>({
    top: 0,
    height: 0,
    visible: false,
  });
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startY: number; startScrollTop: number; ratio: number } | null>(null);

  const showBriefly = useCallback(() => {
    setThumb((prev) => ({ ...prev, visible: true }));
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setThumb((prev) => ({ ...prev, visible: false }));
    }, 800);
  }, []);

  const updateThumb = useCallback(() => {
    const el = document.getElementById('scrollable-page');
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 4) {
      setThumb({ top: 0, height: 0, visible: false });
      return;
    }

    // Leave a small inset at top and bottom for window controls and player
    const topInset = 36;
    const bottomInset = 20;
    const availableTrack = Math.max(80, clientHeight - topInset - bottomInset);
    // Compact pill height like Apple / iOS indicator
    const minHeight = 32;
    const maxHeight = 52;
    const pageRatio = scrollHeight > clientHeight ? clientHeight / scrollHeight : 1;
    const computedHeight = Math.max(minHeight, Math.min(maxHeight, Math.round(pageRatio * 64)));
    const maxScroll = scrollHeight - clientHeight;
    const maxThumbTop = availableTrack - computedHeight;
    const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    const computedTop = topInset + scrollRatio * maxThumbTop;

    setThumb((prev) => ({
      top: computedTop,
      height: computedHeight,
      visible: prev.visible,
    }));
  }, []);

  useEffect(() => {
    const el = document.getElementById('scrollable-page');
    if (!el) return;

    const onScroll = () => {
      updateThumb();
      showBriefly();
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateThumb);

    // Initial measure
    updateThumb();
    const observer = new ResizeObserver(updateThumb);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateThumb);
      observer.disconnect();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [updateThumb, showBriefly]);

  // Detect mouse movement near the right edge of the window
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const nearEdge = window.innerWidth - e.clientX <= 28;
      setIsHovered(nearEdge);
      if (nearEdge) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setThumb((prev) => ({ ...prev, visible: true }));
      } else if (!isDragging) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
          setThumb((prev) => ({ ...prev, visible: false }));
        }, 800);
      }
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [isDragging]);

  const onThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = document.getElementById('scrollable-page');
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const topInset = 36;
    const bottomInset = 20;
    const availableTrack = Math.max(80, clientHeight - topInset - bottomInset);
    const maxThumbTop = availableTrack - thumb.height;
    const maxScroll = scrollHeight - clientHeight;
    const ratio = maxThumbTop > 0 ? maxScroll / maxThumbTop : 1;

    dragRef.current = {
      startY: e.clientY,
      startScrollTop: scrollTop,
      ratio,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onThumbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragRef.current) return;
    const el = document.getElementById('scrollable-page');
    if (!el) return;

    const deltaY = e.clientY - dragRef.current.startY;
    el.scrollTop = dragRef.current.startScrollTop + deltaY * dragRef.current.ratio;
  };

  const onThumbPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setThumb((prev) => ({ ...prev, visible: false }));
    }, 800);
  };

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = document.getElementById('scrollable-page');
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const topInset = 36;
    const bottomInset = 20;
    const availableTrack = Math.max(80, el.clientHeight - topInset - bottomInset);
    const ratio = Math.max(0, Math.min(1, (clickY - topInset) / availableTrack));
    el.scrollTo({
      top: ratio * (el.scrollHeight - el.clientHeight),
      behavior: 'smooth',
    });
  };

  if (thumb.height <= 0) return null;

  const isVisible = thumb.visible || isHovered || isDragging;

  return (
    <div
      className={`fixed inset-y-0 right-0 z-(--z-modal) w-4 pointer-events-auto select-none transition-opacity duration-300 ease-out ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onTrackClick}
      aria-hidden="true"
    >
      <div
        className={`absolute right-1 cursor-pointer rounded-[999px] transition-[width,background-color] duration-120 ease-in ${
          isHovered || isDragging
            ? 'w-2 bg-[color-mix(in_srgb,var(--systemPrimary)_80%,transparent)] shadow-[0_1px_4px_rgba(0,0,0,0.3)]'
            : 'w-1 bg-[color-mix(in_srgb,var(--systemPrimary)_45%,transparent)]'
        }`}
        style={{
          height: `${thumb.height}px`,
          transform: `translateY(${thumb.top}px)`,
        }}
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={onThumbPointerUp}
        onPointerCancel={onThumbPointerUp}
      />
    </div>
  );
}
