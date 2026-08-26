import type { LevelDefinition } from '../types';

export const level04: LevelDefinition = {
  id: 'gravity',
  index: 3,
  name: 'Gravity',
  description: 'Bend sunlight around BLACKHOLE and through PRISM to reach EARTH.',
  requiredDevices: ['prism', 'blackhole'],
  sun: { xPct: 0.08, yPct: 0.5 },
  receivers: [{ id: 'earth', xPct: 0.9, yPct: 0.22 }],
  goal: {
    receivers: [{ receiverId: 'earth', minPower: 60 }],
    simultaneous: true,
    holdDurationMs: 1500
  },
  initialDevicePlacement: [
    { id: 'blackhole', xPct: 0.32, yPct: 0.62 },
    { id: 'prism', xPct: 0.55, yPct: 0.5 }
  ],
  introHint: 'Let gravity bend it.'
};
