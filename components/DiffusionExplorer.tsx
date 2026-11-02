"use client";
import * as d3 from "d3";
import { motion } from "framer-motion";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { linspace, normPdf, trapz } from "@/lib/gaussian";
import { BIMODAL, diffuse, mixPdf, sampleMix } from "@/lib/mixture";
import { forwardPaths, SCHEDULES, sigmaOf } from "@/lib/diffusion";
import { cn, fmt } from "@/lib/utils";
import { areaPath, Axes, linePath, M, useSize } from "./charts/Chart";
import { Figure, Key, LessonShell } from "./LessonShell";
import { Button, Select, Slider, Stat, Switch, Sym, Tex } from "./ui";

const N_STEPS = 240;
const XD: [number, number] = [-4.5, 4.5];

export default function DiffusionExplorer() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sched, setSched] = useState("exp");
  const [nPart, setNPart] = useState(60);
  const [showPaths, setShowPaths] = useState(true);
  const [visited, setVisited] = useState({ end: false, cosine: false, unimodal: false });
  const S = SCHEDULES[sched];

  const x0 = useMemo(() => sampleMix(BIMODAL, nPart, 11), [nPart]);
  const { ts, paths } = useMemo(() => forwardPaths(x0, S, N_STEPS, 2024), [x0, S]);
  const k = Math.round(t * N_STEPS);
  const alpha = S.alpha(t);
  const sigma = sigmaOf(S, t);
  const mt = diffuse(BIMODAL, alpha, sigma);
  const grid = useMemo(() => linspace(XD[0], XD[1], 400), []);
  const pt = grid.map((v) => [v, mixPdf(mt, v)] as [number, number]);
  const p0 = grid.map((v) => [v, mixPdf(BIMODAL, v)] as [number, number]);
  const gauss = grid.map((v) => [v, normPdf(v, 0, 1)] as [number, number]);
  const wide = linspace(-12, 12, 2400);
  const klToGauss = trapz(
    wide,
    wide.map((v) => {
      const p = mixPdf(mt, v);
      return p > 1e-300 ? p * (Math.log(p) - Math.log(normPdf(v, 0, 1))) : 0;
    })
  );
  const peaks = pt.filter((p, i) => i > 0 && i < pt.length - 1 && p[1] > pt[i - 1][1] && p[1] > pt[i + 1][1]).length;

  // animation: advance t with requestAnimationFrame; the paths are fixed, so particles move continuously
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((v) => Math.min(1, v + dt * 0.18));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing]);

  useEffect(() => {
    setVisited((v) => {
      const n = { end: v.end || t > 0.97, cosine: v.cosine || sched === "cosine", unimodal: v.unimodal || (peaks === 1 && t < 0.97) };
      return n.end === v.end && n.cosine === v.cosine && n.unimodal === v.unimodal ? v : n;
    });
  }, [t, sched, peaks]);

  // stage: clean while most signal remains; "almost Gaussian" once p_t is within KL 0.01 of N(0,1)
  useEffect(() => {
    if (playing && t >= 1) setPlaying(false);
  }, [playing, t]);

  const stage = alpha > 0.8 ? 0 : klToGauss > 0.01 ? 1 : 2;

  const [refA, sA] = useSize<HTMLDivElement>();
  const [refC, sC] = useSize<HTMLDivElement>();
  const hTop = 230;
  const yMax = 0.7;
  const xA = d3.scaleLinear().domain(XD).range([M.left, sA.width - M.right]);
  const yA = d3.scaleLinear().domain([0, yMax]).range([hTop - M.bottom, M.top]);
  const hC = 300;
  const xC = d3.scaleLinear().domain([0, 1]).range([M.left, sC.width - M.right]);
  const yC = d3.scaleLinear().domain(XD).range([hC - M.bottom, M.top]);

  return (
    <LessonShell
      index={2}
      title="Khuếch tán làm gì?"
      intuition="Quá trình khuếch tán thuận từ từ trộn dữ liệu với nhiễu Gauss, phá huỷ dần thông tin về dữ liệu ban đầu."
      equation={String.raw`\begin{gathered}x_t=\alpha_t\,x_0+\sigma_t\,\epsilon\\ \sigma_t=\sqrt{1-\alpha_t^2}\end{gathered}`}
      equationNote={
        <>
          <Sym tex="x_0" tip="Dữ liệu sạch, lấy từ phân phối hai đỉnh." />, <Sym tex="\epsilon" tip="Nhiễu Gauss chuẩn N(0,1)." />,{" "}
          <Sym tex="\alpha_t" tip="Phần tín hiệu còn giữ lại tại thời điểm t; giảm từ 1 về gần 0." /> và{" "}
          <Sym tex="\sigma_t" tip="Độ lớn nhiễu; tăng từ 0 lên gần 1." />. Tổng phương sai được bảo toàn (variance preserving).
        </>
      }
      main={
        <div className="flex flex-col gap-4">
          {/* timeline */}
          <div className="grid grid-cols-3 gap-2">
            {["Dữ liệu sạch", "Nhiễu một phần", "Gần như Gauss"].map((s, i) => (
              <div
                key={s}
                className={cn(
                  "rounded-xl border px-3 py-2 text-center text-[13px] transition-colors",
                  i === stage ? "border-noise bg-[var(--c-noise-soft)] font-semibold text-ink" : "border-line text-ink-3"
                )}
              >
                {s}
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Figure title="A · Dữ liệu sạch p₀(x)" legend={<Key color="var(--c-dist)">p₀</Key>}>
              <div ref={refA} className="w-full">
                <svg width={sA.width} height={hTop}>
                  <Axes x={xA} y={yA} width={sA.width} height={hTop} xTicks={6} yTicks={3} />
                  <path d={areaPath(p0, xA, yA)} fill="var(--c-dist-soft)" />
                  <path d={linePath(p0, xA, yA)} fill="none" stroke="var(--c-dist)" strokeWidth={2.2} />
                  {x0.map((v, i) => (
                    <line key={i} x1={xA(v)} x2={xA(v)} y1={yA(0)} y2={yA(0) - 9} stroke="var(--c-dist)" strokeOpacity={0.6} />
                  ))}
                </svg>
              </div>
            </Figure>
            <Figure
              title={`B · Phân phối nhiễu p_t(x) tại t = ${t.toFixed(2)}`}
              legend={
                <>
                  <Key color="var(--c-dist)">p_t</Key>
                  <Key color="var(--c-euclid)" dashed>
                    N(0,1)
                  </Key>
                </>
              }
            >
              <svg width={sA.width} height={hTop}>
                <Axes x={xA} y={yA} width={sA.width} height={hTop} xTicks={6} yTicks={3} />
                <path d={linePath(gauss, xA, yA)} fill="none" stroke="var(--c-euclid)" strokeDasharray="5 4" strokeWidth={1.5} />
                <path d={areaPath(pt, xA, yA)} fill="var(--c-dist-soft)" />
                <path d={linePath(pt, xA, yA)} fill="none" stroke="var(--c-dist)" strokeWidth={2.4} />
                {paths.map((p, i) => (
                  <circle key={i} cx={xA(p[k])} cy={yA(0) - 5} r={3} fill="var(--c-noise)" fillOpacity={0.75} />
                ))}
              </svg>
            </Figure>
          </div>
          <Figure
            title="C · Quỹ đạo của từng hạt theo thời gian"
            legend={
              <>
                <Key color="var(--c-noise)">hạt nhiễu x_t</Key>
              </>
            }
          >
            <div ref={refC} className="w-full">
              <svg width={sC.width} height={hC}>
                <Axes x={xC} y={yC} width={sC.width} height={hC} xLabel="thời gian t" yLabel="x" xTicks={10} yTicks={6} />
                {showPaths &&
                  paths.map((p, i) => (
                    <path
                      key={i}
                      d={linePath(
                        p.slice(0, k + 1).map((v, j) => [ts[j], v] as [number, number]),
                        xC,
                        yC
                      )}
                      fill="none"
                      stroke="var(--c-noise)"
                      strokeOpacity={0.35}
                      strokeWidth={1}
                    />
                  ))}
                <line x1={xC(t)} x2={xC(t)} y1={M.top} y2={hC - M.bottom} stroke="var(--ink-3)" strokeDasharray="3 4" />
                {paths.map((p, i) => (
                  <motion.circle key={i} cx={xC(t)} cy={yC(p[k])} r={3.2} fill="var(--c-noise)" />
                ))}
              </svg>
            </div>
          </Figure>
        </div>
      }
      controls={
        <>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => (t >= 1 ? (setT(0), setPlaying(true)) : setPlaying(!playing))}>
              {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "Tạm dừng" : "Chạy"}
            </Button>
            <Button
              onClick={() => {
                setPlaying(false);
                setT(0);
              }}
            >
              <RotateCcw size={14} /> Đặt lại
            </Button>
          </div>
          <Slider label={<>Thời gian nhiễu <Tex math="t" /></>} value={t} min={0} max={1} step={0.001} onChange={(v) => (setPlaying(false), setT(v))} accent="var(--c-noise)" />
          <Select
            label="Lịch trình nhiễu (noise schedule)"
            value={sched}
            onChange={setSched}
            options={Object.values(SCHEDULES).map((s) => ({ value: s.id, label: s.label }))}
          />
          <Slider label="Số hạt" value={nPart} min={10} max={200} step={10} onChange={setNPart} format={(v) => v.toFixed(0)} accent="var(--c-noise)" />
          <Switch label="Hiện đường đi của hạt" checked={showPaths} onChange={setShowPaths} />
        </>
      }
      measures={
        <div className="grid grid-cols-2 gap-2">
          <Stat label="α_t (tín hiệu)" value={fmt(alpha, 3)} />
          <Stat label="σ_t (nhiễu)" value={fmt(sigma, 3)} />
          <Stat label="SNR = α²/σ²" value={alpha * alpha / (sigma * sigma) > 1e3 ? "> 1000" : fmt((alpha * alpha) / (sigma * sigma), 3)} />
          <Stat label="KL(p_t ‖ N(0,1))" value={fmt(klToGauss, 3)} hint="→ 0: gần như Gauss" />
        </div>
      }
      explanation={
        <>
          <p>
            Mỗi hạt cam bắt đầu từ một điểm dữ liệu sạch. Theo thời gian, nó bị kéo dần về 0 (hệ số <Tex math="\alpha_t" />) và bị lắc ngẫu
            nhiên (nhiễu <Tex math="\sigma_t\epsilon" />).
          </p>
          <p>
            Hai đỉnh của dữ liệu nhoè vào nhau rồi biến mất: <b>thông tin về dữ liệu gốc bị phá huỷ dần</b>. Cuối cùng chỉ còn lại một
            Gauss chuẩn — giống hệt nhau với mọi tập dữ liệu.
          </p>
          <p className="text-[12.5px] text-ink-3">
            Nhiễu Brown được lấy mẫu một lần (có hạt giống cố định), nên quỹ đạo liên tục và có thể lặp lại.
          </p>
        </>
      }
      tasks={[
        { text: "Bấm “Chạy” và xem tới t = 1. Hai đỉnh còn không?", done: visited.end },
        { text: "Tìm thời điểm p_t chỉ còn MỘT đỉnh.", done: visited.unimodal },
        { text: "Đổi sang lịch trình cosine: thông tin bị phá huỷ nhanh hay chậm hơn lúc đầu?", done: visited.cosine },
      ]}
      math={
        <>
          <p>Với dữ liệu là hỗn hợp Gauss, phân phối nhiễu vẫn là hỗn hợp Gauss, tính chính xác:</p>
          <Tex math={String.raw`p_t(x)=\sum_k \pi_k\,\mathcal N\!\big(x;\ \alpha_t\mu_k,\ \alpha_t^2 s_k^2+\sigma_t^2\big)`} block />
          <p>Quỹ đạo dùng bước chuyển chính xác của quá trình Ornstein–Uhlenbeck:</p>
          <Tex math={String.raw`x_{t'}=\tfrac{\alpha_{t'}}{\alpha_t}x_t+\sqrt{1-\big(\tfrac{\alpha_{t'}}{\alpha_t}\big)^2}\,\xi`} block />
        </>
      }
    />
  );
}
