import type { LevelDefinition } from '../types';

export const level01: LevelDefinition = {
  id: 'split',
  index: 0,
  name: '빛 분산',
  description: '태양의 흰빛을 나누어 지구와 화성에 필요한 빛을 동시에 보내세요.',
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
  introHint: '태양과 프리즘 창을 움직이세요.'
};
