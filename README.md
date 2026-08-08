# KDBC Coach Tools

KDBC Coach Tools is a device-local coaching workspace for planning practices, building boats, coaching sessions, and recording what happened. It is designed for the Kingston Dragon Boat Club coaching team and keeps roster names, weights, ratings, constraints, lineups, and reviews in the coach's browser.

## Coaching model

Season progression follows:

1. Stability
2. Technique
3. Endurance
4. Power
5. Speed

Timing is coached in every phase. It is a technical standard, not a separate season phase. Generated blocks display one primary coaching cue at a time.

## Training workspace

- Exact practice blocks, intervals, date, notes, and selected drills are preserved.
- Time-, stroke-, and distance-based intervals include target rate, RPE, recovery, and a technical stop condition.
- The diagnostic selector connects a boat-wide issue to one drill and one cue.
- Post-practice reviews record completion, actual RPE, conditions, the issue to revisit, the drill used, and its effectiveness.
- Progression guidance requires two consecutive clean sessions and accounts for excessive RPE or unresolved issues.

### Drill governance

- **Active:** appropriate for normal recommendation when it matches the observed issue.
- **Limited-use:** requires additional coach judgment or safety control. Examples include Paddling Blind and Upside Down Paddle.
- **Retired:** retained only in historical references and excluded from active recommendation. The current cue-card document removes the retired drills and uses Pause Before the Catch and 80/100 Rotation instead.

## Boat Intelligence 2.0

The boat planner treats recorded safety, side, availability, event-eligibility, row, must-pair, avoid-pair, and locked-seat constraints as higher priority than performance optimization.

- Balanced and strongest-first objectives obey the same hard constraints.
- Steer and drummer assignments sit outside the 20 paddling seats.
- Event eligibility is stored separately from gender identity.
- Missing ratings are unknown; they are not converted into an average score.
- Rating date and evidence confidence affect the displayed data-confidence level.
- Recommendation quality, data confidence, constraint status, section profile, and trim confidence are shown separately.
- Left/right and bow/stern trim appear only when at least 70% of paddler weights are known.
- Each seated paddler has a short “Why this seat?” explanation.
- One-seat dockside substitution preserves every other seat and supports a full undo.
- Loading an older lineup uses current paddler profiles and never rolls the roster backward.

## Sessions and device data

One stable session ID connects the training plan, attendance, boat plan, conditions, notes, and post-practice review. Legacy Release 1/2 drafts migrate into the current session store.

Backups are versioned and validated before replacement. Coaches may create a standard JSON backup or an AES-GCM encrypted backup protected by a passphrase. Restoring a backup replaces only recognized KDBC Coach Tools keys after validation.

## Privacy and printing

- All coaching data remains device-local.
- Crew-safe printouts contain names, roles, rows, sides, and spares only.
- Coach-detail printouts may include ratings, weights, evidence confidence, trim, and coaching checks.
- Accommodation text and private coach notes are never included in crew-safe output.

## Development

```bash
npm run lint
npm test
```

The behavioural regression suite covers session migration, current-roster lineup loading, constraint handling, missing-rating confidence, substitution stability, backup validation, and rendered output markers.
