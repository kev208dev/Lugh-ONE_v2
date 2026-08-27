import type { LevelDefinition } from '../types';

export const level05: LevelDefinition = {
  id: 'veil',
  index: 4,
  name: '성운 장막',
  description: '빛을 흡수하는 성운을 피해 지구와 화성에 태양빛을 동시에 보내세요.',
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
  introHint: '성운에 닿은 빛은 모두 흡수됩니다.'
};
