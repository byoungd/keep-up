# Cowork UI Anti-Patterns

**Purpose**: A "Rogues Gallery" of design mistakes. If you see code like this, refactor it.

---

## 🚫 1. The "Christmas Tree" Effect
**Mistake**: Using "Magic" colors for standard UI elements.
**Why**: Violates the "Novelty Budget". Users get fatigued.

| ❌ Bad Code | ✅ Good Code |
| :--- | :--- |
| `<div className="bg-gradient-to-r from-pink-500 to-violet-500 text-white p-4 rounded-lg">Success!</div>` | `<div className="bg-surface-2 border border-emerald-500/20 text-emerald-600 p-4 rounded-lg">Success!</div>` |
| **Why**: Gradients are for AI generation ONLY. | **Why**: Status should be legible and standard. |

## 🚫 2. The "Foggy Glass"
**Mistake**: Overusing `backdrop-blur`.
**Why**: Performance cost + Visual muddiness. Arc uses blur *functionally* (to read text over wallpaper), not everywhere.

| ❌ Bad Code | ✅ Good Code |
| :--- | :--- |
| `<div className="backdrop-blur-xl bg-white/10 p-4">Content</div>` (On a white background) | `<div className="bg-surface-1 p-4">Content</div>` |
| **Why**: Blurring a solid background does nothing but waste GPU. | **Why**: Use solid colors for structural elements. |

## 🚫 3. The "Jumpy" Layout
**Mistake**: Using `width` transitions for sidebar collapse without layout projection.
**Why**: Causes text reflow and scrollbar flickering.

| ❌ Bad Code | ✅ Good Code |
| :--- | :--- |
| `transition-[width] duration-300` | Use `framer-motion` layout projection OR `transform: translateX` for drawer behavior. |

## 🚫 4. The "Infinity" Spinner
**Mistake**: Using a looping animation for a resting state (e.g., "Online" status).
**Why**: Distracts from focus. "Tuesday Morning" principle.

| ❌ Bad Code | ✅ Good Code |
| :--- | :--- |
| `<div className="animate-pulse bg-green-500 rounded-full" />` | `<div className="bg-green-500 rounded-full" />` |
| **Why**: If everything is moving, nothing is important. | **Why**: Static indicators are calm. |

## 🚫 5. Grey Walls
**Mistake**: Using borders to separate everything.
**Why**: Visual clutter. Arc/Dia use **spacing** and **background color** to separate.

| ❌ Bad Code | ✅ Good Code |
| :--- | :--- |
| `border border-gray-200` on every card | `bg-surface-1` on the container, `bg-surface-2` on cards, `gap-4`. |
| **Why**: Looks like a wireframe. | **Why**: Looks like a product. |
