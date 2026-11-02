// Fisher–Rao geometry of diffusion spacetime z = (x_t, t) for a 1D Gaussian-mixture prior.
//
// The denoising posterior is an exponential family in x_0 (Karczewski et al., ICLR 2026):
//   p(x0 | x, t) ∝ q(x0) exp( eta(z)·T(x0) ),  T = (x0, x0^2),
//   eta(z) = ( alpha x / sigma^2 , -alpha^2 / (2 sigma^2) ).
// Hence  G(z) = J_eta^T Cov[T] J_eta  (exact), and the Jeffreys divergence between two points is
//   KL(p1||p2) + KL(p2||p1) = (eta1 - eta2)·(mu1 - mu2)  exactly, with mu = E[T].
import { linspace, trapz } from "./gaussian";
import { Mix1D, posterior, posteriorLogPdf, posteriorPdf, Posterior1D } from "./mixture";
import { dsigmaOf, Schedule, sigmaOf } from "./diffusion";

export type Mat2 = [[number, number], [number, number]];
export type Pt = [number, number]; // (x, t)

export function post(m: Mix1D, s: Schedule, x: number, t: number): Posterior1D {
  return posterior(m, x, s.alpha(t), sigmaOf(s, t));
}

/** Natural parameters eta(x, t). */
export function eta(s: Schedule, x: number, t: number): [number, number] {
  const a = s.alpha(t);
  const s2 = sigmaOf(s, t) ** 2;
  return [(a / s2) * x, -(a * a) / (2 * s2)];
}

/** Expectation parameters mu = E[T(x0) | x, t] = (E x0, E x0^2) from the exact posterior. */
export function expectation(m: Mix1D, s: Schedule, x: number, t: number): [number, number] {
  const p = post(m, s, x, t);
  let e1 = 0;
  let e2 = 0;
  p.w.forEach((w, k) => {
    e1 += w * p.m[k];
    e2 += w * (p.v[k] + p.m[k] * p.m[k]);
  });
  return [e1, e2];
}

/** Cov[T] for T = (x0, x0^2) under the posterior mixture (law of total covariance). */
export function covT(p: Posterior1D): Mat2 {
  const comps = p.w.map((w, k) => {
    const m = p.m[k];
    const v = p.v[k];
    return {
      w,
      E: [m, v + m * m],
      C: [
        [v, 2 * m * v],
        [2 * m * v, 2 * v * v + 4 * m * m * v],
      ],
    };
  });
  const E = [0, 0];
  comps.forEach((c) => {
    E[0] += c.w * c.E[0];
    E[1] += c.w * c.E[1];
  });
  const C: Mat2 = [
    [0, 0],
    [0, 0],
  ];
  comps.forEach((c) => {
    const d = [c.E[0] - E[0], c.E[1] - E[1]];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) C[i][j] += c.w * (c.C[i][j] + d[i] * d[j]);
  });
  return C;
}

/** J_eta = d eta / d(x, t), analytic. Rows: (eta1, eta2); columns: (x, t). */
export function jacEta(s: Schedule, x: number, t: number): Mat2 {
  const al = s.alpha(t);
  const dal = s.dalpha(t);
  const sg = sigmaOf(s, t);
  const dsg = dsigmaOf(s, t);
  const s2 = sg * sg;
  const a = al / s2;
  const da = dal / s2 - (2 * al * dsg) / (s2 * sg);
  const db = (-al * dal) / s2 + (al * al * dsg) / (s2 * sg);
  return [
    [a, da * x],
    [0, db],
  ];
}

/** EXACT spacetime Fisher–Rao metric G(x, t) = J^T Cov[T] J (2 x 2, coordinates (x, t)). */
export function spacetimeMetric(m: Mix1D, s: Schedule, x: number, t: number): Mat2 {
  const J = jacEta(s, x, t);
  const C = covT(post(m, s, x, t));
  const CJ = [
    [C[0][0] * J[0][0] + C[0][1] * J[1][0], C[0][0] * J[0][1] + C[0][1] * J[1][1]],
    [C[1][0] * J[0][0] + C[1][1] * J[1][0], C[1][0] * J[0][1] + C[1][1] * J[1][1]],
  ];
  return [
    [J[0][0] * CJ[0][0] + J[1][0] * CJ[1][0], J[0][0] * CJ[0][1] + J[1][0] * CJ[1][1]],
    [J[0][1] * CJ[0][0] + J[1][1] * CJ[1][0], J[0][1] * CJ[0][1] + J[1][1] * CJ[1][1]],
  ];
}

/**
 * NUMERICAL check of the same metric, without the exponential-family identity:
 * G_ab = ∫ p(x0|z) ∂_a log p(x0|z) ∂_b log p(x0|z) dx0, derivatives by central differences
 * in z, integral by the trapezoid rule on a grid wide enough to cover the posterior.
 */
export function spacetimeMetricNumeric(m: Mix1D, s: Schedule, x: number, t: number, nGrid = 4001): Mat2 {
  const p0 = post(m, s, x, t);
  const sds = p0.v.map(Math.sqrt);
  const lo = Math.min(...p0.m.map((mm, k) => mm - 12 * sds[k]));
  const hi = Math.max(...p0.m.map((mm, k) => mm + 12 * sds[k]));
  const xs = linspace(lo, hi, nGrid);
  const hx = 1e-5 * Math.max(1, Math.abs(x));
  const ht = 1e-6;
  const px1 = post(m, s, x + hx, t);
  const px0 = post(m, s, x - hx, t);
  const pt1 = post(m, s, x, t + ht);
  const pt0 = post(m, s, x, t - ht);
  const g: number[][] = [[], [], [], []];
  xs.forEach((x0) => {
    const r = posteriorPdf(p0, x0);
    const dx = (posteriorLogPdf(px1, x0) - posteriorLogPdf(px0, x0)) / (2 * hx);
    const dt = (posteriorLogPdf(pt1, x0) - posteriorLogPdf(pt0, x0)) / (2 * ht);
    g[0].push(r * dx * dx);
    g[1].push(r * dx * dt);
    g[3].push(r * dt * dt);
  });
  const gxt = trapz(xs, g[1]);
  return [
    [trapz(xs, g[0]), gxt],
    [gxt, trapz(xs, g[3])],
  ];
}

export function quadForm(G: Mat2, v: [number, number]): number {
  return G[0][0] * v[0] * v[0] + (G[0][1] + G[1][0]) * v[0] * v[1] + G[1][1] * v[1] * v[1];
}

export function eig2(G: Mat2): [number, number] {
  const a = G[0][0];
  const d = G[1][1];
  const b = 0.5 * (G[0][1] + G[1][0]);
  const tr = a + d;
  const disc = Math.sqrt(Math.max(((a - d) * (a - d)) / 4 + b * b, 0));
  return [tr / 2 - disc, tr / 2 + disc];
}

/** Jeffreys divergence KL(p1||p2) + KL(p2||p1) = Δeta · Δmu (exact for exponential families). */
export function jeffreys(m: Mix1D, s: Schedule, a: Pt, b: Pt): number {
  const ea = eta(s, a[0], a[1]);
  const eb = eta(s, b[0], b[1]);
  const ma = expectation(m, s, a[0], a[1]);
  const mb = expectation(m, s, b[0], b[1]);
  return (ea[0] - eb[0]) * (ma[0] - mb[0]) + (ea[1] - eb[1]) * (ma[1] - mb[1]);
}

/** KL(p(x0|a) || p(x0|b)) by quadrature (KL between Gaussian mixtures has no closed form). */
export function klPosteriors(m: Mix1D, s: Schedule, a: Pt, b: Pt, nGrid = 1201): number {
  const pa = post(m, s, a[0], a[1]);
  const pb = post(m, s, b[0], b[1]);
  const sds = pa.v.map(Math.sqrt);
  const lo = Math.min(...pa.m.map((mm, k) => mm - 10 * sds[k]));
  const hi = Math.max(...pa.m.map((mm, k) => mm + 10 * sds[k]));
  const xs = linspace(lo, hi, nGrid);
  return trapz(
    xs,
    xs.map((x0) => {
      const la = posteriorLogPdf(pa, x0);
      return Math.exp(la) * (la - posteriorLogPdf(pb, x0));
    })
  );
}

export interface CurveMeasures {
  euclid: number; // length in raw (x, t) coordinates
  fr: number; // Fisher–Rao length, midpoint rule with the exact metric
  frJeffreys: number; // sum sqrt(Jeffreys) — the paper's simulation-free estimator
  cumFr: number[]; // accumulated FR length at each node
  speed: number[]; // local FR speed |dz/du|_G at each node (u in [0,1])
}

/** Measure a polyline in spacetime. Never uses Euclidean length as a stand-in for FR length. */
export function measureCurve(m: Mix1D, s: Schedule, pts: Pt[]): CurveMeasures {
  const n = pts.length;
  let euclid = 0;
  let fr = 0;
  let frJ = 0;
  const cum = [0];
  const seg: number[] = [];
  for (let i = 1; i < n; i++) {
    const d: [number, number] = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
    euclid += Math.hypot(d[0], d[1]);
    const mid: Pt = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2];
    const ds = Math.sqrt(Math.max(quadForm(spacetimeMetric(m, s, mid[0], mid[1]), d), 0));
    seg.push(ds);
    fr += ds;
    frJ += Math.sqrt(Math.max(jeffreys(m, s, pts[i - 1], pts[i]), 0));
    cum.push(fr);
  }
  const speed = pts.map((_, i) => {
    const a = seg[Math.max(0, i - 1)];
    const b = seg[Math.min(seg.length - 1, i)];
    return ((i === 0 ? b : i === n - 1 ? a : 0.5 * (a + b)) * (n - 1));
  });
  return { euclid, fr, frJeffreys: frJ, cumFr: cum, speed };
}
