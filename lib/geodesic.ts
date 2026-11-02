// Geodesics: exact for the univariate Gaussian family, numerical for diffusion spacetime.
import { frLineElement, linspace } from "./gaussian";
import { Mix1D } from "./mixture";
import { Schedule } from "./diffusion";
import { Pt, quadForm, spacetimeMetric } from "./fisher";

export type P2 = [number, number]; // (mu, sigma) or (x, t)

/**
 * EXACT Fisher–Rao geodesic between N(mu1, s1^2) and N(mu2, s2^2).
 * In (mu, y = sqrt(2) sigma) the metric is 2 x hyperbolic, whose geodesics are vertical lines or
 * semicircles centred on y = 0. Points are returned at constant Fisher–Rao speed.
 */
export function gaussianGeodesic(A: P2, B: P2, n = 200): P2[] {
  const [m1, s1] = A;
  const [m2, s2] = B;
  const y1 = Math.SQRT2 * s1;
  const y2 = Math.SQRT2 * s2;
  if (Math.abs(m1 - m2) < 1e-12) {
    // vertical line: hyperbolic arclength is log(y)
    return linspace(0, 1, n).map((u) => [m1, Math.exp(Math.log(s1) + u * (Math.log(s2) - Math.log(s1)))]);
  }
  const c = (m1 * m1 + y1 * y1 - m2 * m2 - y2 * y2) / (2 * (m1 - m2));
  const R = Math.hypot(m1 - c, y1);
  const th1 = Math.atan2(y1, m1 - c);
  const th2 = Math.atan2(y2, m2 - c);
  // hyperbolic arclength along the circle: s(theta) = log tan(theta / 2)
  const S = (th: number) => Math.log(Math.tan(th / 2));
  const sa = S(th1);
  const sb = S(th2);
  return linspace(0, 1, n).map((u) => {
    const th = 2 * Math.atan(Math.exp(sa + u * (sb - sa)));
    return [c + R * Math.cos(th), (R * Math.sin(th)) / Math.SQRT2];
  });
}

export function geodesicCircle(A: P2, B: P2) {
  const [m1, s1] = A;
  const [m2, s2] = B;
  const y1 = Math.SQRT2 * s1;
  const y2 = Math.SQRT2 * s2;
  const c = (m1 * m1 + y1 * y1 - m2 * m2 - y2 * y2) / (2 * (m1 - m2));
  return { center: c, radiusY: Math.hypot(m1 - c, y1), radiusSigma: Math.hypot(m1 - c, y1) / Math.SQRT2 };
}

export function straightPath(A: P2, B: P2, n = 200): P2[] {
  return linspace(0, 1, n).map((u) => [A[0] + u * (B[0] - A[0]), A[1] + u * (B[1] - A[1])]);
}

/** Cubic Bézier through endpoints A, B with control points C1, C2. */
export function bezier(A: P2, C1: P2, C2: P2, B: P2, n = 200): P2[] {
  return linspace(0, 1, n).map((u) => {
    const v = 1 - u;
    const a = v * v * v;
    const b = 3 * v * v * u;
    const c = 3 * v * u * u;
    const d = u * u * u;
    return [a * A[0] + b * C1[0] + c * C2[0] + d * B[0], a * A[1] + b * C1[1] + c * C2[1] + d * B[1]];
  });
}

export interface PathLengths {
  euclid: number;
  fr: number;
  cumFr: number[];
  cumEuclid: number[];
}

/** Euclidean and Fisher–Rao length of a polyline in (mu, sigma) — midpoint rule. */
export function gaussianPathLengths(path: P2[]): PathLengths {
  let e = 0;
  let f = 0;
  const cf = [0];
  const ce = [0];
  for (let i = 1; i < path.length; i++) {
    const dm = path[i][0] - path[i - 1][0];
    const ds = path[i][1] - path[i - 1][1];
    const sm = 0.5 * (path[i][1] + path[i - 1][1]);
    e += Math.hypot(dm, ds);
    f += frLineElement(dm, ds, sm);
    cf.push(f);
    ce.push(e);
  }
  return { euclid: e, fr: f, cumFr: cf, cumEuclid: ce };
}

// ------------------------------------------------------------------ spacetime (numerical)

export interface SpacetimeGeodesicOptions {
  nPoints?: number; // nodes used inside the energy during optimisation
  nOut?: number; // nodes of the returned curve
  nBasis?: number; // sine basis functions per coordinate
  iters?: number;
  tMin?: number;
  tMax?: number;
  bows?: number[]; // initial bows in t (multiple initialisations)
}

/** Smooth curve with fixed endpoints: gamma(u) = (1-u)A + uB + sum_k c_k sin(k pi u), t clamped to [tMin, tMax]. */
function sineCurve(A: Pt, B: Pt, c: number[][], n: number, tMin: number, tMax: number): Pt[] {
  return linspace(0, 1, n).map((u) => {
    let x = A[0] + u * (B[0] - A[0]);
    let t = A[1] + u * (B[1] - A[1]);
    c.forEach(([cx, ct], k) => {
      const b = Math.sin((k + 1) * Math.PI * u);
      x += cx * b;
      t += ct * b;
    });
    return [x, Math.min(tMax, Math.max(tMin, t))];
  });
}

function energy(m: Mix1D, s: Schedule, pts: Pt[]): number {
  let E = 0;
  for (let i = 1; i < pts.length; i++) {
    const d: [number, number] = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
    E += quadForm(spacetimeMetric(m, s, 0.5 * (pts[i][0] + pts[i - 1][0]), 0.5 * (pts[i][1] + pts[i - 1][1])), d);
  }
  return E * (pts.length - 1);
}

function frLength(m: Mix1D, s: Schedule, pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const d: [number, number] = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
    L += Math.sqrt(Math.max(quadForm(spacetimeMetric(m, s, 0.5 * (pts[i][0] + pts[i - 1][0]), 0.5 * (pts[i][1] + pts[i - 1][1])), d), 0));
  }
  return L;
}

/**
 * NUMERICAL geodesic in diffusion spacetime. The curve is a smooth sine series with fixed endpoints
 * (few parameters, so no node-level zig-zag); its discrete energy under the EXACT metric is minimised
 * with Adam on finite-difference gradients, from several initial curves. The winner is the curve with
 * the smallest Fisher–Rao length on a fine grid. It is an approximation and is labelled as such.
 */
export async function spacetimeGeodesic(
  m: Mix1D,
  s: Schedule,
  A: Pt,
  B: Pt,
  opts: SpacetimeGeodesicOptions = {},
  onProgress?: (frac: number) => void
): Promise<{ pts: Pt[]; energy: number; length: number; tried: number }> {
  const N = opts.nPoints ?? 41;
  const nOut = opts.nOut ?? N;
  const K = opts.nBasis ?? 6;
  const iters = opts.iters ?? 400;
  const tMin = opts.tMin ?? 0.03;
  const tMax = opts.tMax ?? 1;
  const bows = opts.bows ?? [0, 0.2, 0.45, -0.05];
  let best: { pts: Pt[]; energy: number; length: number } | null = null;
  let done = 0;
  for (const bow of bows) {
    const c = Array.from({ length: K }, (_, k) => [0, k === 0 ? bow : 0]);
    const mo = c.map(() => [0, 0]);
    const ve = c.map(() => [0, 0]);
    const lr = [0.04, 0.02];
    const f = () => energy(m, s, sineCurve(A, B, c, N, tMin, tMax));
    for (let it = 1; it <= iters; it++) {
      const decay = 1 - 0.95 * (it / iters);
      for (let k = 0; k < K; k++) {
        for (let d = 0; d < 2; d++) {
          const h = 1e-4;
          const o = c[k][d];
          c[k][d] = o + h;
          const ep = f();
          c[k][d] = o - h;
          const em = f();
          c[k][d] = o;
          const g = (ep - em) / (2 * h);
          mo[k][d] = 0.9 * mo[k][d] + 0.1 * g;
          ve[k][d] = 0.999 * ve[k][d] + 0.001 * g * g;
          const mh = mo[k][d] / (1 - 0.9 ** it);
          const vh = ve[k][d] / (1 - 0.999 ** it);
          c[k][d] -= (decay * lr[d] * mh) / (Math.sqrt(vh) + 1e-12);
        }
      }
      if (it % 25 === 0) {
        onProgress?.((done + it / iters) / bows.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    const fine = sineCurve(A, B, c, 401, tMin, tMax);
    const length = frLength(m, s, fine);
    if (!best || length < best.length) best = { pts: sineCurve(A, B, c, nOut, tMin, tMax), energy: f(), length };
    done++;
  }
  onProgress?.(1);
  return { ...best!, tried: bows.length };
}
