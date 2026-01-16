# Manus Agent Runtime and Frontend Design Specification

**Author:** Manus AI
**Date:** January 16, 2026
**Language:** English

## 1. Agent Runtime Specification

The Manus Agent Runtime is the core execution environment designed for autonomous, reliable, and secure task completion. It is built upon a deterministic state machine architecture operating within a secure, isolated sandbox.

### 1.1 The Agent Loop Architecture

The Agent operates on a continuous, iterative **Agent Loop**, which ensures a structured approach to problem-solving and self-correction.

| Step | Name | Description | Key Mechanism |
| :--- | :--- | :--- | :--- |
| **1. Perception** | Sensing | Analyzes the current context, including user input, dialogue history, and the result of the previous action (Observation). | Context Window, Dialogue History |
| **2. Thinking** | Reasoning | Determines the next logical step: update the plan, advance the phase, or select a tool for execution. | Internal LLM Reasoning Model |
| **3. Decision** | Tool Selection | Selects the **single** most appropriate tool and its parameters based on the current phase goal and reasoning. | Function Calling Protocol |
| **4. Action** | Execution | Executes the selected tool within the sandboxed environment. | Tool Invocation |
| **5. Observation** | Feedback | Captures the output (success data or error message) from the executed tool. | Tool Return Value |
| **6. Iteration** | Loop | Feeds the Observation back into the Perception step to continue the cycle until the task is complete. | Deterministic State Machine |

### 1.2 Execution Environment and Security

The Agent operates within a **Sandboxed Virtual Machine (VM)** environment, ensuring security, reliability, and full execution capability.

| Feature | Description | Rationale |
| :--- | :--- | :--- |
| **Isolation** | Ubuntu 22.04 Linux VM with full internet access. | Provides a secure, isolated, and Turing-complete environment for code execution and web browsing. |
| **Persistence** | System state, installed packages, and file system persist across hibernation cycles. | Allows for long-running, multi-session tasks without loss of progress. |
| **Tool Access** | Access to Shell, File System, Browser, and specialized tools via Function Calling. | Enables the Agent to perform complex, real-world tasks (e.g., web development, data analysis). |
| **Security** | Strict separation from the host system and user data. | Prevents interference and protects user privacy. |

### 1.3 Tool Architecture and Protocol

All Agent interactions with the environment are mediated through a robust set of specialized tools, accessed via a **Function Calling Protocol**.

#### 1.3.1 Single-Step Execution Constraint
A fundamental rule of the runtime is the **Strict Single-Step Execution Principle**:
> The Agent **MUST** respond with exactly one tool call per response. Parallel function calling is strictly forbidden.

This constraint enforces sequential reasoning, ensures state consistency, and simplifies error handling by making every operation atomic.

#### 1.3.2 Core Tool Categories

| Category | Key Tools | Purpose |
| :--- | :--- | :--- |
| **Task Management** | `plan` (update, advance) | Structures complex tasks into manageable, sequential phases. |
| **Communication** | `message` (info, ask, result) | Standardized protocol for all user interaction and final delivery. |
| **Environment I/O** | `shell`, `file`, `match` | Low-level interaction with the sandbox file system and command line. |
| **Information Retrieval** | `search`, `browser` | Accesses external, real-time information and performs web automation. |
| **Content Generation** | `generate`, `slides` | AI-driven creation of media, presentations, and documents. |
| **Specialized** | `webdev_init_project`, `schedule`, `expose` | Domain-specific utilities for project scaffolding and task scheduling. |

### 1.4 Communication Protocol Mapping

The `message` tool is the sole channel for user-facing communication, and its structure is designed to map directly to Frontend UI events.

| `message` Type | Purpose | Frontend UI Mapping |
| :--- | :--- | :--- |
| **`info`** | Progress Update | Non-blocking, subtle status update (e.g., "Searching for data...", "Installing dependencies..."). |
| **`ask`** | User Input/Authorization | Blocking prompt requiring user response (e.g., text input, confirmation dialog). |
| **`result`** | Final Delivery | Task completion notification, presenting the final output and attachments. |

The `ask` type is further refined by the `suggested_action` parameter, which is critical for dynamic UI rendering (see Section 2.2).

### 1.5 Error Handling and Recovery

The runtime employs a **"Three-Attempt Principle"** for error recovery:
1.  **Diagnosis:** Analyze the error message and context.
2.  **Fix/Alternative:** Attempt to fix the issue (e.g., correct parameters, use a different tool).
3.  **Escalation:** If three consecutive attempts fail, the Agent uses `message(type="ask")` to report the failure to the user and request guidance.
The Agent is strictly forbidden from repeating the exact same failed action.

## 2. Frontend Design Specification

The Manus Frontend is designed to provide a transparent, intuitive, and interactive interface for the user, translating the complex backend Agent Loop into a clear conversational flow.

### 2.1 UI Philosophy and Transparency

The core UI principle is **"Logic Transparency, Interaction Simplicity."** The user should always be aware of *what* the Agent is doing and *why*, without being overwhelmed by technical details.

#### 2.1.1 Task Progress Visualization
The Frontend **MUST** parse the `plan` tool's output to render a persistent, visible task status indicator.

| UI Element | Data Source | Display Logic |
| :--- | :--- | :--- |
| **Task Goal Header** | `plan.goal` | Displayed prominently at the top of the task view. |
| **Phase List/Progress Bar** | `plan.phases`, `plan.current_phase_id` | Renders the list of phases. Completed phases are marked green; the current phase is highlighted; future phases are dimmed. |
| **Real-time Status Feed** | `message(type="info")` | Displays non-intrusive, concise text updates (e.g., "Phase 2: Information Gathering started," "Executing shell command..."). |

### 2.2 Interactive Communication Rendering

The Frontend's primary function is to interpret the `message` tool's output and render the appropriate interactive component.

#### 2.2.1 `message(type="ask")` Handling
This is the critical path for user interaction. The Frontend **MUST** block further Agent execution until a response is received.

| `suggested_action` Value | UI Component Rendered | User Action |
| :--- | :--- | :--- |
| `none` | Standard Text Input Field | User provides clarifying text input. |
| `confirm_browser_operation` | Confirmation Dialog/Buttons | User clicks "Confirm" or "Cancel" to authorize a sensitive web action (e.g., payment, posting). |
| `take_over_browser` | Browser Takeover Prompt | User clicks "Take Over" to manually complete a step (e.g., CAPTCHA, login) in an embedded browser window. |
| `upgrade_to_unlock_feature` | Subscription Upgrade Card | User is presented with an option to upgrade or select an alternative, non-premium path. |

#### 2.2.2 `message(type="result")` Handling
The final message type triggers the task completion state in the UI.

-   **Final Text:** The main body of the `message` is displayed as the final answer.
-   **Attachment Display:** All files listed in `message.attachments` are rendered as downloadable cards. The Frontend **MUST** respect the order provided by the Agent (descending importance).

### 2.3 Multi-Modal Result Presentation

The Frontend is responsible for enhancing the presentation of Agent-generated assets.

| Asset Type | Presentation Method | Key Feature |
| :--- | :--- | :--- |
| **Markdown (`.md`)** | In-line rendering | Full support for GFM (GitHub Flavored Markdown), including tables and code blocks. |
| **Code Files** | In-line rendering with syntax highlighting | Automatic syntax highlighting based on file extension (e.g., `.py`, `.js`, `.html`). |
| **Images (`.png`, `.jpg`)** | Embedded preview | Displayed directly in the chat thread. |
| **PDF/Slides** | Embedded Viewer/Preview | A dedicated viewer for multi-page documents, allowing users to scroll through content without downloading. |

### 2.4 User Profile and Constraint Awareness

The Frontend **MUST** be aware of the user's subscription level and display appropriate warnings or suggestions when the Agent attempts to use a restricted feature.

-   **Example:** If the Agent suggests a `slides` generation with `slide_count > 12` for a non-premium user, the UI should display a warning overlay linked to the upgrade path, even before the Agent sends the `upgrade_to_unlock_feature` message. This preemptive check enhances UX.

## 3. Conclusion and Summary of Key Design Principles

The Manus Agent Runtime and Frontend are designed as a tightly integrated system, adhering to a set of core principles that prioritize reliability, transparency, and user control.

| Design Principle | Runtime Implementation | Frontend Implementation |
| :--- | :--- | :--- |
| **Reliability** | Deterministic Agent Loop, Sandboxed VM, Three-Attempt Error Recovery. | Clear status visualization, Blocking prompts for critical input. |
| **Transparency** | Context-aware reasoning, Function Calling protocol. | Real-time status feed (`info`), Tool invocation logs (advanced view), Phase progress bar. |
| **Control** | Structured Task Planning (`plan`), Atomic execution. | Interactive authorization (`ask` + `suggested_action`), Browser takeover mechanism. |
| **Professionalism** | Strict adherence to output format and writing style. | Multi-modal result presentation, Code syntax highlighting, Attachment management. |

The Runtime's deterministic, single-step execution ensures reliability, while the Frontend's transparent visualization and precise mapping of the `message` protocol ensure a clear, controllable, and professional user experience. This synergy allows Manus to function as a powerful, yet predictable, digital collaborator.

The Manus Agent Runtime and Frontend are designed as a tightly integrated system. The Runtime's deterministic, single-step execution ensures reliability, while the Frontend's transparent visualization and precise mapping of the `message` protocol ensure a clear, controllable, and professional user experience.
