"use client";
import { BookOpen, Compass, Moon, Route, Sigma, Sparkles, Sun, Waves, Wind, Orbit } from "lucide-react";
import { useSettings } from "./Settings";
import { Switch } from "./ui";
import { cn } from "@/lib/utils";

export const LESSONS = [
  { id: "density", title: "Phân phối xác suất là gì?", icon: BookOpen },
  { id: "diffusion", title: "Khuếch tán làm gì?", icon: Waves },
  { id: "score", title: "Hàm score là gì?", icon: Wind },
  { id: "manifold", title: "Hình học thông tin là gì?", icon: Compass },
  { id: "geodesic", title: "Đường trắc địa Fisher–Rao", icon: Route },
  { id: "spacetime", title: "Hình học không–thời gian khuếch tán", icon: Orbit },
] as const;

export function LessonNavigation({ current, onSelect }: { current: number; onSelect: (i: number) => void }) {
  const { dark, setDark, showMath, setShowMath, guided, setGuided } = useSettings();
  return (
    <nav className="flex h-full flex-col gap-6 p-5">
      <div>
        <div className="flex items-center gap-2 text-ink">
          <Sparkles size={18} className="text-dist" />
          <span className="font-serif text-[19px] leading-none">Diffusion Geometry Lab</span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">Học khuếch tán & hình học thông tin bằng cách chạm và kéo.</p>
      </div>

      <ol className="space-y-1">
        {LESSONS.map((l, i) => {
          const Icon = l.icon;
          const active = i === current;
          return (
            <li key={l.id}>
              <button
                onClick={() => onSelect(i)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors",
                  active ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:bg-surface/70"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold",
                    active ? "bg-ink text-bg" : "bg-surface-2 text-ink-3"
                  )}
                >
                  {i + 1}
                </span>
                <span className="leading-snug">{l.title}</span>
                <Icon size={15} className={cn("ml-auto shrink-0", active ? "text-dist" : "text-ink-3 opacity-0 group-hover:opacity-100")} />
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-auto space-y-3 rounded-xl border border-line bg-surface p-3">
        <Switch label={<span className="flex items-center gap-1.5"><Sigma size={14} /> Hiện toán học</span>} checked={showMath} onChange={setShowMath} />
        <Switch label={<span className="flex items-center gap-1.5"><Sparkles size={14} /> Chế độ hướng dẫn</span>} checked={guided} onChange={setGuided} />
        <Switch label={<span className="flex items-center gap-1.5">{dark ? <Moon size={14} /> : <Sun size={14} />} Giao diện tối</span>} checked={dark} onChange={setDark} />
        <p className="text-[11.5px] leading-snug text-ink-3">
          {guided ? "Hướng dẫn: mỗi bài có các thí nghiệm nhỏ được đánh dấu khi bạn hoàn thành." : "Khám phá tự do: ẩn các bước hướng dẫn."}
        </p>
      </div>
    </nav>
  );
}
