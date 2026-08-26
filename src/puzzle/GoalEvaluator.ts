import type { LevelGoal, ReceiverId, ReceiverRequirement } from '../level/types';

export interface ReceiverEvaluation {
  receiverId: ReceiverId;
  minPower: number;
  maxPower?: number;
  currentPower: number;
  passMin: boolean;
  passMax: boolean;
  pass: boolean;
}

export interface GoalEvaluation {
  satisfied: boolean;
  perReceiver: ReceiverEvaluation[];
}

/** A receiver with no requirement in `goal` at all isn't evaluated — a level
 * that only cares about earth (see LEVEL02) simply omits mars from
 * `goal.receivers`, and mars's current power (however high or low) has no
 * bearing on `satisfied`. */
function evaluateRequirement(
  req: ReceiverRequirement,
  currentPowers: Partial<Record<ReceiverId, number>>,
  spectralContributionPercent?: Partial<Record<ReceiverId, number>>
): ReceiverEvaluation {
  const currentPower = currentPowers[req.receiverId] ?? 0;
  const passMin = currentPower >= req.minPower;
  const passMax = req.maxPower === undefined || currentPower <= req.maxPower;

  // Spectral-purity sub-check: only enforced when the caller actually
  // supplied a contribution figure for this receiver. Physics callers that
  // haven't computed a per-wavelength breakdown yet (or a level with no
  // spectralRange requirement at all) shouldn't be penalized for data they
  // were never asked to provide — so "no data" defaults to passing rather
  // than failing.
  let passSpectral = true;
  if (req.spectralRange?.minContribution !== undefined) {
    const contribution = spectralContributionPercent?.[req.receiverId];
    if (contribution !== undefined) {
      passSpectral = contribution >= req.spectralRange.minContribution;
    }
  }

  return {
    receiverId: req.receiverId,
    minPower: req.minPower,
    maxPower: req.maxPower,
    currentPower,
    passMin,
    passMax,
    pass: passMin && passMax && passSpectral
  };
}

/**
 * Pure snapshot evaluation of a level's goal against the CURRENT receiver
 * readings — no time/hold logic here (see PuzzleStateMachine for the
 * hold-duration/sticky-SOLVED behavior built on top of this). `goal.simultaneous`
 * is the only mode the initial 5 levels use (every requirement must pass in
 * this same snapshot); a future non-simultaneous goal type isn't implemented
 * — `satisfied` always means "every requirement currently passes."
 */
export function evaluateGoal(
  goal: LevelGoal,
  currentPowers: Partial<Record<ReceiverId, number>>,
  spectralContributionPercent?: Partial<Record<ReceiverId, number>>
): GoalEvaluation {
  const perReceiver = goal.receivers.map((req) =>
    evaluateRequirement(req, currentPowers, spectralContributionPercent)
  );
  const satisfied = perReceiver.every((r) => r.pass);
  return { satisfied, perReceiver };
}
