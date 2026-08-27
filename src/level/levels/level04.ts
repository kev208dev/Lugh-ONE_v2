import type { LevelDefinition } from '../types';

export const level04: LevelDefinition = {
  id: 'gravity',
  index: 3,
  name: '중력 굴절',
  description: '블랙홀의 중력으로 태양빛을 휘게 한 뒤 프리즘을 거쳐 지구에 보내세요.',
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
  introHint: '블랙홀 주변으로 빛을 휘게 하세요.'
};
