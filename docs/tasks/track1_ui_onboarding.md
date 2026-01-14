# Track 1: UX/UI & Onboarding (Project Velvet Entry)

**Objective:**
Transform the `apps/reader` into a premium, "Linear-quality" experience. Priority is on the **Onboarding Flow** and the **Daily Digest UI**. The user must feel "at home" within 30 seconds.

**Context:**
-   The current app lacks a guided setup.
-   Boring empty states kill retention.
-   Visual feedback (transitions, hover states) is critical for "premium" feel.

**Key Requirements:**
1.  **Onboarding Wizard:**
    -   Create a multi-step modal/page:
        1.  **Topic Selection:** Grid of selectable pills (e.g., "AI", "React", "Crypto").
        2.  **Source Imports:** Preset bundles (e.g., "TechCrunch + HackerNews") or OPML upload.
        3.  **Completion:** Trigger initial fetch + transition to Dashboard.
    -   *Tech:* React, Framer Motion (page transitions).

2.  **Polished Digest View:**
    -   Implement the `DigestCard` component from PRD.
    -   Add "collapsible" details for Evidence/Citations.
    -   Ensure typography hierarchy is perfect (Inter/system fonts).

3.  **Empty States & Feedback:**
    -   Never show a blank white screen.
    -   Use skeleton loaders for content fetching.
    -   If no feeds, show "Add your first feed" CTA with a friendly illustration.

**Files of Interest:**
-   `apps/reader/app/page.tsx`
-   `apps/reader/src/components/layout/*`
-   `apps/reader/src/components/feed/FeedList.tsx`

**Deliverables:**
-   [ ] `OnboardingFlow` component.
-   [ ] `DigestCard` polished component.
-   [ ] Updated `theme` / `tailwind.config` for consistency.
