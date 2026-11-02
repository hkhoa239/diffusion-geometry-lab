"use client";
import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useState } from "react";
import { frDistanceGaussian, frLineElement, linspace, normPdf } from "@/lib/gaussian";
import { fmt } from "@/lib/utils";
import { ArrowDefs, areaPath, Axes, clamp, linePath, M, useSize, useSvgDrag } from "./charts/Chart";
import { Figure, Key, LessonShell } from "./LessonShell";
import { Slider, Stat, Switch, Sym, Tex } from "./ui";

const MU: [number, number] = [-4, 4];
const SG: [number, number] = [0.1, 3];
const EPS = 0.14; // radius of the drawn Fisher unit balls

export default function StatisticalManifold() {
  const [mu, setMu] = useState(-1);
  const [sd, setSd] = useState(1);
  const [d, setD] = useState<[number, number]>([1, 0]); // displacement (dmu, dsigma)
  const [showBalls, setShowBalls] = useState(true);
  const [seen, setSeen] = useState({ narrow: false, wide: false, vertical: false });

  const end: [number, number] = [mu + d[0], Math.max(0.05, sd + d[1])];
  const eucl = Math.hypot(d[0], d[1]);
  const frInf = frLineElement(d[0], d[1], sd);
  const frExact = frDistanceGaussian(mu, sd, end[0], end[1]);
  const horizontal = Math.abs(d[1]) < 0.08 && Math.abs(d[0]) > 0.5;
  const vertical = Math.abs(d[0]) < 0.08 && Math.abs(d[1]) > 0.2;

  // record guided-experiment progress
  useEffect(() => {
    setSeen((s) => {
      const n = { narrow: s.narrow || (horizontal && sd < 0.45), wide: s.wide || (horizontal && sd > 2), vertical: s.vertical || vertical };
      return n.narrow === s.narrow && n.wide === s.wide && n.vertical === s.vertical ? s : n;
    });
  }, [horizontal, vertical, sd]);

  const [refL, sL] = useSize<HTMLDivElement>();
  const [refR, sR] = useSize<HTMLDivElement>();
  const H = 400;
  const xs = useMemo(() => linspace(-8, 8, 500), []);
  const xL = d3.scaleLinear().domain([-8, 8]).range([M.left, sL.width - M.right]);
  const yL = d3.scaleLinear().domain([0, 1.6]).range([H - M.bottom, M.top]);
  const xR = d3.scaleLinear().domain(MU).range([M.left, sR.width - M.right]);
  const yR = d3.scaleLinear().domain(SG).range([H - M.bottom, M.top]);

  const dragP = useSvgDrag(
    useCallback((px: number, py: number) => {
      setMu(clamp(xR.invert(px), MU[0], MU[1]));
      setSd(clamp(yR.invert(py), 0.15, SG[1]));
    }, [xR, yR])
  );
  const dragD = useSvgDrag(
    useCallback(
      (px: number, py: number) => {
        const nx = clamp(xR.invert(px), MU[0], MU[1]);
        const ny = clamp(yR.invert(py), 0.12, SG[1]);
        setD([nx - mu, ny - sd]);
      },
      [xR, yR, mu, sd]
    )
  );

  const balls = useMemo(() => {
    const out: { m: number; s: number }[] = [];
    for (const m of linspace(-3.5, 3.5, 8)) for (const s of [0.3, 0.55, 0.9, 1.35, 1.9, 2.55]) out.push({ m, s });
    return out;
  }, []);

  return (
    <LessonShell
      index={4}
      title="Hình học thông tin là gì?"
      intuition={
        <>
          Mỗi điểm trong <b>đa tạp thống kê</b> là cả một phân phối xác suất. Di chuyển một điểm nghĩa là thay đổi toàn bộ phân phối.
        </>
      }
      equation={String.raw`\begin{gathered}G(\mu,\sigma)=\begin{pmatrix}1/\sigma^2&0\\0&2/\sigma^2\end{pmatrix}\\[4pt] ds^2=\frac{d\mu^2+2\,d\sigma^2}{\sigma^2}\end{gathered}`}
      equationNote={
        <>
          <Sym tex="G" tip="Ma trận thông tin Fisher: đo phân phối thay đổi bao nhiêu khi tham số thay đổi một chút." /> phụ thuộc vào{" "}
          <Sym tex="\sigma" tip="Độ lệch chuẩn. σ càng nhỏ, mỗi bước dịch chuyển càng “đắt”." />: cùng một bước <Tex math="d\mu" /> sẽ dài hơn khi σ nhỏ.
        </>
      }
      main={
        <div className="grid gap-4 xl:grid-cols-2">
          <Figure
            title="Không gian phân phối"
            legend={
              <>
                <Key color="var(--c-dist)">N(μ, σ²)</Key>
                <Key color="var(--c-accent)" dashed>
                  sau dịch chuyển
                </Key>
              </>
            }
          >
            <div ref={refL} className="w-full">
              <svg width={sL.width} height={H}>
                <Axes x={xL} y={yL} width={sL.width} height={H} xLabel="x" yLabel="p(x)" />
                <path d={linePath(xs.map((v) => [v, Math.min(normPdf(v, end[0], end[1]), 1.6)]), xL, yL)} fill="none" stroke="var(--c-accent)" strokeWidth={2} strokeDasharray="6 4" />
                <path d={areaPath(xs.map((v) => [v, Math.min(normPdf(v, mu, sd), 1.6)]), xL, yL)} fill="var(--c-dist-soft)" />
                <path d={linePath(xs.map((v) => [v, Math.min(normPdf(v, mu, sd), 1.6)]), xL, yL)} fill="none" stroke="var(--c-dist)" strokeWidth={2.6} />
              </svg>
            </div>
          </Figure>
          <Figure
            title="Không gian tham số (μ, σ)"
            legend={
              <>
                {showBalls && <Key color="var(--c-geo)">quả cầu Fisher đơn vị</Key>}
                <Key color="var(--c-accent)">dịch chuyển</Key>
              </>
            }
          >
            <div ref={refR} className="w-full">
              <svg width={sR.width} height={H} className="select-none">
                <ArrowDefs id="arrD" color="var(--c-accent)" />
                <Axes x={xR} y={yR} width={sR.width} height={H} xLabel="μ" yLabel="σ" />
                {showBalls &&
                  balls.map((b, i) => (
                    <ellipse
                      key={i}
                      cx={xR(b.m)}
                      cy={yR(b.s)}
                      rx={Math.abs(xR(EPS * b.s) - xR(0))}
                      ry={Math.abs(yR(SG[0] + (EPS * b.s) / Math.SQRT2) - yR(SG[0]))}
                      fill="var(--c-geo)"
                      fillOpacity={0.08}
                      stroke="var(--c-geo)"
                      strokeOpacity={0.45}
                    />
                  ))}
                <ellipse
                  cx={xR(mu)}
                  cy={yR(sd)}
                  rx={Math.abs(xR(EPS * sd) - xR(0))}
                  ry={Math.abs(yR(SG[0] + (EPS * sd) / Math.SQRT2) - yR(SG[0]))}
                  fill="var(--c-geo)"
                  fillOpacity={0.18}
                  stroke="var(--c-geo)"
                  strokeWidth={2}
                />
                <line x1={xR(mu)} y1={yR(sd)} x2={xR(end[0])} y2={yR(end[1])} stroke="var(--c-accent)" strokeWidth={3} markerEnd="url(#arrD)" />
                <circle className="handle" cx={xR(end[0])} cy={yR(end[1])} r={8} fill="var(--c-accent)" stroke="white" strokeWidth={2} {...dragD} />
                <circle className="handle" cx={xR(mu)} cy={yR(sd)} r={10} fill="var(--c-dist)" stroke="white" strokeWidth={2.5} {...dragP} />
                <text x={xR(mu) - 12} y={yR(sd) - 16} fontSize={12} fill="var(--c-dist)" fontWeight={600} textAnchor="end">
                  N({fmt(mu, 1)}, {fmt(sd, 2)}²)
                </text>
              </svg>
            </div>
          </Figure>
        </div>
      }
      controls={
        <>
          <Slider label={<>Trung bình <Tex math="\mu" /></>} value={mu} min={MU[0]} max={MU[1]} step={0.01} onChange={setMu} />
          <Slider label={<>Độ lệch chuẩn <Tex math="\sigma" /></>} value={sd} min={0.15} max={3} step={0.01} onChange={setSd} />
          <Slider label={<>Dịch chuyển <Tex math="d\mu" /></>} value={d[0]} min={-2} max={2} step={0.01} onChange={(v) => setD([v, d[1]])} accent="var(--c-accent)" />
          <Slider label={<>Dịch chuyển <Tex math="d\sigma" /></>} value={d[1]} min={-1} max={1} step={0.01} onChange={(v) => setD([d[0], v])} accent="var(--c-accent)" />
          <Switch label="Hiện metric cục bộ (quả cầu Fisher)" checked={showBalls} onChange={setShowBalls} />
          <p className="text-[12.5px] text-ink-3">Kéo chấm xanh để chọn phân phối; kéo chấm vàng để đặt mũi tên dịch chuyển.</p>
        </>
      }
      measures={
        <div className="grid grid-cols-2 gap-2">
          <Stat label="độ dài Euclid" value={fmt(eucl, 3)} color="var(--c-euclid)" hint="√(dμ² + dσ²)" />
          <Stat label="độ dài Fisher–Rao vô cùng bé" value={fmt(frInf, 3)} color="var(--c-geo)" hint="√(dμ²+2dσ²)/σ" />
          <Stat label="khoảng cách FR chính xác" value={fmt(frExact, 3)} color="var(--c-geo)" hint="giữa hai đầu mũi tên" />
          <Stat label="tỉ lệ FR / Euclid" value={eucl > 1e-6 ? fmt(frInf / eucl, 2) + "×" : "—"} hint="≈ 1/σ khi đi ngang" />
        </div>
      }
      explanation={
        <>
          <p>
            Hình học thông tin đo <b>phân phối thay đổi bao nhiêu</b>, không chỉ tham số di chuyển bao xa.
          </p>
          <p>
            Mỗi elip xanh lá là tập các dịch chuyển có cùng “độ dài Fisher”. Elip <b>nhỏ</b> khi σ nhỏ: một bước nhỏ đã làm Gauss hẹp thay đổi rất
            nhiều. Elip <b>lớn</b> khi σ lớn: Gauss rộng gần như không đổi khi dịch nhẹ.
          </p>
          <p>Elip dẹt theo chiều σ (tỉ lệ 1/√2): đổi độ rộng “đắt” hơn đổi vị trí một chút.</p>
        </>
      }
      tasks={[
        { text: "Đặt mũi tên nằm ngang (dσ ≈ 0), rồi kéo chấm xanh xuống σ < 0.45. Độ dài Fisher thay đổi ra sao?", done: seen.narrow },
        { text: "Giữ mũi tên ngang và kéo lên σ > 2. Cùng một bước dμ giờ “rẻ” hơn bao nhiêu?", done: seen.wide },
        { text: "Đặt mũi tên thẳng đứng (dμ ≈ 0). Vì sao tỉ lệ FR/Euclid giờ là √2/σ?", done: seen.vertical },
      ]}
      math={
        <>
          <Tex math={String.raw`G_{ab}=\mathbb E\big[\partial_a\log p\;\partial_b\log p\big],\quad \partial_\mu\log p=\tfrac{x-\mu}{\sigma^2},\ \partial_\sigma\log p=\tfrac{(x-\mu)^2-\sigma^2}{\sigma^3}`} block />
          <p>Lấy kỳ vọng dưới N(μ, σ²) cho ra đúng ma trận ở trên. Khoảng cách chính xác giữa hai Gauss:</p>
          <Tex math={String.raw`d=\sqrt2\,\operatorname{arccosh}\!\Big(1+\frac{(\mu_1-\mu_2)^2+2(\sigma_1-\sigma_2)^2}{4\sigma_1\sigma_2}\Big)`} block />
        </>
      }
    />
  );
}
