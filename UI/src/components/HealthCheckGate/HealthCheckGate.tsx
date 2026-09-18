import { useState, useEffect, useRef } from 'react';
import { motionApi, type SystemStatus } from '../../services/api';

interface HealthCheckGateProps {
  apiBaseUrl?: string;
  onReady?: () => void;
}

type GateState = 'checking' | 'waking' | 'verifying_db' | 'ready' | 'offline_prompt';

export default function HealthCheckGate({ apiBaseUrl, onReady }: HealthCheckGateProps) {
  const [gateState, setGateState] = useState<GateState>('checking');
  const [statusMessage, setStatusMessage] = useState('Connecting to Motion Transit API...');
  const [systemTelemetry, setSystemTelemetry] = useState<SystemStatus | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    // Check session cache for fast reload
    const cachedHealthy = sessionStorage.getItem('motion_api_ready');
    const targetUrl = apiBaseUrl || import.meta.env.PUBLIC_API_URL || 'https://motionapi.onrender.com';
    setResolvedUrl(targetUrl);

    // Start elapsed timer
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(sec);

      // If backend takes longer than 2.5s, it is waking up from Render cold sleep
      if (sec >= 3 && gateState === 'checking') {
        setGateState('waking');
        setStatusMessage('Waking up backend on Render (free-tier cold start, ~20-30s)...');
      }

      // Show manual skip button after 4s so user is never stuck
      if (sec >= 4) {
        setShowSkipButton(true);
      }
    }, 1000);

    let isMounted = true;

    const performHealthCheck = async (attempt = 1) => {
      try {
        const health = await motionApi.getHealth();
        if (health && health.status === 'ok') {
          if (!isMounted) return;
          
          setGateState('verifying_db');
          setStatusMessage('Synchronizing timetable database & spatial graph...');

          // Fetch full system telemetry if available
          try {
            const status = await motionApi.getStatus();
            if (isMounted && status) {
              setSystemTelemetry(status);
            }
          } catch (e) {
            // Non-blocking telemetry fetch
          }

          if (!isMounted) return;
          setGateState('ready');
          setStatusMessage('Connected to Motion Transit Engine');
          sessionStorage.setItem('motion_api_ready', 'true');

          // Smooth exit transition
          setTimeout(() => {
            if (isMounted) {
              setIsDismissed(true);
              if (onReady) onReady();
            }
          }, cachedHealthy ? 300 : 900);
          return;
        }
      } catch (err) {
        if (!isMounted) return;
        // Render cold start or network latency: retry every 2.5s
        pollRef.current = setTimeout(() => {
          if (isMounted) performHealthCheck(attempt + 1);
        }, 2500);
      }
    };

    performHealthCheck();

    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const handleSkipOrProceed = () => {
    setIsDismissed(true);
    if (onReady) onReady();
  };

  if (isDismissed) {
    return null;
  }

  return (
    <div
      id="motion-startup-gate"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-deep/95 p-6 backdrop-blur-2xl transition-all duration-700 ease-out ${
        gateState === 'ready' ? 'opacity-90 scale-[1.01]' : 'opacity-100 scale-100'
      }`}
      style={{
        background: 'radial-gradient(circle at 50% 40%, rgba(14, 23, 42, 0.95) 0%, #030712 100%)',
      }}
    >
      {/* Subtle Ambient Radial Glows */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />

      {/* Main Glassmorphic Gateway Container */}
      <div className="relative z-10 flex w-full max-w-md flex-col items-center rounded-3xl border border-white/10 bg-surface/80 p-8 shadow-2xl backdrop-blur-xl text-center">
        
        {/* Animated Brand Pulse Radar */}
        <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-md animate-ping" style={{ animationDuration: '3s' }} />
          <div className="absolute inset-2 rounded-full border border-cyan-400/40 bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 backdrop-blur-md" />
          
          {/* Central Logo Icon */}
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 text-white shadow-glow-cyan">
            {gateState === 'ready' ? (
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-6 w-6 animate-pulse text-white" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 19 21 12 17 5 21 12 2" />
              </svg>
            )}
          </div>
        </div>

        {/* Title & Badge */}
        <div className="mb-1 flex items-center gap-2">
          <span className="font-display text-2xl font-bold tracking-wider text-white">MOTION</span>
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-400">
            {gateState === 'ready' ? 'READY' : gateState === 'waking' ? 'WAKING UP' : 'INITIALIZING'}
          </span>
        </div>
        <p className="font-sans text-xs text-slate-400 mb-6">
          Victorian Multi-Modal Transit Routing Engine
        </p>

        {/* Dynamic Status Display */}
        <div className="w-full rounded-2xl border border-white/5 bg-black/30 p-4 backdrop-blur-md text-left mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[11px] font-medium text-slate-400">STATUS CHECK</span>
            {gateState !== 'ready' && (
              <span className="font-mono text-[11px] text-cyan-400 font-semibold animate-pulse">
                {elapsedSeconds > 0 ? `+${elapsedSeconds}s` : 'Checking...'}
              </span>
            )}
            {gateState === 'ready' && (
              <span className="font-mono text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                ONLINE
              </span>
            )}
          </div>

          <p className="font-sans text-sm font-medium text-slate-200 flex items-center gap-2">
            {gateState === 'ready' ? (
              <span className="text-emerald-400 font-bold">✓</span>
            ) : (
              <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            )}
            {statusMessage}
          </p>

          {/* Connected Telemetry Highlights */}
          {systemTelemetry && systemTelemetry.stops_count > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3 font-mono text-[10px] text-slate-300">
              <div>Stops: <span className="text-cyan-300 font-semibold">{systemTelemetry.stops_count.toLocaleString()}</span></div>
              <div>Routes: <span className="text-cyan-300 font-semibold">{systemTelemetry.routes_count.toLocaleString()}</span></div>
              <div>Edges: <span className="text-cyan-300 font-semibold">{(systemTelemetry.transit_edges_count + systemTelemetry.transfer_edges_count).toLocaleString()}</span></div>
              <div>Live PTV: <span className={systemTelemetry.ptv_api_configured ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>{systemTelemetry.ptv_api_configured ? 'ACTIVE' : 'SIMULATED'}</span></div>
            </div>
          )}

          {/* Target Host Information */}
          <div className="mt-2 truncate font-mono text-[10px] text-slate-500">
            Target: <span className="text-slate-400">{resolvedUrl}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10 mb-5">
          <div
            className={`absolute bottom-0 top-0 transition-all duration-500 rounded-full ${
              gateState === 'ready'
                ? 'w-full bg-emerald-400 shadow-glow-cyan'
                : gateState === 'waking'
                ? 'w-3/4 bg-gradient-to-r from-cyan-400 to-indigo-500 animate-pulse'
                : 'w-1/3 bg-cyan-400 animate-pulse'
            }`}
          />
        </div>

        {/* Helper Note for Render Free Tier */}
        {gateState === 'waking' && (
          <p className="font-sans text-[11px] leading-relaxed text-slate-400 mb-4 animate-fade-in">
            Render free servers spin down after 15 minutes of inactivity. First boot takes ~20–30s to load the GTFS graph.
          </p>
        )}

        {/* Skip / Offline Button */}
        {showSkipButton && gateState !== 'ready' && (
          <button
            type="button"
            onClick={handleSkipOrProceed}
            className="group flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 font-sans text-xs font-medium text-slate-300 transition-all hover:border-cyan-400/50 hover:bg-white/10 hover:text-white"
          >
            <span>Continue to 3D Map</span>
            <span className="font-mono text-cyan-400 transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        )}
      </div>
    </div>
  );
}
