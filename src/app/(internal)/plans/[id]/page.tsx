"use client";
import { use, useEffect, useState } from "react";
import { requestJson, type Plan } from "@/lib/client";
import { PageTitle, Notice } from "@/components/common";
import { PlanResult } from "@/components/plan-result";
export default function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [plan, setPlan] = useState<Plan>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    requestJson<Plan>(`/api/plans/${id}`)
      .then((plan) => {
        if (active) setPlan(plan);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <>
      <PageTitle
        eyebrow="Detail rencana"
        title="Hasil pengantaran"
        description="Nama dan koordinat memakai snapshot saat rencana dibuat."
      />
      {error && <Notice error>{error}</Notice>}
      {plan ? (
        <PlanResult key={plan.id} plan={plan} />
      ) : (
        !error && <p role="status">Memuat rencana…</p>
      )}
    </>
  );
}
