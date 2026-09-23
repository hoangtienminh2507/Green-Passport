'use client';

import { useState, useEffect, useRef } from 'react';
import Avatar from './Avatar';

function Chevron({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
         className={`transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Gear() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Thanh nav trắng, nổi trên nền, kiểu hiện đại — avatar hiển thị kèm tên như site tham khảo.
export default function AppHeader({ user, onOpenProfile, onLogout }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-30 bg-white/90 backdrop-blur transition-shadow ${scrolled ? 'shadow-navbar' : ''}`}
      style={{ paddingTop: 'env(safe-area-inset-top,0px)' }}
    >
      <div className="mx-auto flex h-[62px] w-full max-w-[1180px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-[19px]" aria-hidden="true">🌱</span>
          <span className="text-[16px] font-extrabold tracking-tight text-header">Green Passport</span>
        </div>

        {user && (
          <div className="flex items-center gap-2">
            <div className="relative" ref={wrapRef}>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Menu tài khoản"
                className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 text-ink-700 shadow-sm transition-colors hover:border-brand/40 hover:bg-brand-soft/60"
              >
                <Avatar size={30} />
                <span className="hidden max-w-[140px] truncate text-[13px] font-bold sm:inline">{user.name}</span>
                <Chevron open={open} />
              </button>

              {open && (
                <div role="menu" className="absolute right-0 top-[calc(100%+10px)] w-60 animate-rise rounded-2xl border border-line bg-white p-1.5 text-ink shadow-pop">
                  <div className="px-3 py-2.5">
                    <div className="truncate text-[13.5px] font-bold">{user.name}</div>
                    <div className="mt-0.5 text-xs text-ink-600">{user.role}</div>
                  </div>
                  <div className="mx-2 border-t border-line" />
                  <button role="menuitem" type="button"
                    onClick={() => { setOpen(false); onOpenProfile(); }}
                    className="mt-1.5 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold hover:bg-canvas">
                    <span aria-hidden="true">🎖️</span> Hồ sơ của tôi
                  </button>
                  <button role="menuitem" type="button"
                    onClick={() => { setOpen(false); onLogout(); }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-red-600 hover:bg-red-50">
                    <span aria-hidden="true">⏻</span> Đăng xuất
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenProfile}
              aria-label="Cài đặt tài khoản"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink-600 transition-colors hover:border-brand/40 hover:bg-brand-soft/60"
            >
              <Gear />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
