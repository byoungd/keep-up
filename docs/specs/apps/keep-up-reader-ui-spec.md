# Keep-Up Reader UI Spec -- Arc/Dia Inspired

> Arc/Dia design analysis applied to Keep-Up Reader (digest -> read -> brief) for a desktop-first web app.

## Goals
- Borrow Arc's spatial navigation and minimal chrome to keep attention on reading and evidence.
- Borrow Dia's AI-native workflow (chat with tabs, memory, tone control) to make AI an ambient copilot.
- Deliver a deterministic, accessible, local-first UI that fits Keep-Up's LFCC/CRDT stack and design standards.

## Non-Goals
- Recreating Arc/Dia wholesale (no tab sync, no proprietary Boosts). We borrow principles, not brand.
- Replacing the ProseMirror editor or LFCC model. The spec focuses on shell + interactions around the editor.
- Shipping mobile parity; this spec is desktop-first with adaptive breakpoints.

---

## Arc & Dia Design Principles (What to Borrow)

| Theme | Arc | Dia | Keep-Up Translation |
|-------|-----|-----|---------------------|
| Chrome minimalism | Vertical sidebar replaces tab strip; full-bleed content; hover-revealed controls. | Sparse top bar; overlay menus; black-on-white focus. | Keep nav in a slim left rail; hide secondary chrome when reading; reveal actions on focus/hover. |
| Spatial nav | Spaces with color-coded stacks; pinned cards vs ephemeral tabs; split view/peek. | Workspace list that behaves like chat threads; "tab mentions" to pull context. | Spaces = Topics/Projects; cards = Digests/Briefs/Docs; support peek/split for citations and source comparison. |
| Command-first | Command palette for nav/actions; consistent shortcuts. | Command bar + inline AI prompts; "/" triggers. | Global command palette (CmdK) for nav, search, and AI commands; inline "/" menu in editor. |
| AI in context | Lightly assists (Boosts, Notes) without dominating UI. | AI is the primary surface: chat that knows open tabs, tone, and memory. | AI panel is context-aware: knows current doc/digest, can "mention" other open docs, respects AI Envelope. |
| Flow continuity | Little Arc (ephemeral), Peek overlays, no-context-loss transitions. | Chat floats above content; quick answers while staying in flow. | Peek for source cards/citations; mini panel for quick reads; keep task context when switching Topics. |
| Tone | Playful but focused color blocks; bold typography. | Calm monochrome with subtle neon cues for AI. | Use muted graphite surfaces with electric blue accents for AI actions; avoid purple default. |

---

## Visual Direction
- **Palette**: Graphite surfaces (`--background` white, `--surface-1` cool gray, `--surface-2` charcoal for rails) with **electric cyan** accent for AI/command affordances and **amber** for highlights/warnings. Avoid purple. Respect design tokens from `design-system`.
- **Typography**: Use a purposeful sans with character (e.g., **Soehne/GT America** style) for headings; system-sans fallback for body. Keep sizes aligned to design standards (`--text-base` 14px body, `--text-lg` 16px section headers, `--text-xl` 20px hero).
- **Density**: Default density for navigation and lists; compact for secondary rails and command palette.
- **Background treatment**: Carded surfaces with subtle gradient washes for active Spaces; full-bleed reading canvas with 64-80px gutters.
- **Iconography**: Two-tone stroked icons with 1.5px stroke; AI actions use cyan glow on hover.

---

## Layout & IA

### Shell
- **Left Rail (72px collapsed -> 240px expanded)**: Spaces/Topics selector, Today, Library, Briefs, Ask, Settings. Color stripe per Space (Arc-inspired). Hover/focus expands to show labels.
- **Primary Content**: Center stage for Reader/Digest/Briefs. Max width 1200px; use 16-24px padding; optional split panes (60/40) for source vs summary.
- **Right Context Rail (320px)**: AI/command panel, metadata (citations, annotations, sync status). Can dock/undock; collapses in focus mode.
- **Top Command Bar**: Floating pill anchored to left rail when idle; expands on CmdK or `/` to show command palette.
- **Bottom Status Strip (optional)**: Sync/offline indicator, AI lane (fast/deep/consensus), model/source status.

### Navigation & States
- **Spaces = Topics/Projects**: Color-coded; switching preserves open stack (docs/digests) similar to Arc Spaces.
- **Stacks**: Each Space holds cards: Digest issues, Reader items, Brief docs. Cards can be **Pinned** (persist) or **Scratch** (auto-clear after 12h like Arc's tabs).
- **Peek/Preview**: Hover on a citation or digest card -> 420px peek panel overlaying content; ESC closes.
- **Split View**: `Ctrl+\` opens a side-by-side comparison (source vs summary, or two docs).
- **Focus Mode**: `Shift+F` hides rails, leaves top-left breadcrumb + exit hint.
- **Offline/Sync**: Right rail shows "Local-first: syncing/queued/conflict" chip; conflict opens AI Envelope diagnostics.

---

## Command & AI Surfaces

### Global Command Palette (Arc command, Dia chat hybrid)
- Trigger: `CmdK` or `/` from anywhere; contextual search across Spaces, docs, citations, and commands.
- Sections: **Navigate**, **Create** (new digest/brief), **Run AI** (summaries, compare, explain), **System** (density/theme, BYOK lane).
- Command preview: right-side detail shows what will happen; include shortcut hints.

### AI Panel (Dia-style chat with tabs)
- Docked on right rail; default width 320px; supports **tab mentions**: type `@` to reference open docs/cards.
- **Context chips**: current doc, selected text hash, cited sources; user can remove chips to constrain scope.
- **Mode toggles**: Tone (neutral/brief/technical), Lane (fast/deep/consensus), Privacy (local-only vs allow outbound).
- **Attachments**: drag a source card or citation to attach; panel shows applied preconditions (span hash) per AI Envelope.
- **Replies**: show citations inline; "Open in Reader" opens a scratch card in the current Space.

### Inline Actions (Arc hover affordances)
- Text selection bubble: Summarize, Explain, Translate, Add note, Copy with citation. Appears as pill with icons, fades in/out 150ms.
- Digest card hover: Quick peek, Pin, Add to Brief, Send to AI panel (opens a chat prefilled with context chips).
- Keyboard-first: `;` opens selection menu on current cursor line (ProseMirror-safe, no Framer Motion).

---

## Core Flows

1) **Read a Digest Issue**
   - Enter a Space -> Today -> digest card list (default list density). Cards show source icon, title, "why it matters," citation count.
   - Hover -> Peek; Enter -> open card in main pane; right rail shows citations + AI panel.
   - Actions: Pin to Space, Add to Brief, Compare (opens split with source link), Ask (sends context chips to AI panel).

2) **Deep Dive a Source**
   - Click "Open source" -> new scratch card (Little Arc analogue) appears as overlay; ESC to close; `CmdEnter` to promote to pinned.
   - Inline annotations appear in margin; selection bubble offers "Add note" and "Quote with citation."

3) **Write/Update a Brief**
   - Brief opens in full-width ProseMirror canvas; left rail collapses to 80px to maximize width.
   - AI panel docked: user can `@` mention digest items; system passes span hashes as preconditions.
   - "Cite as you type": when AI inserts text, citations render as superscript chips; user can inspect via peek.

4) **Compare & Synthesize**
   - Select two cards -> `Ctrl+\` split view; top bar shows comparison goal; AI panel gets both contexts; "Merge summary" button writes to Brief draft (suggestion mode).

5) **Ask Mode (Dia inspiration)**
   - Global Ask route uses full-height chat; context selector allows adding Spaces, last digest, or uploaded PDF.
   - Responses show **memory** badge when reusing past context; user can clear memory (privacy control).

---

## Components & States

- **Left Rail Items**: 40px row height; icon + label; active state uses colored stripe; badges for unread counts.
- **Cards (Digest/Doc)**: 3-tier text (title 16px semibold, "why" 13px, meta 11px), 12px radius; subtle gradient header in Space color; hover lifts 4px with shadow.
- **Peek Panel**: Fixed 420px width; anchored near trigger; includes header, key excerpt, actions (Open, Add to Brief, Ask).
- **Command Palette**: 640px width modal; left column results, right column preview; keyboard hints right aligned.
- **AI Panel Messages**: Alternating background stripes every two messages for scanability; citations as inline pills; message toolbar on hover (copy, pin, open in Brief).
- **Offline/Sync Chips**: Right rail top; color-coded (green synced, amber queued, red conflict) with tooltip linking to troubleshooting.

---

## Interaction & Motion
- **Durations**: 120-150ms for micro (hover/selection), 200-260ms for panels; easing `ease-out` for entrance, `ease-in-out` for layout.
- **Peek**: Fade + slide-up 8px; backdrop blur 12px at 20% opacity.
- **Rail expand/collapse**: Width transition 200ms; icons remain fixed to avoid drift.
- **Command Palette**: Scale 0.98 -> 1 with opacity; focus trap active.
- **AI Streaming**: Token shimmer bar under response header; spinner for pending tool calls; stop button visible.
- **No Framer Motion in editor NodeViews**; use CSS transitions/decorations for selection bubbles.

---

## Accessibility
- **Landmarks**: `nav` for rails, single `main` for content, `aside` for AI panel.
- **Keyboard**: Full tab order; `[`/`]` cycle cards; `CmdK` command palette; `Shift+F` focus mode; ESC closes peek/overlays.
- **ARIA**: Icon-only buttons with `aria-label`; live region for AI streaming; progress status for sync chip.
- **Contrast**: Minimum 4.5:1 for text; 3:1 for UI elements; cyan accent checked against backgrounds.
- **Reduced motion**: Honor prefers-reduced-motion; switch to opacity-only transitions.

---

## Data & AI Envelope Hooks
- Each AI action passes **context chips** -> span/block IDs and hashes (preconditions) to AI Gateway.
- Peek and selection bubble show hash/tooltips for the span being modified.
- Sync chip exposes last applied `doc_frontier`; conflicts open a modal to rebase (per AI Envelope guidance).

---

## Desktop -> Mobile Adaptation (Light)
- Left rail collapses to icon strip; bottom nav for Today/Library/Briefs/Ask.
- Right rail becomes modal sheet; command palette becomes full-screen.
- Peek becomes bottom drawer (70vh); split view replaced by tabbed toggle.

---

## Open Questions
- Should Spaces support nested groups (Arc folders) or stay flat? Recommend flat for MVP.
- Do we surface AI memory per Space or global? Recommend per Space with manual clear.
- Little Arc analogue: keep scratch cards as overlays or separate route? Recommend overlay for speed, auto-expire.
