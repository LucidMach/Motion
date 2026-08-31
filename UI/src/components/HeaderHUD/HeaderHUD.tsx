import { useEffect, useRef, useState } from 'react';
import BrandGroup from './BrandGroup';
import GpsLocationCard from './GpsLocationCard';
import type { LocationTelemetry, RegionChangeEventDetail, StatusEventDetail } from '../../types/events';

export default function HeaderHUD() {
  const [regionLabel, setRegionLabel] = useState('Melbourne CBD • Victoria');
  const [regionUpdated, setRegionUpdated] = useState(false);
  const [locationName, setLocationName] = useState('My Location');
  const [accuracyText, setAccuracyText] = useState('±15m accuracy');
  const regionFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onLocation = (event: Event) => {
      const loc = (event as CustomEvent<LocationTelemetry>).detail;
      if (!loc) return;
      setLocationName(loc.locationName || 'My Location');
      setAccuracyText(`±${loc.accuracy}m accuracy`);
    };

    const onStatus = (event: Event) => {
      const { state } = (event as CustomEvent<StatusEventDetail>).detail || ({} as StatusEventDetail);
      if (state === 'gps_acquiring') {
        setLocationName('Acquiring GPS...');
        setAccuracyText('Locating signal');
      } else if (state === 'gps_fallback') {
        setLocationName('Melbourne CBD');
        setAccuracyText('~15m (Approx)');
      }
    };

    const onRegionChange = (event: Event) => {
      const regionName = (event as CustomEvent<RegionChangeEventDetail>).detail?.regionName;
      if (!regionName) return;
      setRegionLabel(regionName);
      setRegionUpdated(true);
      if (regionFlashTimer.current) clearTimeout(regionFlashTimer.current);
      regionFlashTimer.current = setTimeout(() => setRegionUpdated(false), 600);
    };

    window.addEventListener('motion:location', onLocation);
    window.addEventListener('motion:status', onStatus);
    window.addEventListener('motion:region-change', onRegionChange);

    return () => {
      window.removeEventListener('motion:location', onLocation);
      window.removeEventListener('motion:status', onStatus);
      window.removeEventListener('motion:region-change', onRegionChange);
      if (regionFlashTimer.current) clearTimeout(regionFlashTimer.current);
    };
  }, []);

  const handleRecenter = () => {
    window.dispatchEvent(new CustomEvent('motion:cmd:fly-user'));
  };

  return (
    <header
      aria-label="Navigation & Region Status Bar"
      className="pointer-events-auto absolute left-5 right-5 top-5 z-10 flex h-16 items-center justify-between rounded-lg border border-subtle bg-surface px-5 shadow-glass backdrop-blur-lg transition-colors hover:border-subtle max-[768px]:left-3 max-[768px]:right-3 max-[768px]:top-3 max-[768px]:h-[58px] max-[768px]:px-3"
    >
      <BrandGroup regionLabel={regionLabel} regionUpdated={regionUpdated} />
      <div className="flex items-center gap-3">
        <GpsLocationCard locationName={locationName} accuracyText={accuracyText} onRecenter={handleRecenter} />
      </div>
    </header>
  );
}
