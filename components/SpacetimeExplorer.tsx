"use client";
import * as d3 from "d3";
import { motion } from "framer-motion";
import { Loader2, Pause, PenLine, Play, RotateCcw, Route } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { linspace, normPdf } from "@/lib/gaussian";
import { BIMODAL, diffuse, mixPdf, posteriorPdf } from "@/lib/mixture";
import { SCHEDULES, sigmaOf } from "@/lib/diffusion";
import {
  klPosteriors,
  measureCurve,
  post,
  Pt,
  spacetimeMetric,
  spacetimeMetricNumeric,
} from "@/lib/fisher";
import { spacetimeGeodesic } from "@/lib/geodesic";
import { cn, fmt } from "@/lib/utils";
import { areaPath, Axes, clamp, linePath, M, useSize, useSvgDrag } from "./charts/Chart";
import { Figure, Key, LessonShell } from "./LessonShell";
import { useSettings } from "./Settings";
import { Button, Slider, Stat, Switch, Sym, Tex } from "./ui";

const S = SCHEDULES.exp; // alpha_t = exp(-4 t)
const T_MIN = 0.03;
const XR: [number, number] = [-3.6, 3.6];
const A: Pt = [-1.6, 0.1]; // (x, t)
const B: Pt = [1.6, 0.12];
const NC = 121; // nodes per curve

type CurveId = "c1" | "c2" | "geo";
const CURVE_META: Record<CurveId, { label: string; color: string }> = {
  c1: { label: "Đường 1", color: "var(--c-euclid)" },
  c2: { label: "Đường 2", color: "var(--c-user)" },
  geo: { label: "Trắc địa (xấp xỉ số)", color: "var(--c-geo)" },
};

function sameFlags<T extends Record<string, boolean>>(a: T, b: T) {
  return Object.keys(a).every((k) => a[k] === b[k]);
}

function straight(): Pt[] {
  return linspace(0, 1, NC).map((u) => [A[0] + u * (B[0] - A[0]), A[1] + u * (B[1] - A[1])]);
}
function bowed(h: number): Pt[] {
  return linspace(0, 1, NC).map((u) => [A[0] + u * (B[0] - A[0]), clamp(A[1] + u * (B[1] - A[1]) + h * 4 * u * (1 - u), T_MIN, 1)]);
}
// Default "curve 2" dips towards LOW noise: crossing the clean region between the modes is expensive.
const C2_DEFAULT = -0.06;

/** Turn a free-hand stroke into a curve with the fixed endpoints: affine endpoint correction, smoothing, resampling. */
function strokeToCurve(stroke: Pt[]): Pt[] | null {
  if (stroke.length < 4) return null;
  const cum = [0];
  for (let i = 1; i < stroke.length; i++) cum.push(cum[i - 1] + Math.hypot(stroke[i][0] - stroke[i - 1][0], (stroke[i][1] - stroke[i - 1][1]) * 6));
  const L = cum[cum.length - 1];
  if (L < 1e-6) return null;
  const s = cum.map((c) => c / L);
  const n = stroke.length - 1;
  let pts: Pt[] = stroke.map((p, i) => [
    p[0] + (A[0] - stroke[0][0]) * (1 - s[i]) + (B[0] - stroke[n][0]) * s[i],
    p[1] + (A[1] - stroke[0][1]) * (1 - s[i]) + (B[1] - stroke[n][1]) * s[i],
  ]);
  // resample uniformly in the stroke parameter
  const res: Pt[] = linspace(0, 1, NC).map((u) => {
    let j = 1;
    while (j < s.length - 1 && s[j] < u) j++;
    const w = (u - s[j - 1]) / Math.max(s[j] - s[j - 1], 1e-12);
    return [pts[j - 1][0] + w * (pts[j][0] - pts[j - 1][0]), pts[j - 1][1] + w * (pts[j][1] - pts[j - 1][1])];
  });
  // light smoothing, endpoints fixed
  pts = res;
  for (let it = 0; it < 4; it++) pts = pts.map((p, i) => (i === 0 || i === NC - 1 ? p : [(pts[i - 1][0] + 2 * p[0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * p[1] + pts[i + 1][1]) / 4]));
  return pts.map(([x, t]) => [clamp(x, XR[0], XR[1]), clamp(t, T_MIN, 1)]);
}

function klSum(curve: Pt[], n: number): number {
  const idx = linspace(0, curve.length - 1, n).map(Math.round);
  let s = 0;
  for (let i = 1; i < idx.length; i++) s += klPosteriors(BIMODAL, S, curve[idx[i - 1]], curve[idx[i]], 801);
  return s;
}

export default function SpacetimeExplorer() {
  const { dark } = useSettings();
  const [z, setZ] = useState<Pt>([-0.4, 0.2]);
  const [curves, setCurves] = useState<Record<CurveId, Pt[] | null>>({ c1: straight(), c2: bowed(C2_DEFAULT), geo: null });
  const [sel, setSel] = useState<CurveId>("c1");
  const [u, setU] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(false);
  const [draw, setDraw] = useState<"c1" | "c2" | null>(null);
  const [stroke, setStroke] = useState<Pt[]>([]);
  const [geoBusy, setGeoBusy] = useState<number | null>(null);
  const [showBall, setShowBall] = useState(true);
  const [prog, setProg] = useState({ boundary: false, prior: false, drew: false, geo: false, ran: false });

  const curve = curves[sel] ?? curves.c1!;
  const idx = Math.round(u * (NC - 1));
  const zc: Pt = follow ? curve[idx] : z;
  const [xt, t] = zc;
  const alpha = S.alpha(t);
  const sigma = sigmaOf(S, t);
  const P = post(BIMODAL, S, xt, t);
  const G = spacetimeMetric(BIMODAL, S, xt, t);
  const Gn = useMemo(() => spacetimeMetricNumeric(BIMODAL, S, xt, t, 1601), [xt, t]);
  const gRelErr = Math.max(Math.abs(G[0][0] - Gn[0][0]) / G[0][0], Math.abs(G[1][1] - Gn[1][1]) / G[1][1], Math.abs(G[0][1] - Gn[0][1]) / Math.sqrt(G[0][0] * G[1][1]));

  const meas = useMemo(() => {
    const out: Partial<Record<CurveId, ReturnType<typeof measureCurve> & { kl60: number; kl240: number }>> = {};
    (Object.keys(curves) as CurveId[]).forEach((k) => {
      const c = curves[k];
      if (!c) return;
      out[k] = { ...measureCurve(BIMODAL, S, c), kl60: klSum(c, 31), kl240: klSum(c, NC) };
    });
    return out;
  }, [curves]);
  const m = meas[sel] ?? meas.c1!;

  const w0 = P.w[0];
  useEffect(() => {
    setProg((p) => {
      const n = {
        boundary: p.boundary || (Math.abs(w0 - 0.5) < 0.04 && t < 0.3),
        prior: p.prior || t > 0.7,
        drew: p.drew,
        geo: p.geo || !!curves.geo,
        ran: p.ran || (follow && u > 0.98),
      };
      return sameFlags(p, n) ? p : n;
    });
  }, [w0, t, curves.geo, follow, u]);

  // animation along the selected curve
  useEffect(() => {
    if (!playing) return;
    let id: number;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setU((v) => Math.min(1, v + dt * 0.15));
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  useEffect(() => {
    if (playing && u >= 1) setPlaying(false);
  }, [playing, u]);

  const computeGeodesic = async () => {
    setGeoBusy(0);
    const g = await spacetimeGeodesic(BIMODAL, S, A, B, { nPoints: 41, nOut: NC, iters: 300, tMin: T_MIN }, (f) => setGeoBusy(f));
    setCurves((c) => ({ ...c, geo: g.pts }));
    setGeoBusy(null);
  };

  // ---------------- spacetime plot
  const [refC, sC] = useSize<HTMLDivElement>();
  const HC = 400;
  const xs = d3.scaleLinear().domain([0, 1]).range([M.left, sC.width - M.right]); // t axis
  const ys = d3.scaleLinear().domain(XR).range([HC - M.bottom, M.top]); // x axis
  const toPx = (p: Pt): [number, number] => [xs(p[1]), ys(p[0])];
  const curvePath = (c: Pt[]) => d3.line<Pt>().x((p) => xs(p[1])).y((p) => ys(p[0]))(c) ?? "";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const NX = 120;
    const NT = 160;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(NT, NX);
    // theme-aware ramp: from the surface colour to the distribution blue
    const col = dark ? d3.interpolateRgb("#1a1a18", "#4d93ea") : d3.interpolateRgb("#f4f8fe", "#2a78d6");
    for (let i = 0; i < NT; i++) {
      const tt = Math.max(0.005, (i + 0.5) / NT);
      const mt = diffuse(BIMODAL, S.alpha(tt), sigmaOf(S, tt));
      const vals = linspace(XR[1], XR[0], NX).map((x) => mixPdf(mt, x));
      const mx = Math.max(...vals);
      vals.forEach((v, j) => {
        const c = d3.rgb(col(0.05 + 0.7 * Math.sqrt(v / mx)));
        const k = 4 * (j * NT + i);
        img.data[k] = c.r;
        img.data[k + 1] = c.g;
        img.data[k + 2] = c.b;
        img.data[k + 3] = 150;
      });
    }
    ctx.putImageData(img, 0, 0);
  }, [dark]);

  const dragZ = useSvgDrag(
    useCallback(
      (px: number, py: number) => {
        setFollow(false);
        setPlaying(false);
        setZ([clamp(ys.invert(py), XR[0], XR[1]), clamp(xs.invert(px), T_MIN, 1)]);
      },
      [xs, ys]
    )
  );

  const onDrawDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draw) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    setStroke([[ys.invert(e.clientY - r.top), xs.invert(e.clientX - r.left)]]);
  };
  const onDrawMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draw || stroke.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    setStroke((s) => [...s, [ys.invert(e.clientY - r.top), xs.invert(e.clientX - r.left)]]);
  };
  const onDrawUp = () => {
    if (!draw) return;
    const c = strokeToCurve(stroke);
    if (c) {
      setCurves((cs) => ({ ...cs, [draw]: c }));
      setSel(draw);
      setProg((p) => ({ ...p, drew: true }));
    }
    setStroke([]);
    setDraw(null);
  };

  // FR unit ball at z: v = eps * G^{-1/2} (cos, sin)
  const ball = useMemo(() => {
    const a = G[0][0];
    const b = G[0][1];
    const d = G[1][1];
    const tr = a + d;
    const disc = Math.sqrt(((a - d) * (a - d)) / 4 + b * b);
    const l1 = tr / 2 + disc;
    const l2 = tr / 2 - disc;
    const v1: [number, number] = Math.abs(b) > 1e-12 ? [l1 - d, b] : a >= d ? [1, 0] : [0, 1];
    const n1 = Math.hypot(v1[0], v1[1]);
    const e1: [number, number] = [v1[0] / n1, v1[1] / n1];
    const e2: [number, number] = [-e1[1], e1[0]];
    const eps = 0.5;
    return linspace(0, 2 * Math.PI, 80).map((th) => {
      const c1 = (eps * Math.cos(th)) / Math.sqrt(Math.max(l1, 1e-12));
      const c2 = (eps * Math.sin(th)) / Math.sqrt(Math.max(l2, 1e-12));
      return [xt + c1 * e1[0] + c2 * e2[0], t + c1 * e1[1] + c2 * e2[1]] as Pt;
    });
  }, [G, xt, t]);

  // ---------------- small panels
  const [refA, sA] = useSize<HTMLDivElement>();
  const HS = 220;
  const xg = useMemo(() => linspace(-4, 4, 400), []);
  const mt = diffuse(BIMODAL, alpha, sigma);
  const pt = xg.map((v) => [v, mixPdf(mt, v)] as [number, number]);
  const xa = d3.scaleLinear().domain([-4, 4]).range([M.left, sA.width - M.right]);
  const ya = d3.scaleLinear().domain([0, Math.max(0.5, d3.max(pt, (p) => p[1])! * 1.15)]).range([HS - M.bottom, M.top]);
  const dragX = useSvgDrag(
    useCallback(
      (px: number) => {
        setFollow(false);
        setPlaying(false);
        setZ([clamp(xa.invert(px), XR[0], XR[1]), t]);
      },
      [xa, t]
    )
  );
  const postCurve = xg.map((v) => [v, posteriorPdf(P, v)] as [number, number]);
  const yb = d3.scaleLinear().domain([0, Math.max(1.4, d3.max(postCurve, (p) => p[1])! * 1.1)]).range([HS - M.bottom, M.top]);
  const prior = xg.map((v) => [v, mixPdf(BIMODAL, v)] as [number, number]);

  const speedHere = m.speed[idx];

  return (
    <LessonShell
      index={6}
      title="Hình học không–thời gian khuếch tán"
      intuition={
        <>
          Mỗi điểm <Tex math="z=(x_t,t)" /> xác định một <b>phân phối khử nhiễu</b> <Tex math="p(x_0\mid x_t,t)" />. Đi trong không–thời gian là đi qua một họ
          phân phối.
        </>
      }
      equation={String.raw`\begin{aligned}G_{ab}(z)=\mathbb E_{x_0\sim p(x_0\mid z)}\big[&\partial_{z_a}\log p(x_0\mid z)\\ \cdot\;&\partial_{z_b}\log p(x_0\mid z)\big]\end{aligned}`}
      equationNote={
        <>
          <Sym tex="z" tip="Điểm không–thời gian: một quan sát nhiễu x_t tại thời điểm t." />,{" "}
          <Sym tex="p(x_0\mid z)" tip="Phân phối các dữ liệu sạch có thể đã tạo ra quan sát nhiễu x_t (Bayes)." />. Metric Fisher đo phân phối khử nhiễu đổi nhanh
          thế nào khi z di chuyển — tính chính xác từ hỗn hợp Gauss.
        </>
      }
      main={
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-geo/40 bg-[color-mix(in_srgb,var(--c-geo)_8%,transparent)] px-4 py-3 text-[15px] leading-relaxed text-ink">
            Di chuyển trong không–thời gian khuếch tán làm thay đổi phân phối của các ảnh sạch có thể có. <b>Độ dài Fisher–Rao</b> đo tổng lượng thay đổi tích luỹ của
            các phân phối khử nhiễu đó.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Figure
              title={`A · Khuếch tán thuận: p_t(x) tại t = ${t.toFixed(2)}`}
              legend={
                <>
                  <Key color="var(--c-dist)">p_t</Key>
                  <Key color="var(--c-noise)">quan sát x_t</Key>
                </>
              }
            >
              <div ref={refA} className="w-full">
                <svg width={sA.width} height={HS}>
                  <Axes x={xa} y={ya} width={sA.width} height={HS} yTicks={3} xTicks={6} xLabel="x_t" />
                  <path d={areaPath(pt, xa, ya)} fill="var(--c-dist-soft)" />
                  <path d={linePath(pt, xa, ya)} fill="none" stroke="var(--c-dist)" strokeWidth={2.3} />
                  <line x1={xa(xt)} x2={xa(xt)} y1={ya(0)} y2={M.top} stroke="var(--c-noise)" strokeWidth={2} />
                  <circle className="handle" cx={xa(xt)} cy={ya(mixPdf(mt, xt))} r={8} fill="var(--c-noise)" stroke="white" strokeWidth={2} {...dragX} />
                </svg>
              </div>
            </Figure>
            <Figure
              title="B · Phân phối khử nhiễu p(x₀ | xₜ, t)"
              legend={
                <>
                  <Key color="var(--c-dist)">hậu nghiệm</Key>
                  <Key color="var(--c-euclid)" dashed>
                    tiên nghiệm p(x₀)
                  </Key>
                </>
              }
            >
              <svg width={sA.width} height={HS}>
                <Axes x={xa} y={yb} width={sA.width} height={HS} yTicks={3} xTicks={6} xLabel="x₀" />
                <path d={linePath(prior.map(([a, b]) => [a, Math.min(b, yb.domain()[1])]), xa, yb)} fill="none" stroke="var(--c-euclid)" strokeDasharray="4 4" />
                {P.w.map((w, k) => (
                  <path
                    key={k}
                    d={linePath(xg.map((v) => [v, Math.min(w * normPdf(v, P.m[k], Math.sqrt(P.v[k])), yb.domain()[1])]), xa, yb)}
                    fill="none"
                    stroke="var(--c-dist)"
                    strokeOpacity={0.55}
                    strokeDasharray="2 3"
                  />
                ))}
                <motion.path d={areaPath(postCurve.map(([a, b]) => [a, Math.min(b, yb.domain()[1])]), xa, yb)} fill="var(--c-dist-soft)" />
                <path d={linePath(postCurve.map(([a, b]) => [a, Math.min(b, yb.domain()[1])]), xa, yb)} fill="none" stroke="var(--c-dist)" strokeWidth={2.6} />
                {P.w.map((w, k) => (
                  <g key={k} transform={`translate(${sA.width - M.right - 118}, ${M.top + 4 + k * 20})`}>
                    <text x={0} y={10} fontSize={11} fill="var(--ink-3)">
                      w{k + 1}
                    </text>
                    <rect x={22} y={2} width={70} height={9} rx={4} fill="var(--surface-2)" />
                    <rect x={22} y={2} width={70 * w} height={9} rx={4} fill="var(--c-dist)" />
                    <text x={96} y={10} fontSize={11} fill="var(--ink)">
                      {w.toFixed(2)}
                    </text>
                  </g>
                ))}
              </svg>
            </Figure>
          </div>
          <Figure
            title="C · Không–thời gian (t, x): nền là mật độ nhiễu p_t(x)"
            legend={
              <>
                {(Object.keys(CURVE_META) as CurveId[])
                  .filter((k) => curves[k])
                  .map((k) => (
                    <Key key={k} color={CURVE_META[k].color} dashed={k === "geo"}>
                      {CURVE_META[k].label}
                    </Key>
                  ))}
                {showBall && <Key color="var(--c-geo)">quả cầu Fisher tại z</Key>}
              </>
            }
          >
            <div ref={refC} className="relative w-full">
              <canvas
                ref={canvasRef}
                width={160}
                height={120}
                className="absolute"
                style={{ left: M.left, top: M.top, width: sC.width - M.left - M.right, height: HC - M.top - M.bottom }}
              />
              <svg
                width={sC.width}
                height={HC}
                className={cn("relative select-none", draw && "cursor-crosshair")}
                onPointerDown={onDrawDown}
                onPointerMove={onDrawMove}
                onPointerUp={onDrawUp}
              >
                <Axes x={xs} y={ys} width={sC.width} height={HC} xLabel="thời gian t (nhiễu tăng →)" yLabel="x_t" grid={false} />
                {(Object.keys(CURVE_META) as CurveId[]).map((k) =>
                  curves[k] ? (
                    <path
                      key={k}
                      d={curvePath(curves[k]!)}
                      fill="none"
                      stroke={CURVE_META[k].color}
                      strokeWidth={k === sel ? 4 : 2.2}
                      strokeDasharray={k === "geo" ? "8 5" : undefined}
                      opacity={k === sel ? 1 : 0.7}
                    />
                  ) : null
                )}
                {stroke.length > 1 && <path d={curvePath(stroke)} fill="none" stroke="var(--c-user)" strokeWidth={2} strokeDasharray="3 3" />}
                {showBall && <path d={curvePath(ball) + "Z"} fill="var(--c-geo)" fillOpacity={0.15} stroke="var(--c-geo)" strokeWidth={1.5} />}
                {[
                  { p: A, n: "A" },
                  { p: B, n: "B" },
                ].map(({ p, n }) => (
                  <g key={n}>
                    <circle cx={toPx(p)[0]} cy={toPx(p)[1]} r={7} fill="var(--ink)" />
                    <text x={toPx(p)[0] - 14} y={toPx(p)[1] + 4} fontWeight={700} fontSize={13} fill="var(--ink)" textAnchor="end">
                      {n}
                    </text>
                  </g>
                ))}
                {!draw && <circle className="handle" cx={toPx(zc)[0]} cy={toPx(zc)[1]} r={10} fill="var(--c-noise)" stroke="white" strokeWidth={3} {...dragZ} />}
                {!draw && (
                  <text x={toPx(zc)[0] + 14} y={toPx(zc)[1] - 10} fontSize={12} fontWeight={600} fill="var(--ink)">
                    z = ({fmt(xt, 2)}, {fmt(t, 2)})
                  </text>
                )}
                {draw && (
                  <text x={sC.width / 2} y={M.top + 18} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--c-user)">
                    Vẽ một đường từ gần A tới gần B — hai đầu sẽ được gắn đúng vào A và B
                  </text>
                )}
              </svg>
            </div>
          </Figure>
          <Figure title="So sánh ba đại lượng trên mỗi đường (cùng hai đầu A, B)">
            <CompareTable meas={meas} sel={sel} />
          </Figure>
        </div>
      }
      controls={
        <>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
            {(Object.keys(CURVE_META) as CurveId[]).map((k) => (
              <button
                key={k}
                disabled={!curves[k]}
                onClick={() => (setSel(k), setU(0), setFollow(true))}
                className={cn("rounded-lg px-2 py-1.5 text-[12px] font-medium disabled:opacity-30", sel === k ? "bg-surface text-ink shadow-sm" : "text-ink-3")}
                style={sel === k ? { boxShadow: `inset 0 -3px 0 ${CURVE_META[k].color}` } : undefined}
              >
                {CURVE_META[k].label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setFollow(true);
                if (u >= 1) setU(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "Tạm dừng" : "Đi dọc đường"}
            </Button>
            <Button onClick={() => setDraw("c1")}>
              <PenLine size={14} /> Vẽ đường 1
            </Button>
            <Button onClick={() => setDraw("c2")}>
              <PenLine size={14} /> Vẽ đường 2
            </Button>
          </div>
          <Slider
            label="Tiến độ dọc đường chọn"
            value={u}
            min={0}
            max={1}
            step={0.001}
            onChange={(v) => (setFollow(true), setPlaying(false), setU(v))}
            accent={CURVE_META[sel].color}
          />
          <Slider label={<>Thời gian <Tex math="t" /> của z</>} value={t} min={T_MIN} max={1} step={0.001} onChange={(v) => (setFollow(false), setZ([xt, v]))} accent="var(--c-noise)" />
          <Slider label={<>Quan sát nhiễu <Tex math="x_t" /></>} value={xt} min={XR[0]} max={XR[1]} step={0.01} onChange={(v) => (setFollow(false), setZ([v, t]))} accent="var(--c-noise)" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={computeGeodesic} disabled={geoBusy !== null}>
              {geoBusy !== null ? <Loader2 size={14} className="animate-spin" /> : <Route size={14} />}
              {geoBusy !== null ? `Đang tối ưu… ${Math.round(geoBusy * 100)}%` : "Tính trắc địa (xấp xỉ số)"}
            </Button>
            <Button variant="ghost" onClick={() => setCurves({ c1: straight(), c2: bowed(C2_DEFAULT), geo: curves.geo })}>
              <RotateCcw size={14} /> Đặt lại đường
            </Button>
          </div>
          <Switch label="Hiện quả cầu Fisher tại z" checked={showBall} onChange={setShowBall} />
        </>
      }
      measures={
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="tốc độ FR cục bộ" value={follow ? fmt(speedHere, 2) : "—"} color={CURVE_META[sel].color} hint="|dz/du| theo metric G" />
            <Stat label="FR đã tích luỹ" value={follow ? fmt(m.cumFr[idx], 3) : "—"} color={CURVE_META[sel].color} hint={`/ ${fmt(m.fr, 3)} tổng`} />
            <Stat label="trọng số hậu nghiệm" value={`${fmt(P.w[0], 2)} / ${fmt(P.w[1], 2)}`} color="var(--c-dist)" />
            <Stat label="α_t / σ_t" value={`${fmt(alpha, 2)} / ${fmt(sigma, 2)}`} />
          </div>
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-ink-2">
            <div className="mb-1 font-semibold text-ink">Kiểm chứng metric tại z</div>
            <div className="font-mono text-[11.5px] leading-relaxed">
              G giải tích = [{G[0][0].toExponential(3)}, {G[0][1].toExponential(3)}; {G[1][1].toExponential(3)}]
              <br />G tích phân số = [{Gn[0][0].toExponential(3)}, {Gn[0][1].toExponential(3)}; {Gn[1][1].toExponential(3)}]
            </div>
            <div className={cn("mt-1", gRelErr < 1e-3 ? "text-geo" : "text-noise")}>sai lệch tương đối: {gRelErr.toExponential(1)}</div>
          </div>
        </div>
      }
      explanation={
        <>
          <p>
            Kéo chấm cam (z). Khi <Tex math="x_t" /> ở giữa hai cụm, hậu nghiệm có <b>hai đỉnh</b>: dữ liệu sạch có thể đến từ cả hai phía. Khi <Tex math="t" />{" "}
            lớn, hậu nghiệm gần như bằng tiên nghiệm — quan sát nhiễu gần như không còn thông tin.
          </p>
          <p>
            Elip xanh lá là các bước có cùng “độ dài thông tin”. Nó rất hẹp theo chiều x khi t nhỏ (đổi x_t một chút làm hậu nghiệm đổi nhiều), và rộng khi t lớn.
          </p>
          <p>
            Vì thế đường ngắn nhất từ A tới B thường <b>đi vòng lên vùng nhiễu cao hơn</b> để vượt qua ranh giới giữa hai cụm một cách “rẻ” — giống bài 5, nơi trắc địa
            làm Gauss rộng ra trước. Ngược lại, đường 2 lặn xuống vùng ít nhiễu nên phải trả giá đắt.
          </p>
          <p className="text-[12.5px] text-ink-3">
            Lưu ý: ở đây có cả một “thung lũng” các đường gần như ngắn nhất — mọi đường vồng lên vừa phải đều dài xấp xỉ trắc địa. Trắc địa không nhất thiết là đường duy
            nhất, nên hãy so sánh <b>độ dài</b>, đừng chỉ so hình dạng.
          </p>
        </>
      }
      tasks={[
        { text: "Kéo z tới chỗ hậu nghiệm chia đều hai cụm (w₁ ≈ w₂ ≈ 0.5) với t < 0.3.", done: prog.boundary },
        { text: "Tăng t lên > 0.7. Hậu nghiệm giống phân phối nào?", done: prog.prior },
        { text: "Vẽ đường của riêng bạn từ A tới B và so sánh độ dài Fisher–Rao.", done: prog.drew },
        { text: "Tính trắc địa (xấp xỉ số). Nó đi qua vùng t lớn hay nhỏ?", done: prog.geo },
        { text: "Chọn một đường và bấm “Đi dọc đường” tới cuối; quan sát hậu nghiệm thay đổi.", done: prog.ran },
      ]}
      math={
        <>
          <p>Hậu nghiệm là một họ mũ theo x₀ (Karczewski et al., ICLR 2026):</p>
          <Tex math={String.raw`p(x_0\mid z)\propto p(x_0)\,e^{\eta(z)^\top T(x_0)},\ \ T=(x_0,x_0^2),\ \ \eta=\Big(\tfrac{\alpha_t x_t}{\sigma_t^2},-\tfrac{\alpha_t^2}{2\sigma_t^2}\Big)`} block />
          <p>Do đó metric chính xác là</p>
          <Tex math={String.raw`G(z)=J_\eta^\top\,\mathrm{Cov}[T(x_0)\mid z]\,J_\eta`} block />
          <p>
            Bảng “kiểm chứng” so sánh công thức này với tích phân số trực tiếp của định nghĩa Fisher. Độ dài đường cong dùng quy tắc trung điểm với metric chính xác; cột
            “Jeffreys” dùng ước lượng không mô phỏng của bài báo, <Tex math={String.raw`\sum\sqrt{\Delta\eta\cdot\Delta\mu}`} />.
          </p>
          <p>
            Trắc địa được tìm bằng tối ưu số (Adam) trên năng lượng rời rạc của một đường cong trơn (chuỗi sin, đầu mút cố định), khởi tạo từ 4 đường khác nhau và giữ đường có độ dài Fisher–Rao nhỏ nhất — nên nó chỉ là <b>xấp xỉ</b>.
          </p>
        </>
      }
    />
  );
}

function CompareTable({
  meas,
  sel,
}: {
  meas: Partial<Record<CurveId, ReturnType<typeof measureCurve> & { kl60: number; kl240: number }>>;
  sel: CurveId;
}) {
  const ids = (Object.keys(CURVE_META) as CurveId[]).filter((k) => meas[k]);
  const best = Math.min(...ids.map((k) => meas[k]!.fr));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] text-ink-3">
            <th className="py-1.5 pr-3 font-medium">Đường</th>
            <th className="py-1.5 pr-3 font-medium">Euclid trong (x, t)</th>
            <th className="py-1.5 pr-3 font-medium">Fisher–Rao (metric chính xác)</th>
            <th className="py-1.5 pr-3 font-medium">Fisher–Rao (ước lượng Jeffreys)</th>
            <th className="py-1.5 pr-3 font-medium">Σ KL, 30 bước</th>
            <th className="py-1.5 font-medium">Σ KL, 120 bước</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {ids.map((k) => {
            const r = meas[k]!;
            return (
              <tr key={k} className={cn("border-t border-line", k === sel && "bg-surface-2")}>
                <td className="py-1.5 pr-3 font-sans">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CURVE_META[k].color }} />
                    {CURVE_META[k].label}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-ink-2">{fmt(r.euclid, 3)}</td>
                <td className={cn("py-1.5 pr-3 font-semibold", r.fr <= best + 1e-9 ? "text-geo" : "text-ink")}>{fmt(r.fr, 3)}</td>
                <td className="py-1.5 pr-3 text-ink-2">{fmt(r.frJeffreys, 3)}</td>
                <td className="py-1.5 pr-3 text-ink-2">{fmt(r.kl60, 3)}</td>
                <td className="py-1.5 text-ink-2">{fmt(r.kl240, 3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[12px] leading-snug text-ink-3">
        Tổng KL giữa các phân phối liên tiếp <b>không phải là độ dài</b>: KL không đối xứng, và khi chia nhỏ đường thì tổng KL giảm về 0 (mỗi bước ≈ ½·ds²), trong khi
        độ dài Fisher–Rao không đổi. Euclid trong (x, t) trộn hai đơn vị khác nhau nên không có ý nghĩa thông tin.
      </p>
    </div>
  );
}
