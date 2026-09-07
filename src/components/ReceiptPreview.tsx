"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { CAFE } from "@/lib/cafe";
import {
  itemCount,
  receiptMoney,
  receiptWhen,
  type PaperWidth,
  type ReceiptTicket,
} from "@/lib/escpos";
import { paymentLabel } from "@/lib/payments";

type ReceiptPreviewProps = {
  ticket: ReceiptTicket;
  paperWidth: PaperWidth;
  printerReady: boolean;
  pending: boolean;
  onClose: () => void;
  onPrint: () => void;
};

function Slip({
  title,
  paperWidth,
  children,
}: {
  title: string;
  paperWidth: PaperWidth;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
        {title}
      </p>
      <div
        className="bg-white px-4 py-5 text-black shadow-xl"
        style={{ width: paperWidth === 58 ? 220 : 300 }}
      >
        <div className="font-mono text-[11px] leading-4">{children}</div>
      </div>
    </div>
  );
}

function Rule() {
  return <p className="my-2 overflow-hidden text-neutral-400">{"-".repeat(42)}</p>;
}

function Row({ left, right, strong }: { left: string; right: string; strong?: boolean }) {
  return (
    <p className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <span>{left}</span>
      <span className="shrink-0">{right}</span>
    </p>
  );
}

function CustomerSlip({ ticket }: { ticket: ReceiptTicket }) {
  return (
    <>
      <div className="flex justify-center">
        <Image
          src="/images/logo.jpg"
          alt={CAFE.name}
          width={72}
          height={72}
          className="h-[72px] w-[72px] rounded-full object-cover"
        />
      </div>
      <p className="mt-2 text-center text-[10px] tracking-[0.12em]">
        {CAFE.tagline}
      </p>
      <p className="mt-2 text-center">{CAFE.street}</p>
      <p className="text-center">{CAFE.city}</p>
      <p className="text-center">Tel {CAFE.phone}</p>
      <Rule />
      <p className="mt-1 text-center text-base font-bold">
        Order No. {ticket.ticketNo}
      </p>
      <p className="text-center">{receiptWhen(ticket.at)}</p>
      <p className="text-center">Cashier: {ticket.cashier}</p>
      <Rule />
      <Row left="Item" right="Amount" strong />
      {ticket.items.map((item) => (
        <div key={item.productId} className="mt-2">
          <p>{item.name}</p>
          <Row
            left={`  ${item.qty} x ${receiptMoney(item.price)}`}
            right={receiptMoney(item.price * item.qty)}
          />
        </div>
      ))}
      <Rule />
      <Row left="Subtotal" right={receiptMoney(ticket.subtotal)} />
      {ticket.discount > 0 ? (
        <Row
          left={ticket.promoLabel ?? "Discount"}
          right={`-${receiptMoney(ticket.discount)}`}
        />
      ) : null}
      <Row left="TOTAL" right={receiptMoney(ticket.total)} strong />
      {ticket.paid && ticket.paid > 0 ? (
        <>
          <Rule />
          {ticket.paymentMethod === "gcash" || ticket.paymentMethod === "maya" ? (
            <>
              <Row left="Pay" right={paymentLabel(ticket.paymentMethod)} />
              <Row
                left={paymentLabel(ticket.paymentMethod)}
                right={receiptMoney(ticket.paid)}
              />
            </>
          ) : (
            <>
              <Row left="Cash" right={receiptMoney(ticket.paid)} />
              <Row left="Change" right={receiptMoney(ticket.change ?? 0)} />
            </>
          )}
        </>
      ) : null}
      <Rule />
      <p className="text-center lowercase">{CAFE.tagline.toLowerCase()}</p>
      <p className="mt-1 text-center">have a seat, take a sip</p>
      <p className="mt-1 text-center">Thank you. Please come again.</p>
      <p className="mt-3 text-center text-[10px] text-neutral-500">Order slip</p>
    </>
  );
}

function BaristaSlip({ ticket }: { ticket: ReceiptTicket }) {
  const drinks = itemCount(ticket.items);
  return (
    <>
      <p className="text-center text-[10px]">MAKE THESE DRINKS</p>
      <Rule />
      <p className="text-center font-bold">ORDER NO. {ticket.ticketNo}</p>
      <p className="text-center">{receiptWhen(ticket.at)}</p>
      <Rule />
      <p className="flex gap-2 font-semibold text-neutral-500">
        <span className="w-8 shrink-0">Qty</span>
        <span>Drink</span>
      </p>
      <ul className="mt-1">
        {ticket.items.map((item) => (
          <li
            key={item.productId}
            className="flex items-baseline gap-2 border-b border-dashed border-neutral-200 py-1"
          >
            <span className="w-8 shrink-0 font-bold">{item.qty}x</span>
            <span className="min-w-0 leading-4 uppercase">{item.name}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[10px] font-semibold">
        {drinks} {drinks === 1 ? "DRINK" : "DRINKS"} TO MAKE
      </p>
    </>
  );
}

export function ReceiptPreview({
  ticket,
  paperWidth,
  printerReady,
  pending,
  onClose,
  onPrint,
}: ReceiptPreviewProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div className="flex max-h-[90svh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-neutral-200 text-black shadow-2xl">
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <div>
            <h3 className="text-lg font-semibold">Receipt preview</h3>
            <p className="text-xs text-neutral-500">
              Two slips · {paperWidth}mm · customer then barista
            </p>
          </div>
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
              <path d="M6 6l12 12M18 6L6 18" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="flex flex-col items-center gap-8 py-2 md:flex-row md:items-start md:justify-center">
            <Slip title="For the customer" paperWidth={paperWidth}>
              <CustomerSlip ticket={ticket} />
            </Slip>
            <Slip title="For the barista" paperWidth={paperWidth}>
              <BaristaSlip ticket={ticket} />
            </Slip>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-neutral-300 bg-white p-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm"
          >
            Close
          </button>
          <button
            type="button"
            disabled={pending || !printerReady}
            onClick={onPrint}
            className="flex-1 rounded-xl bg-black py-2.5 text-sm text-white disabled:opacity-40"
          >
            {printerReady ? "Print both copies" : "Connect printer to print"}
          </button>
        </div>
      </div>
    </div>
  );
}
