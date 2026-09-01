"""Reconciles a computed itinerary against live GTFS-Realtime delay and
cancellation data. A deep module: the caller hands over the itinerary plus two
injected callables - a realtime checker and a recompute function - and gets
back a decision (refreshed itinerary, accumulated delay, whether recompute
succeeded) with no knowledge of how PTV's live feed or the routing algorithm
work. Recompute is considered to have failed - and the original itinerary is
returned unchanged, flagged as such - whether it raises or simply returns a
non-Success status; either way the caller is told, instead of silently
serving a stale itinerary that may still reference a cancelled trip.
"""

from dataclasses import dataclass, field
from typing import Callable, Dict, List, Tuple


@dataclass
class DisruptionCheckResult:
    itinerary: Dict
    realtime_delay_mins: int
    recompute_attempted: bool
    recompute_succeeded: bool
    cancelled_trip_ids: List[str] = field(default_factory=list)


def reconcile_with_live_disruptions(
    itinerary: Dict,
    recompute_fn: Callable[[List[str]], Dict],
    realtime_checker: Callable[[str], Tuple[int, bool]],
) -> DisruptionCheckResult:
    """Checks every scheduled transit leg against live realtime data. If any
    leg's trip is reported cancelled, calls recompute_fn with the accumulated
    cancelled trip ids and uses its result only if recompute_fn returns a
    itinerary dict with status "Success"."""
    realtime_delay_mins = 0
    cancelled_trip_ids: List[str] = []

    for leg in itinerary.get("legs", []):
        if leg.get("type") != "TRANSIT" or leg.get("is_replacement"):
            continue
        trip_id = leg.get("trip_id")
        if not trip_id or trip_id == "SCHEDULED":
            continue
        delay, is_cancelled = realtime_checker(trip_id)
        if is_cancelled:
            cancelled_trip_ids.append(trip_id)
        elif delay > 0:
            realtime_delay_mins += delay

    if not cancelled_trip_ids:
        return DisruptionCheckResult(
            itinerary=itinerary,
            realtime_delay_mins=realtime_delay_mins,
            recompute_attempted=False,
            recompute_succeeded=True,
        )

    try:
        recomputed = recompute_fn(cancelled_trip_ids)
    except Exception:
        recomputed = None

    if not recomputed or recomputed.get("status") != "Success":
        return DisruptionCheckResult(
            itinerary=itinerary,
            realtime_delay_mins=realtime_delay_mins,
            recompute_attempted=True,
            recompute_succeeded=False,
            cancelled_trip_ids=cancelled_trip_ids,
        )

    return DisruptionCheckResult(
        itinerary=recomputed,
        realtime_delay_mins=realtime_delay_mins,
        recompute_attempted=True,
        recompute_succeeded=True,
        cancelled_trip_ids=cancelled_trip_ids,
    )
