import type { Metadata } from "next";
import { Great_Vibes, Inter, Playfair_Display } from "next/font/google";
import { CAFE } from "@/lib/cafe";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const script = Great_Vibes({
  variable: "--font-great-vibes",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: CAFE.name,
  description: `${CAFE.tagline} ${CAFE.street}, ${CAFE.city}. Open ${CAFE.hours} ${CAFE.hoursNote}.`,
  icons: {
    icon: "/images/logo.jpg",
    apple: "/images/logo.jpg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${script.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-black font-sans text-white">{children}</body>
    </html>
  );
}
