# Harbor Dispatch Core Protocol

The fictional North Quay harbor uses a dispatch protocol to coordinate ferry movement through one
narrow channel. The protocol separates a vessel's permission to request movement from the physical
berth, the channel, and the records that describe that permission.

## Berth reservation

A **berth reservation** is a temporary authorization for one named vessel to request entry to one
named berth during one clearance window. It does not transfer ownership of the berth, guarantee that
the vessel will enter, or authorize movement through a different berth. Harbor Control may suspend a
reservation when the channel becomes unsafe.

Only Harbor Control creates or suspends a berth reservation. A timetable entry is a planning notice,
not a reservation. A vessel with a timetable entry but no active reservation must remain outside the
channel.

## Dispatch token

A **dispatch token** is a record that carries a reservation identifier, vessel call sign, berth
identifier, issue time, and expiry time. The token refers to a berth reservation; it is not itself the
reservation or the berth. Copying a token copies the record, but it does not create another
reservation and does not extend the original expiry time.

Before relying on a token, the channel controller compares every carried field with the current
reservation registry. A well-formed token is rejected when its reservation has been suspended, its
vessel or berth differs from the registry, or its expiry time has passed. Possession of a token alone
therefore never guarantees movement authority.

## Clearance window

A **clearance window** is the twelve-minute interval in which a vessel with an active reservation may
request channel entry. The interval begins when Harbor Control confirms that the channel is clear; it
does not begin at the vessel's scheduled departure time or when a token is printed. If Harbor Control
suspends the reservation, unused minutes are not carried into a later window.

The vessel must enter the channel before the clearance window ends. Once entry has been authorized,
an emergency interlock may still halt movement. The interlock is a safety override, not evidence that
the earlier reservation or token was invalid.

## Release sequence

Harbor Control follows this order for an ordinary departure:

1. Confirm that the vessel has adequate tide margin for the planned channel and time.
2. Create an active berth reservation for the vessel and berth.
3. Issue a dispatch token that refers to that reservation.
4. Validate the token against the current registry during the clearance window.
5. Authorize movement unless a safety override is active.

Adequate tide margin is necessary but not sufficient for departure. The reservation, token
validation, clearance window, and safety state remain separate requirements.

## Tide-margin dependency

This protocol names **tide margin** as an input to release, but it does not define how tide margin is
calculated. That calculation belongs to the separate Tide Margin Supplement. Tide margin must not be
treated as another name for tide height, water depth, or clearance window.

## Worked cases

Ferry Alder has an active reservation for Berth 2 and receives a matching token. Its scheduled
departure was 09:00, but Harbor Control did not confirm a clear channel until 09:04. Alder's clearance
window therefore runs from 09:04 until 09:16.

Ferry Birch holds a copied token for Alder's reservation. The record is structurally complete, but
its vessel call sign does not match the registry. Birch has no authority to enter under that token.
