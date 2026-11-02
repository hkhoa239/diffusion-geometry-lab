"use client";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LESSONS, LessonNavigation } from "@/components/LessonNavigation";
import { SettingsProvider } from "@/components/Settings";
import { Button, TooltipProvider } from "@/components/ui";

const loading = () => <div className="p-10 text-ink-3">Đang tải bài học…</div>;
const LESSON_COMPONENTS = [
  dynamic(() => import("@/components/GaussianExplorer"), { ssr: false, loading }),
  dynamic(() => import("@/components/DiffusionExplorer"), { ssr: false, loading }),
  dynamic(() => import("@/components/ScoreField"), { ssr: false, loading }),
  dynamic(() => import("@/components/StatisticalManifold"), { ssr: false, loading }),
  dynamic(() => import("@/components/GeodesicExplorer"), { ssr: false, loading }),
  dynamic(() => import("@/components/SpacetimeExplorer"), { ssr: false, loading }),
];

export default function Home() {
  const [current, setCurrent] = useState(0);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const read = () => {
      const m = window.location.hash.match(/bai-(\d)/);
      if (m) setCurrent(Math.min(LESSONS.length - 1, Math.max(0, Number(m[1]) - 1)));
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const go = (i: number) => {
    setCurrent(i);
    setDrawer(false);
    window.history.replaceState(null, "", `#bai-${i + 1}`);
    window.scrollTo({ top: 0 });
  };

  const Lesson = LESSON_COMPONENTS[current];

  return (
    <SettingsProvider>
      <TooltipProvider>
        <div className="flex min-h-screen">
          {/* Sidebar (desktop) */}
          <aside className="sticky top-0 hidden h-screen w-[270px] shrink-0 border-r border-line bg-surface-2/40 lg:block">
            <LessonNavigation current={current} onSelect={go} />
          </aside>

          {/* Drawer (tablet / phone) */}
          {drawer && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(false)} />
              <aside className="absolute left-0 top-0 h-full w-[280px] border-r border-line bg-bg">
                <button className="absolute right-3 top-3 text-ink-3" onClick={() => setDrawer(false)} aria-label="Đóng">
                  <X size={18} />
                </button>
                <LessonNavigation current={current} onSelect={go} />
              </aside>
            </div>
          )}

          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
              <button className="text-ink-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Mở mục lục">
                <Menu size={20} />
              </button>
              <div className="hidden text-[13px] text-ink-3 lg:block">
                Bài {current + 1} / {LESSONS.length}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={current === 0} onClick={() => go(current - 1)}>
                  <ChevronLeft size={15} /> Bài trước
                </Button>
                <Button variant="primary" disabled={current === LESSONS.length - 1} onClick={() => go(current + 1)}>
                  Bài tiếp <ChevronRight size={15} />
                </Button>
              </div>
            </div>
            <Lesson key={current} />
          </main>
        </div>
      </TooltipProvider>
    </SettingsProvider>
  );
}
