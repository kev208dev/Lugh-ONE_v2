import { bootstrapDevicePage } from './deviceBootstrap';

const { bus } = bootstrapDevicePage('mars');

const powerEl = document.getElementById('power');
const bannerEl = document.getElementById('level-banner');

bus.subscribe((msg) => {
  if (msg.type === 'level-state') {
    if (powerEl) powerEl.textContent = `${Math.round(msg.marsPercent)}%`;
    if (bannerEl) bannerEl.classList.toggle('visible', msg.complete);
  }
});
