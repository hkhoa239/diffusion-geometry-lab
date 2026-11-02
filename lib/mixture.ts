// Gaussian mixtures: density, score, diffusion and the exact Bayes posterior.
import { normPdf, SQRT2PI } from "./gaussian";

export interface Mix1D {
  w: number[];
  mu: number[];
  sd: number[];
}

/** The lessons' prior: 1/2 N(-2, 0.3^2) + 1/2 N(2, 0.3^2). */
export const BIMODAL: Mix1D = { w: [0.5, 0.5], mu: [-2, 2], sd: [0.3, 0.3] };

function logSumExp(v: number[]): number {
  const m = Math.max(...v);
  if (!isFinite(m)) return m;
  let s = 0;
  for (const x of v) s += Math.exp(x - m);
  return m + Math.log(s);
}

function compLog(m: Mix1D, x: number): number[] {
  return m.w.map((w, k) => {
    const z = (x - m.mu[k]) / m.sd[k];
    return Math.log(w) - 0.5 * z * z - Math.log(m.sd[k] * SQRT2PI);
  });
}

export function mixLogPdf(m: Mix1D, x: number): number {
  return logSumExp(compLog(m, x));
}

export function mixPdf(m: Mix1D, x: number): number {
  return Math.exp(mixLogPdf(m, x));
}

export function responsibilities(m: Mix1D, x: number): number[] {
  const l = compLog(m, x);
  const z = logSumExp(l);
  return l.map((v) => Math.exp(v - z));
}

/** Score d/dx log p(x) = sum_k r_k(x) * (-(x - mu_k) / sd_k^2), computed stably. */
export function mixScore(m: Mix1D, x: number): number {
  const r = responsibilities(m, x);
  let s = 0;
  for (let k = 0; k < r.length; k++) s += (r[k] * -(x - m.mu[k])) / (m.sd[k] * m.sd[k]);
  return s;
}

/** Marginal of x_t = alpha x_0 + sigma eps when x_0 ~ m. */
export function diffuse(m: Mix1D, alpha: number, sigma: number): Mix1D {
  return {
    w: m.w.slice(),
    mu: m.mu.map((u) => alpha * u),
    sd: m.sd.map((s) => Math.sqrt(alpha * alpha * s * s + sigma * sigma)),
  };
}

export interface Posterior1D {
  w: number[]; // posterior mixture weights (responsibilities of x_t)
  m: number[]; // component means
  v: number[]; // component variances
}

/**
 * Exact denoising distribution p(x_0 | x_t) for a Gaussian-mixture prior (Bayes' rule):
 *   v_k = (1/sd_k^2 + alpha^2/sigma^2)^-1,  m_k = v_k (mu_k/sd_k^2 + alpha x_t / sigma^2),
 *   w_k ∝ pi_k N(x_t; alpha mu_k, alpha^2 sd_k^2 + sigma^2).
 */
export function posterior(m: Mix1D, xt: number, alpha: number, sigma: number): Posterior1D {
  const s2 = sigma * sigma;
  const w = responsibilities(diffuse(m, alpha, sigma), xt);
  const v = m.sd.map((sd) => 1 / (1 / (sd * sd) + (alpha * alpha) / s2));
  const mm = m.mu.map((mu, k) => v[k] * (mu / (m.sd[k] * m.sd[k]) + (alpha * xt) / s2));
  return { w, m: mm, v };
}

export function posteriorPdf(p: Posterior1D, x0: number): number {
  let s = 0;
  for (let k = 0; k < p.w.length; k++) s += p.w[k] * normPdf(x0, p.m[k], Math.sqrt(p.v[k]));
  return s;
}

export function posteriorLogPdf(p: Posterior1D, x0: number): number {
  return logSumExp(
    p.w.map((w, k) => {
      const z = (x0 - p.m[k]) / Math.sqrt(p.v[k]);
      return Math.log(Math.max(w, 1e-300)) - 0.5 * z * z - Math.log(Math.sqrt(p.v[k]) * SQRT2PI);
    })
  );
}

/** Deterministic PRNG (mulberry32) and standard normals (Box–Muller) for reproducible animations. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(uniform(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
  return { uniform, normal };
}

export function sampleMix(m: Mix1D, n: number, seed: number): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    let u = r.uniform();
    let k = 0;
    while (k < m.w.length - 1 && u > m.w[k]) {
      u -= m.w[k];
      k++;
    }
    return m.mu[k] + m.sd[k] * r.normal();
  });
}

// ----------------------------------------------------------------- 2D: 8 Gaussians on a circle

export const RING = { K: 8, radius: 3, sd: 0.35 };

export function ringMeans(): [number, number][] {
  return Array.from({ length: RING.K }, (_, k) => {
    const a = (2 * Math.PI * k) / RING.K;
    return [RING.radius * Math.cos(a), RING.radius * Math.sin(a)];
  });
}

const MEANS2D = ringMeans();

/** Diffused 8-Gaussian mixture: log density, density, score and density gradient at (x, y). */
export function ring2d(x: number, y: number, alpha: number, sigma: number) {
  const v = alpha * alpha * RING.sd * RING.sd + sigma * sigma;
  const logs = MEANS2D.map(([mx, my]) => {
    const dx = x - alpha * mx;
    const dy = y - alpha * my;
    return Math.log(1 / RING.K) - (dx * dx + dy * dy) / (2 * v) - Math.log(2 * Math.PI * v);
  });
  const lse = logSumExp(logs);
  let sx = 0;
  let sy = 0;
  logs.forEach((l, k) => {
    const r = Math.exp(l - lse);
    sx += (r * -(x - alpha * MEANS2D[k][0])) / v;
    sy += (r * -(y - alpha * MEANS2D[k][1])) / v;
  });
  const p = Math.exp(lse);
  return { logp: lse, p, score: [sx, sy] as [number, number], gradP: [p * sx, p * sy] as [number, number] };
}
