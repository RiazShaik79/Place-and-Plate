"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "./Icons";

interface Slide {
  title: string;
  content: React.ReactNode;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A row of equal cards that scrolls sideways: two in view on wide screens, one (with the next one
 * peeking) on phones. Swipe, Previous / Next, or a dot. No autoplay. Every slide stays in the DOM.
 */
export default function Carousel({ label, slides }: { label: string; slides: Slide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0); // first card in view
  const [visible, setVisible] = useState<number[]>([0]); // every card fully in view
  const [atEnd, setAtEnd] = useState(false);

  // Which slide is at the start of the view, and whether the last one is fully visible.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => {
      const items = [...el.children] as HTMLElement[];
      const left = el.scrollLeft;
      let i = 0;
      for (const [n, item] of items.entries()) if (Math.abs(item.offsetLeft - el.offsetLeft - left) < Math.abs(items[i].offsetLeft - el.offsetLeft - left)) i = n;
      setCurrent(i);
      setVisible(items.flatMap((item, n) => {
        const start = item.offsetLeft - el.offsetLeft - left;
        return start >= -4 && start + item.offsetWidth <= el.clientWidth + 4 ? [n] : [];
      }));
      setAtEnd(left + el.clientWidth >= el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [slides.length]);

  function go(i: number) {
    const el = track.current;
    const item = el?.children[Math.max(0, Math.min(slides.length - 1, i))] as HTMLElement | undefined;
    if (!el || !item) return;
    el.scrollTo({ left: item.offsetLeft - el.offsetLeft, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  const button = "grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-sunken disabled:opacity-35 disabled:hover:bg-surface";

  return (
    <section aria-roledescription="carousel" aria-label={label}>
      <div
        ref={track}
        className="-mx-1 flex items-start scroll-px-1 snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] sm:gap-6 [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s, i) => (
          <div
            key={s.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}: ${s.title}`}
            className="flex shrink-0 basis-[88%] snap-start lg:basis-[calc(50%-12px)] lg:self-stretch"
          >
            {s.content}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={() => go(current - 1)} disabled={current === 0} aria-label="Previous chart" className={button}>
          <ChevronLeft className="h-[18px] w-[18px]" />
        </button>
        <div className="flex items-center">
          {slides.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${s.title}`}
              aria-current={visible.includes(i) ? "true" : undefined}
              className="grid h-6 w-6 place-items-center rounded-full"
            >
              <span className={`h-2 w-2 rounded-full transition-colors ${visible.includes(i) ? "bg-basil" : "bg-line"}`} />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => go(current + 1)} disabled={atEnd} aria-label="Next chart" className={button}>
          <ChevronRight className="h-[18px] w-[18px]" />
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {visible.length > 1
          ? `${visible.map((i) => slides[i].title).join(" and ")}, ${visible[0] + 1} to ${visible.at(-1)! + 1} of ${slides.length}`
          : `${slides[current]?.title}, ${current + 1} of ${slides.length}`}
      </p>
    </section>
  );
}
