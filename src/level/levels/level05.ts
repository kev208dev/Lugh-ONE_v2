import type { LevelDefinition } from '../types';

export const level05: LevelDefinition = {
  id: 'veil',
  index: 4,
  name: 'Veil',
  description: 'Route sunlight around light-eating nebulae to feed EARTH and MARS at once.',
  requiredDevices: ['prism', 'mirror'],
  sun: { xPct: 0.1, yPct: 0.5 },
  receivers: [
    { id: 'earth', xPct: 0.88, yPct: 0.28 },
    { id: 'mars', xPct: 0.88, yPct: 0.72 }
  ],
  nebulae: [
    { id: 'nebula-1', xPct: 0.28, yPct: 0.5, sizePx: 220, attenuation: 1 },
    { id: 'nebula-2', xPct: 0.8, yPct: 0.38, sizePx: 190, attenuation: 1 }
  ],
  goal: {
    receivers: [
      { receiverId: 'earth', minPower: 55 },
      { receiverId: 'mars', minPower: 45 }
    ],
    simultaneous: true,
    holdDurationMs: 1500
  },
  initialDevicePlacement: [
    { id: 'mirror', xPct: 0.45, yPct: 0.5 },
    { id: 'prism', xPct: 0.7, yPct: 0.5 }
  ],
  introHint: 'The veil drinks every ray it touches.'
};
