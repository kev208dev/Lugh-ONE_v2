import type { LevelDefinition } from '../types';

export const level01: LevelDefinition = {
  id: 'split',
  index: 0,
  name: 'Split',
  description: 'Disperse white sunlight so EARTH and MARS both receive enough power at once.',
  requiredDevices: ['prism'],
  sun: { xPct: 0.1, yPct: 0.5 },
  receivers: [
    { id: 'earth', xPct: 0.85, yPct: 0.32 },
    { id: 'mars', xPct: 0.85, yPct: 0.68 }
  ],
  goal: {
    receivers: [
      { receiverId: 'mars', minPower: 55 },
      { receiverId: 'earth', minPower: 55 }
    ],
    simultaneous: true,
    holdDurationMs: 1500
  },
  initialDevicePlacement: [{ id: 'prism', xPct: 0.5, yPct: 0.58 }],
  introHint: 'Separate the light.'
};
