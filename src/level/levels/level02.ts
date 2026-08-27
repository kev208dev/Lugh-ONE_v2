import type { LevelDefinition } from '../types';

export const level02: LevelDefinition = {
  id: 'reflect',
  index: 1,
  name: '빛 반사',
  description: '태양빛을 거울에 반사한 뒤 프리즘을 통과시켜 지구에 보내세요.',
  requiredDevices: ['prism', 'mirror'],
  sun: { xPct: 0.1, yPct: 0.5 },
  receivers: [{ id: 'earth', xPct: 0.88, yPct: 0.18 }],
  goal: {
    receivers: [{ receiverId: 'earth', minPower: 65 }],
    simultaneous: true,
    holdDurationMs: 1500
  },
  initialDevicePlacement: [
    { id: 'mirror', xPct: 0.35, yPct: 0.28 },
    { id: 'prism', xPct: 0.62, yPct: 0.62 }
  ],
  introHint: '거울로 빛의 길을 꺾으세요.'
};
