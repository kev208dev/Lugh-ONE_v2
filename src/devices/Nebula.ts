export class NebulaRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private intensity = 0;
  private color = 'rgb(190,220,255)';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('NebulaRenderer: 2d context unavailable');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.draw(this.intensity, this.color);
  }

  draw(intensity: number, color: string): void {
    this.intensity = Math.min(1, Math.max(0, intensity));
    this.color = color;

    const { ctx, canvas } = this;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.43;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [190, 220, 255];
    const litColor = (alpha: number) => `rgba(${channels[0]},${channels[1]},${channels[2]},${alpha})`;
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius * 1.18);
    halo.addColorStop(0, litColor(0.28 + this.intensity * 0.55));
    halo.addColorStop(0.42, `rgba(77,58,112,${0.22 + this.intensity * 0.36})`);
    halo.addColorStop(1, 'rgba(8,10,18,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.18, 0, Math.PI * 2);
    ctx.fill();

    const wisps = [
      [-0.34, -0.08, 0.62, 0.36],
      [0.22, -0.26, 0.54, 0.3],
      [0.28, 0.22, 0.66, 0.34],
      [-0.2, 0.3, 0.48, 0.28],
      [0.02, 0.02, 0.82, 0.42]
    ] as const;

    for (const [ox, oy, scale, alpha] of wisps) {
      const x = cx + ox * radius;
      const y = cy + oy * radius;
      const wisp = ctx.createRadialGradient(x, y, 0, x, y, radius * scale);
      wisp.addColorStop(0, `rgba(148,126,190,${alpha + this.intensity * 0.22})`);
      wisp.addColorStop(0.55, `rgba(54,77,112,${alpha * 0.5 + this.intensity * 0.13})`);
      wisp.addColorStop(1, 'rgba(10,10,18,0)');
      ctx.fillStyle = wisp;
      ctx.beginPath();
      ctx.arc(x, y, radius * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.intensity > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.9);
      bloom.addColorStop(0, litColor(1));
      bloom.addColorStop(0.32, `rgba(255,255,255,${0.18 * this.intensity})`);
      bloom.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 0.25 + this.intensity * 0.55;
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
