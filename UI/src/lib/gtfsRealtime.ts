// Minimal GTFS-Realtime protobuf schema - just the Alert-related messages
// ptv_realtime.py's get_raw_service_alerts() actually reads (trip updates /
// vehicle positions have no live callers left, so FeedEntity.trip_update
// and VehiclePosition are deliberately omitted). Field numbers match the
// standard public gtfs-realtime.proto (MobilityData/Google Transit spec) -
// protobuf wire compatibility only depends on field numbers, not on a
// message declaring every field the publisher sends.
import protobuf from 'protobufjs';

const PROTO_SOURCE = `
syntax = "proto2";
package transit_realtime;

message FeedMessage {
  repeated FeedEntity entity = 2;
}

message FeedEntity {
  optional Alert alert = 5;
}

message Alert {
  repeated TimeRange active_period = 1;
  repeated EntitySelector informed_entity = 5;
  optional int32 effect = 7;
  optional TranslatedString header_text = 10;
  optional TranslatedString description_text = 11;
}

message TimeRange {
  optional uint64 start = 1;
  optional uint64 end = 2;
}

message EntitySelector {
  optional string route_id = 2;
}

message TranslatedString {
  message Translation {
    required string text = 1;
    optional string language = 2;
  }
  repeated Translation translation = 1;
}
`;

const root = protobuf.parse(PROTO_SOURCE).root;
const FeedMessage = root.lookupType('transit_realtime.FeedMessage');

export interface DecodedAlert {
  activePeriods: { start: number; end: number }[];
  headerText: string;
  descriptionText: string;
  effect: number;
  informedRouteIds: string[];
}

export interface DecodedFeed {
  alerts: DecodedAlert[];
}

export function decodeFeedMessage(buffer: Uint8Array): DecodedFeed {
  const message = FeedMessage.decode(buffer) as any;
  const alerts: DecodedAlert[] = [];

  for (const entity of message.entity ?? []) {
    if (!entity.alert) continue;
    const alert = entity.alert;

    const activePeriods = (alert.activePeriod ?? []).map((p: any) => ({
      start: Number(p.start ?? 0),
      end: Number(p.end ?? 0),
    }));

    const headerText = alert.headerText?.translation?.[0]?.text ?? '';
    const descriptionText = alert.descriptionText?.translation?.[0]?.text ?? '';
    const informedRouteIds = (alert.informedEntity ?? [])
      .map((ie: any) => ie.routeId)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);

    alerts.push({
      activePeriods,
      headerText,
      descriptionText,
      effect: alert.effect ?? 8,
      informedRouteIds,
    });
  }

  return { alerts };
}
