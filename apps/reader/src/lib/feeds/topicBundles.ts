export interface FeedBundle {
  id: string;
  label: string;
  description: string;
  icon: string; // Lucide icon name
  feeds: {
    title: string;
    url: string;
  }[];
}

// Note: Labels and descriptions are now handled via i18n translation keys in Onboarding.bundles.[id]
export const TOPIC_BUNDLES: Record<string, FeedBundle> = {
  react: {
    id: "react",
    label: "React Ecosystem",
    description: "Next.js, React 19, and UI libraries",
    icon: "Atom",
    feeds: [
      { title: "React Blog", url: "https://react.dev/feed.xml" },
      { title: "Next.js Blog", url: "https://nextjs.org/feed.xml" },
      { title: "Overreacted", url: "https://overreacted.io/rss.xml" },
      { title: "TkDodo's Blog", url: "https://tkdodo.eu/blog/rss.xml" },
      { title: "Josh W Comeau", url: "https://www.joshwcomeau.com/rss.xml" },
    ],
  },
  ai: {
    id: "ai",
    label: "AI Engineering",
    description: "LLMs, Agents, and Research",
    icon: "Brain",
    feeds: [
      { title: "OpenAI Blog", url: "https://openai.com/blog/rss.xml" },
      { title: "Anthropic Research", url: "https://www.anthropic.com/index.xml" },
      { title: "Simon Willison", url: "https://simonwillison.net/atom/entries/" },
      { title: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml" },
      { title: "Lil'Log", url: "https://lilianweng.github.io/index.xml" },
    ],
  },
  cloud: {
    id: "cloud",
    label: "Cloud Native",
    description: "K8s, Serverless, and System Design",
    icon: "Cloud",
    feeds: [
      { title: "Kubernetes Blog", url: "https://kubernetes.io/feed.xml" },
      { title: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/" },
      { title: "AWS News", url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/" },
      { title: "ByteByteGo", url: "https://blog.bytebytego.com/feed" },
    ],
  },
  frontend: {
    id: "frontend",
    label: "Modern Frontend",
    description: "CSS, Web Platform, and TS",
    icon: "Layout",
    feeds: [
      { title: "Smashing Magazine", url: "https://www.smashingmagazine.com/feed/" },
      { title: "CSS-Tricks", url: "https://css-tricks.com/feed/" },
      { title: "Web.dev", url: "https://web.dev/feed.xml" },
      { title: "TypeScript Blog", url: "https://devblogs.microsoft.com/typescript/feed/" },
    ],
  },
  backend: {
    id: "backend",
    label: "Backend & Systems",
    description: "Databases, Rust, and Go",
    icon: "Database",
    feeds: [
      { title: "Go Blog", url: "https://go.dev/blog/feed.atom" },
      { title: "Rust Blog", url: "https://blog.rust-lang.org/feed.xml" },
      { title: "Planet PostgreSQL", url: "https://planet.postgresql.org/rss20.xml" },
      { title: "Redis Blog", url: "https://redis.io/blog/rss" },
    ],
  },
  tech_lead: {
    id: "tech_lead",
    label: "Engineering Leadership",
    description: "Management, Architecture, and Culture",
    icon: "Briefcase",
    feeds: [
      { title: "Pragmatic Engineer", url: "https://blog.pragmaticengineer.com/rss/" },
      { title: "Staff Eng", url: "https://staffeng.com/rss" },
      { title: "Rands in Repose", url: "https://randsinrepose.com/feed/" },
      { title: "Engineering at Meta", url: "https://engineering.fb.com/feed/" },
    ],
  },
};
