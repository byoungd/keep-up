# Task Prompt: Agent UI (UI & Chat Experience)

## 🎯 Objective
Build the **App Shell and Chat Experience** for `apps/cowork`. This agent owns the user's first impression and the main communication channel.
**Goal**: A localized, premium "Linear-like" application feel. Sub-100ms interaction response time.

## 🧱 Boundaries & Scope
- **IN SCOPE**:
  - `apps/cowork/src/app/*` (Layouts, Routing).
  - `apps/cowork/src/features/chat/*` (Chat interface).
  - `apps/cowork/src/features/workspace/*` (Session list, filepicker).
  - Global Design System integration (`packages/app`).
- **OUT OF SCOPE**:
  - Task Timeline rendering (Gamma's job).
  - Artifact contents (Gamma's job).
  - Backend logic (Core's job).

## 💎 Top-Tier Quality Standards
- **Visuals**: Pixel-perfect implementation of Tailwind v4 tokens. Glassmorphism on sidebar/headers.
- **Performance**: No layout shifts (CLS 0). Virtualize message lists if >50 items.
- **Motion**: Subtle entry animations for messages (opacity + slide-up).
- **Code**: All components must be accessible (Radix UI primitives recommended).

## 📋 Requirements
1. **Shell & Routing**:
   - Setup `TanStack Router` with layouts: `RootLayout` (Sidebar + Main).
   - **Sidebar**: Collapsible, persistent, showing recent sessions and workspace selector.
   - **Header**: Minimalist, showing current Model/Status.
2. **Workspace Management**:
   - "New Session" flow: User picks a local directory -> System validates access -> Redirect to chat.
   - Use `window.showDirectoryPicker` or native equivalent if available, else generic input for now.
3. **Chat Interface**:
   - **Message List**: distinct styles for User (right aligned/bubble) vs Assistant (left aligned/transparent).
   - **Composer**: Auto-expanding textarea, "Cmd+Enter" to send.
   - **Optimistic Updates**: UI shows user message immediately, then "Sending..." state.
4. **Settings & Configuration**:
   - dedicated `/settings` route.
   - Form for: OpenAI/Anthropic API Keys, Default Model selection, Theme toggle.
5. **Integration Points**:
   - Define a `TaskContainer` slot where Gamma's components will render.
   - Define an `ArtifactRail` slot for the right panel.
   - **Responsibility**: You are responsible for the *page layout* that holds these slots and passing `sessionId` to them.

## ✅ Definition of Done
- [ ] App loads with a sleek "Empty State" landing page.
- [ ] Sidebar navigation works between "Home" and "Session :id".
- [ ] User can type a message, hit enter, and see it appear (mocked backend response allowed).
- [ ] Zero lint/type errors.
- [ ] Dark mode support is flawless (no white flashes).
