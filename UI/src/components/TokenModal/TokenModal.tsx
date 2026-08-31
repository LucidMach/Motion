import { useEffect, useRef, useState } from 'react';
import TokenModalHeader from './TokenModalHeader';
import TokenModalForm from './TokenModalForm';
import type { StatusEventDetail } from '../../types/events';

const TOKEN_STORAGE_KEY = 'motion_mapbox_token';

export default function TokenModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [token, setToken] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const openModal = () => {
      setToken(localStorage.getItem(TOKEN_STORAGE_KEY) || '');
      setIsOpen(true);
    };

    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<StatusEventDetail>).detail;
      if (detail?.state === 'needs_token') openModal();
    };

    window.addEventListener('motion:cmd:open-token-modal', openModal);
    window.addEventListener('motion:status', onStatus);
    return () => {
      window.removeEventListener('motion:cmd:open-token-modal', openModal);
      window.removeEventListener('motion:status', onStatus);
    };
  }, []);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSave = () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    window.dispatchEvent(new CustomEvent('motion:cmd:update-token', { detail: { token: trimmed } }));
    setIsOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-hidden={!isOpen}
      onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(3,7,18,0.75)] backdrop-blur-[8px] transition-all duration-250 ${
        isOpen ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'
      }`}
    >
      <div className="flex w-[90%] max-w-[480px] animate-modal-in flex-col gap-5 rounded-lg border border-glow bg-surface-elevated p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_30px_rgba(56,189,248,0.15)]">
        <TokenModalHeader onClose={() => setIsOpen(false)} />
        <TokenModalForm
          token={token}
          onTokenChange={setToken}
          onSave={handleSave}
          onCancel={() => setIsOpen(false)}
          inputRef={inputRef}
        />
      </div>
    </div>
  );
}
