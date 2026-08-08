export type CorePaddler = {
  id: string;
  sidePref: "L" | "R" | "Either";
  sideExclusive: boolean;
  weightKg: number | null;
  ratings: Record<string, number | null>;
  ratingAssessedAt: string;
  ratingConfidence: "Low" | "Medium" | "High";
};

export type CoreSeat = {
  row: number;
  active: boolean;
  leftId: string | null;
  rightId: string | null;
};

export function calculateTrim(seats: CoreSeat[], paddlers: CorePaddler[]) {
  const paddlerMap = new Map(paddlers.map((paddler) => [paddler.id, paddler]));
  const entries = seats.flatMap((seat) => ([
    seat.leftId ? { paddler: paddlerMap.get(seat.leftId), side: "L" as const, row: seat.row } : null,
    seat.rightId ? { paddler: paddlerMap.get(seat.rightId), side: "R" as const, row: seat.row } : null,
  ])).filter((item): item is { paddler: CorePaddler; side: "L" | "R"; row: number } => Boolean(item?.paddler));
  const known = entries.filter((item) => item.paddler.weightKg !== null);
  const coverage = entries.length ? Math.round((known.length / entries.length) * 100) : 0;
  const sideWeight = (side: "L" | "R") => known.filter((item) => item.side === side).reduce((sum, item) => sum + Number(item.paddler.weightKg), 0);
  const halfWeight = (bow: boolean) => known.filter((item) => bow ? item.row <= 5 : item.row > 5).reduce((sum, item) => sum + Number(item.paddler.weightKg), 0);
  const total = known.reduce((sum, item) => sum + Number(item.paddler.weightKg), 0);
  return {
    coverage,
    reliable: coverage >= 70,
    left: sideWeight("L"),
    right: sideWeight("R"),
    bow: halfWeight(true),
    stern: halfWeight(false),
    centreRow: total ? known.reduce((sum, item) => sum + Number(item.paddler.weightKg) * item.row, 0) / total : null,
  };
}

export function evidenceConfidence(paddler: CorePaddler, now = Date.now()) {
  const ratingValues = Object.values(paddler.ratings);
  const coverage = ratingValues.length ? ratingValues.filter((value) => value !== null).length / ratingValues.length : 0;
  const confidence = paddler.ratingConfidence === "High" ? 1 : paddler.ratingConfidence === "Medium" ? 0.72 : 0.45;
  let recency = 0.55;
  if (paddler.ratingAssessedAt) {
    const ageDays = Math.max(0, (now - new Date(`${paddler.ratingAssessedAt}T12:00:00Z`).getTime()) / 86_400_000);
    recency = ageDays <= 90 ? 1 : ageDays <= 180 ? 0.85 : ageDays <= 365 ? 0.65 : 0.4;
  }
  return Math.round(coverage * confidence * recency * 100);
}

export function validateSeatAssignments(seats: CoreSeat[], paddlers: CorePaddler[]) {
  const paddlerMap = new Map(paddlers.map((paddler) => [paddler.id, paddler]));
  const seen = new Set<string>();
  const errors: string[] = [];
  seats.forEach((seat) => {
    ([['L', seat.leftId], ['R', seat.rightId]] as const).forEach(([side, id]) => {
      if (!id) return;
      if (seen.has(id)) errors.push(`${id} appears in more than one seat.`);
      seen.add(id);
      const paddler = paddlerMap.get(id);
      if (!paddler) errors.push(`${id} is not in the current roster.`);
      if (paddler?.sideExclusive && paddler.sidePref !== "Either" && paddler.sidePref !== side) errors.push(`${id} is seated on the wrong required side.`);
    });
  });
  return errors;
}

export function replaceOneSeat(seats: CoreSeat[], outgoingId: string, replacement: CorePaddler) {
  const next = structuredClone(seats) as CoreSeat[];
  let replacements = 0;
  next.forEach((seat) => {
    if (seat.leftId === outgoingId) {
      if (replacement.sideExclusive && replacement.sidePref === "R") throw new Error("Replacement is right-side only.");
      seat.leftId = replacement.id;
      replacements += 1;
    }
    if (seat.rightId === outgoingId) {
      if (replacement.sideExclusive && replacement.sidePref === "L") throw new Error("Replacement is left-side only.");
      seat.rightId = replacement.id;
      replacements += 1;
    }
  });
  if (replacements !== 1) throw new Error("Outgoing paddler must occupy exactly one seat.");
  return next;
}
