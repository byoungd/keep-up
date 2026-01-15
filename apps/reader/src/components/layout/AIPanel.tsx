"use client";
import { Button } from "@/components/ui/Button";
import { useAIPanelState } from "@/context/PanelStateContext";
import { useAIPanelController } from "@/hooks/useAIPanelController";
import { useAIPanelTranslations } from "@/hooks/useAIPanelTranslations";
import { useProactiveSuggestions } from "@/hooks/useProactiveSuggestions";
import { useReferenceHandler } from "@/hooks/useReferenceHandler";
import { AI_PROMPTS } from "@/lib/ai/prompts";
import type { LoroRuntime, SpanList } from "@ku0/lfcc-bridge";
import { type PanelPosition, AIPanel as ShellAIPanel } from "@ku0/shell";
import type { EditorView } from "prosemirror-view";
import * as React from "react";
import { ProactiveSuggestionCard } from "../ai/ProactiveSuggestionCard";
import { WorkflowSelector } from "../ai/WorkflowSelector";
import { ApprovalRequestCard } from "./ApprovalRequestCard";
import { ContextStatusPanel } from "./ContextStatusPanel";
import { ProjectContextPanel } from "./ProjectContextPanel";
import { ReferenceDebugPanel } from "./ReferenceDebugPanel";
import { TaskQueuePanel } from "./TaskQueuePanel";

interface AIPanelProps {
  onClose: () => void;
  selectedText?: string;
  pageContext?: string;
  docId?: string;
  selectionSpans?: SpanList;
  runtime?: LoroRuntime | null;
  editorView?: EditorView | null;
  /** Which side of the screen this panel is on. Affects tooltip/dropdown directions. */
  panelPosition?: PanelPosition;
}

export function AIPanel({
  onClose,
  selectedText,
  pageContext,
  docId,
  selectionSpans,
  runtime,
  editorView,
  panelPosition,
}: AIPanelProps): React.ReactNode {
  // Controller handles all chat lifecycle logic
  const ctrl = useAIPanelController({
    docId,
    selectedText,
    pageContext,
    selectionSpans,
    runtime,
  });
  const { position } = useAIPanelState();
  const resolvedPanelPosition: PanelPosition =
    panelPosition ?? (position === "left" ? "left" : "right");

  const {
    messages,
    input,
    setInput,
    inputRef,
    isLoading,
    isStreaming,
    model,
    setModel,
    pendingApproval,
    approvalBusy,
    approvalError,
    attachmentsCtrl,
    consentCtrl,
    listRef,
    filteredModels,
    contextPayload,
    selectedCapability,
    visionFallback,
    projectContext,
    backgroundTasks,
    handleSend,
    runPrompt,
    handleRunBackground,
    handleAbort,
    handleClear,
    handleRetry,
    handleEdit,
    handleBranch,
    handleQuote,
    handleSuggestionClick,
    handleCopyLastAnswer,
    handleCopy,
    handleUseTask,
    handleApprove,
    handleReject,
    handleUpdateTask,
    handleUpdateWalkthrough,
    exportHistory,
    workflow,
    setWorkflow,
  } = ctrl;

  const {
    attachments,
    attachmentError,
    // isAttachmentBusy logic is computed in controller for handleSend,
    // but we need it here for InputArea disabled state
    handleAddAttachmentClick,
    handleRemoveAttachment,
    handleAttachmentFiles,
    fileInputRef,
  } = attachmentsCtrl;

  const {
    state: consentState,
    docOverride,
    decision,
    setGlobalAllow,
    setDocOverride,
    acceptDisclosure,
  } = consentCtrl;

  const {
    t,
    suggestions,
    messageListTranslations,
    headerTranslations,
    attachmentsMeta,
    inputTranslations,
    contextStatusTranslations,
    projectContextTranslations,
    approvalTranslations,
    taskQueueTranslations,
    providerLabel,
  } = useAIPanelTranslations(selectedCapability.provider);

  const { resolveReference, handleReferenceSelect } = useReferenceHandler(editorView);

  // View-specific helpers
  const isAttachmentBusy = attachments.some(
    (att) => att.status === "processing" || att.status === "sending"
  );

  const [contextPreviewOpen, setContextPreviewOpen] = React.useState(false);
  const handleToggleContextPreview = React.useCallback(() => {
    setContextPreviewOpen((prev) => !prev);
  }, []);

  const visionGuard =
    attachments.length > 0 && !selectedCapability.supports.vision ? (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
        <span>{t("errorVisionRequired")}</span>
        {visionFallback && (
          <Button size="compact" variant="outline" onClick={() => setModel(visionFallback.id)}>
            {t("visionSwitch", { model: visionFallback.label })}
          </Button>
        )}
      </div>
    ) : null;

  const { suggestions: proactiveSuggestions } = useProactiveSuggestions();

  const contextStatus = contextPayload ? (
    <ContextStatusPanel
      contextPayload={contextPayload}
      decision={decision}
      consentState={consentState}
      docId={docId}
      docOverride={docOverride}
      providerLabel={providerLabel}
      contextPreviewOpen={contextPreviewOpen}
      onTogglePreview={handleToggleContextPreview}
      onSetGlobalAllow={setGlobalAllow}
      onSetDocOverride={setDocOverride}
      onAcceptDisclosure={acceptDisclosure}
      translations={contextStatusTranslations}
    />
  ) : null;

  const referenceDebugPanel = <ReferenceDebugPanel editorView={editorView} messages={messages} />;

  return (
    <ShellAIPanel
      // Header Props
      title={t("title")}
      model={model}
      setModel={setModel}
      filteredModels={filteredModels}
      isStreaming={isStreaming}
      isLoading={isLoading}
      onClose={onClose}
      onClear={handleClear}
      onCopyLast={handleCopyLastAnswer}
      onExport={exportHistory}
      headerTranslations={headerTranslations}
      panelPosition={resolvedPanelPosition}
      // Configuration
      prompts={AI_PROMPTS}
      // Slots
      topContent={
        <>
          <div className="px-4 py-2 border-b border-border/50">
            <WorkflowSelector
              value={workflow}
              onChange={(w) => setWorkflow(w as typeof workflow)}
            />
          </div>

          <ProjectContextPanel
            tasks={projectContext.data?.tasks ?? []}
            isLoading={projectContext.isLoading}
            error={projectContext.error}
            updatedAt={projectContext.data?.updatedAt}
            warnings={projectContext.data?.warnings}
            onUseTask={handleUseTask}
            onRefresh={projectContext.refresh}
            translations={projectContextTranslations}
          />

          <TaskQueuePanel
            tasks={backgroundTasks.tasks}
            stats={backgroundTasks.stats}
            error={backgroundTasks.streamError}
            onCancelTask={backgroundTasks.cancelTask}
            onPauseTask={backgroundTasks.pauseTask}
            onResumeTask={backgroundTasks.resumeTask}
            onUpdateTask={(task) => handleUpdateTask(task.name)}
            onUpdateWalkthrough={(task) => handleUpdateWalkthrough(task.name)}
            translations={taskQueueTranslations}
          />

          {backgroundTasks.pendingApproval && (
            <ApprovalRequestCard
              request={{
                confirmationId: backgroundTasks.pendingApproval.confirmationId,
                toolName: backgroundTasks.pendingApproval.toolName,
                description: backgroundTasks.pendingApproval.description,
                arguments: backgroundTasks.pendingApproval.arguments,
                risk: backgroundTasks.pendingApproval.risk,
                reason: backgroundTasks.pendingApproval.reason,
                riskTags: backgroundTasks.pendingApproval.riskTags,
              }}
              isBusy={backgroundTasks.approvalBusy}
              error={backgroundTasks.approvalError}
              onApprove={backgroundTasks.approveNext}
              onReject={backgroundTasks.rejectNext}
              translations={approvalTranslations}
            />
          )}
        </>
      }
      overlayContent={
        <>
          {messages.length === 0 && !isLoading && proactiveSuggestions.length > 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 px-6">
              <div className="w-full max-w-sm space-y-3 pointer-events-auto animate-in fade-in fill-mode-forwards duration-700 slide-in-from-bottom-8">
                <h3 className="text-sm font-medium text-muted-foreground text-center mb-2">
                  {t("proactiveSuggestionsTitle")}
                </h3>
                {proactiveSuggestions.map((s) => (
                  <ProactiveSuggestionCard
                    key={s.id}
                    title={s.title}
                    description={s.description}
                    actionPrompt={s.actionPrompt}
                    icon={s.icon}
                    onSelect={runPrompt}
                  />
                ))}
              </div>
            </div>
          )}

          {pendingApproval && (
            <ApprovalRequestCard
              request={pendingApproval}
              isBusy={approvalBusy}
              error={approvalError}
              onApprove={handleApprove}
              onReject={handleReject}
              translations={approvalTranslations}
            />
          )}

          {referenceDebugPanel}
        </>
      }
      // MessageList Props
      messages={messages}
      suggestions={suggestions}
      listRef={listRef}
      onEdit={handleEdit}
      onBranch={handleBranch}
      onQuote={handleQuote}
      onCopy={handleCopy}
      onRetry={handleRetry}
      onSuggestionClick={handleSuggestionClick}
      messageListTranslations={messageListTranslations}
      resolveReference={editorView ? resolveReference : undefined}
      onReferenceSelect={editorView ? handleReferenceSelect : undefined}
      // InputArea Props
      input={input}
      setInput={setInput}
      onSend={handleSend}
      onRunBackground={handleRunBackground}
      onAbort={handleAbort}
      attachments={attachments}
      onAddAttachment={handleAddAttachmentClick}
      onRemoveAttachment={handleRemoveAttachment}
      fileInputRef={fileInputRef}
      inputRef={inputRef}
      onFileChange={handleAttachmentFiles}
      inputTranslations={{
        ...inputTranslations,
        attachmentsMeta: attachmentsMeta(attachments.length),
      }}
      contextStatus={contextStatus}
      visionGuard={visionGuard}
      attachmentError={attachmentError ?? undefined}
      isAttachmentBusy={isAttachmentBusy}
    />
  );
}
