"use client";

import { useCallback } from "react";
import { encodeBaristaTicket, type ReceiptTicket } from "@/lib/escpos";
import {
  useSerialPrinter,
  type SerialPrinterConnection,
} from "@/lib/serial-printer";

export type LabelPrinter = Omit<SerialPrinterConnection, "write"> & {
  printLabel: (ticket: ReceiptTicket) => Promise<void>;
};

export function useLabelPrinter(): LabelPrinter {
  const connection = useSerialPrinter({
    role: "label",
    defaultPaperWidth: 58,
  });
  const printLabel = useCallback(
    async (ticket: ReceiptTicket) => {
      await connection.write(
        encodeBaristaTicket(ticket, connection.paperWidth),
      );
    },
    [connection],
  );

  const { write: _write, ...printer } = connection;
  void _write;
  return { ...printer, printLabel };
}
