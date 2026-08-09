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

export type CoreCompositionRule = "count" | "mixed" | "women";
export type CoreEventEligibility = "Unconfirmed" | "Open" | "Mixed" | "Women" | "Ineligible";

export type CoreAllocationMember = {
  id: string;
  name: string;
  avoidPairWith: string;
  mustPairWith: string;
  eventEligibility: CoreEventEligibility;
  allocationScore: number;
};

export type CoreAllocationStrategy = "balanced" | "strongest";

function referencesMember(reference: string, member: CoreAllocationMember) {
  const normalized = reference.trim().toLowerCase();
  return Boolean(normalized) && (member.id.toLowerCase() === normalized || member.name.toLowerCase() === normalized);
}

export function allocateBoatUnits<T extends CoreAllocationMember>(
  units: T[][],
  sizes: number[],
  strategy: CoreAllocationStrategy,
  compositionRule: CoreCompositionRule,
  seededGroups: T[][] = [],
) {
  const groups = sizes.map((_, index) => [...(seededGroups[index] ?? [])]);
  const overflow: T[] = [];
  const potentialWomenCount = (group: T[]) => group.filter((paddler) => paddler.eventEligibility === "Women" || paddler.eventEligibility === "Unconfirmed").length;
  const conflictsWithGroup = (unit: T[], group: T[]) => unit.some((paddler) => {
    if (!paddler.avoidPairWith.trim()) return false;
    return group.some((member) => referencesMember(paddler.avoidPairWith, member));
  }) || group.some((member) => {
    if (!member.avoidPairWith.trim()) return false;
    return unit.some((paddler) => referencesMember(member.avoidPairWith, paddler));
  });

  units.forEach((unit) => {
    const unitWomen = unit.filter((paddler) => paddler.eventEligibility === "Women").length;
    const unitPotentialWomen = potentialWomenCount(unit);
    const options = groups.map((group, index) => ({
      index,
      room: group.length + unit.length <= sizes[index],
      conflict: conflictsWithGroup(unit, group),
      average: group.length ? group.reduce((sum, item) => sum + item.allocationScore, 0) / group.length : 0,
      size: group.length,
      womenNeed: Math.max(0, Math.ceil(sizes[index] / 2) - group.filter((paddler) => paddler.eventEligibility === "Women").length),
      potentialWomenNeed: Math.max(0, Math.ceil(sizes[index] / 2) - potentialWomenCount(group)),
    })).filter((item) => item.room && !item.conflict);
    const target = strategy === "strongest"
      ? options.sort((a, b) => compositionRule === "mixed" && unitPotentialWomen ? b.potentialWomenNeed - a.potentialWomenNeed || (unitWomen ? b.womenNeed - a.womenNeed : 0) || a.index - b.index : a.index - b.index)[0]
      : options.sort((a, b) => compositionRule === "mixed" && unitPotentialWomen ? b.potentialWomenNeed - a.potentialWomenNeed || (unitWomen ? b.womenNeed - a.womenNeed : 0) || a.average - b.average || a.size - b.size || a.index - b.index : a.average - b.average || a.size - b.size || a.index - b.index)[0];

    if (target) {
      groups[target.index].push(...unit);
      return;
    }

    const remainingCapacity = groups.reduce((total, group, index) => total + Math.max(0, sizes[index] - group.length), 0);
    if (remainingCapacity < unit.length) {
      overflow.push(...unit);
      return;
    }

    const hasRelationshipConstraint = unit.some((paddler) => paddler.mustPairWith.trim() || paddler.avoidPairWith.trim())
      || groups.some((group) => conflictsWithGroup(unit, group));
    if (hasRelationshipConstraint) {
      throw new Error(`No feasible boat can satisfy the recorded must-pair / avoid-pair constraints for ${unit.map((item) => item.name).join(" and ")}.`);
    }
    throw new Error(`No feasible boat can place ${unit.map((item) => item.name).join(" and ")}. Review locked seats and boat capacity.`);
  });

  return { groups, overflow };
}

export function evaluateEventEligibility(eligibilities: CoreEventEligibility[], rule: CoreCompositionRule) {
  const total = eligibilities.length;
  const confirmedWomen = eligibilities.filter((value) => value === "Women").length;
  const unconfirmed = eligibilities.filter((value) => value === "Unconfirmed").length;
  const ineligible = eligibilities.filter((value) => value === "Ineligible").length;
  const requiredWomen = rule === "mixed" ? Math.ceil(total / 2) : rule === "women" ? total : 0;

  if (rule === "count") {
    return { allowed: true, provisional: false, total, confirmedWomen, unconfirmed, ineligible, requiredWomen, incompatible: 0 };
  }

  if (rule === "women") {
    const incompatible = eligibilities.filter((value) => value !== "Women" && value !== "Unconfirmed").length;
    return {
      allowed: incompatible === 0,
      provisional: incompatible === 0 && unconfirmed > 0,
      total,
      confirmedWomen,
      unconfirmed,
      ineligible,
      requiredWomen,
      incompatible,
    };
  }

  const potentialWomen = confirmedWomen + unconfirmed;
  return {
    allowed: ineligible === 0 && potentialWomen >= requiredWomen,
    provisional: ineligible === 0 && confirmedWomen < requiredWomen && potentialWomen >= requiredWomen,
    total,
    confirmedWomen,
    unconfirmed,
    ineligible,
    requiredWomen,
    incompatible: ineligible,
  };
}

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
