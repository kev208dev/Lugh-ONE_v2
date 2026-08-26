import type { LevelDefinition } from '../types';

export const level03: LevelDefinition = {
  id: 'balance',
  index: 2,
  name: 'Balance',
  description: 'Keep both EARTH and MARS fed without overexposing either one.',
  requiredDevices: ['prism'],
  sun: { xPct: 0.12, yPct: 0.5 },
  receivers: [
    { id: 'earth', xPct: 0.82, yPct: 0.4 },
    { id: 'mars', xPct: 0.82, yPct: 0.6 }
  ],
  goal: {
    receivers: [
      { receiverId: 'earth', minPower: 55, maxPower: 75 },
      { receiverId: 'mars', minPower: 55, maxPower: 75 }
    ],
    simultaneous: true,
    holdDurationMs: 1500
  },
  initialDevicePlacement: [{ id: 'prism', xPct: 0.48, yPct: 0.46 }],
  introHint: 'Feed both, starve neither.'
};
