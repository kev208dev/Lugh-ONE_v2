import type { LevelDefinition } from '../types';

export const level03: LevelDefinition = {
  id: 'balance',
  index: 2,
  name: '빛의 균형',
  description: '지구와 화성 어느 쪽도 너무 밝아지지 않도록 빛의 양을 맞추세요.',
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
  introHint: '두 행성의 빛을 균형 있게 맞추세요.'
};
