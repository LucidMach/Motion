import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TransitDock from './TransitDock';
import { motionApi } from '../../services/api';

vi.mock('../../services/api', () => ({
  motionApi: {
    getRoutesByMode: vi.fn(),
    getRouteShape: vi.fn(),
    getRouteStops: vi.fn(),
    getLiveTrains: vi.fn(),
    getLiveVehicles: vi.fn()
  }
}));

const mockTrainRoutes = [
  {
    route_id: 'Lilydale',
    route_short_name: 'Lilydale',
    route_long_name: 'Flinders Street - Lilydale',
    color: '#152C6B',
    group: 'Burnley Group',
    mode: 'train'
  },
  {
    route_id: 'Pakenham',
    route_short_name: 'Pakenham',
    route_long_name: 'Flinders Street - Pakenham',
    color: '#0072CE',
    group: 'Caulfield Group',
    mode: 'train'
  }
];

const mockTramRoutes = [
  {
    route_id: '96',
    route_short_name: '96',
    route_long_name: 'East Brunswick - St Kilda Beach',
    color: '#78BE20',
    group: '',
    mode: 'tram'
  }
];

const mockStops = [
  {
    stop_id: '1',
    stop_name: 'Flinders Street',
    full_name: 'Flinders Street Station',
    stop_lat: -37.818,
    stop_lon: 144.967,
    stop_sequence: 1
  },
  {
    stop_id: '2',
    stop_name: 'Lilydale',
    full_name: 'Lilydale Station',
    stop_lat: -37.757,
    stop_lon: 145.345,
    stop_sequence: 2
  }
];

describe('TransitDock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(motionApi.getRoutesByMode).mockImplementation(async (mode) => {
      if (mode === 'train') return mockTrainRoutes;
      if (mode === 'tram') return mockTramRoutes;
      return [];
    });
    vi.mocked(motionApi.getRouteShape).mockResolvedValue({
      type: 'FeatureCollection',
      features: []
    });
    vi.mocked(motionApi.getRouteStops).mockResolvedValue(mockStops);
    const mockVehiclesFC = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [144.96, -37.81] },
          properties: { route_short_name: 'Lilydale', trip_id: 'T1', mode: 'train' }
        }
      ]
    };
    vi.mocked(motionApi.getLiveTrains).mockResolvedValue(mockVehiclesFC);
    vi.mocked(motionApi.getLiveVehicles).mockResolvedValue(mockVehiclesFC);
  });

  it('renders mode buttons for Train, Tram, and Bus in the floating dock', async () => {
    render(<TransitDock />);

    expect(await screen.findByRole('button', { name: /explore trains/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explore trams/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explore buses/i })).toBeInTheDocument();
  });

  it('opens Transit Explorer when a dock button is clicked and closes on second click', async () => {
    render(<TransitDock />);

    const trainBtn = await screen.findByRole('button', { name: /explore trains/i });
    fireEvent.click(trainBtn);

    const explorer = await screen.findByRole('dialog', { name: /transit explorer/i });
    expect(explorer).toHaveClass('translate-x-0');
    expect(await screen.findByText('Lilydale Line')).toBeInTheDocument();

    // Click again to toggle closed
    fireEvent.click(trainBtn);
    expect(explorer).toHaveClass('-translate-x-full');
  });

  it('filters routes when user types in the search input', async () => {
    render(<TransitDock />);

    fireEvent.click(screen.getByRole('button', { name: /explore trains/i }));

    const searchInput = await screen.findByPlaceholderText(/search train lines/i);
    fireEvent.change(searchInput, { target: { value: 'Lily' } });

    expect(screen.getByText('Lilydale Line')).toBeInTheDocument();
    expect(screen.queryByText('Pakenham Line')).not.toBeInTheDocument();
  });

  it('highlights route and expands inline dropdown within the route itself when clicked', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<TransitDock />);

    fireEvent.click(screen.getByRole('button', { name: /explore trains/i }));
    const routeCard = await screen.findByText('Lilydale Line');
    fireEvent.click(routeCard);

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'motion:cmd:highlight-route'
        })
      );
    });

    // Inline dropdown within route card should now be visible
    expect(await screen.findByRole('button', { name: /fit on map/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(screen.getAllByText('Flinders Street').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lilydale').length).toBeGreaterThan(0);

    // Ensure NO floating popup / modal exists
    expect(screen.queryByRole('region', { name: /hud/i })).not.toBeInTheDocument();
  });

  it('allows flying to a stop from the inline stops dropdown', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<TransitDock />);

    fireEvent.click(screen.getByRole('button', { name: /explore trains/i }));
    fireEvent.click(await screen.findByText('Lilydale Line'));

    // Wait for stations to load into inline dropdown
    const stopBtn = await screen.findByRole('button', { name: 'Flinders Street' });
    fireEvent.click(stopBtn);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'motion:cmd:fly-to',
        detail: expect.objectContaining({
          title: 'Flinders Street'
        })
      })
    );
  });

  it('dismisses route highlight when clear button is clicked in inline dropdown', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<TransitDock />);

    fireEvent.click(screen.getByRole('button', { name: /explore trains/i }));
    fireEvent.click(await screen.findByText('Lilydale Line'));

    const clearBtn = await screen.findByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtn);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'motion:cmd:clear-route-highlight'
      })
    );
    expect(screen.queryByRole('button', { name: /fit on map/i })).not.toBeInTheDocument();
  });

  it('closes Transit Explorer when the top-left back button is clicked', async () => {
    render(<TransitDock />);

    fireEvent.click(screen.getByRole('button', { name: /explore trains/i }));
    const explorer = await screen.findByRole('dialog', { name: /transit explorer/i });
    expect(explorer).toHaveClass('translate-x-0');

    // Click the top-left back button
    const backBtn = await screen.findByRole('button', { name: /back to map/i });
    fireEvent.click(backBtn);

    expect(explorer).toHaveClass('-translate-x-full');
  });

  it('switches transit mode from the sidebar rail', async () => {
    render(<TransitDock />);

    fireEvent.click(screen.getByRole('button', { name: /explore trains/i }));
    expect(await screen.findByText('Lilydale Line')).toBeInTheDocument();

    // Click Tram mode in sidebar rail
    const tramRailBtn = await screen.findByRole('button', { name: /switch to trams/i });
    fireEvent.click(tramRailBtn);

    // Should load and display Route 96 Tram
    const tramElements = await screen.findAllByText('96');
    expect(tramElements.length).toBeGreaterThan(0);
  });

  it('does not mount a blocking backdrop, and implements stepped dismissal on empty map click', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<TransitDock />);

    // Open explorer and select a route
    fireEvent.click(screen.getByRole('button', { name: /explore trains/i }));
    const routeCard = await screen.findByText('Lilydale Line');
    fireEvent.click(routeCard);

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'motion:cmd:highlight-route' })
      );
    });

    const explorer = screen.getByRole('dialog', { name: /transit explorer/i });
    expect(explorer).toHaveClass('translate-x-0');

    // Verify NO blocking backdrop overlay exists
    expect(screen.queryByTestId('transit-explorer-backdrop')).not.toBeInTheDocument();

    // Simulate clicking a live vehicle consist on the map
    fireEvent(
      window,
      new CustomEvent('motion:vehicle-selected', {
        detail: {
          tripId: 'TRIP-1234',
          routeShortName: 'Lilydale',
          color: '#152C6B',
          coords: [144.96, -37.81],
          mode: 'train'
        }
      })
    );

    // VehiclePanel should now be visible on the right
    const vehiclePanel = await screen.findByRole('dialog', { name: /vehicle inspector/i });
    expect(vehiclePanel).toHaveClass('translate-x-0');
    expect(screen.getByText('TRIP-1234')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /focus camera/i })).toBeInTheDocument();

    // 1st Empty-Map Click: dismisses the right-side VehiclePanel first
    fireEvent(window, new CustomEvent('motion:map-empty-click'));

    await waitFor(() => {
      expect(vehiclePanel).toHaveClass('translate-x-full');
    });
    // Left Explorer is still open!
    expect(explorer).toHaveClass('translate-x-0');

    // 2nd Empty-Map Click: dismisses the left Transit Explorer and clears route highlight
    fireEvent(window, new CustomEvent('motion:map-empty-click'));

    await waitFor(() => {
      expect(explorer).toHaveClass('-translate-x-full');
    });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'motion:cmd:clear-route-highlight' })
    );
  });

  it('renders mode buttons with strictly color change and no indicator bars or dots', async () => {
    render(<TransitDock />);

    // Open explorer to inspect rail mode buttons
    fireEvent.click(screen.getByRole('button', { name: /explore trains/i }));
    const explorer = await screen.findByRole('dialog', { name: /transit explorer/i });
    const trainRailBtn = within(explorer).getByRole('button', { name: /close trains/i });

    // Mode button has color applied to SVG/container
    expect(trainRailBtn).toHaveStyle({ color: '#0072CE' });

    // Ensure no child indicator bar or dot elements exist inside the button
    const childSpans = trainRailBtn.querySelectorAll('span');
    // Only the tooltip span should exist
    for (const span of Array.from(childSpans)) {
      expect(span.textContent).toBe('Trains');
      expect(span.className).toContain('whitespace-nowrap');
    }
  });

  it('clears route highlight when switching modes with an active route', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<TransitDock />);

    // Open and select train route
    fireEvent.click(screen.getByRole('button', { name: /explore trains/i }));
    fireEvent.click(await screen.findByText('Lilydale Line'));

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'motion:cmd:highlight-route' })
      );
    });

    // Switch to Tram
    const tramBtn = await screen.findByRole('button', { name: /switch to trams/i });
    fireEvent.click(tramBtn);

    // Should have cleared route highlight
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'motion:cmd:clear-route-highlight' })
    );
  });

  it('renders live vehicle count badge in place of the right dropdown chevron arrow', async () => {
    render(<TransitDock />);

    fireEvent.click(screen.getByRole('button', { name: /explore trains/i }));
    // In our mock, Lilydale has 1 live train
    const liveCountBadge = await screen.findByText(/1 train/i);
    expect(liveCountBadge).toBeInTheDocument();

    // Verify no right chevron svg exists in the route card button
    const lilydaleBtn = liveCountBadge.closest('button');
    expect(lilydaleBtn).not.toBeNull();
    const chevronSvg = lilydaleBtn?.querySelector('path[d="M9 18l6-6-6-6"]');
    expect(chevronSvg).toBeNull();
  });
});
