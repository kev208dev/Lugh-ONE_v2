import type { LevelDefinition } from '../types';

export const level03: LevelDefinition = {
  id: 'balance',
  index: 2,
  name: '빛의 균형',
  description: '지구와 화성에 각각 55% 이상의 빛을 동시에 보내세요. 100%도 성공으로 인정됩니다.',
  requiredDevices: ['prism'],
  sun: { xPct: 0.12, yPct: 0.5 },
  receivers: [
    { id: 'earth', xPct: 0.82, yPct: 0.4 },
    { id: 'mars', xPct: 0.82, yPct: 0.6 }
  ],
  goal: {
    receivers: [
      { receiverId: 'earth', minPower: 55 },
      { receiverId: 'mars', minPower: 55 }
    ],
    simultaneous: true,
    holdDurationMs: 1500
  },
  initialDevicePlacement: [{ id: 'prism', xPct: 0.48, yPct: 0.46 }],
  introHint: '두 행성을 모두 55% 이상 밝히세요.'
};
