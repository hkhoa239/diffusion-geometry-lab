// Univariate Gaussian: density, CDF, and its exact Fisher–Rao geometry.

export const SQRT2PI = Math.sqrt(2 * Math.PI);

export function normPdf(x: number, mu: number, sd: number): number {
  const z = (x - mu) / sd;
  return Math.exp(-0.5 * z * z) / (sd * SQRT2PI);
}

export function normLogPdf(x: number, mu: number, sd: number): number {
  const z = (x - mu) / sd;
  return -0.5 * z * z - Math.log(sd * SQRT2PI);
}

/** erf with |error| < 1.2e-7 (Numerical Recipes erfc approximation). */
export function erf(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? 1 - r : r - 1;
}

export function normCdf(x: number, mu: number, sd: number): number {
  return 0.5 * (1 + erf((x - mu) / (sd * Math.SQRT2)));
}

/** P(a <= X <= b) for X ~ N(mu, sd^2). */
export function intervalProb(a: number, b: number, mu: number, sd: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return normCdf(hi, mu, sd) - normCdf(lo, mu, sd);
}

/** Fisher information of N(mu, sigma^2) in coordinates (mu, sigma): diag(1/s^2, 2/s^2). */
export function gaussianFisher(sigma: number): [[number, number], [number, number]] {
  const s2 = sigma * sigma;
  return [
    [1 / s2, 0],
    [0, 2 / s2],
  ];
}

/** Infinitesimal Fisher–Rao length of a displacement (dmu, dsigma) at sigma. */
export function frLineElement(dmu: number, dsigma: number, sigma: number): number {
  return Math.sqrt((dmu * dmu + 2 * dsigma * dsigma) / (sigma * sigma));
}

/**
 * Exact Fisher–Rao distance between N(mu1, s1^2) and N(mu2, s2^2).
 * With y = sqrt(2) sigma the metric is ds^2 = 2 (dmu^2 + dy^2) / y^2, i.e. sqrt(2) times the
 * hyperbolic upper half-plane, so d = sqrt(2) * arccosh(1 + (dmu^2 + 2 dsigma^2) / (4 s1 s2)).
 */
export function frDistanceGaussian(mu1: number, s1: number, mu2: number, s2: number): number {
  const arg = 1 + ((mu1 - mu2) ** 2 + 2 * (s1 - s2) ** 2) / (4 * s1 * s2);
  return Math.SQRT2 * Math.acosh(Math.max(1, arg));
}

export function linspace(a: number, b: number, n: number): number[] {
  if (n === 1) return [a];
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

/** Trapezoidal integral of samples ys on a uniform grid xs. */
export function trapz(xs: number[], ys: number[]): number {
  let s = 0;
  for (let i = 1; i < xs.length; i++) s += 0.5 * (ys[i] + ys[i - 1]) * (xs[i] - xs[i - 1]);
  return s;
}
