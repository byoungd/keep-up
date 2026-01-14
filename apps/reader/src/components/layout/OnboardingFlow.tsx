"use client";

import { cn } from "@keepup/shared/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export interface OnboardingFlowProps {
  onComplete: (data: OnboardingData) => void;
  className?: string;
}

export interface OnboardingData {
  topics: string[];
  sources: string[];
}

const TOPIC_KEYS = [
  "ai",
  "cryptoWeb3",
  "startups",
  "productDesign",
  "engineering",
  "marketing",
  "finance",
  "science",
] as const;

type TopicKey = (typeof TOPIC_KEYS)[number];

const SOURCE_BUNDLES = [
  {
    id: "tech-news",
    key: "techNews",
    icon: "🚀",
  },
  {
    id: "ai-research",
    key: "aiResearch",
    icon: "🤖",
  },
  {
    id: "design",
    key: "designDaily",
    icon: "🎨",
  },
] as const;

type BundleId = (typeof SOURCE_BUNDLES)[number]["id"];
type BundleKey = (typeof SOURCE_BUNDLES)[number]["key"];

type Step = "topics" | "sources" | "completing";

export function OnboardingFlow({ onComplete, className }: OnboardingFlowProps) {
  const t = useTranslations("Onboarding");
  const [step, setStep] = useState<Step>("topics");
  const [selectedTopics, setSelectedTopics] = useState<TopicKey[]>([]);
  const [selectedBundles, setSelectedBundles] = useState<BundleId[]>([]);

  const [completionProgress, setCompletionProgress] = useState(0);

  useEffect(() => {
    if (step !== "completing") {
      return undefined;
    }

    let progress = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const intervalId = setInterval(() => {
      progress = Math.min(progress + 2, 100); // Slower, smoother progress
      setCompletionProgress(progress);
      if (progress >= 100) {
        clearInterval(intervalId);
        timeoutId = setTimeout(() => {
          onComplete({ topics: selectedTopics, sources: selectedBundles });
        }, 800);
      }
    }, 30);

    return () => {
      clearInterval(intervalId);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [step, onComplete, selectedTopics, selectedBundles]);

  const handleNext = () => {
    if (step === "topics") {
      setStep("sources");
    } else if (step === "sources") {
      setCompletionProgress(0);
      setStep("completing");
    }
  };

  const toggleTopic = (topic: TopicKey) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const toggleBundle = (id: BundleId) => {
    setSelectedBundles((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center min-h-[60vh] w-full max-w-2xl mx-auto p-6 relative",
        className
      )}
    >
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-3xl">
        <div className="absolute top-[-50%] left-[20%] w-[500px] h-[500px] bg-purple-500/5 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <AnimatePresence mode="wait">
        {step === "topics" && (
          <motion.div
            key="topics"
            initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full space-y-8 relative z-10"
          >
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                {t("topicsTitle")}
              </h2>
              <p className="text-zinc-400 text-lg">{t("topicsSubtitle")}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TOPIC_KEYS.map((topicKey) => {
                const isSelected = selectedTopics.includes(topicKey);
                return (
                  <motion.button
                    layout
                    type="button"
                    key={topicKey}
                    onClick={() => toggleTopic(topicKey)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "flex items-center justify-center px-4 py-4 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden group",
                      isSelected
                        ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                        : "bg-white/5 border border-white/5 text-zinc-400 hover:bg-white/10 hover:border-white/10 hover:text-zinc-200"
                    )}
                  >
                    {/* Subtle shine effect for unselected */}
                    {!isSelected && (
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr from-white/0 via-white/5 to-white/0" />
                    )}
                    <span className="relative z-10">{t(`topics.${topicKey}`)}</span>
                  </motion.button>
                );
              })}
            </div>

            <div className="flex justify-end pt-8">
              <motion.button
                type="button"
                onClick={handleNext}
                disabled={selectedTopics.length === 0}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="group flex items-center gap-2 px-8 py-3 bg-white text-black rounded-full font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_20px_rgba(255,255,255,0.15)] hover:shadow-[0_4px_25px_rgba(255,255,255,0.25)]"
              >
                {t("continue")}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </div>
          </motion.div>
        )}

        {step === "sources" && (
          <motion.div
            key="sources"
            initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full space-y-8 relative z-10"
          >
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                {t("sourcesTitle")}
              </h2>
              <p className="text-zinc-400 text-lg">{t("sourcesSubtitle")}</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {SOURCE_BUNDLES.map((bundle) => {
                const isSelected = selectedBundles.includes(bundle.id);
                const bundleKey = bundle.key as BundleKey;
                return (
                  <motion.button
                    layout
                    type="button"
                    key={bundle.id}
                    onClick={() => toggleBundle(bundle.id)}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className={cn(
                      "flex items-center gap-6 p-6 rounded-2xl border text-left transition-all duration-300 group relative overflow-hidden",
                      isSelected
                        ? "bg-zinc-800/80 border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.15)]"
                        : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
                    )}
                  >
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        className="absolute top-4 right-4"
                      >
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500 shadow-lg shadow-purple-500/40">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      </motion.div>
                    )}
                    <span className="text-4xl filter drop-shadow-lg">{bundle.icon}</span>
                    <div>
                      <h3
                        className={cn(
                          "text-lg font-semibold tracking-tight transition-colors",
                          isSelected ? "text-purple-100" : "text-white"
                        )}
                      >
                        {t(`bundles.${bundleKey}.title`)}
                      </h3>
                      <p className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors mt-1">
                        {t(`bundles.${bundleKey}.description`)}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-8">
              <button
                type="button"
                onClick={() => setStep("topics")}
                className="text-sm text-zinc-500 hover:text-white transition-colors px-4 font-medium"
              >
                {t("back")}
              </button>
              <motion.button
                type="button"
                onClick={handleNext}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="group flex items-center gap-2 px-8 py-3 bg-white text-black rounded-full font-bold text-sm transition-all shadow-[0_4px_20px_rgba(255,255,255,0.15)] hover:shadow-[0_4px_25px_rgba(255,255,255,0.25)]"
              >
                {selectedBundles.length === 0 ? t("skipForNow") : t("finishSetup")}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </div>
          </motion.div>
        )}

        {step === "completing" && (
          <motion.div
            key="completing"
            initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center justify-center text-center space-y-8 py-12 relative z-10"
          >
            <div className="relative">
              <div className="absolute -inset-8 bg-purple-500/30 blur-2xl rounded-full animate-pulse" />
              <Sparkles className="w-16 h-16 text-purple-200 relative z-10 motion-safe:animate-spin" />
            </div>

            <div className="space-y-3">
              <h3 className="text-3xl font-bold tracking-tighter text-white">
                {t("completingTitle")}
              </h3>
              <p className="text-zinc-400 text-lg">{t("completingSubtitle")}</p>
            </div>

            <div className="w-64 h-1 bg-zinc-800/50 rounded-full overflow-hidden backdrop-blur-sm">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                initial={{ width: "0%" }}
                animate={{ width: `${completionProgress}%` }}
                transition={{ type: "spring", stiffness: 50, damping: 20 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
