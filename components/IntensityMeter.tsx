import { INTENSITIES, INTENSITY_LABELS, type Intensity } from "@/lib/types";

/** Three small bars filled to the intensity level, with the word beside them (never colour alone). */
export default function IntensityMeter({ intensity }: { intensity: Intensity }) {
  const level = INTENSITIES.indexOf(intensity) + 1;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`w-[3px] rounded-full ${n <= level ? "bg-basil" : "bg-line"}`} style={{ height: 4 + n * 3 }} />
        ))}
      </span>
      {INTENSITY_LABELS[intensity]}
    </span>
  );
}
