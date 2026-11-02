"use client";
import * as d3 from "d3";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { linspace } from "@/lib/gaussian";
import { BIMODAL, diffuse, mixLogPdf, mixPdf, mixScore, ring2d, ringMeans, rng } from "@/lib/mixture";
import { SCHEDULES, sigmaOf } from "@/lib/diffusion";
import { fmt } from "@/lib/utils";
import { ArrowDefs, areaPath, Axes, clamp, linePath, M, useSize, useSvgDrag } from "./charts/Chart";
import { Figure, Key, LessonShell } from "./LessonShell";
import { Button, Slider, Stat, Switch, Sym, Tabs, TabsContent, TabsList, TabsTrigger, Tex } from "./ui";

const S = SCHEDULES.exp;

export default function ScoreField() {
  const [tab, setTab] = useState("1d");
  const [t1, setT1] = useState(0.02);
  const [xp, setXp] = useState(-1);
  const [t2, setT2] = useState(0.02);
  const [showDens, setShowDens] = useState(true);
  const [showScore, setShowScore] = useState(true);
  const [showGradP, setShowGradP] = useState(false);
  const [probe, setProbe] = useState<[number, number]>([1.2, 0.6]);
  const [eta, setEta] = useState(0.02);
  const [simSteps, setSimSteps] = useState(0);
  const [seenGradP, setSeenGradP] = useState(false);
  useEffect(() => {
    if (showGradP) setSeenGradP(true);
  }, [showGradP]);

  const m1 = diffuse(BIMODAL, S.alpha(t1), sigmaOf(S, t1));
  const s1 = mixScore(m1, xp);

  const tasks = [
    { text: "Kéo điểm x tới chỗ score bằng 0 nằm GIỮA hai đỉnh. Ở đó mật độ cao hay thấp?", done: Math.abs(s1) < 0.08 && Math.abs(xp) < 0.6 },
    { text: "Ở tab 2D, bật “Gradient của mật độ ∇p” và so sánh với ∇log p ở xa các cụm.", done: seenGradP },
    { text: "Ở tab Lấy mẫu, chạy ≥ 200 bước. Vì sao các hạt leo dốc thuần tuý bị co về một điểm?", done: simSteps >= 200 },
  ];

  return (
    <LessonShell
      index={3}
      title="Hàm score là gì?"
      intuition="Score là độ dốc của log-mật độ: nó chỉ hướng mà log p tăng nhanh nhất tại mỗi điểm."
      equation={String.raw`s_t(x)=\nabla_x \log p_t(x)`}
      equationNote={
        <>
          <Sym tex="\nabla_x" tip="Gradient theo x: vectơ các đạo hàm riêng." /> của{" "}
          <Sym tex="\log p_t" tip="Logarit của mật độ nhiễu tại thời điểm t." />. Trong 1D, score chỉ là đạo hàm{" "}
          <Tex math={String.raw`\tfrac{d}{dx}\log p(x)`} />.
        </>
      }
      main={
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-3">
          <TabsList>
            <TabsTrigger value="1d">A · Score 1D</TabsTrigger>
            <TabsTrigger value="2d">B · Trường score 2D</TabsTrigger>
            <TabsTrigger value="sample">C · Leo dốc vs Langevin</TabsTrigger>
          </TabsList>
          <TabsContent value="1d">
            <Score1D m={m1} xp={xp} setXp={setXp} />
          </TabsContent>
          <TabsContent value="2d">
            <Score2D t={t2} showDens={showDens} showScore={showScore} showGradP={showGradP} probe={probe} setProbe={setProbe} />
          </TabsContent>
          <TabsContent value="sample">
            <SamplerDemo t={t2} eta={eta} onSteps={setSimSteps} />
          </TabsContent>
        </Tabs>
      }
      controls={
        tab === "1d" ? (
          <>
            <Slider label={<>Mức nhiễu <Tex math="t" /></>} value={t1} min={0} max={0.6} step={0.002} onChange={setT1} accent="var(--c-noise)" />
            <Slider label={<>Vị trí <Tex math="x" /></>} value={xp} min={-4} max={4} step={0.01} onChange={setXp} accent="var(--c-score)" />
          </>
        ) : tab === "2d" ? (
          <>
            <Slider label={<>Mức nhiễu <Tex math="t" /></>} value={t2} min={0} max={0.6} step={0.002} onChange={setT2} accent="var(--c-noise)" />
            <Switch label="Hiện mật độ (bản đồ nhiệt + đường đồng mức)" checked={showDens} onChange={setShowDens} />
            <Switch label={<>Hiện mũi tên score <Tex math="\nabla\log p" /></>} checked={showScore} onChange={setShowScore} />
            <Switch label={<>Hiện gradient của mật độ <Tex math="\nabla p" /></>} checked={showGradP} onChange={setShowGradP} />
            <p className="text-[12.5px] text-ink-3">Kéo chấm tròn để đo score tại một điểm quan sát.</p>
          </>
        ) : (
          <>
            <Slider label={<>Mức nhiễu của mục tiêu <Tex math="t" /></>} value={t2} min={0} max={0.4} step={0.002} onChange={setT2} accent="var(--c-noise)" />
            <Slider label={<>Bước <Tex math="\eta" /></>} value={eta} min={0.002} max={0.06} step={0.001} onChange={setEta} format={(v) => v.toFixed(3)} accent="var(--c-score)" />
          </>
        )
      }
      measures={
        tab === "1d" ? (
          <div className="grid grid-cols-2 gap-2">
            <Stat label="p(x)" value={fmt(mixPdf(m1, xp), 4)} color="var(--c-dist)" />
            <Stat label="log p(x)" value={fmt(mixLogPdf(m1, xp), 3)} />
            <Stat label="score s(x)" value={fmt(s1, 3)} color="var(--c-score)" hint={s1 > 0.05 ? "→ log p tăng về bên phải" : s1 < -0.05 ? "← log p tăng về bên trái" : "≈ 0: điểm dừng"} />
            <Stat label="|s(x)|" value={fmt(Math.abs(s1), 3)} hint="độ dốc của log p" />
          </div>
        ) : tab === "2d" ? (
          <ProbeStats t={t2} probe={probe} />
        ) : undefined
      }
      explanation={
        tab === "sample" ? (
          <>
            <p>
              <b>Trái:</b> leo dốc thuần tuý <Tex math={String.raw`x\leftarrow x+\eta\,s(x)`} />. Mọi hạt trượt lên đỉnh gần nhất rồi đứng yên —
              ta được <i>các mode</i>, không phải một phân phối.
            </p>
            <p>
              <b>Phải:</b> động lực Langevin thêm nhiễu <Tex math={String.raw`\sqrt{2\eta}\,\epsilon`} />. Nhiễu cân bằng với lực kéo của score nên
              các hạt <b>phân tán đúng như mật độ</b>.
            </p>
            <p className="text-[12.5px] text-ink-3">
              Đây là bộ lấy mẫu Langevin minh hoạ trên một mật độ cố định, không phải SDE ngược đầy đủ của mô hình khuếch tán.
            </p>
          </>
        ) : (
          <>
            <p>
              Score là <b>độ dốc cục bộ của log-mật độ</b>. Nó dương khi log p tăng về bên phải và bằng 0 tại các điểm cực trị — kể cả điểm
              trũng giữa hai đỉnh.
            </p>
            <p>
              Score <i>không</i> trỏ thẳng tới một mẫu dữ liệu cụ thể; nó chỉ cho biết hướng log p tăng nhanh nhất <i>ngay tại đây</i>.
            </p>
            {tab === "2d" && (
              <p>
                Ở xa các cụm, <Tex math="\nabla p" /> gần như bằng 0 (mật độ phẳng lì), nhưng <Tex math="\nabla\log p" /> vẫn lớn — đó là lý do mô hình
                khuếch tán học score thay vì gradient của mật độ.
              </p>
            )}
          </>
        )
      }
      tasks={tasks}
      math={
        <>
          <p>Với hỗn hợp Gauss, score có dạng trung bình có trọng số của score từng thành phần:</p>
          <Tex math={String.raw`s(x)=\sum_k r_k(x)\,\frac{-(x-m_k)}{v_k},\qquad r_k(x)=\frac{\pi_k\,\mathcal N(x;m_k,v_k)}{p(x)}`} block />
          <p>
            Và <Tex math={String.raw`\nabla p = p\,\nabla\log p`} />: gradient mật độ bằng score nhân với mật độ, nên nó tắt dần ở vùng mật độ thấp.
          </p>
        </>
      }
    />
  );
}

// ------------------------------------------------------------------ A: 1D
function Score1D({ m, xp, setXp }: { m: ReturnType<typeof diffuse>; xp: number; setXp: (v: number) => void }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const W = size.width;
  const H1 = 230;
  const H2 = 210;
  const xs = useMemo(() => linspace(-4.5, 4.5, 500), []);
  const x = d3.scaleLinear().domain([-4.5, 4.5]).range([M.left, W - M.right]);
  const dens = xs.map((v) => [v, mixPdf(m, v)] as [number, number]);
  const pmax = Math.max(...dens.map((d) => d[1]));
  const y1 = d3.scaleLinear().domain([0, pmax * 1.15]).range([H1 - M.bottom, M.top]);
  const sc = xs.map((v) => [v, mixScore(m, v)] as [number, number]);
  const smax = Math.min(25, Math.max(...sc.map((d) => Math.abs(d[1])))) * 1.1;
  const y2 = d3.scaleLinear().domain([-smax, smax]).range([H2 - M.bottom, M.top]);
  const s = mixScore(m, xp);
  const drag = useSvgDrag(useCallback((px: number) => setXp(clamp(x.invert(px), -4.5, 4.5)), [x, setXp]));
  const arrowLen = clamp(s / smax, -1, 1) * 70;
  return (
    <div className="grid gap-3">
      <Figure title="Mật độ p(x)" legend={<Key color="var(--c-dist)">p(x)</Key>}>
        <div ref={ref} className="w-full">
          <svg width={W} height={H1}>
            <ArrowDefs id="arrS1" color="var(--c-score)" />
            <Axes x={x} y={y1} width={W} height={H1} yTicks={3} />
            <path d={areaPath(dens, x, y1)} fill="var(--c-dist-soft)" />
            <path d={linePath(dens, x, y1)} fill="none" stroke="var(--c-dist)" strokeWidth={2.4} />
            <line x1={x(xp)} x2={x(xp)} y1={y1(0)} y2={y1(mixPdf(m, xp))} stroke="var(--c-score)" strokeDasharray="3 3" />
            {Math.abs(arrowLen) > 2 && (
              <line
                x1={x(xp)}
                x2={x(xp) + arrowLen}
                y1={y1(mixPdf(m, xp))}
                y2={y1(mixPdf(m, xp))}
                stroke="var(--c-score)"
                strokeWidth={3}
                markerEnd="url(#arrS1)"
              />
            )}
            <circle className="handle" cx={x(xp)} cy={y1(mixPdf(m, xp))} r={8} fill="var(--c-score)" stroke="white" strokeWidth={2} {...drag} />
          </svg>
        </div>
      </Figure>
      <Figure title="Score s(x) = d/dx log p(x)" legend={<Key color="var(--c-score)">s(x)</Key>}>
        <svg width={W} height={H2}>
          <Axes x={x} y={y2} width={W} height={H2} yTicks={4} />
          <line x1={M.left} x2={W - M.right} y1={y2(0)} y2={y2(0)} stroke="var(--ink-3)" />
          <path d={linePath(sc.map(([a, b]) => [a, clamp(b, -smax, smax)]), x, y2)} fill="none" stroke="var(--c-score)" strokeWidth={2.4} />
          <line x1={x(xp)} x2={x(xp)} y1={y2(0)} y2={y2(clamp(s, -smax, smax))} stroke="var(--c-score)" strokeWidth={3} />
          <circle className="handle" cx={x(xp)} cy={y2(clamp(s, -smax, smax))} r={7} fill="var(--c-score)" stroke="white" strokeWidth={2} {...drag} />
          <text x={W - M.right} y={M.top + 10} textAnchor="end" fontSize={12} fill="var(--ink-3)">
            dương → log p tăng sang phải · âm → sang trái
          </text>
        </svg>
      </Figure>
    </div>
  );
}

// ------------------------------------------------------------------ B: 2D field
const D2 = 5.5;

function Score2D({
  t,
  showDens,
  showScore,
  showGradP,
  probe,
  setProbe,
}: {
  t: number;
  showDens: boolean;
  showScore: boolean;
  showGradP: boolean;
  probe: [number, number];
  setProbe: (p: [number, number]) => void;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const side = Math.min(size.width, 640);
  const x = d3.scaleLinear().domain([-D2, D2]).range([0, side]);
  const y = d3.scaleLinear().domain([-D2, D2]).range([side, 0]);
  const a = S.alpha(t);
  const sg = sigmaOf(S, t);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const N = 140;
  const field = useMemo(() => {
    const vals: number[] = new Array(N * N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const px = -D2 + ((i + 0.5) / N) * 2 * D2;
        const py = D2 - ((j + 0.5) / N) * 2 * D2;
        vals[j * N + i] = ring2d(px, py, a, sg).p;
      }
    return vals;
  }, [a, sg]);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(N, N);
    const mx = Math.max(...field);
    const col = d3.scaleSequential(d3.interpolateBlues).domain([0, 1]);
    field.forEach((v, k) => {
      const c2 = d3.rgb(col(Math.pow(v / mx, 0.6) * 0.85));
      img.data[4 * k] = c2.r;
      img.data[4 * k + 1] = c2.g;
      img.data[4 * k + 2] = c2.b;
      img.data[4 * k + 3] = 255 * Math.min(1, 0.15 + (v / mx) * 1.2);
    });
    ctx.putImageData(img, 0, 0);
  }, [field]);
  const contours = useMemo(() => {
    const mx = Math.max(...field);
    const gen = d3.contours().size([N, N]).thresholds([0.05, 0.2, 0.45, 0.75].map((q) => q * mx));
    return gen(field);
  }, [field]);
  const proj = d3.geoTransform({
    point(px, py) {
      this.stream.point((px / N) * side, (py / N) * side);
    },
  });
  const pathGen = d3.geoPath(proj);

  // arrows on a grid; length normalised per field (so both fields are visible), direction exact
  const G = 15;
  const pts = linspace(-D2 + 0.4, D2 - 0.4, G);
  const arrows = (kind: "score" | "gradp") => {
    const vs = pts.flatMap((px) => pts.map((py) => ({ px, py, v: kind === "score" ? ring2d(px, py, a, sg).score : ring2d(px, py, a, sg).gradP })));
    const mags = vs.map((o) => Math.hypot(o.v[0], o.v[1]));
    const ref = d3.quantile(mags.slice().sort(d3.ascending), 0.9) || 1;
    const L = (side / G) * 0.85;
    return vs.map((o, k) => {
      const mag = mags[k];
      const len = Math.min(1, mag / ref) * L;
      const dx = mag > 0 ? (o.v[0] / mag) * len : 0;
      const dy = mag > 0 ? (o.v[1] / mag) * len : 0;
      return { x1: x(o.px), y1: y(o.py), x2: x(o.px) + dx, y2: y(o.py) - dy, len };
    });
  };
  const drag = useSvgDrag(
    useCallback((px: number, py: number) => setProbe([clamp(x.invert(px), -D2, D2), clamp(y.invert(py), -D2, D2)]), [x, y, setProbe])
  );
  const pr = ring2d(probe[0], probe[1], a, sg);
  const pm = Math.hypot(pr.score[0], pr.score[1]);
  const pl = Math.min(60, pm * 12);
  return (
    <Figure
      title="8 cụm Gauss trên một vòng tròn"
      legend={
        <>
          {showDens && <Key color="var(--c-dist)">mật độ</Key>}
          {showScore && <Key color="var(--c-score)">∇log p (score)</Key>}
          {showGradP && <Key color="var(--c-accent)">∇p</Key>}
        </>
      }
    >
      <div ref={ref} className="flex w-full justify-center">
        <div className="relative" style={{ width: side, height: side }}>
          <canvas ref={canvasRef} width={N} height={N} style={{ width: side, height: side, imageRendering: "auto", opacity: showDens ? 1 : 0 }} className="absolute inset-0 rounded-lg" />
          <svg width={side} height={side} className="absolute inset-0">
            <ArrowDefs id="arrS" color="var(--c-score)" />
            <ArrowDefs id="arrG" color="var(--c-accent)" />
            <ArrowDefs id="arrP" color="var(--c-score)" />
            {showDens &&
              contours.map((c, i) => <path key={i} d={pathGen(c) ?? ""} fill="none" stroke="var(--c-dist)" strokeOpacity={0.55} strokeWidth={1} />)}
            {showScore &&
              arrows("score").map((r, i) =>
                r.len > 1.5 ? <line key={i} {...r} stroke="var(--c-score)" strokeWidth={1.4} markerEnd="url(#arrS)" /> : <circle key={i} cx={r.x1} cy={r.y1} r={1} fill="var(--c-score)" />
              )}
            {showGradP &&
              arrows("gradp").map((r, i) =>
                r.len > 1.5 ? <line key={i} {...r} stroke="var(--c-accent)" strokeWidth={1.4} markerEnd="url(#arrG)" /> : <circle key={i} cx={r.x1} cy={r.y1} r={1.2} fill="var(--c-accent)" />
              )}
            {pm > 1e-9 && (
              <line
                x1={x(probe[0])}
                y1={y(probe[1])}
                x2={x(probe[0]) + (pr.score[0] / pm) * pl}
                y2={y(probe[1]) - (pr.score[1] / pm) * pl}
                stroke="var(--c-score)"
                strokeWidth={3.5}
                markerEnd="url(#arrP)"
              />
            )}
            <circle className="handle" cx={x(probe[0])} cy={y(probe[1])} r={9} fill="var(--surface)" stroke="var(--c-score)" strokeWidth={3} {...drag} />
          </svg>
        </div>
      </div>
      <p className="px-1 pt-2 text-[12px] text-ink-3">Độ dài mũi tên được chuẩn hoá riêng cho từng trường để cả hai cùng nhìn thấy được; hướng là chính xác.</p>
    </Figure>
  );
}

function ProbeStats({ t, probe }: { t: number; probe: [number, number] }) {
  const r = ring2d(probe[0], probe[1], S.alpha(t), sigmaOf(S, t));
  return (
    <div className="grid grid-cols-2 gap-2">
      <Stat label="điểm quan sát" value={`(${fmt(probe[0], 1)}, ${fmt(probe[1], 1)})`} />
      <Stat label="p(x)" value={r.p < 1e-4 ? r.p.toExponential(1) : fmt(r.p, 4)} color="var(--c-dist)" />
      <Stat label="|∇log p|" value={fmt(Math.hypot(...r.score), 3)} color="var(--c-score)" />
      <Stat label="|∇p|" value={Math.hypot(...r.gradP) < 1e-4 ? Math.hypot(...r.gradP).toExponential(1) : fmt(Math.hypot(...r.gradP), 4)} color="var(--c-accent)" />
    </div>
  );
}

// ------------------------------------------------------------------ C: gradient ascent vs Langevin
function SamplerDemo({ t, eta, onSteps }: { t: number; eta: number; onSteps: (n: number) => void }) {
  const NP = 300;
  const init = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: NP }, () => [r.uniform() * 10 - 5, r.uniform() * 10 - 5] as [number, number]);
  }, []);
  const [ga, setGa] = useState(init);
  const [lv, setLv] = useState(init);
  const [steps, setSteps] = useState(0);
  const [running, setRunning] = useState(false);
  const noise = useRef(rng(99));
  const a = S.alpha(t);
  const sg = sigmaOf(S, t);

  const reset = () => {
    setGa(init);
    setLv(init);
    setSteps(0);
    noise.current = rng(99);
  };

  useEffect(() => {
    if (!running) return;
    let id: number;
    const tick = () => {
      setGa((ps) => ps.map(([px, py]) => {
        const s = ring2d(px, py, a, sg).score;
        return [px + eta * s[0], py + eta * s[1]];
      }));
      setLv((ps) => ps.map(([px, py]) => {
        const s = ring2d(px, py, a, sg).score;
        const k = Math.sqrt(2 * eta);
        return [px + eta * s[0] + k * noise.current.normal(), py + eta * s[1] + k * noise.current.normal()];
      }));
      setSteps((n) => n + 1);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [running, a, sg, eta]);

  useEffect(() => {
    onSteps(steps);
  }, [steps, onSteps]);

  const spread = (ps: [number, number][]) => {
    const means = ringMeans().map(([u, v]) => [a * u, a * v]);
    let s = 0;
    ps.forEach(([px, py]) => {
      s += Math.min(...means.map(([u, v]) => (px - u) ** 2 + (py - v) ** 2));
    });
    return Math.sqrt(s / ps.length / 2);
  };
  const target = Math.sqrt(a * a * 0.35 * 0.35 + sg * sg);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setRunning(!running)}>
          {running ? <Pause size={14} /> : <Play size={14} />} {running ? "Tạm dừng" : "Chạy"}
        </Button>
        <Button onClick={reset}>
          <RotateCcw size={14} /> Đặt lại
        </Button>
        <span className="text-[13px] text-ink-3">Bước: {steps}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ParticlePanel title="Leo dốc thuần tuý: x ← x + η s(x)" ps={ga} t={t} spread={spread(ga)} target={target} />
        <ParticlePanel title="Langevin (minh hoạ): x ← x + η s(x) + √(2η) ε" ps={lv} t={t} spread={spread(lv)} target={target} />
      </div>
    </div>
  );
}

function ParticlePanel({ title, ps, t, spread, target }: { title: string; ps: [number, number][]; t: number; spread: number; target: number }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const side = Math.min(size.width, 420);
  const x = d3.scaleLinear().domain([-D2, D2]).range([0, side]);
  const y = d3.scaleLinear().domain([-D2, D2]).range([side, 0]);
  const a = S.alpha(t);
  return (
    <Figure title={title}>
      <div ref={ref} className="flex w-full justify-center">
        <svg width={side} height={side} className="rounded-lg bg-surface-2/50">
          {ringMeans().map(([u, v], i) => (
            <circle key={i} cx={x(a * u)} cy={y(a * v)} r={Math.abs(x(target) - x(0))} fill="var(--c-dist-soft)" stroke="var(--c-dist)" strokeOpacity={0.4} />
          ))}
          {ps.map(([px, py], i) => (
            <circle key={i} cx={x(px)} cy={y(py)} r={2.2} fill="var(--c-noise)" fillOpacity={0.8} />
          ))}
        </svg>
      </div>
      <div className="px-1 pt-2 text-[12.5px] text-ink-2">
        Độ phân tán quanh cụm gần nhất: <b className="font-mono">{fmt(spread, 3)}</b> (đúng của mật độ: <span className="font-mono">{fmt(target, 3)}</span>)
      </div>
    </Figure>
  );
}
