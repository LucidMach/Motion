import { useState, useEffect, useRef } from 'react';
import { motionApi, type SystemStatus } from '../../services/api';

interface HealthCheckGateProps {
  apiBaseUrl?: string;
  onReady?: () => void;
}

type GateState = 'connecting' | 'waking' | 'synchronizing' | 'ready' | 'offline_available';

export default function HealthCheckGate({ apiBaseUrl, onReady }: HealthCheckGateProps) {
  const [gateState, setGateState] = useState<GateState>('connecting');
  const [statusText, setStatusText] = useState('Connecting to transit backend cluster...');
  const [systemTelemetry, setSystemTelemetry] = useState<SystemStatus | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showBypass, setShowBypass] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const cachedReady = sessionStorage.getItem('motion_api_ready');
    const targetUrl = apiBaseUrl || import.meta.env.PUBLIC_API_URL || 'https://motionapi.onrender.com';
    setResolvedUrl(targetUrl);

    // Elapsed timer to detect Render free-tier cold sleep
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(sec);

      if (sec >= 3 && gateState === 'connecting') {
        setGateState('waking');
        setStatusText('Waking Render service (free tier cold start, ~20-30s)...');
      }

      if (sec >= 4) {
        setShowBypass(true);
      }
    }, 1000);

    let isMounted = true;

    const checkBackendHealth = async () => {
      try {
        const health = await motionApi.getHealth();
        if (health && health.status === 'ok') {
          if (!isMounted) return;

          setGateState('synchronizing');
          setStatusText('Synchronizing timetable graphs and live alerts...');

          try {
            const telemetry = await motionApi.getStatus();
            if (isMounted && telemetry) {
              setSystemTelemetry(telemetry);
            }
          } catch {
            // Non-blocking telemetry fetch
          }

          if (!isMounted) return;
          setGateState('ready');
          setStatusText('Motion Transit Engine Online');
          sessionStorage.setItem('motion_api_ready', 'true');

          setTimeout(() => {
            if (isMounted) {
              setIsDismissed(true);
              if (onReady) onReady();
            }
          }, cachedReady ? 350 : 850);
          return;
        }
      } catch {
        if (!isMounted) return;
        pollRef.current = setTimeout(checkBackendHealth, 2500);
      }
    };

    checkBackendHealth();

    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    if (onReady) onReady();
  };

  if (isDismissed) {
    return null;
  }

  const getStatusBadge = () => {
    switch (gateState) {
      case 'ready':
        return {
          label: 'ONLINE',
          className: 'border-accent-emerald/40 bg-accent-emerald/10 text-accent-emerald',
          dot: 'bg-accent-emerald animate-ping',
        };
      case 'waking':
        return {
          label: `WAKING +${elapsedSeconds}s`,
          className: 'border-accent-amber/40 bg-accent-amber/10 text-accent-amber',
          dot: 'bg-accent-amber animate-pulse',
        };
      case 'synchronizing':
        return {
          label: 'SYNCING',
          className: 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan',
          dot: 'bg-accent-cyan animate-pulse',
        };
      default:
        return {
          label: 'INITIALIZING',
          className: 'border-subtle bg-surface text-secondary',
          dot: 'bg-accent-cyan animate-ping',
        };
    }
  };

  const badge = getStatusBadge();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Motion Backend Health Check"
      className="fixed inset-0 z-100 flex items-center justify-center bg-[rgba(3,7,18,0.78)] backdrop-blur-sm transition-all duration-300"
    >
      <div className="flex w-[90%] max-w-125 animate-modal-in flex-col gap-6 rounded-4xl border border-glow bg-surface-elevated p-8 shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_30px_rgba(56,189,248,0.15)] max-[768px]:rounded-2xl max-[768px]:p-6">
        
        {/* Header matching TokenModal and SettingsModal */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent-cyan/40 bg-linear-to-br from-accent-cyan/20 to-accent-indigo/20 text-accent-cyan shadow-[0_0_12px_var(--color-glow)]"
            >
              {gateState === 'ready' ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 animate-float-slight"
                  style={{ filter: 'drop-shadow(0 0 6px var(--color-accent-cyan))' }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 19 21 12 17 5 21 12 2" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="font-display text-[1.15rem] font-bold text-primary">Transit Engine System</h2>
              <p className="text-[0.78rem] text-secondary">Multi-modal Victorian routing & live disruption node</p>
            </div>
          </div>

          <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[0.72rem] font-bold tracking-wider ${badge.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
            <span>{badge.label}</span>
          </div>
        </div>

        {/* Content Box matching Motion's form & telemetry card styling */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-subtle bg-[rgba(5,7,13,0.8)] p-4">
            
            {/* Status text row */}
            <div className="flex items-center justify-between text-[0.82rem]">
              <span className="font-sans font-medium text-primary flex items-center gap-2">
                {gateState === 'ready' ? (
                  <span className="text-accent-emerald font-bold">✓</span>
                ) : (
                  <span className="inline-block h-2 w-2 rounded-full bg-accent-cyan animate-ping" />
                )}
                {statusText}
              </span>
              <span className="font-mono text-[0.72rem] text-muted">
                {elapsedSeconds > 0 ? `+${elapsedSeconds}s` : 'active'}
              </span>
            </div>

            {/* Glowing progress bar matching Motion theme */}
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface border border-subtle">
              <div
                className={`absolute bottom-0 top-0 transition-all duration-500 rounded-full ${
                  gateState === 'ready'
                    ? 'w-full bg-accent-emerald shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                    : gateState === 'waking'
                    ? 'w-3/4 bg-linear-to-r from-accent-cyan via-accent-indigo to-accent-amber animate-pulse'
                    : 'w-1/3 bg-linear-to-r from-accent-cyan to-accent-indigo animate-pulse'
                }`}
              />
            </div>

            {/* Telemetry metadata rows */}
            {systemTelemetry && systemTelemetry.stops_count > 0 ? (
              <div className="mt-1 grid grid-cols-2 gap-2 border-t border-subtle pt-2.5 font-mono text-[0.74rem]">
                <div className="flex justify-between text-secondary">
                  <span>Stops:</span>
                  <span className="font-semibold text-primary">{systemTelemetry.stops_count.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Routes:</span>
                  <span className="font-semibold text-primary">{systemTelemetry.routes_count.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Edges:</span>
                  <span className="font-semibold text-accent-cyan">{(systemTelemetry.transit_edges_count + systemTelemetry.transfer_edges_count).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Live GTFS-R:</span>
                  <span className={systemTelemetry.ptv_api_configured ? 'font-semibold text-accent-emerald' : 'text-muted'}>
                    {systemTelemetry.ptv_api_configured ? 'CONNECTED' : 'STANDALONE'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[0.74rem] text-muted">
                <span>API Endpoint</span>
                <code className="font-mono text-secondary text-[0.72rem]">{resolvedUrl}</code>
              </div>
            )}
          </div>

          {/* Render cold boot helper note */}
          {gateState === 'waking' && (
            <p className="text-[0.78rem] leading-relaxed text-secondary animate-fade-in">
              Render free instances hibernate after 15 minutes of inactivity. The container is booting and loading the GTFS graph into memory.
            </p>
          )}

          {/* Action Footer */}
          <div className="mt-2 flex items-center justify-between gap-3">
            {showBypass && gateState !== 'ready' ? (
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-full border border-subtle bg-surface px-5 py-2.5 font-sans text-[0.82rem] font-semibold text-secondary transition-all hover:border-glow hover:bg-surface-hover hover:text-primary active:scale-[0.98]"
              >
                Continue in Offline Mode
              </button>
            ) : (
              <div className="text-[0.72rem] text-muted font-mono">
                Motion Transit OS • Victoria
              </div>
            )}

            {gateState === 'ready' ? (
              <button
                type="button"
                onClick={handleDismiss}
                className="flex items-center gap-2 rounded-full border border-accent-cyan/50 bg-linear-to-br from-[#0284c7] to-[#4f46e5] px-6 py-2.5 font-sans text-[0.85rem] font-semibold text-white shadow-[0_0_16px_rgba(56,189,248,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_22px_rgba(56,189,248,0.5)] active:translate-y-0"
              >
                <span>Enter Map</span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
