import type { LocationTelemetry, StatusEventDetail } from '../../types/events';

export function dispatchLocation(telemetry: LocationTelemetry): void {
  window.dispatchEvent(new CustomEvent<LocationTelemetry>('motion:location', { detail: telemetry }));
}

export function dispatchStatus(status: StatusEventDetail): void {
  window.dispatchEvent(new CustomEvent('motion:status', { detail: status }));
}

export function dispatchRegion(regionName: string): void {
  window.dispatchEvent(new CustomEvent('motion:region-change', { detail: { regionName } }));
}
