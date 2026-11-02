"use client";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Circle, FlaskConical, Sigma } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSettings } from "./Settings";
import { Card, Tex } from "./ui";

export interface Task {
  text: ReactNode;
  done?: boolean;
}

export function LessonShell({
  index,
  title,
  intuition,
  main,
  controls,
  measures,
  equation,
  equationNote,
  explanation,
  tasks,
  math,
}: {
  index: number;
  title: string;
  intuition: ReactNode;
  main: ReactNode;
  controls?: ReactNode;
  measures?: ReactNode;
  equation: string;
  equationNote?: ReactNode;
  explanation: ReactNode;
  tasks: Task[];
  math?: ReactNode;
}) {
  const { guided, showMath } = useSettings();
  const doneCount = tasks.filter((t) => t.done).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
      {/* Main visualisation */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 lg:p-7">
        <motion.header initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3">Bài {index}</div>
          <h1 className="mt-1 font-serif text-[28px] leading-tight text-ink lg:text-[32px]">{title}</h1>
          <p className="mt-2 max-w-3xl text-[16px] leading-relaxed text-ink-2">{intuition}</p>
        </motion.header>
        <motion.div
          className="min-h-0 flex-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          {main}
        </motion.div>
      </div>

      {/* Context panel */}
      <aside className="scroll-thin w-full shrink-0 space-y-3 overflow-y-auto border-t border-line bg-bg/60 p-4 xl:w-[370px] xl:border-l xl:border-t-0">
        <Card title="Công thức chính">
          <Tex math={equation} block />
          {equationNote && <div className="mt-2 text-[13px] leading-relaxed text-ink-2">{equationNote}</div>}
        </Card>
        {controls && <Card title="Điều khiển">{<div className="space-y-4">{controls}</div>}</Card>}
        {measures && <Card title="Số đo trực tiếp">{measures}</Card>}
        <Card title="Bạn đang thấy gì?">
          <div className="space-y-2 text-[14px] leading-relaxed text-ink-2">{explanation}</div>
        </Card>
        {guided && (
          <Card
            title={
              <span className="flex items-center gap-1.5">
                <FlaskConical size={13} /> Thử xem ({doneCount}/{tasks.length})
              </span>
            }
          >
            <ul className="space-y-2.5">
              {tasks.map((t, i) => (
                <li key={i} className="flex gap-2 text-[14px] leading-snug text-ink-2">
                  {t.done ? (
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-geo" />
                  ) : (
                    <Circle size={17} className="mt-0.5 shrink-0 text-ink-3" />
                  )}
                  <span className={t.done ? "text-ink" : ""}>{t.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {math && <MathDetails defaultOpen={showMath}>{math}</MathDetails>}
      </aside>
    </div>
  );
}

function MathDetails({ children, defaultOpen }: { children: ReactNode; defaultOpen: boolean }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? defaultOpen;
  return (
    <section className="rounded-xl border border-line bg-surface">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3"
        onClick={() => setOpen(!isOpen)}
      >
        <span className="flex items-center gap-1.5">
          <Sigma size={13} /> Toán học chi tiết
        </span>
        <ChevronDown size={15} className={isOpen ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 px-4 pb-4 text-[13.5px] leading-relaxed text-ink-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** A panel that frames one chart in the main area. */
export function Figure({ title, children, legend, className }: { title?: ReactNode; children: ReactNode; legend?: ReactNode; className?: string }) {
  return (
    <div className={"flex min-h-0 flex-col rounded-2xl border border-line bg-surface p-3 " + (className ?? "")}>
      {(title || legend) && (
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 px-1">
          {title && <div className="text-[13px] font-semibold text-ink">{title}</div>}
          {legend && <div className="flex flex-wrap gap-3 text-[12px] text-ink-2">{legend}</div>}
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export function Key({ color, children, dashed }: { color: string; children: ReactNode; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="18" height="8">
        <line x1="1" x2="17" y1="4" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      {children}
    </span>
  );
}
