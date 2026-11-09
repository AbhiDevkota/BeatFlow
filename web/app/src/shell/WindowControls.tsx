import { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { isDesktopApp } from '@/lib/platform';

/**
 * Discord-style frameless window controls (Minimize, Maximize/Restore, Close).
 * Sits in the top-right corner of the desktop application and follows the app's theme.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktopApp() || typeof window === 'undefined') return;

    const checkMaximized = async () => {
      try {
        const w = window as any;
        const isMax = await (w.__BEATFLOW_WINDOW__?.isMaximized?.() ??
          w.__TAURI_INTERNALS__?.invoke?.('window_is_maximized') ??
          w.__TAURI__?.core?.invoke?.('window_is_maximized'));
        if (typeof isMax === 'boolean') setMaximized(isMax);
      } catch {
        // Ignored
      }
    };

    checkMaximized();
    window.addEventListener('resize', checkMaximized);
    return () => window.removeEventListener('resize', checkMaximized);
  }, []);

  if (!isDesktopApp()) return null;

  const handleMinimize = () => {
    const w = window as any;
    w.__BEATFLOW_WINDOW__?.minimize?.() ??
      w.__TAURI_INTERNALS__?.invoke?.('window_minimize') ??
      w.__TAURI__?.core?.invoke?.('window_minimize');
  };

  const handleToggleMaximize = async () => {
    const w = window as any;
    const res = await (w.__BEATFLOW_WINDOW__?.toggleMaximize?.() ??
      w.__TAURI_INTERNALS__?.invoke?.('window_toggle_maximize') ??
      w.__TAURI__?.core?.invoke?.('window_toggle_maximize'));
    if (typeof res === 'boolean') setMaximized(res);
  };

  const handleClose = () => {
    const w = window as any;
    w.__BEATFLOW_WINDOW__?.close?.() ??
      w.__TAURI_INTERNALS__?.invoke?.('window_close') ??
      w.__TAURI__?.core?.invoke?.('window_close');
  };

  return (
    <>
      {/* Top drag strip: allows dragging and double-click to maximize across the window top, leaving the buttons clear */}
      <div
        className="fixed top-0 inset-x-0 z-[calc(var(--z-modal)-1)] h-8 pr-[132px]"
        data-tauri-drag-region=""
        onDoubleClick={handleToggleMaximize}
      />

      {/* The 3 Discord-style window buttons sitting in the top right */}
      <div
        className="fixed top-0 right-0 z-(--z-modal) flex h-8 items-center select-none"
        aria-label="Window controls"
      >
        <button
          type="button"
          className="grid h-8 w-11 place-items-center text-secondary transition-colors duration-150 hover:bg-quinary hover:text-primary active:bg-quaternary"
          onClick={handleMinimize}
          aria-label="Minimize"
          title="Minimize"
          tabIndex={-1}
        >
          <Minus size={14} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          className="grid h-8 w-11 place-items-center text-secondary transition-colors duration-150 hover:bg-quinary hover:text-primary active:bg-quaternary"
          onClick={handleToggleMaximize}
          aria-label={maximized ? 'Restore' : 'Maximize'}
          title={maximized ? 'Restore' : 'Maximize'}
          tabIndex={-1}
        >
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="3.5" y="1.5" width="7" height="7" rx="0.5" />
              <path d="M1.5 3.5v7h7" />
            </svg>
          ) : (
            <Square size={11} strokeWidth={1.5} />
          )}
        </button>

        <button
          type="button"
          className="grid h-8 w-11 place-items-center text-secondary transition-colors duration-150 hover:bg-[#e81123] hover:text-white active:bg-[#c40f1f] active:text-white"
          onClick={handleClose}
          aria-label="Close"
          title="Close"
          tabIndex={-1}
        >
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>
    </>
  );
}
