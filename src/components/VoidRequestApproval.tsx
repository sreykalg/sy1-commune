"use client";

import { useState, useTransition } from "react";
import { deleteVoidRequest, setVoidRequestStatus } from "@/actions/pos";
import { formatMoney } from "@/lib/menu";
import { phDateTimeLabel } from "@/lib/datetime";
import type { VoidRequest } from "@/lib/types";

function ticketLabel(request: VoidRequest) {
  if (request.ticketNo) return `#${request.ticketNo}`;
  return request.kind === "checkout" ? "Checkout" : "—";
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
                const result = await setVoidRequestStatus(request.id, "approved");
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
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setVoidRequestStatus(request.id, "denied");
                if (result && "error" in result && result.error) {
                  onNotice(result.error);
                  return;
                }
                onNotice("Void request denied.");
              })
            }
            className="rounded-full border border-neutral-300 px-3 py-2 text-xs font-medium hover:border-black disabled:opacity-40"
          >
            Deny
          </button>
        </>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await deleteVoidRequest(request.id);
            onNotice("Request removed.");
          })
        }
        className={`rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 ${
          request.status === "pending" ? "col-span-2 sm:col-span-1" : "col-span-2"
        }`}
      >
        Delete
      </button>
    </div>
  );
}

export function VoidRequestApproval({ requests }: { requests: VoidRequest[] }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rows = [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="min-h-screen min-w-0 space-y-6 rounded-none border-0 border-neutral-300 bg-white p-3 sm:rounded-xl sm:border sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Void request approval</h1>
      </div>
      {notice ? <p className="text-sm text-neutral-600">{notice}</p> : null}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 px-4 py-10 text-center text-sm text-neutral-400">
          No void requests yet.
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((request) => (
              <article key={request.id} className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{request.cashierName}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {phDateTimeLabel(request.createdAt)} · {ticketLabel(request)}
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
                      {phDateTimeLabel(request.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium">{request.cashierName}</td>
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
