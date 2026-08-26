import { bootstrapDevicePage } from './deviceBootstrap';
import { SunRenderer } from '../devices/Sun';

const sunCanvas = document.getElementById('sun-canvas') as HTMLCanvasElement;
new SunRenderer(sunCanvas);

bootstrapDevicePage('sun');
