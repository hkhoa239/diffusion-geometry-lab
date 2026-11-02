"use client";
import * as d3 from "d3";
import { motion } from "framer-motion";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { frDistanceGaussian, linspace, normPdf } from "@/lib/gaussian";
import { bezier, gaussianGeodesic, gaussianPathLengths, P2, straightPath } from "@/lib/geodesic";
import { cn, fmt } from "@/lib/utils";
import { areaPath, Axes, clamp, linePath, M, useSize, useSvgDrag } from "./charts/Chart";
import { Figure, Key, LessonShell } from "./LessonShell";
import { Button, Slider, Stat, Switch, Sym, Tex } from "./ui";

const A: P2 = [-2, 0.5];
const B: P2 = [2, 0.5];
const MU: [number, number] = [-3.6, 3.6];
const SG: [number, number] = [0, 2.3];
const NPTS = 400;
// The initial user path dips to narrower Gaussians, so it starts out WORSE than the straight line.
const C1_0: P2 = [-0.9, 0.22];
const C2_0: P2 = [1.1, 0.42];
const D_STAR = frDistanceGaussian(A[0], A[1], B[0], B[1]);

type PathId = "straight" | "user" | "geodesic";
const PATHS: { id: PathId; label: string; color: string }[] = [
  { id: "straight", label: "Đường thẳng (Euclid)", color: "var(--c-euclid)" },
  { id: "user", label: "Đường của bạn", color: "var(--c-user)" },
  { id: "geodesic", label: "Trắc địa Fisher–Rao", color: "var(--c-geo)" },
];

export default function GeodesicExplorer() {
  const [c1, setC1] = useState<P2>(C1_0);
  const [c2, setC2] = useState<P2>(C2_0);
  const [sel, setSel] = useState<PathId>("straight");
  const [u, setU] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showAll, setShowAll] = useState(true);
  const [showMetric, setShowMetric] = useState(false);
  const [showCurrent, setShowCurrent] = useState(true);
  const [prog, setProg] = useState({ geoPlayed: false, beat: false, close: false, low: false });

  const paths = useMemo(
    () => ({
      straight: straightPath(A, B, NPTS),
      user: bezier(A, c1, c2, B, NPTS),
      geodesic: gaussianGeodesic(A, B, NPTS),
    }),
    [c1, c2]
  );
  const L = useMemo(
    () => ({
      straight: gaussianPathLengths(paths.straight),
      user: gaussianPathLengths(paths.user),
      geodesic: gaussianPathLengths(paths.geodesic),
    }),
    [paths]
  );
  const idx = Math.round(u * (NPTS - 1));
  const cur = paths[sel][idx];
  const userMinSigma = Math.min(...paths.user.map((p) => p[1]));

  useEffect(() => {
    setProg((p) => {
      const n = {
        geoPlayed: p.geoPlayed || (sel === "geodesic" && u > 0.98),
        beat: p.beat || L.user.fr < L.straight.fr - 0.05,
        close: p.close || L.user.fr < D_STAR * 1.03,
        low: p.low || userMinSigma < 0.3,
      };
      return n.geoPlayed === p.geoPlayed && n.beat === p.beat && n.close === p.close && n.low === p.low ? p : n;
    });
  }, [sel, u, L, userMinSigma]);

  // animation
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setU((v) => Math.min(1, v + dt * 0.22 * speed));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed]);

  useEffect(() => {
    if (playing && u >= 1) setPlaying(false);
  }, [playing, u]);

  const [refP, sP] = useSize<HTMLDivElement>();
  const HP = 380;
  const x = d3.scaleLinear().domain(MU).range([M.left, sP.width - M.right]);
  const y = d3.scaleLinear().domain(SG).range([HP - M.bottom, M.top]);
  const drag1 = useSvgDrag(useCallback((px: number, py: number) => setC1([clamp(x.invert(px), MU[0], MU[1]), clamp(y.invert(py), 0.05, SG[1])]), [x, y]));
  const drag2 = useSvgDrag(useCallback((px: number, py: number) => setC2([clamp(x.invert(px), MU[0], MU[1]), clamp(y.invert(py), 0.05, SG[1])]), [x, y]));

  const balls = useMemo(() => {
    const out: P2[] = [];
    for (const m of linspace(-3, 3, 7)) for (const s of [0.35, 0.7, 1.1, 1.6]) out.push([m, s]);
    return out;
  }, []);

  const [refD, sD] = useSize<HTMLDivElement>();
  const HD = 210;
  const xs = useMemo(() => linspace(-6, 6, 400), []);
  const xd = d3.scaleLinear().domain([-6, 6]).range([M.left, sD.width - M.right]);
  const yd = d3.scaleLinear().domain([0, 0.85]).range([HD - M.bottom, M.top]);

  const color = (id: PathId) => PATHS.find((p) => p.id === id)!.color;

  return (
    <LessonShell
      index={5}
      title="Đường trắc địa Fisher–Rao"
      intuition="Đường ngắn nhất giữa hai phân phối không nhất thiết là đường thẳng trong toạ độ tham số."
      equation={String.raw`L_G(\gamma)=\int_0^1\sqrt{\dot\gamma(u)^{\top}G(\gamma(u))\,\dot\gamma(u)}\;du`}
      equationNote={
        <>
          <Sym tex="\gamma(u)" tip="Một đường đi trong không gian tham số, u chạy từ 0 (điểm A) đến 1 (điểm B)." />,{" "}
          <Sym tex="\dot\gamma" tip="Vận tốc dọc đường đi." /> và <Sym tex="G" tip="Metric Fisher: G = diag(1/σ², 2/σ²)." />. Độ dài Fisher–Rao cộng dồn
          các bước nhỏ, mỗi bước được “định giá” bằng metric tại chỗ đó.
        </>
      }
      main={
        <div className="flex flex-col gap-4">
          <Figure
            title="Không gian tham số (μ, σ) — cùng hai điểm đầu A và B"
            legend={PATHS.map((p) => (
              <Key key={p.id} color={p.color} dashed={p.id === "straight"}>
                {p.label}
              </Key>
            ))}
          >
            <div ref={refP} className="w-full">
              <svg width={sP.width} height={HP} className="select-none">
                <Axes x={x} y={y} width={sP.width} height={HP} xLabel="μ (trung bình)" yLabel="σ (độ lệch chuẩn)" />
                <rect x={M.left} y={y(0.06)} width={sP.width - M.left - M.right} height={y(0) - y(0.06)} fill="var(--ink-3)" opacity={0.15} />
                <text x={M.left + 6} y={y(0.06) - 4} fontSize={11} fill="var(--ink-3)">
                  σ → 0: Gauss suy biến, mọi bước dịch chuyển đều “vô cùng đắt”
                </text>
                {showMetric &&
                  balls.map(([m, s], i) => (
                    <ellipse
                      key={i}
                      cx={x(m)}
                      cy={y(s)}
                      rx={Math.abs(x(0.25 * s) - x(0))}
                      ry={Math.abs(y((0.25 * s) / Math.SQRT2) - y(0))}
                      fill="var(--c-geo)"
                      fillOpacity={0.07}
                      stroke="var(--c-geo)"
                      strokeOpacity={0.4}
                    />
                  ))}
                {PATHS.filter((p) => showAll || p.id === sel).map((p) => (
                  <path
                    key={p.id}
                    d={linePath(paths[p.id], x, y)}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={p.id === sel ? 4 : 2.2}
                    strokeOpacity={p.id === sel ? 1 : 0.55}
                    strokeDasharray={p.id === "straight" ? "7 5" : undefined}
                  />
                ))}
                {/* user path controls */}
                {(showAll || sel === "user") && (
                  <g>
                    <path d={`M${x(A[0])},${y(A[1])} L${x(c1[0])},${y(c1[1])} M${x(B[0])},${y(B[1])} L${x(c2[0])},${y(c2[1])}`} stroke="var(--c-user)" strokeDasharray="2 4" />
                    {[
                      { p: c1, d: drag1 },
                      { p: c2, d: drag2 },
                    ].map(({ p, d }, i) => (
                      <rect key={i} className="handle" x={x(p[0]) - 8} y={y(p[1]) - 8} width={16} height={16} rx={4} fill="var(--surface)" stroke="var(--c-user)" strokeWidth={3} {...d} />
                    ))}
                  </g>
                )}
                {/* endpoints */}
                {[
                  { p: A, n: "A" },
                  { p: B, n: "B" },
                ].map(({ p, n }) => (
                  <g key={n}>
                    <circle cx={x(p[0])} cy={y(p[1])} r={7} fill="var(--ink)" />
                    <text x={x(p[0])} y={y(p[1]) + 22} textAnchor="middle" fontWeight={700} fontSize={13} fill="var(--ink)">
                      {n}
                    </text>
                  </g>
                ))}
                {/* moving point(s) */}
                {showAll &&
                  PATHS.filter((p) => p.id !== sel).map((p) => (
                    <circle key={p.id} cx={x(paths[p.id][idx][0])} cy={y(paths[p.id][idx][1])} r={5} fill={p.color} opacity={0.55} />
                  ))}
                <motion.circle cx={x(cur[0])} cy={y(cur[1])} r={9} fill={color(sel)} stroke="white" strokeWidth={2.5} />
              </svg>
            </div>
          </Figure>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Figure title={`Phân phối hiện tại dọc đường đi (u = ${u.toFixed(2)})`}>
              <div ref={refD} className="w-full">
                <svg width={sD.width} height={HD}>
                  <Axes x={xd} y={yd} width={sD.width} height={HD} yTicks={3} xLabel="x" />
                  {[A, B].map((p, i) => (
                    <path key={i} d={linePath(xs.map((v) => [v, normPdf(v, p[0], p[1])]), xd, yd)} fill="none" stroke="var(--ink-3)" strokeOpacity={0.4} strokeDasharray="3 3" />
                  ))}
                  {showAll &&
                    PATHS.filter((p) => p.id !== sel).map((p) => (
                      <path
                        key={p.id}
                        d={linePath(xs.map((v) => [v, normPdf(v, paths[p.id][idx][0], paths[p.id][idx][1])]), xd, yd)}
                        fill="none"
                        stroke={p.color}
                        strokeOpacity={0.5}
                        strokeWidth={1.5}
                      />
                    ))}
                  {showCurrent && (
                    <>
                      <path d={areaPath(xs.map((v) => [v, Math.min(normPdf(v, cur[0], cur[1]), 0.85)]), xd, yd)} fill="var(--c-dist-soft)" />
                      <path d={linePath(xs.map((v) => [v, Math.min(normPdf(v, cur[0], cur[1]), 0.85)]), xd, yd)} fill="none" stroke={color(sel)} strokeWidth={2.8} />
                    </>
                  )}
                </svg>
              </div>
            </Figure>
            <Figure title="Bảng so sánh độ dài">
              <LengthBoard L={L} sel={sel} />
            </Figure>
          </div>
        </div>
      }
      controls={
        <>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
            {PATHS.map((p) => (
              <button
                key={p.id}
                onClick={() => setSel(p.id)}
                className={cn("rounded-lg px-2 py-1.5 text-[12px] font-medium", sel === p.id ? "bg-surface text-ink shadow-sm" : "text-ink-3")}
                style={sel === p.id ? { boxShadow: `inset 0 -3px 0 ${p.color}` } : undefined}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => (u >= 1 ? (setU(0), setPlaying(true)) : setPlaying(!playing))}>
              {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "Tạm dừng" : "Chạy"}
            </Button>
            <Button onClick={() => (setC1(C1_0), setC2(C2_0))}>
              <RotateCcw size={14} /> Đặt lại điểm điều khiển
            </Button>
          </div>
          <Slider label="Tiến độ dọc đường đi u" value={u} min={0} max={1} step={0.001} onChange={(v) => (setPlaying(false), setU(v))} accent={color(sel)} />
          <Slider label="Tốc độ" value={speed} min={0.25} max={3} step={0.05} onChange={setSpeed} format={(v) => `${v.toFixed(2)}×`} accent="var(--ink-3)" />
          <Switch label="Hiện cả ba đường" checked={showAll} onChange={setShowAll} />
          <Switch label="Hiện phân phối hiện tại" checked={showCurrent} onChange={setShowCurrent} />
          <Switch label="Hiện metric cục bộ (quả cầu Fisher)" checked={showMetric} onChange={setShowMetric} />
          <p className="text-[12.5px] text-ink-3">Kéo hai ô vuông hồng để uốn “đường của bạn”.</p>
        </>
      }
      measures={
        <div className="grid grid-cols-2 gap-2">
          <Stat label="FR đã đi (đường chọn)" value={fmt(L[sel].cumFr[idx], 3)} color={color(sel)} />
          <Stat label="Euclid đã đi" value={fmt(L[sel].cumEuclid[idx], 3)} color="var(--c-euclid)" />
          <Stat label="Tổng FR của đường chọn" value={fmt(L[sel].fr, 3)} color={color(sel)} />
          <Stat label="Dư so với trắc địa" value={`+${fmt(Math.max(0, ((L[sel].fr - D_STAR) / D_STAR) * 100), 1)}%`} hint={`d* = ${fmt(D_STAR, 3)} (chính xác)`} />
        </div>
      }
      explanation={
        <>
          <p>
            Hãy tưởng tượng: <b>dịch trung bình rất “đắt” khi Gauss hẹp</b>, nhưng rẻ khi nó rộng. Đường ngắn nhất về mặt thông tin vì thế{" "}
            <b>làm Gauss rộng ra trước</b>, dịch nó sang, rồi <b>thu hẹp lại</b>.
          </p>
          <p>
            Đường xanh lá đi vòng lên cao nên dài hơn trong toạ độ Euclid, nhưng ngắn hơn hẳn theo Fisher–Rao: {fmt(L.geodesic.fr, 2)} so với {fmt(L.straight.fr, 2)}.
          </p>
          <p className="text-[12.5px] text-ink-3">
            Trắc địa được tính chính xác: trong toạ độ (μ, √2σ) metric là 2 lần mặt phẳng hyperbolic, nên trắc địa là nửa đường tròn có tâm trên trục σ = 0.
          </p>
        </>
      }
      tasks={[
        { text: "Chọn “Trắc địa Fisher–Rao” và chạy hết đường. Gauss ở giữa đường rộng hay hẹp?", done: prog.geoPlayed },
        { text: "Uốn đường của bạn sao cho độ dài FR NGẮN HƠN đường thẳng, dù trông nó dài hơn.", done: prog.beat },
        { text: "Đưa đường của bạn tới gần trắc địa: dư dưới 3%.", done: prog.close },
        { text: "Kéo đường của bạn xuống thấp (σ < 0.3). Vì sao độ dài FR tăng vọt?", done: prog.low },
      ]}
      math={
        <>
          <p>Đổi biến y = √2σ biến metric Fisher thành bội của metric hyperbolic:</p>
          <Tex math={String.raw`ds^2=\frac{d\mu^2+2\,d\sigma^2}{\sigma^2}=2\,\frac{d\mu^2+dy^2}{y^2}`} block />
          <p>Trắc địa là đường thẳng đứng hoặc nửa đường tròn vuông góc với biên y = 0. Khoảng cách chính xác:</p>
          <Tex math={String.raw`d(A,B)=\sqrt2\,\operatorname{arccosh}(17)\approx ${fmt(D_STAR, 4)},\qquad L_{\text{thẳng}}=\frac{|\Delta\mu|}{\sigma}=8`} block />
          <p>Độ dài được tính bằng quy tắc trung điểm trên {NPTS} điểm; sai số so với công thức đóng dưới 10⁻⁶.</p>
        </>
      }
    />
  );
}

function LengthBoard({ L, sel }: { L: Record<PathId, ReturnType<typeof gaussianPathLengths>>; sel: PathId }) {
  const maxFr = Math.max(...PATHS.map((p) => L[p.id].fr), 1);
  const maxE = Math.max(...PATHS.map((p) => L[p.id].euclid), 1);
  return (
    <div className="space-y-3 px-1 py-1">
      {PATHS.map((p) => (
        <div key={p.id} className={cn("space-y-1 rounded-lg p-2", sel === p.id && "bg-surface-2")}>
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="flex items-center gap-1.5 font-medium text-ink">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} /> {p.label}
            </span>
            <span className="text-ink-3">+{fmt(Math.max(0, ((L[p.id].fr - D_STAR) / D_STAR) * 100), 0)}%</span>
          </div>
          <Bar label="Euclid" v={L[p.id].euclid} max={maxE} color="var(--c-euclid)" />
          <Bar label="Fisher–Rao" v={L[p.id].fr} max={maxFr} color={p.color} strong />
        </div>
      ))}
      <p className="text-[11.5px] leading-snug text-ink-3">Thanh Euclid và thanh Fisher–Rao dùng hai thang riêng.</p>
    </div>
  );
}

function Bar({ label, v, max, color, strong }: { label: string; v: number; max: number; color: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px] text-ink-3">
      <span className="w-[68px] shrink-0">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full rounded-full" style={{ background: color, opacity: strong ? 1 : 0.6 }} animate={{ width: `${(v / max) * 100}%` }} transition={{ duration: 0.25 }} />
      </div>
      <span className="w-12 text-right font-mono tabular-nums text-ink">{fmt(v, 2)}</span>
    </div>
  );
}
