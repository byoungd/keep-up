"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { AlertCircle, Loader2, Search, Settings, ShieldAlert } from "lucide-react";

export default function DesignPage() {
  return (
    <div className="min-h-screen bg-background p-8 font-sans text-foreground">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="space-y-2 border-b border-border/40 pb-6">
          <h1 className="text-3xl font-bold tracking-tight">Design System</h1>
          <p className="text-muted-foreground">
            Core tokens and primitives for the Reader application.
          </p>
        </header>

        {/* 1. Typography */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold border-b border-border/40 pb-2">Typography</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-baseline">
              <span className="text-xs text-muted-foreground font-mono">h1 / 3xl bold</span>
              <h1 className="text-3xl font-bold">The quick brown fox</h1>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-baseline">
              <span className="text-xs text-muted-foreground font-mono">h2 / 2xl semibold</span>
              <h2 className="text-2xl font-semibold">Jumps over the lazy dog</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-baseline">
              <span className="text-xs text-muted-foreground font-mono">h3 / xl font-medium</span>
              <h3 className="text-xl font-medium">Reviewing design tokens</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-baseline">
              <span className="text-xs text-muted-foreground font-mono">body / base</span>
              <p className="text-base text-foreground">
                Linear-style interfaces prioritize clarity and speed. Visual noise is minimized to
                maximize focus on content.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-baseline">
              <span className="text-xs text-muted-foreground font-mono">caption / sm muted</span>
              <p className="text-sm text-muted-foreground">
                Secondary information usually appears in muted colors.
              </p>
            </div>
          </div>
        </section>

        {/* 2. Colors */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold border-b border-border/40 pb-2">Colors</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <ColorSwatch name="bg-background" className="bg-background border border-border" />
            <ColorSwatch name="bg-surface-1" className="bg-surface-1" />
            <ColorSwatch name="bg-surface-2" className="bg-surface-2" />
            <ColorSwatch name="bg-muted" className="bg-muted" />

            <ColorSwatch name="bg-accent-emerald" className="bg-accent-emerald" />
            <ColorSwatch name="bg-accent-amber" className="bg-accent-amber" />
            <ColorSwatch name="bg-accent-rose" className="bg-accent-rose" />
            <ColorSwatch name="bg-accent-violet" className="bg-accent-violet" />
          </div>
        </section>

        {/* 3. Buttons */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold border-b border-border/40 pb-2">Buttons</h2>
          <div className="flex flex-wrap gap-4 items-center">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <Button size="compact" variant="secondary">
              Compact Button
            </Button>
            <Button size="sm" variant="secondary">
              Small Button
            </Button>
            <Button size="default" variant="secondary">
              Default Button
            </Button>
            <Button size="lg" variant="secondary">
              Large (Default)
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <Button disabled>Disabled</Button>
            <Button variant="primary">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading
            </Button>
            <Button variant="secondary">
              <Settings className="mr-2 h-4 w-4" />
              With Icon
            </Button>
          </div>
        </section>

        {/* 4. Badges */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold border-b border-border/40 pb-2">Badges</h2>
          <div className="flex flex-wrap gap-4">
            <Badge variant="default">Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </section>

        {/* 5. Inputs */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold border-b border-border/40 pb-2">Inputs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
            <div className="space-y-2">
              <label htmlFor="input-standard" className="text-sm font-medium">
                Standard Input
              </label>
              <Input id="input-standard" placeholder="Enter username..." />
            </div>
            <div className="space-y-2">
              <label htmlFor="input-search" className="text-sm font-medium">
                With Search Icon
              </label>
              <Input
                id="input-search"
                leftIcon={<Search className="h-4 w-4" />}
                placeholder="Search documentation..."
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="input-disabled" className="text-sm font-medium">
                Disabled
              </label>
              <Input id="input-disabled" disabled value="Cannot edit this" />
            </div>
          </div>
        </section>

        {/* 6. States */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold border-b border-border/40 pb-2">States</h2>
          <div className="grid gap-4">
            <div className="rounded-lg border border-accent-amber/20 bg-accent-amber/10 p-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-accent-amber" />
                <div className="text-sm">
                  <span className="font-semibold block">Policy Degradation</span>
                  <span className="text-muted-foreground">
                    This is how the new warning banner looks.
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <div className="text-sm">
                  <span className="font-semibold block">Critical Error</span>
                  <span className="text-muted-foreground">Something went wrong.</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ColorSwatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-md shadow-sm", className)} />
      <code className="text-xs text-muted-foreground">{name}</code>
    </div>
  );
}
