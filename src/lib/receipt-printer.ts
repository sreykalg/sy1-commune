"use client";

import { useCallback, useEffect, useState } from "react";
import {
  encodeOrderSlips,
  sampleTicket,
  type PaperWidth,
  type ReceiptTicket,
} from "@/lib/escpos";

const WIDTH_KEY = "commune_receipt_width";
const BAUD_RATE = 9600;

export type PrinterStatus = "unsupported" | "disconnected" | "connected";

export type ReceiptPrinter = {
  supported: boolean;
  connected: boolean;
  status: PrinterStatus;
  paperWidth: PaperWidth;
  setPaperWidth: (width: PaperWidth) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  print: (ticket: ReceiptTicket) => Promise<void>;
  testPrint: () => Promise<void>;
};

let activePort: SerialPort | null = null;

function serialAvailable(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

function readWidth(): PaperWidth {
  if (typeof window === "undefined") return 80;
  return window.localStorage.getItem(WIDTH_KEY) === "58" ? 58 : 80;
}

async function openPort(port: SerialPort) {
  if (!port.writable) {
    await port.open({ baudRate: BAUD_RATE, bufferSize: 4096 });
  }
  try {
    await port.setSignals({ dataTerminalReady: true, requestToSend: true });
  } catch {
    // Some USB printers do not expose modem signals.
  }
  activePort = port;
}

async function closePort() {
  const port = activePort;
  activePort = null;
  if (!port) return;
  try {
    await port.close();
  } catch {
    // Already closed.
  }
}

async function writeBytes(data: Uint8Array) {
  const port = activePort;
  if (!port?.writable) {
    throw new Error("Receipt printer is not connected.");
  }
  const writer = port.writable.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
}

async function receiptLogo(): Promise<Uint8Array | undefined> {
  if (typeof document === "undefined") return undefined;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load logo."));
      image.src = "/images/logo.jpg";
    });
    const size = 144;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    const widthBytes = Math.ceil(size / 8);
    const raster = new Uint8Array(widthBytes * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        const lum = pixels[i] * 0.3 + pixels[i + 1] * 0.59 + pixels[i + 2] * 0.11;
        if (lum < 165) {
          raster[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
    }
    return Uint8Array.from([
      0x1b, 0x61, 0x01,
      0x1d, 0x76, 0x30, 0x00,
      widthBytes & 0xff,
      (widthBytes >> 8) & 0xff,
      size & 0xff,
      (size >> 8) & 0xff,
      ...raster,
      0x0a,
      0x1b, 0x61, 0x00,
    ]);
  } catch {
    return undefined;
  }
}

export function useReceiptPrinter(): ReceiptPrinter {
  const [status, setStatus] = useState<PrinterStatus>("disconnected");
  const [paperWidth, setPaperWidthState] = useState<PaperWidth>(80);

  useEffect(() => {
    if (!serialAvailable()) {
      setStatus("unsupported");
      return;
    }
    setPaperWidthState(readWidth());
    let cancelled = false;
    navigator.serial
      .getPorts()
      .then(async (ports) => {
        const port = ports[0];
        if (!port || cancelled) return;
        await openPort(port);
        if (!cancelled) setStatus("connected");
      })
      .catch(() => {
        if (!cancelled) setStatus("disconnected");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPaperWidth = useCallback((width: PaperWidth) => {
    setPaperWidthState(width);
    window.localStorage.setItem(WIDTH_KEY, String(width));
  }, []);

  const connect = useCallback(async () => {
    if (!serialAvailable()) {
      throw new Error("Use Chrome or Edge on the POS computer to connect a USB printer.");
    }
    const port = await navigator.serial.requestPort();
    await closePort();
    await openPort(port);
    setStatus("connected");
  }, []);

  const disconnect = useCallback(async () => {
    const port = activePort;
    await closePort();
    if (port) {
      try {
        await port.forget();
      } catch {
        // Older Chromium builds may not support forget().
      }
    }
    setStatus(serialAvailable() ? "disconnected" : "unsupported");
  }, []);

  const print = useCallback(
    async (ticket: ReceiptTicket) => {
      const logo = await receiptLogo();
      for (const copy of encodeOrderSlips(ticket, paperWidth, logo)) {
        await writeBytes(copy);
      }
    },
    [paperWidth],
  );

  const testPrint = useCallback(async () => {
    const logo = await receiptLogo();
    for (const copy of encodeOrderSlips(sampleTicket(), paperWidth, logo)) {
      await writeBytes(copy);
    }
  }, [paperWidth]);

  return {
    supported: status !== "unsupported",
    connected: status === "connected",
    status,
    paperWidth,
    setPaperWidth,
    connect,
    disconnect,
    print,
    testPrint,
  };
}
