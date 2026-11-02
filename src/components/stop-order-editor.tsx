"use client";
import { useId, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "./ui/button";
import { Notice } from "./common";
import type { Stop } from "@/lib/client";

export type StopOrder = {
  orderedStopIds: string[];
  fixedThroughStopId: string;
};

export function StopOrderEditor({
  stops,
  busy,
  onCancel,
  onSave,
}: {
  stops: Stop[];
  busy: boolean;
  onCancel: () => void;
  onSave: (order: StopOrder) => void;
}) {
  const [draft, setDraft] = useState(stops);
  const editorId = useId();
  const [boundaryId, setBoundaryId] = useState(stops[0].id);
  const boundary = draft.findIndex((stop) => stop.id === boundaryId);
  const prefix = draft.slice(0, boundary + 1);
  const suffix = draft.slice(boundary + 1);
  const overridesUrgency = prefix.some(
    (stop, i) =>
      !stop.isUrgent && draft.slice(i + 1).some((next) => next.isUrgent),
  );
  function move(from: number, to: number) {
    const next = [...draft];
    const [stop] = next.splice(from, 1);
    next.splice(to, 0, stop);
    // Moving between the two lists remounts the row. Keep the keyboard on this stop.
    const activeId = document.activeElement?.id;
    flushSync(() => setDraft(next));
    const control = activeId && document.getElementById(activeId);
    (control && !control.matches(":disabled")
      ? control
      : document.getElementById(`${editorId}-position-${stop.id}`)
    )?.focus();
  }
  return (
    <section aria-labelledby={editorId} className="panel min-w-0">
      <header className="mb-6">
        <h2 id={editorId} className="text-xl font-bold text-slate-900">
          Atur urutan
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Susun tujuan, lalu pilih pemberhentian terakhir yang urutannya tetap.
        </p>
      </header>
      <fieldset
        disabled={busy}
        aria-labelledby={editorId}
        aria-busy={busy}
        className="min-w-0 space-y-5"
      >
        {[prefix, suffix].map((group, groupIndex) => (
          <section key={groupIndex}>
            <h3
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${groupIndex === 0 ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-700"}`}
            >
              {groupIndex === 0 ? "Urutan tetap" : "Akan dioptimalkan"} ·{" "}
              {group.length} tujuan
            </h3>
            {group.length === 0 && (
              <p className="px-3 pt-3 text-sm text-slate-500">
                Semua tujuan sudah ditetapkan.
              </p>
            )}
            <ol
              className="divide-y divide-slate-100"
              start={groupIndex ? prefix.length + 1 : 1}
            >
              {group.map((stop) => {
                const index = draft.indexOf(stop);
                return (
                  <li
                    key={stop.id}
                    className="grid min-w-0 items-center gap-x-5 gap-y-2 py-3 lg:grid-cols-[minmax(0,1fr)_auto_10rem]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="font-semibold wrap-anywhere">
                          {stop.storeNameSnapshot}
                        </span>
                        {stop.isUrgent && (
                          <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                            Urgent
                          </span>
                        )}
                        {stop.id === boundaryId && (
                          <p className="mt-1 text-xs font-semibold text-teal-700">
                            Batas urutan tetap
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={index === 0}
                        id={`${editorId}-up-${stop.id}`}
                        aria-label={`Naikkan ${stop.storeNameSnapshot}`}
                        onClick={() => move(index, index - 1)}
                      >
                        <ArrowUp size={16} aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={index === draft.length - 1}
                        id={`${editorId}-down-${stop.id}`}
                        aria-label={`Turunkan ${stop.storeNameSnapshot}`}
                        onClick={() => move(index, index + 1)}
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                      </Button>
                      <label className="flex items-center gap-2 text-slate-600">
                        Posisi
                        <select
                          id={`${editorId}-position-${stop.id}`}
                          aria-label={`Posisi ${stop.storeNameSnapshot}`}
                          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-600"
                          value={index}
                          onChange={(event) =>
                            move(index, Number(event.target.value))
                          }
                        >
                          {draft.map((_, i) => (
                            <option key={i} value={i}>
                              {i + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 text-slate-600">
                      <input
                        type="radio"
                        id={`${editorId}-boundary-${stop.id}`}
                        name={`${editorId}-fixed-through`}
                        aria-label={`Tetapkan sampai ${stop.storeNameSnapshot}`}
                        className="size-4 shrink-0 accent-teal-700"
                        checked={stop.id === boundaryId}
                        onChange={(event) => {
                          const id = event.currentTarget.id;
                          flushSync(() => setBoundaryId(stop.id));
                          document.getElementById(id)?.focus();
                        }}
                      />{" "}
                      Tetapkan sampai di sini
                    </label>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        {overridesUrgency && (
          <Notice>
            Urutan tetap menempatkan tujuan biasa sebelum tujuan urgent. Tujuan
            urgent dalam bagian yang dioptimalkan tetap didahulukan.
          </Notice>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button
            onClick={() =>
              onSave({
                orderedStopIds: draft.map((stop) => stop.id),
                fixedThroughStopId: boundaryId,
              })
            }
          >
            {busy
              ? "Menghitung…"
              : suffix.length
                ? "Simpan dan optimalkan sisa"
                : "Simpan urutan dan hitung estimasi"}
          </Button>
        </div>
      </fieldset>
    </section>
  );
}
