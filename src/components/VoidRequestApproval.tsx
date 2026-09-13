"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { approveVoidRequest } from "@/actions/pos";
import { formatMoney } from "@/lib/menu";
import { phDateTimeLabel } from "@/lib/datetime";
import type { VoidRequest } from "@/lib/types";

function ticketLabel(request: VoidRequest) {
  if (request.orderId) return request.orderId.slice(-6);
  return "Checkout";
}

function toInputDateStr(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function periodBounds(rangeType: string, filterDateStr: string, mode: "range" | "date") {
  let now = new Date();
  const startOfPeriod = new Date();

  if (mode === "date" && filterDateStr) {
    now = new Date(`${filterDateStr}T23:59:59+08:00`);
    startOfPeriod.setTime(now.getTime());
    startOfPeriod.setHours(0, 0, 0, 0);
    return { start: startOfPeriod, end: now };
  }

  now = new Date();
  startOfPeriod.setTime(now.getTime());

  if (rangeType === "today") {
    startOfPeriod.setHours(0, 0, 0, 0);
  } else if (rangeType === "week") {
    startOfPeriod.setDate(now.getDate() - 6);
    startOfPeriod.setHours(0, 0, 0, 0);
  } else if (rangeType === "lastWeek") {
    const dayOfWeek = now.getDay();
    const diffToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - diffToLastMonday - 7);
    lastMonday.setHours(0, 0, 0, 0);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);
    return { start: lastMonday, end: lastSunday };
  } else if (rangeType === "month") {
    startOfPeriod.setDate(1);
    startOfPeriod.setHours(0, 0, 0, 0);
  } else if (rangeType === "lastMonth") {
    startOfPeriod.setMonth(now.getMonth() - 1);
    startOfPeriod.setDate(1);
    startOfPeriod.setHours(0, 0, 0, 0);
    now.setDate(0);
    now.setHours(23, 59, 59, 999);
  } else if (rangeType === "thisYear") {
    startOfPeriod.setMonth(0, 1);
    startOfPeriod.setHours(0, 0, 0, 0);
  } else if (rangeType === "lastYear") {
    const prevYear = now.getFullYear() - 1;
    startOfPeriod.setFullYear(prevYear, 0, 1);
    startOfPeriod.setHours(0, 0, 0, 0);
    now.setFullYear(prevYear, 11, 31);
    now.setHours(23, 59, 59, 999);
  }

  return { start: startOfPeriod, end: now };
}

function RequestActions({
  request,
  pending,
  onNotice,
  startTransition,
}: {
  request: VoidRequest;
  pending: boolean;
  onNotice: (value: string) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
      {request.status === "pending" ? (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await approveVoidRequest(request.id);
                if (result && "error" in result && result.error) {
                  onNotice(result.error);
                  return;
                }
                onNotice("Void request approved.");
              })
            }
            className="rounded-full bg-black px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            Approve
          </button>
        </>
      ) : null}
    </div>
  );
}

export function VoidRequestApproval({ requests }: { requests: VoidRequest[] }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [filterDateStr, setFilterDateStr] = useState("");
  const [rangeType, setRangeType] = useState("today");
  const [activeFilterMode, setActiveFilterMode] = useState<"range" | "date">("range");

  useEffect(() => {
    setFilterDateStr(toInputDateStr(new Date()));
  }, []);

  const rows = useMemo(() => {
    const { start, end } = periodBounds(rangeType, filterDateStr, activeFilterMode);
    const startMs = start.getTime();
    const endMs = end.getTime();
    return [...requests]
      .filter((request) => {
        const at = new Date(request.requestedAt).getTime();
        return Number.isFinite(at) && at >= startMs && at <= endMs;
      })
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [activeFilterMode, filterDateStr, rangeType, requests]);

  return (
    <div className="min-h-screen min-w-0 space-y-6 rounded-none border-0 border-neutral-300 bg-white p-3 sm:rounded-xl sm:border sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Void request approval</h1>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
          <div
            className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 shadow-sm transition sm:py-1.5 ${
              activeFilterMode === "range"
                ? "bg-white border-black ring-1 ring-black"
                : "bg-white border-neutral-300 opacity-75"
            }`}
          >
            <span className="shrink-0 text-xs font-medium text-neutral-500">Range:</span>
            <select
              value={rangeType}
              onChange={(event) => {
                setRangeType(event.target.value);
                setActiveFilterMode("range");
              }}
              onClick={() => setActiveFilterMode("range")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="lastWeek">Last Week</option>
              <option value="month">This Month</option>
              <option value="lastMonth">Last Month</option>
              <option value="thisYear">This Year</option>
              <option value="lastYear">Last Year</option>
            </select>
          </div>
          <div
            className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 shadow-sm transition sm:py-1.5 ${
              activeFilterMode === "date"
                ? "bg-white border-black ring-1 ring-black"
                : "bg-white border-neutral-300 opacity-75"
            }`}
          >
            <span className="shrink-0 text-xs font-medium text-neutral-500">Date:</span>
            <input
              type="date"
              value={filterDateStr}
              onChange={(event) => {
                setFilterDateStr(event.target.value);
                setActiveFilterMode("date");
              }}
              onClick={() => setActiveFilterMode("date")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>
      {notice ? <p className="text-sm text-neutral-600">{notice}</p> : null}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 px-4 py-10 text-center text-sm text-neutral-400">
          No void requests in this range.
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((request) => (
              <article key={request.id} className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{request.requestedByName}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {phDateTimeLabel(request.requestedAt)} · {ticketLabel(request)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{formatMoney(request.total)}</p>
                    <p className="mt-0.5 text-[11px] text-neutral-500 capitalize">{request.status}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-neutral-600">
                  {request.items.map((item) => `${item.qty}× ${item.name}`).join(", ")}
                </p>
                <p className="mt-2 text-xs text-neutral-500">Reason: {request.reason}</p>
                <div className="mt-3 border-t border-neutral-100 pt-3">
                  <RequestActions
                    request={request}
                    pending={pending}
                    onNotice={setNotice}
                    startTransition={startTransition}
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-neutral-200 bg-white md:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs font-medium tracking-wide text-neutral-400 uppercase">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Cashier</th>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((request) => (
                  <tr key={request.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3 whitespace-nowrap text-neutral-600">
                      {phDateTimeLabel(request.requestedAt)}
                    </td>
                    <td className="px-4 py-3 font-medium">{request.requestedByName}</td>
                    <td className="px-4 py-3 text-neutral-600">{ticketLabel(request)}</td>
                    <td className="max-w-[220px] px-4 py-3 text-neutral-600">
                      {request.items.map((item) => `${item.qty}× ${item.name}`).join(", ")}
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-neutral-600">{request.reason}</td>
                    <td className="px-4 py-3 capitalize">{request.status}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(request.total)}</td>
                    <td className="px-4 py-3">
                      <RequestActions
                        request={request}
                        pending={pending}
                        onNotice={setNotice}
                        startTransition={startTransition}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
