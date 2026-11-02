import { describe, expect, it } from "vitest";
import { frDistanceGaussian, intervalProb, linspace, normPdf, trapz } from "../lib/gaussian";
import { BIMODAL, diffuse, mixLogPdf, mixPdf, mixScore, posterior, posteriorPdf, ring2d } from "../lib/mixture";
import { forwardPaths, SCHEDULES, sigmaOf } from "../lib/diffusion";
import {
  eig2,
  expectation,
  jeffreys,
  klPosteriors,
  measureCurve,
  spacetimeMetric,
  spacetimeMetricNumeric,
} from "../lib/fisher";
import { bezier, gaussianGeodesic, gaussianPathLengths, spacetimeGeodesic, straightPath } from "../lib/geodesic";

const S = SCHEDULES.exp;
const relErr = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

describe("probability normalisation", () => {
  it("Gaussian integrates to 1 and interval probability matches quadrature", () => {
    const xs = linspace(-30, 30, 20001);
    expect(trapz(xs, xs.map((x) => normPdf(x, 0.7, 1.3)))).toBeCloseTo(1, 8);
    const q = linspace(-0.4, 1.9, 4001);
    expect(intervalProb(-0.4, 1.9, 0.7, 1.3)).toBeCloseTo(trapz(q, q.map((x) => normPdf(x, 0.7, 1.3))), 6);
  });

  it("diffused mixture integrates to 1 at every t", () => {
    const xs = linspace(-15, 15, 30001);
    for (const t of [0, 0.1, 0.5, 1]) {
      const m = diffuse(BIMODAL, S.alpha(t), sigmaOf(S, t));
      expect(trapz(xs, xs.map((x) => mixPdf(m, x)))).toBeCloseTo(1, 6);
    }
  });

  it("posterior p(x0|xt) is normalised and matches Bayes' rule on a grid", () => {
    const xs = linspace(-8, 8, 16001);
    for (const [x, t] of [
      [0.3, 0.2],
      [-1.5, 0.05],
      [2.5, 0.6],
    ]) {
      const a = S.alpha(t);
      const sg = sigmaOf(S, t);
      const p = posterior(BIMODAL, x, a, sg);
      expect(trapz(xs, xs.map((x0) => posteriorPdf(p, x0)))).toBeCloseTo(1, 6);
      // brute-force Bayes: prior * likelihood / evidence
      const joint = xs.map((x0) => mixPdf(BIMODAL, x0) * normPdf(x, a * x0, sg));
      const Z = trapz(xs, joint);
      const i = 9000;
      expect(relErr(posteriorPdf(p, xs[i]), joint[i] / Z)).toBeLessThan(1e-5);
      expect(relErr(Z, mixPdf(diffuse(BIMODAL, a, sg), x))).toBeLessThan(1e-6);
    }
  });
});

describe("score", () => {
  it("analytic score equals finite differences of log p (incl. low-density points)", () => {
    for (const t of [0.01, 0.2, 0.9]) {
      const m = diffuse(BIMODAL, S.alpha(t), sigmaOf(S, t));
      for (const x of [-6, -2.1, -0.3, 0, 1.7, 5.5]) {
        const h = 1e-5;
        const fd = (mixLogPdf(m, x + h) - mixLogPdf(m, x - h)) / (2 * h);
        expect(Math.abs(mixScore(m, x) - fd)).toBeLessThan(1e-4 * Math.max(1, Math.abs(fd)));
      }
    }
  });

  it("2D ring score equals finite differences", () => {
    const h = 1e-5;
    for (const [x, y] of [
      [0.4, -1.2],
      [3, 0.1],
      [-5, 4],
    ]) {
      const r = ring2d(x, y, 0.8, 0.6);
      const fx = (ring2d(x + h, y, 0.8, 0.6).logp - ring2d(x - h, y, 0.8, 0.6).logp) / (2 * h);
      const fy = (ring2d(x, y + h, 0.8, 0.6).logp - ring2d(x, y - h, 0.8, 0.6).logp) / (2 * h);
      expect(Math.abs(r.score[0] - fx)).toBeLessThan(1e-5 * Math.max(1, Math.abs(fx)));
      expect(Math.abs(r.score[1] - fy)).toBeLessThan(1e-5 * Math.max(1, Math.abs(fy)));
    }
  });
});

describe("forward process", () => {
  it("precomputed-increment paths have the exact marginal variance", () => {
    const n = 4000;
    const x0 = Array.from({ length: n }, () => 1.0);
    const { paths } = forwardPaths(x0, S, 50, 7);
    const t = 0.5;
    const k = 25;
    const xs = paths.map((p) => p[k]);
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    expect(Math.abs(mean - S.alpha(t))).toBeLessThan(4 * Math.sqrt(sigmaOf(S, t) ** 2 / n));
    expect(Math.abs(v - sigmaOf(S, t) ** 2)).toBeLessThan(0.06);
  });
});

describe("spacetime Fisher metric", () => {
  const pts: [number, number][] = [
    [0, 0.3],
    [-1.8, 0.35],
    [1.2, 0.6],
    [2.5, 0.1],
    [0.5, 0.9],
  ];
  it("is symmetric and positive semidefinite", () => {
    for (const [x, t] of pts) {
      const G = spacetimeMetric(BIMODAL, S, x, t);
      expect(Math.abs(G[0][1] - G[1][0])).toBeLessThan(1e-12 * Math.max(1, Math.abs(G[0][1])));
      expect(eig2(G)[0]).toBeGreaterThanOrEqual(-1e-10 * eig2(G)[1]);
    }
  });

  it("analytic metric matches numerical integration of the Fisher information", () => {
    for (const [x, t] of pts) {
      const G = spacetimeMetric(BIMODAL, S, x, t);
      const N = spacetimeMetricNumeric(BIMODAL, S, x, t);
      const scale = Math.hypot(G[0][0], G[1][1], G[0][1]);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) expect(Math.abs(G[i][j] - N[i][j]) / scale).toBeLessThan(1e-4);
    }
  });

  it("Jeffreys divergence = Δη·Δμ equals KL + KL by quadrature", () => {
    const a: [number, number] = [-1.2, 0.3];
    const b: [number, number] = [0.8, 0.45];
    const J = jeffreys(BIMODAL, S, a, b);
    const Q = klPosteriors(BIMODAL, S, a, b, 6001) + klPosteriors(BIMODAL, S, b, a, 6001);
    expect(relErr(J, Q)).toBeLessThan(1e-4);
    expect(expectation(BIMODAL, S, 0, 0.5)[0]).toBeCloseTo(0, 10);
  });

  it("curve length converges with resolution, and the Jeffreys estimator agrees", () => {
    const curve = (n: number) =>
      linspace(0, 1, n).map((u) => [-1.8 + 3.6 * u, 0.3 + 0.3 * Math.sin(Math.PI * u)] as [number, number]);
    const ref = measureCurve(BIMODAL, S, curve(4001)).fr;
    const e1 = Math.abs(measureCurve(BIMODAL, S, curve(51)).fr - ref);
    const e2 = Math.abs(measureCurve(BIMODAL, S, curve(201)).fr - ref);
    expect(e2).toBeLessThan(e1 / 8); // ~ O(N^-2): 4x points -> ~16x smaller
    const m = measureCurve(BIMODAL, S, curve(801));
    expect(relErr(m.frJeffreys, m.fr)).toBeLessThan(1e-4);
  });
});

describe("Gaussian Fisher–Rao geometry", () => {
  const A: [number, number] = [-2, 0.5];
  const B: [number, number] = [2, 0.5];

  it("geodesic length equals the closed-form distance", () => {
    const d = frDistanceGaussian(-2, 0.5, 2, 0.5);
    expect(d).toBeCloseTo(Math.SQRT2 * Math.acosh(17), 12);
    expect(relErr(gaussianPathLengths(gaussianGeodesic(A, B, 4000)).fr, d)).toBeLessThan(1e-6);
    // vertical geodesic
    expect(relErr(gaussianPathLengths(gaussianGeodesic([0, 0.5], [0, 2], 2000)).fr, frDistanceGaussian(0, 0.5, 0, 2))).toBeLessThan(1e-6);
  });

  it("straight line at constant sigma has FR length |Δμ|/σ = 8 and is longer than the geodesic", () => {
    const L = gaussianPathLengths(straightPath(A, B, 1000));
    expect(L.fr).toBeCloseTo(8, 9);
    expect(L.euclid).toBeCloseTo(4, 9);
    const G = gaussianPathLengths(gaussianGeodesic(A, B, 1000));
    expect(G.fr).toBeLessThan(L.fr);
    expect(G.euclid).toBeGreaterThan(L.euclid); // longer in Euclidean terms, shorter in FR terms
  });

  it("no Bézier path beats the geodesic", () => {
    const d = frDistanceGaussian(-2, 0.5, 2, 0.5);
    for (const h of [0.6, 1.2, 2, 3]) {
      const p = bezier(A, [-2, h], [2, h], B, 2000);
      expect(gaussianPathLengths(p).fr).toBeGreaterThan(d - 1e-9);
    }
  });

  it("FR length converges with resolution", () => {
    const p = (n: number) => bezier(A, [-1, 2], [1.5, 1.4], B, n);
    const ref = gaussianPathLengths(p(20000)).fr;
    const e1 = Math.abs(gaussianPathLengths(p(50)).fr - ref);
    const e2 = Math.abs(gaussianPathLengths(p(200)).fr - ref);
    expect(e2).toBeLessThan(e1 / 8);
  });
});

describe("numerical spacetime geodesic", () => {
  it("is never longer than the straight line between the same endpoints", async () => {
    const A: [number, number] = [-1.8, 0.3];
    const B: [number, number] = [1.8, 0.35];
    const g = await spacetimeGeodesic(BIMODAL, S, A, B, { iters: 300, bows: [0, 0.3] });
    const straight = linspace(0, 1, 41).map((u) => [A[0] + u * (B[0] - A[0]), A[1] + u * (B[1] - A[1])] as [number, number]);
    expect(measureCurve(BIMODAL, S, g.pts).fr).toBeLessThan(measureCurve(BIMODAL, S, straight).fr);
  }, 60000);
});

describe("lesson-6 geodesic (app settings)", () => {
  it("beats the straight and the bowed default curves and stays smooth", async () => {
    const A: [number, number] = [-1.6, 0.1];
    const B: [number, number] = [1.6, 0.12];
    const NC = 121;
    const straight = linspace(0, 1, NC).map((u) => [A[0] + u * (B[0] - A[0]), A[1] + u * (B[1] - A[1])] as [number, number]);
    const bowed = linspace(0, 1, NC).map((u) => [A[0] + u * (B[0] - A[0]), Math.min(1, A[1] + u * (B[1] - A[1]) + 0.45 * 4 * u * (1 - u))] as [number, number]);
    const g = await spacetimeGeodesic(BIMODAL, S, A, B, { nPoints: 41, nOut: NC, iters: 300, tMin: 0.03 });
    const Lg = measureCurve(BIMODAL, S, g.pts);
    const Ls = measureCurve(BIMODAL, S, straight);
    const Lb = measureCurve(BIMODAL, S, bowed);
    console.log(`FR lengths: geodesic ${Lg.fr.toFixed(3)}, straight ${Ls.fr.toFixed(3)}, bowed ${Lb.fr.toFixed(3)}; euclid geodesic ${Lg.euclid.toFixed(2)}`);
    expect(Lg.fr).toBeLessThan(Ls.fr);
    expect(Lg.fr).toBeLessThan(Lb.fr);
    expect(Lg.euclid).toBeLessThan(10); // no zig-zag
  }, 120000);
});
