"use client";
import * as d3 from "d3";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

export function useSize<T extends HTMLElement>(): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 600, height: 360 });
  useEffect(() => {
    if (!ref.current) return;
    let frame = 0;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      const w = Math.max(260, Math.floor(r.width));
      const h = Math.max(180, Math.floor(r.height));
      // deliver on the next frame and ignore sub-pixel jitter, so layout feedback cannot loop
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setSize((s) => (Math.abs(s.width - w) <= 1 && Math.abs(s.height - h) <= 1 ? s : { width: w, height: h }))
      );
    });
    ro.observe(ref.current);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);
  return [ref, size];
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export const M: Margin = { top: 16, right: 18, bottom: 34, left: 44 };

type Lin = d3.ScaleLinear<number, number>;

export function Axes({
  x,
  y,
  width,
  height,
  margin = M,
  xLabel,
  yLabel,
  xTicks = 8,
  yTicks = 5,
  grid = true,
  xFormat,
  yFormat,
}: {
  x: Lin;
  y: Lin;
  width: number;
  height: number;
  margin?: Margin;
  xLabel?: ReactNode;
  yLabel?: ReactNode;
  xTicks?: number;
  yTicks?: number;
  grid?: boolean;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
}) {
  const fx = xFormat ?? x.tickFormat(xTicks);
  const fy = yFormat ?? y.tickFormat(yTicks);
  return (
    <g className="axis">
      {grid &&
        y.ticks(yTicks).map((t) => <line key={`gy${t}`} className="gridline" x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} />)}
      {grid &&
        x.ticks(xTicks).map((t) => <line key={`gx${t}`} className="gridline" x1={x(t)} x2={x(t)} y1={margin.top} y2={height - margin.bottom} />)}
      <line x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
      {x.ticks(xTicks).map((t) => (
        <text key={`x${t}`} x={x(t)} y={height - margin.bottom + 15} textAnchor="middle">
          {fx(t)}
        </text>
      ))}
      {y.ticks(yTicks).map((t) => (
        <text key={`y${t}`} x={margin.left - 7} y={y(t) + 4} textAnchor="end">
          {fy(t)}
        </text>
      ))}
      {xLabel && (
        <text className="chart-label" x={width - margin.right} y={height - 4} textAnchor="end">
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text className="chart-label" x={margin.left - 36} y={margin.top - 4} textAnchor="start">
          {yLabel}
        </text>
      )}
    </g>
  );
}

/** Pointer drag on an SVG: calls onDrag with coordinates in the SVG's pixel space. */
export function useSvgDrag(onDrag: (px: number, py: number) => void) {
  const dragging = useRef(false);
  const onPointerDown = useCallback((e: React.PointerEvent<SVGElement>) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.stopPropagation();
  }, []);
  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      if (!dragging.current) return;
      const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
      const r = svg.getBoundingClientRect();
      onDrag(e.clientX - r.left, e.clientY - r.top);
    },
    [onDrag]
  );
  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}

export function linePath(pts: [number, number][], x: Lin, y: Lin) {
  return d3.line<[number, number]>().x((p) => x(p[0])).y((p) => y(p[1]))(pts) ?? "";
}

export function areaPath(pts: [number, number][], x: Lin, y: Lin, y0 = 0) {
  return (
    d3
      .area<[number, number]>()
      .x((p) => x(p[0]))
      .y0(y(y0))
      .y1((p) => y(p[1]))(pts) ?? ""
  );
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/** Arrowhead marker definitions (one per semantic colour). */
export function ArrowDefs({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
      </marker>
    </defs>
  );
}
