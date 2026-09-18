import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import HealthCheckGate from './HealthCheckGate';
import { motionApi } from '../../services/api';

vi.mock('../../services/api', () => ({
  motionApi: {
    baseUrl: 'https://motionapi.onrender.com',
    getHealth: vi.fn(),
    getStatus: vi.fn(),
  },
}));

const mockedGetHealth = vi.mocked(motionApi.getHealth);
const mockedGetStatus = vi.mocked(motionApi.getStatus);

const READY_TELEMETRY = {
  status: 'ready',
  server_online: true,
  uptime_seconds: 12,
  kdtree_in_memory: true,
  kdtree_nodes_count: 23477,
  db_path: 'gtfs_schedule.db',
  db_exists: true,
  db_loaded: true,
  stops_count: 23477,
  routes_count: 605,
  transit_edges_count: 42899,
  transfer_edges_count: 20000,
  ptv_api_configured: true,
  checks: {},
} as const;

describe('HealthCheckGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    mockedGetHealth.mockReset();
    mockedGetStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in the connecting state while the first health check is in flight', async () => {
    mockedGetHealth.mockReturnValue(new Promise(() => {})); // never resolves
    render(<HealthCheckGate />);

    expect(screen.getByText(/connecting to transit backend cluster/i)).toBeInTheDocument();
    expect(screen.getByText('INITIALIZING')).toBeInTheDocument();
  });

  it('moves to the waking state after the elapsed-time threshold when the backend has not responded', async () => {
    mockedGetHealth.mockReturnValue(new Promise(() => {})); // never resolves
    render(<HealthCheckGate />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(screen.getByText(/WAKING/)).toBeInTheDocument();
    expect(screen.getByText(/waking render service/i)).toBeInTheDocument();
  });

  it('reaches ready and calls onReady once health and status both resolve successfully', async () => {
    mockedGetHealth.mockResolvedValue({
      status: 'ok',
      service: 'Motion Transit Engine API',
      uptime_seconds: 12,
      cold_starting: false,
      kdtree_in_memory: true,
      db_loaded: true,
    });
    mockedGetStatus.mockResolvedValue(READY_TELEMETRY as any);

    const onReady = vi.fn();
    render(<HealthCheckGate onReady={onReady} />);

    // Let the getHealth -> getStatus -> setGateState('ready') promise chain
    // settle before the 850ms dismiss delay fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('ONLINE')).toBeInTheDocument();
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('does not regress to the waking copy once past synchronizing (stale-closure regression)', async () => {
    // getHealth resolves so the gate advances to 'synchronizing', but
    // getStatus is left pending forever so the gate settles there (no
    // dismiss timer ever gets scheduled) - this gives unlimited time to
    // advance the elapsed-time interval well past the 3s "waking" threshold
    // and confirm it doesn't revert the copy, without racing the auto-
    // dismiss timeout.
    mockedGetHealth.mockResolvedValue({
      status: 'ok',
      service: 'Motion Transit Engine API',
      uptime_seconds: 12,
      cold_starting: false,
      kdtree_in_memory: true,
      db_loaded: true,
    });
    mockedGetStatus.mockReturnValue(new Promise(() => {}));

    render(<HealthCheckGate />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/synchronizing timetable graphs/i)).toBeInTheDocument();

    // Advance well past the 3s threshold that used to keep re-firing
    // setGateState('waking') forever due to a stale closure over gateState
    // captured at mount time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByText(/synchronizing timetable graphs/i)).toBeInTheDocument();
    expect(screen.queryByText(/waking render service/i)).not.toBeInTheDocument();
    expect(screen.getByText('SYNCING')).toBeInTheDocument();
  });

  it('shows the skip-waiting bypass button after the threshold and lets the user proceed', async () => {
    mockedGetHealth.mockReturnValue(new Promise(() => {})); // backend never responds
    const onReady = vi.fn();
    render(<HealthCheckGate onReady={onReady} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });

    const bypassButton = screen.getByRole('button', { name: /skip waiting/i });
    expect(bypassButton).toBeInTheDocument();

    act(() => {
      bypassButton.click();
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
