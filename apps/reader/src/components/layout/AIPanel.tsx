"use client";
import { Button } from "@/components/ui/Button";
import { useAIPanelController } from "@/hooks/useAIPanelController";
import { useAIPanelTranslations } from "@/hooks/useAIPanelTranslations";
import { useReferenceHandler } from "@/hooks/useReferenceHandler";
import type { LoroRuntime, SpanList } from "@keepup/lfcc-bridge";
import { cn } from "@keepup/shared/utils";
import type { EditorView } from "prosemirror-view";
import * as React from "react";
import { WorkflowSelector } from "../ai/WorkflowSelector";
import { AIPanelHeader } from "./AIPanelHeader";
import { ApprovalRequestCard } from "./ApprovalRequestCard";
import { ContextStatusPanel } from "./ContextStatusPanel";
import { InputArea } from "./InputArea";
import { MessageList } from "./MessageList";
import type { PanelPosition } from "./ModelSelector";
import { ProjectContextPanel } from "./ProjectContextPanel";
import { ReferenceDebugPanel } from "./ReferenceDebugPanel";

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
  panelPosition = "right",
}: AIPanelProps) {
  // Controller handles all chat lifecycle logic
  const ctrl = useAIPanelController({
    docId,
    selectedText,
    pageContext,
    selectionSpans,
    runtime,
  });

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
    handleSend,
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
    <aside
      className={cn(
        "ai-panel h-full flex flex-col font-sans text-foreground",
        // Standard shadow for depth
        "shadow-xl",
        // Gradient background (top lighter, bottom slightly darker)
        "bg-gradient-to-b from-surface-0/80 via-surface-0/85 to-surface-0/92",
        "backdrop-blur-xl",
        // Entry animation
        "animate-in fade-in slide-in-from-right duration-500 ease-out-expo"
      )}
      aria-label="AI assistant panel"
    >
      <AIPanelHeader
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
        translations={headerTranslations}
        panelPosition={panelPosition}
      />

      <div className="px-4 py-2 border-b border-border/50">
        <WorkflowSelector value={workflow} onChange={(w) => setWorkflow(w as typeof workflow)} />
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

      <MessageList
        messages={messages}
        suggestions={suggestions}
        isLoading={isLoading}
        isStreaming={isStreaming}
        listRef={listRef}
        onEdit={handleEdit}
        onBranch={handleBranch}
        onQuote={handleQuote}
        onCopy={handleCopy}
        onRetry={handleRetry}
        onSuggestionClick={handleSuggestionClick}
        translations={messageListTranslations}
        resolveReference={editorView ? resolveReference : undefined}
        onReferenceSelect={editorView ? handleReferenceSelect : undefined}
      />

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

      <InputArea
        input={input}
        setInput={setInput}
        onSend={handleSend}
        onAbort={handleAbort}
        isLoading={isLoading}
        isStreaming={isStreaming}
        attachments={attachments}
        onAddAttachment={handleAddAttachmentClick}
        onRemoveAttachment={handleRemoveAttachment}
        fileInputRef={fileInputRef}
        inputRef={inputRef}
        onFileChange={handleAttachmentFiles}
        translations={{
          ...inputTranslations,
          attachmentsMeta: attachmentsMeta(attachments.length),
        }}
        contextStatus={contextStatus}
        visionGuard={visionGuard}
        attachmentError={attachmentError ?? undefined}
        isAttachmentBusy={isAttachmentBusy || attachmentError !== null}
      />
    </aside>
  );
}
