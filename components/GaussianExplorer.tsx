"use client";
import * as d3 from "d3";
import { useCallback, useMemo, useState } from "react";
import { intervalProb, linspace, normPdf } from "@/lib/gaussian";
import { fmt } from "@/lib/utils";
import { areaPath, Axes, clamp, linePath, M, useSize, useSvgDrag } from "./charts/Chart";
import { Figure, Key, LessonShell } from "./LessonShell";
import { Stat, Switch, Sym, Slider, Tex } from "./ui";

const XD: [number, number] = [-8, 8];
const YMAX = 2.1;

export default function GaussianExplorer() {
  const [mu, setMu] = useState(0);
  const [sd, setSd] = useState(1);
  const [showInt, setShowInt] = useState(true);
  const [a, setA] = useState(-1);
  const [b, setB] = useState(1);
  const [probe, setProbe] = useState(0.5);
  const [ref, size] = useSize<HTMLDivElement>();
  const W = size.width;
  const H = Math.max(320, Math.min(520, size.height));

  const x = useMemo(() => d3.scaleLinear().domain(XD).range([M.left, W - M.right]), [W]);
  const y = useMemo(() => d3.scaleLinear().domain([0, YMAX]).range([H - M.bottom, M.top]), [H]);
  const xs = useMemo(() => linspace(XD[0], XD[1], 600), []);
  const curve = xs.map((v) => [v, normPdf(v, mu, sd)] as [number, number]);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const shade = linspace(lo, hi, 200).map((v) => [v, normPdf(v, mu, sd)] as [number, number]);
  const P = intervalProb(a, b, mu, sd);
  const peak = normPdf(mu, mu, sd);
  const pProbe = normPdf(probe, mu, sd);

  const dragA = useSvgDrag(useCallback((px: number) => setA(clamp(x.invert(px), XD[0], XD[1])), [x]));
  const dragB = useSvgDrag(useCallback((px: number) => setB(clamp(x.invert(px), XD[0], XD[1])), [x]));
  const dragP = useSvgDrag(useCallback((px: number) => setProbe(clamp(x.invert(px), XD[0], XD[1])), [x]));

  const tasks = [
    { text: "Đưa trung bình μ về 2 và tăng σ lên ≥ 1.5. Đỉnh đường cong thay đổi thế nào?", done: Math.abs(mu - 2) < 0.15 && sd >= 1.5 },
    { text: "Thu nhỏ σ cho tới khi mật độ ở đỉnh vượt quá 1. Điều đó có sai không?", done: peak > 1 },
    { text: "Kéo hai đầu khoảng để xác suất bên trong gần 68% (khoảng μ ± σ).", done: P > 0.66 && P < 0.7 },
  ];

  return (
    <LessonShell
      index={1}
      title="Phân phối xác suất là gì?"
      intuition={
        <>
          Mật độ cho biết giá trị nào <b>dễ xảy ra</b>; xác suất là <b>diện tích</b> dưới đường cong trên một khoảng.
        </>
      }
      equation={String.raw`\begin{aligned}p(x)&=\mathcal N(x;\mu,\sigma^2)\\&=\frac{1}{\sigma\sqrt{2\pi}}\,e^{-\frac{(x-\mu)^2}{2\sigma^2}}\end{aligned}`}
      equationNote={
        <>
          <Sym tex="\mu" tip="Trung bình: vị trí tâm của đường cong." /> dịch chuyển đường cong;{" "}
          <Sym tex="\sigma" tip="Độ lệch chuẩn: độ rộng của đường cong." /> làm nó rộng hoặc hẹp, nhưng tổng diện tích luôn bằng 1.
        </>
      }
      main={
        <Figure
          title="Mật độ Gauss"
          legend={
            <>
              <Key color="var(--c-dist)">mật độ p(x)</Key>
              {showInt && <Key color="var(--c-accent)">khoảng [a, b]</Key>}
            </>
          }
          className="h-full"
        >
          <div ref={ref} className="h-[420px] w-full lg:h-[calc(100vh-280px)] lg:min-h-[380px]">
            <svg width={W} height={H} className="select-none">
              <Axes x={x} y={y} width={W} height={H} xLabel="x" yLabel="mật độ p(x)" />
              {showInt && <path d={areaPath(shade, x, y)} fill="var(--c-dist-soft)" />}
              <path d={linePath(curve, x, y)} fill="none" stroke="var(--c-dist)" strokeWidth={2.6} />
              {/* mean and ±sigma */}
              <line x1={x(mu)} x2={x(mu)} y1={y(0)} y2={y(peak)} stroke="var(--c-dist)" strokeDasharray="4 4" />
              <text x={x(mu)} y={Math.max(y(peak) - 8, 14)} textAnchor="middle" className="chart-label" fontWeight={600}>
                μ = {fmt(mu, 2)}
              </text>
              {[-1, 1].map((k) => (
                <g key={k}>
                  <line x1={x(mu + k * sd)} x2={x(mu + k * sd)} y1={y(0)} y2={y(normPdf(mu + sd, mu, sd))} stroke="var(--ink-3)" strokeDasharray="2 4" />
                  <text x={x(mu + k * sd)} y={y(0) - 6} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                    μ{k > 0 ? "+" : "−"}σ
                  </text>
                </g>
              ))}
              {/* density probe: height, not probability */}
              <g>
                <line x1={x(probe)} x2={x(probe)} y1={y(0)} y2={y(Math.min(pProbe, YMAX))} stroke="var(--c-score)" strokeWidth={3} />
                <circle cx={x(probe)} cy={y(Math.min(pProbe, YMAX))} r={5} fill="var(--c-score)" />
                <text x={x(probe) + 8} y={y(Math.min(pProbe, YMAX)) - 6} fontSize={12} fill="var(--c-score)">
                  chiều cao p(x) = {fmt(pProbe, 3)}
                </text>
                <rect className="handle" x={x(probe) - 10} y={y(0) - 4} width={20} height={22} rx={6} fill="var(--c-score)" opacity={0.9} {...dragP} />
                <text x={x(probe)} y={y(0) + 12} textAnchor="middle" fontSize={10} fill="white" pointerEvents="none">
                  x
                </text>
              </g>
              {showInt &&
                [
                  { v: a, d: dragA, n: "a" },
                  { v: b, d: dragB, n: "b" },
                ].map(({ v, d, n }) => (
                  <g key={n}>
                    <line x1={x(v)} x2={x(v)} y1={y(0)} y2={M.top} stroke="var(--c-accent)" strokeWidth={2} />
                    <rect className="handle" x={x(v) - 9} y={M.top} width={18} height={26} rx={6} fill="var(--c-accent)" {...d} />
                    <text x={x(v)} y={M.top + 17} textAnchor="middle" fontSize={12} fill="white" fontWeight={700} pointerEvents="none">
                      {n}
                    </text>
                  </g>
                ))}
              {showInt && (
                <text x={x((lo + hi) / 2)} y={y(Math.min(normPdf((lo + hi) / 2, mu, sd), YMAX) / 2)} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--ink)">
                  {fmt(P * 100, 1)}%
                </text>
              )}
            </svg>
          </div>
        </Figure>
      }
      controls={
        <>
          <Slider label={<>Trung bình <Tex math="\mu" /></>} value={mu} min={-4} max={4} step={0.01} onChange={setMu} />
          <Slider label={<>Độ lệch chuẩn <Tex math="\sigma" /></>} value={sd} min={0.2} max={3} step={0.01} onChange={setSd} />
          <Switch label="Hiện khoảng xác suất [a, b]" checked={showInt} onChange={setShowInt} />
          <p className="text-[12.5px] text-ink-3">Kéo các nút a, b (vàng) và nút x (tím) ngay trên biểu đồ.</p>
        </>
      }
      measures={
        <div className="grid grid-cols-2 gap-2">
          <Stat label="P(a ≤ X ≤ b)" value={fmt(P, 4)} color="var(--c-accent)" hint="diện tích tô màu" />
          <Stat label="p(x) tại nút x" value={fmt(pProbe, 3)} color="var(--c-score)" hint="chiều cao — không phải xác suất" />
          <Stat label="mật độ ở đỉnh" value={fmt(peak, 3)} hint={peak > 1 ? "> 1 vẫn hợp lệ!" : "= 1/(σ√2π)"} />
          <Stat label="tổng diện tích" value="1.000" hint="luôn chuẩn hoá" />
        </div>
      }
      explanation={
        <>
          <p>
            Đường cong xanh là <b>mật độ</b>. Chiều cao của nó tại một điểm <i>không</i> phải là xác suất — nó có thể lớn hơn 1 khi
            σ nhỏ.
          </p>
          <p>
            <b>Xác suất</b> là diện tích tô màu giữa a và b. Khi σ tăng, đường cong thấp xuống và rộng ra để tổng diện tích vẫn bằng 1.
          </p>
        </>
      }
      tasks={tasks}
      math={
        <>
          <Tex math={String.raw`P(a\le X\le b)=\int_a^b p(x)\,dx=\Phi\!\left(\tfrac{b-\mu}{\sigma}\right)-\Phi\!\left(\tfrac{a-\mu}{\sigma}\right)`} block />
          <p>
            Đỉnh có chiều cao <Tex math={String.raw`1/(\sigma\sqrt{2\pi})`} />, nên khi <Tex math="\sigma<0.4" /> mật độ đỉnh vượt 1. Điều đó hợp lệ
            vì đơn vị của mật độ là “xác suất trên một đơn vị x”.
          </p>
        </>
      }
    />
  );
}
