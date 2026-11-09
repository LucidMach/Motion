import { describe, it, expect } from 'vitest';
import { decodeFeedMessage } from './gtfsRealtime';

// Built with Python's actual `google.transit.gtfs_realtime_pb2` (the real
// library ptv_realtime.py used) to guarantee wire compatibility - not
// hand-crafted bytes. Contains:
//  - entity 1: a NO_SERVICE alert with a closed active_period, one
//    informed_entity.route_id, and header+description text.
//  - entity 2: a SIGNIFICANT_DELAYS alert with an open-ended active_period
//    (no `end` field set) and only header text.
//  - entity 3: a trip_update-only entity with no `alert` field at all,
//    which must be skipped (this schema deliberately omits trip_update).
const FIXTURE_BASE64 =
  'CgUKAzIuMBKNAQoHYWxlcnQtMSqBAQoMCIDiz6oGEJD+z6oGKhMSEXJvdXRlLXNhbmRyaW5naGFtOAFSHwodChtTYW5kcmluZ2hhbSBsaW5lIGRpc3J1cHRpb25aOQo3CjVCdXNlcyByZXBsYWNlIHRyYWlucyBiZXR3ZWVuIFJpY2htb25kIGFuZCBTYW5kcmluZ2hhbRItCg1hbGVydC0yLWRlbGF5KhwKBgiQsNCqBjgDUhAKDgoMTWlub3IgZGVsYXlzEhwKEHRyaXAtdXBkYXRlLW9ubHkaCAoGCgRUMTIz';

function fixtureBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(FIXTURE_BASE64, 'base64'));
}

describe('decodeFeedMessage', () => {
  it('decodes only entities with an alert field, skipping others', () => {
    const { alerts } = decodeFeedMessage(fixtureBytes());
    expect(alerts).toHaveLength(2);
  });

  it('decodes active_period start/end, defaulting a missing end to 0', () => {
    const { alerts } = decodeFeedMessage(fixtureBytes());
    expect(alerts[0].activePeriods).toEqual([{ start: 1700000000, end: 1700003600 }]);
    expect(alerts[1].activePeriods).toEqual([{ start: 1700010000, end: 0 }]);
  });

  it('decodes header and description text from the first translation', () => {
    const { alerts } = decodeFeedMessage(fixtureBytes());
    expect(alerts[0].headerText).toBe('Sandringham line disruption');
    expect(alerts[0].descriptionText).toBe('Buses replace trains between Richmond and Sandringham');
    expect(alerts[1].headerText).toBe('Minor delays');
    expect(alerts[1].descriptionText).toBe('');
  });

  it('decodes the effect enum', () => {
    const { alerts } = decodeFeedMessage(fixtureBytes());
    expect(alerts[0].effect).toBe(1); // NO_SERVICE
    expect(alerts[1].effect).toBe(3); // SIGNIFICANT_DELAYS
  });

  it('decodes informed_entity route_ids, omitting entities without one', () => {
    const { alerts } = decodeFeedMessage(fixtureBytes());
    expect(alerts[0].informedRouteIds).toEqual(['route-sandringham']);
    expect(alerts[1].informedRouteIds).toEqual([]);
  });
});
