// Variance-preserving forward process x_t = alpha_t x_0 + sigma_t eps, sigma_t = sqrt(1 - alpha_t^2).
import { rng } from "./mixture";

export interface Schedule {
  id: string;
  label: string;
  alpha: (t: number) => number;
  dalpha: (t: number) => number; // d alpha / dt (analytic)
}

/** alpha_t = exp(-beta t / 2) with constant beta (the lesson's default). */
export function expSchedule(beta = 8): Schedule {
  return {
    id: "exp",
    label: `Hằng số β = ${beta}: α = exp(−βt/2)`,
    alpha: (t) => Math.exp((-beta * t) / 2),
    dalpha: (t) => (-beta / 2) * Math.exp((-beta * t) / 2),
  };
}

/** Song et al. (2021) VP-SDE: beta(t) = b0 + t (b1 - b0). */
export function linearSchedule(b0 = 0.1, b1 = 20): Schedule {
  const logA = (t: number) => -0.25 * t * t * (b1 - b0) - 0.5 * t * b0;
  return {
    id: "linear",
    label: "Tuyến tính (Song et al.): β(t) = 0.1 + 19.9 t",
    alpha: (t) => Math.exp(logA(t)),
    dalpha: (t) => Math.exp(logA(t)) * (-0.5 * t * (b1 - b0) - 0.5 * b0),
  };
}

/** Cosine schedule (Nichol & Dhariwal), alpha = cos(pi/2 (t+s)/(1+s)) / cos(pi/2 s/(1+s)), capped below 1. */
export function cosineSchedule(s = 0.008): Schedule {
  const f = (t: number) => Math.cos(((t + s) / (1 + s)) * (Math.PI / 2));
  const f0 = f(0);
  const tmax = 0.995;
  return {
    id: "cosine",
    label: "Cosine (Nichol & Dhariwal)",
    alpha: (t) => f(Math.min(t, tmax)) / f0,
    dalpha: (t) => (t > tmax ? 0 : (-Math.sin(((t + s) / (1 + s)) * (Math.PI / 2)) * (Math.PI / 2) / (1 + s)) / f0),
  };
}

export const SCHEDULES: Record<string, Schedule> = {
  exp: expSchedule(8),
  linear: linearSchedule(),
  cosine: cosineSchedule(),
};

export function sigmaOf(s: Schedule, t: number): number {
  const a = s.alpha(t);
  return Math.sqrt(Math.max(1 - a * a, 1e-300));
}

/** d sigma / dt = -alpha * dalpha / sigma. */
export function dsigmaOf(s: Schedule, t: number): number {
  return (-s.alpha(t) * s.dalpha(t)) / sigmaOf(s, t);
}

/**
 * Reproducible forward trajectories. Gaussian increments are drawn ONCE (seeded) and the exact
 * Ornstein–Uhlenbeck transition of the VP-SDE is applied step by step:
 *   x_{k+1} = (alpha_{k+1}/alpha_k) x_k + sqrt(1 - (alpha_{k+1}/alpha_k)^2) xi_k.
 * Every marginal is exactly alpha_t x_0 + sigma_t eps, and paths are continuous in t.
 */
export function forwardPaths(x0: number[], s: Schedule, nSteps: number, seed: number) {
  const r = rng(seed);
  const ts = Array.from({ length: nSteps + 1 }, (_, i) => i / nSteps);
  const xi = x0.map(() => Array.from({ length: nSteps }, () => r.normal()));
  const paths = x0.map((x, p) => {
    const out = [x];
    let cur = x;
    for (let k = 0; k < nSteps; k++) {
      const ratio = s.alpha(ts[k + 1]) / s.alpha(ts[k]);
      cur = ratio * cur + Math.sqrt(Math.max(1 - ratio * ratio, 0)) * xi[p][k];
      out.push(cur);
    }
    return out;
  });
  return { ts, paths };
}
