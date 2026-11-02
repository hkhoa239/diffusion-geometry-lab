# Diffusion Geometry Lab

An interactive, Vietnamese-language learning app for diffusion models and information geometry. You learn by
dragging, playing animations and watching numbers change. Six lessons take you from a single Gaussian density to the
Fisher–Rao geometry of *diffusion spacetime* (Karczewski et al., ICLR 2026).

Everything runs in the browser on exact closed-form mathematics: no backend, no pretrained model, no GPU.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 16 numerical tests (vitest)
npm run build      # production build
```

Requires Node.js 18.18 or newer (developed with Node 22.12).

## Lessons

| # | Lesson | What you manipulate | What you should see |
|---|---|---|---|
| 1 | Phân phối xác suất là gì? (What is a probability distribution?) | μ, σ, draggable interval [a, b], density probe | Density is height and can exceed 1; probability is area |
| 2 | Khuếch tán làm gì? (What does diffusion do?) | time t, play/pause, noise schedule, number of particles | Two modes merge into N(0,1); KL(p_t ‖ N(0,1)) → 0 |
| 3 | Hàm score là gì? (What is a score function?) | 1D draggable x; 2D field with ∇log p vs ∇p; gradient ascent vs Langevin | Score is the local slope of log p; ∇p vanishes where ∇log p does not; Langevin keeps a distribution |
| 4 | Hình học thông tin là gì? (What is information geometry?) | drag a point in (μ, σ) space and a displacement arrow | One point = a whole Gaussian; the same step is "longer" when σ is small |
| 5 | Đường trắc địa Fisher–Rao (Fisher–Rao geodesics) | three paths with the same endpoints; editable Bézier; animation | The exact geodesic (a semicircle) is longer in Euclidean terms but shorter in Fisher–Rao terms (4.99 vs 8.00) |
| 6 | Hình học không–thời gian khuếch tán (Diffusion spacetime geometry) | drag z = (x_t, t); draw two curves; animate; numerical geodesic | The denoising posterior changes along a curve; Fisher–Rao length vs Euclidean length vs ΣKL |

Each lesson has a one-sentence intuition, one main equation, a "Bạn đang thấy gì?" (What are you seeing?)
explanation, and "Thử xem" (Try this) tasks that tick themselves off as you complete them (guided mode). It also has
tooltips on every symbol and a collapsible "Toán học chi tiết" (Detailed mathematics) section. The sidebar toggles are
"Hiện toán học" (show mathematics), "Chế độ hướng dẫn" (guided mode) and "Giao diện tối" (dark mode).

## Mathematics (lib/)

| File | Content |
|---|---|
| `gaussian.ts` | pdf, CDF, interval probability, Gaussian Fisher metric, exact Fisher–Rao distance `√2·arccosh(1 + (Δμ² + 2Δσ²)/(4σ₁σ₂))` |
| `mixture.ts` | Gaussian mixtures: log-sum-exp density, analytic score, diffusion, exact Bayes posterior p(x₀ \| x_t); 8-Gaussian ring in 2D; seeded RNG |
| `diffusion.ts` | VP schedules (α = exp(−βt/2), Song et al. linear-β, cosine) with analytic dα/dt; forward paths from **precomputed** Brownian increments with the exact Ornstein–Uhlenbeck transition, so trajectories are continuous and reproducible |
| `fisher.ts` | Spacetime metric **G = J_ηᵀ Cov[T] J_η** (exponential-family form, exact); an independent quadrature check of the Fisher definition; Jeffreys divergence Δη·Δμ; KL by quadrature; curve measures |
| `geodesic.ts` | Exact Gaussian geodesic (semicircle in (μ, √2σ), constant-speed parametrisation); Bézier and straight paths; **numerical** spacetime geodesic (smooth sine-series curve, Adam on the exact-metric energy, four initialisations, best by measured length), labelled "xấp xỉ số" (numerical approximation) in the UI |

### Numerical checks (`tests/math.test.ts`)

- normalisation of the Gaussian, the diffused mixture, and the posterior (checked against brute-force Bayes on a grid)
- analytic score vs finite differences (1D, including low-density points; 2D ring)
- forward paths reproduce the exact marginal variance
- spacetime Fisher metric: symmetric, PSD, and equal to numerical integration of E[∂log p ∂log p] (to 1e-4)
- Jeffreys identity: Δη·Δμ equals KL + KL computed by quadrature
- curve length converges as O(N⁻²); the Jeffreys estimator agrees with the metric length
- Gaussian geodesic length equals the closed form √2·arccosh(17); the straight line has length 8; no Bézier path beats the geodesic; convergence with resolution
- the lesson-6 numerical geodesic is shorter than both default curves and does not zig-zag

Lesson 6 also shows a live check at the current point: the analytic metric next to the quadrature metric, and their
relative difference (typically about 1e-10).

## Design

- Colour meanings are consistent across lessons: **blue** = distributions, **orange** = noisy data, **purple** = score,
  **green** = geodesic, **gray** = Euclidean path, **pink** = your own path.
- Layout: chapter sidebar on the left, a large visualisation in the centre, and a context panel on the right
  (equation, controls, live measurements, explanation, tasks, detailed maths). On tablets the sidebar becomes a drawer
  and the panel moves below the visualisation.

## Deviations from the brief

- **Charts:** all charts use D3 (scales, shapes, contours) rendered as SVG/Canvas, instead of Plotly.js or Observable
  Plot. Direct manipulation (drag handles, freehand drawing, 60 fps animation) is simpler and faster without a charting
  layer.
- **shadcn/ui:** components are implemented in the shadcn style (Radix primitives + Tailwind) in `components/ui/`,
  rather than generated with the shadcn CLI.
- **Lesson 3, 2D:** the ring has radius 3 (instead of a larger circle) so that all eight modes fit the view at every
  noise level.
- **Lesson 6 geodesic:** it is a numerical approximation, and the UI says so. Many curves that rise into higher noise
  are almost equally short; this flat valley of near-geodesics is pointed out in the lesson.
