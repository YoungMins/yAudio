import { useEffect, useRef } from "react";
import type { Clip } from "../lib/timeline";
import type { WaveformPayload } from "../types/audio";

interface Props {
  waveform: WaveformPayload;
  cursorSecs: number;
  selection: { start: number; end: number } | null;
  clips: readonly Clip[];
  accent: string;
}

/**
 * GPU-accelerated waveform via WebGPU when available, with a Canvas2D
 * fallback so the UI still works in browsers / older platforms without
 * a WebGPU adapter.
 */
export function WaveformRenderer({
  waveform,
  cursorSecs,
  selection,
  clips,
  accent,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<GpuRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const renderer = await GpuRenderer.create(canvas, accent);
      if (cancelled) {
        renderer?.destroy();
        return;
      }
      gpuRef.current = renderer;
      paint();
      const ro = new ResizeObserver(paint);
      ro.observe(canvas);
      cleanup = () => {
        ro.disconnect();
        renderer?.destroy();
        gpuRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveform, accent]);

  useEffect(() => {
    paintOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorSecs, selection, waveform, clips]);

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fitCanvas(canvas);
    if (gpuRef.current) {
      gpuRef.current.draw(waveform.peaks);
    } else {
      paint2d(canvas, waveform.peaks, accent);
    }
    paintOverlay();
  }

  function paintOverlay() {
    const ov = overlayRef.current;
    const base = canvasRef.current;
    if (!ov || !base) return;
    fitCanvas(ov);
    const ctx = ov.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, ov.width, ov.height);
    const dur = waveform.meta.duration_secs || 1;
    const trackTop = ov.height - 18;

    // Clip lane along the bottom of the canvas. Each clip is a small
    // rounded rectangle so the user can see how the timeline has been cut.
    if (clips.length > 0) {
      ctx.fillStyle = `${accent}22`;
      ctx.fillRect(0, trackTop, ov.width, 18);
      for (const clip of clips) {
        const x0 = (clip.start / dur) * ov.width;
        const x1 = ((clip.start + clip.duration) / dur) * ov.width;
        const w = Math.max(2, x1 - x0);
        ctx.fillStyle = accent;
        roundRect(ctx, x0 + 1, trackTop + 3, w - 2, 12, 3);
        ctx.fill();
      }
    }

    if (selection) {
      const x0 = (selection.start / dur) * ov.width;
      const x1 = (selection.end / dur) * ov.width;
      ctx.fillStyle = `${accent}33`;
      ctx.fillRect(x0, 0, x1 - x0, trackTop);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, 0.5, x1 - x0 - 1, trackTop - 1);
    }

    const cx = (cursorSecs / dur) * ov.width;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, trackTop);
    ctx.stroke();
  }

  function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
}

function fitCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function paint2d(canvas: HTMLCanvasElement, peaks: number[], accent: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const mid = h / 2;
  const buckets = peaks.length / 2;
  const colW = Math.max(1, w / buckets);

  ctx.fillStyle = accent;
  for (let i = 0; i < buckets; i++) {
    const min = peaks[i * 2];
    const max = peaks[i * 2 + 1];
    const y0 = mid - max * mid;
    const y1 = mid - min * mid;
    ctx.fillRect(i * colW, y0, colW, Math.max(1, y1 - y0));
  }

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
}

class GpuRenderer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipeline: GPURenderPipeline;
  private format: GPUTextureFormat;
  private accent: [number, number, number];
  private buffer: GPUBuffer | null = null;
  private vertexCount = 0;

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    pipeline: GPURenderPipeline,
    format: GPUTextureFormat,
    accent: [number, number, number]
  ) {
    this.device = device;
    this.context = context;
    this.pipeline = pipeline;
    this.format = format;
    this.accent = accent;
  }

  static async create(
    canvas: HTMLCanvasElement,
    accentHex: string
  ): Promise<GpuRenderer | null> {
    if (!("gpu" in navigator)) return null;
    try {
      const adapter = await navigator.gpu!.requestAdapter();
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
      if (!ctx) return null;
      const format = navigator.gpu!.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: "premultiplied" });

      const accent = hexToRgb(accentHex);
      const shader = device.createShaderModule({
        code: /* wgsl */ `
          struct U { color: vec4<f32> };
          @group(0) @binding(0) var<uniform> u: U;
          @vertex fn vs(@location(0) p: vec2<f32>) -> @builtin(position) vec4<f32> {
            return vec4<f32>(p, 0.0, 1.0);
          }
          @fragment fn fs() -> @location(0) vec4<f32> { return u.color; }
        `,
      });
      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
          module: shader,
          entryPoint: "vs",
          buffers: [
            {
              arrayStride: 8,
              attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
            },
          ],
        },
        fragment: {
          module: shader,
          entryPoint: "fs",
          targets: [{ format }],
        },
        primitive: { topology: "triangle-list" },
      });

      return new GpuRenderer(device, ctx, pipeline, format, accent);
    } catch {
      return null;
    }
  }

  draw(peaks: number[]) {
    const buckets = peaks.length / 2;
    const verts = new Float32Array(buckets * 6 * 2);
    let o = 0;
    for (let i = 0; i < buckets; i++) {
      const x0 = (i / buckets) * 2 - 1;
      const x1 = ((i + 1) / buckets) * 2 - 1;
      const yMin = peaks[i * 2];
      const yMax = peaks[i * 2 + 1];
      verts[o++] = x0;
      verts[o++] = yMin;
      verts[o++] = x1;
      verts[o++] = yMin;
      verts[o++] = x1;
      verts[o++] = yMax;
      verts[o++] = x0;
      verts[o++] = yMin;
      verts[o++] = x1;
      verts[o++] = yMax;
      verts[o++] = x0;
      verts[o++] = yMax;
    }

    if (this.buffer) this.buffer.destroy();
    this.buffer = this.device.createBuffer({
      size: verts.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.buffer, 0, verts);
    this.vertexCount = buckets * 6;

    const ub = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(
      ub,
      0,
      new Float32Array([...this.accent, 1.0])
    );
    const bind = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: ub } }],
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bind);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(this.vertexCount);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    void this.format;
  }

  destroy() {
    this.buffer?.destroy();
    this.buffer = null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const n = parseInt(m, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
