import { Link } from "@/i18n/navigation";
import { ArrowRight, Bot, CheckCircle2, Layers, Sparkles, Zap } from "lucide-react";
import { getTranslations } from "next-intl/server";

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Linear-style "Spotlight" Card
 * Uses radial gradient tracking mouse or fixed group-hover effects
 */
function BentoCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`relative group overflow-hidden rounded-[2rem] bg-zinc-900/40 border border-white/5 p-8 hover:border-white/10 transition-colors duration-500 ${className}`}
    >
      {/* Spotlight Gradient */}
      <div
        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0"
        style={{
          background:
            "radial-gradient(600px circle at center, rgba(120,119,198,0.1), transparent 40%)",
        }}
      />
      {/* Noise Texture Overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none z-0 mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  const t = await getTranslations("HomePage");

  return (
    <main className="relative min-h-screen bg-[#050505] text-white selection:bg-purple-500/30 font-sans">
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-900/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[10%] right-[-5%] w-[500px] h-[500px] bg-indigo-900/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-[20%] right-[20%] w-[300px] h-[300px] bg-cyan-900/5 blur-[80px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 pb-24 pt-24 sm:pt-32 lg:px-8">
        {/* --- Hero Section --- */}
        <div className="flex flex-col items-center text-center mb-32 max-w-5xl mx-auto pt-16 md:pt-24 relative z-20">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-zinc-400 backdrop-blur-md mb-10 hover:bg-white/10 transition-colors cursor-default shadow-lg shadow-white/5">
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
            <span>{t("eyebrow")}</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60 mb-10 pb-2 leading-[1.15] drop-shadow-sm">
            {t("title")}
          </h1>

          <p className="text-xl md:text-2xl text-zinc-400 max-w-3xl leading-relaxed mb-12">
            {t("description")}
          </p>

          <div className="flex items-center gap-6">
            <Link
              href="/app"
              locale={locale}
              className="group relative flex h-12 items-center gap-2 rounded-full bg-gradient-to-b from-white to-zinc-200 px-8 text-sm font-semibold text-black shadow-lg shadow-white/5 transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>{t("ctaPrimary")}</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/lfcc-demo"
              locale={locale}
              className="flex h-12 items-center gap-2 rounded-full border border-white/10 bg-transparent px-8 text-sm font-semibold text-zinc-300 hover:bg-white/5 transition-colors"
            >
              {t("ctaSecondary")}
            </Link>
          </div>
        </div>

        {/* --- Bento Grid --- */}
        <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-6 auto-rows-[300px]">
          {/* Card 1: Sources (RSS/Ingestion) - [4 cols] */}
          <BentoCard className="md:col-span-3 lg:col-span-4 flex flex-col justify-between group">
            <div>
              <div className="flex items-center gap-2 mb-3 text-zinc-400">
                <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
                  <Radio className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono uppercase tracking-wider">Ingestion</span>
              </div>
              <h3 className="text-xl font-medium text-white mb-2">{t("statOne")}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Unified stream from RSS, newsletters, and papers.
              </p>
            </div>

            {/* Mock UI: Feed Item */}
            <div className="mt-6 relative">
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-900 via-zinc-900/80 to-transparent z-20" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-white/[0.02]"
                  >
                    <div className="w-8 h-8 rounded bg-zinc-800 flex-shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-2 w-2/3 bg-zinc-700/50 rounded-full" />
                      <div className="h-2 w-1/2 bg-zinc-800/50 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* Card 2: AI Core (Reasoning) - [8 cols] */}
          <BentoCard className="md:col-span-3 lg:col-span-8 overflow-hidden relative">
            <div className="relative z-10 flex flex-col h-full items-start max-w-lg">
              <div className="flex items-center gap-2 mb-3 text-zinc-400">
                <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <Bot className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono uppercase tracking-wider">Reasoning</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-medium text-white mb-4">
                {t("panelLabel")}
              </h3>
              <p className="text-base text-zinc-400 leading-relaxed max-w-md">{t("panelBody")}</p>

              {/* Decoration: Glowing Orb */}
              <div className="absolute right-[-20%] bottom-[-20%] w-[300px] h-[300px] bg-purple-600/20 blur-[100px] rounded-full pointer-events-none" />
            </div>

            {/* Mock UI: Chat/Agent Interface */}
            <div className="absolute top-10 right-10 w-[320px] h-[320px] rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-2xl p-4 hidden lg:flex flex-col gap-4 transform rotate-[-5deg] transition-transform group-hover:rotate-0 duration-500">
              <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                <div className="w-2 h-2 rounded-full bg-red-500/50" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                <div className="w-2 h-2 rounded-full bg-green-500/50" />
              </div>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-900/50 flex items-center justify-center border border-white/10">
                    <Sparkles className="w-4 h-4 text-purple-300" />
                  </div>
                  <div className="flex-1 p-3 rounded-2xl rounded-tl-none bg-white/[0.03] text-sm text-zinc-300">
                    Analyzing 42 new papers...
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-900/50 flex items-center justify-center border border-white/10">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  </div>
                  <div className="flex-1 p-3 rounded-2xl rounded-tl-none bg-white/[0.03] text-sm text-zinc-300">
                    Found 3 high-signal updates for "RAG".
                  </div>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Card 3: Trust/Knowledge - [6 cols] */}
          <BentoCard className="md:col-span-3 lg:col-span-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3 text-zinc-400">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono uppercase tracking-wider">Trust</span>
              </div>
              <h3 className="text-xl font-medium text-white mb-2">{t("statTwo")}</h3>
              <div className="mt-8 flex items-baseline gap-2">
                <span className="text-5xl font-bold tracking-tight text-white">100%</span>
                <span className="text-lg text-zinc-500">Grounded</span>
              </div>
            </div>

            <div className="mt-auto pt-6 border-t border-white/5">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span>Citations included for every claim. No hallucinations.</span>
              </div>
            </div>
          </BentoCard>

          {/* Card 4: Living Briefs - [6 cols] */}
          <BentoCard className="md:col-span-3 lg:col-span-6 group">
            <div className="flex flex-col h-full relative z-10">
              <div className="flex items-center gap-2 mb-3 text-zinc-400">
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Layers className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono uppercase tracking-wider">Collaboration</span>
              </div>
              <h3 className="text-xl font-medium text-white mb-2">{t("panelLabelAlt")}</h3>
              <p className="text-sm text-zinc-500 mb-6">{t("panelBodyAlt")}</p>

              {/* Mock UI: Document */}
              <div className="flex-1 rounded-t-xl bg-white/[0.02] border border-white/5 p-4 relative overflow-hidden mask-image-b-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-50" />
                <div className="h-4 w-1/3 bg-zinc-800 rounded mb-4" />
                <div className="space-y-2">
                  <div className="h-2 w-full bg-zinc-800/50 rounded" />
                  <div className="h-2 w-5/6 bg-zinc-800/50 rounded" />
                  <div className="h-2 w-4/6 bg-zinc-800/50 rounded" />
                </div>

                {/* Cursor Mock */}
                <div className="absolute top-12 left-1/2 flex items-center gap-2 animate-float">
                  <div className="w-3 h-3 bg-pink-500 transform rotate-45" />
                  <div className="bg-pink-500 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase">
                    Team
                  </div>
                </div>
              </div>
            </div>
          </BentoCard>
        </div>
      </div>
    </main>
  );
}

function Radio({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Radio signal icon"
    >
      <title>Radio signal icon</title>
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    </svg>
  );
}
