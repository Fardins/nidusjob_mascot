import Link from "next/link";
import { MascotSlot } from "@/components/mascot";

export default function NotFound() {
  return (
    <main data-mascot-profile="notFound" className="mx-auto grid min-h-[100svh] max-w-5xl items-center gap-8 px-6 py-16 md:grid-cols-2">
      <div className="text-center md:text-left">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">404</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">This page wandered off.</h1>
        <p className="mt-4 text-ink-soft">Nidus looked everywhere — even under the graduation cap. Let&apos;s get you back on track.</p>
        <Link href="/" className="mt-8 inline-block rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600">
          Take me home
        </Link>
      </div>
      <MascotSlot className="mx-auto aspect-square w-full max-w-sm" />
    </main>
  );
}
