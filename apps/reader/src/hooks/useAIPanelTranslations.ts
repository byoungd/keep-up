import { useTranslations } from "next-intl";
import * as React from "react";
import type { ContextStatusTranslations } from "../components/layout/ContextStatusPanel";
import type { MessageStatus } from "../components/layout/MessageItem";

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  claude: "Claude",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  meta: "Meta",
  alibaba: "Alibaba",
  minimax: "MiniMax",
  moonshot: "Moonshot",
  xai: "xAI",
  zai: "ZAI",
  stealth: "Stealth",
};

export function useAIPanelTranslations(selectedProvider: string) {
  const t = useTranslations("AIPanel");

  const statusLabels = React.useMemo<Record<MessageStatus, string>>(
    () => ({
      streaming: t("statusStreaming"),
      done: t("statusDone"),
      error: t("statusError"),
      canceled: t("statusCanceled"),
    }),
    [t]
  );

  const alertLabels = React.useMemo(
    () => ({
      titleError: t("alertTitleError"),
      titleCanceled: t("alertTitleCanceled"),
      bodyError: t("alertBodyError"),
      bodyCanceled: t("alertBodyCanceled"),
      retry: t("alertRetry"),
    }),
    [t]
  );

  const suggestions = React.useMemo(
    () => [t("suggestSummarize"), t("suggestTranslate"), t("suggestKeyConcepts"), t("suggestQuiz")],
    [t]
  );

  const messageListTranslations = React.useMemo(
    () => ({
      emptyTitle: t("emptyTitle"),
      emptyDescription: t("emptyDescription"),
      you: t("you"),
      assistant: t("assistant"),
      actionEdit: t("actionEdit"),
      actionBranch: t("actionBranch"),
      actionQuote: t("actionQuote"),
      actionCopy: t("actionCopy"),
      actionRetry: t("actionRetry"),
      requestIdLabel: t("requestIdLabel"),
      statusLabels,
      alertLabels,
      referenceLabel: t("referenceLabel"),
      referenceResolved: t("referenceResolved"),
      referenceRemapped: t("referenceRemapped"),
      referenceUnresolved: t("referenceUnresolved"),
      referenceFind: t("referenceFind"),
      referenceUnavailable: t("referenceUnavailable"),
    }),
    [t, statusLabels, alertLabels]
  );

  const headerTranslations = React.useMemo(
    () => ({
      copyLast: t("copyLast"),
      newChat: t("newChat"),
      closePanel: t("closePanel"),
      exportChat: "Export Chat",
      title: t("title"),
    }),
    [t]
  );

  const attachmentsMeta = (count: number) =>
    count > 0 ? t("attachmentsCount", { count }) : t("attachmentsOptional");

  const inputTranslations = React.useMemo(
    () => ({
      attachmentsLabel: t("attachmentsLabel"),
      addImage: t("addImage"),
      removeAttachment: t("removeAttachment"),
      inputPlaceholder: t("inputPlaceholder"),
    }),
    [t]
  );

  const providerLabel = PROVIDER_LABELS[selectedProvider] ?? "AI";

  const contextStatusTranslations = React.useMemo<ContextStatusTranslations>(
    () => ({
      contextSourceSelection: t("contextSourceSelection"),
      contextSourceVisible: t("contextSourceVisible"),
      contextSharingOn: t("contextSharingOn"),
      contextSharingPending: t("contextSharingPending"),
      contextSharingOff: t("contextSharingOff"),
      contextPreviewHide: t("contextPreviewHide"),
      contextPreviewShow: t("contextPreviewShow"),
      contextGlobalLabel: t("contextGlobalLabel"),
      contextToggleOn: t("contextToggleOn"),
      contextToggleOff: t("contextToggleOff"),
      contextDocLabel: t("contextDocLabel"),
      contextDocInherit: t("contextDocInherit"),
      contextDocAllow: t("contextDocAllow"),
      contextDocDeny: t("contextDocDeny"),
      contextSharingActive: t("contextSharingActive", { provider: providerLabel }),
      contextSharingInactive: t("contextSharingInactive"),
      contextDisclosureTitle: t("contextDisclosureTitle"),
      contextDisclosureBody: t("contextDisclosureBody", { provider: providerLabel }),
      contextDisclosureAcknowledge: t("contextDisclosureAcknowledge"),
      contextPreviewTitle: t("contextPreviewTitle"),
      contextRedactions: t("contextRedactions", { count: "{count}" }),
      contextTruncated: t("contextTruncated"),
    }),
    [t, providerLabel]
  );

  const projectContextTranslations = React.useMemo(
    () => ({
      title: t("projectContextTitle"),
      subtitle: t("projectContextSubtitle"),
      loading: t("projectContextLoading"),
      empty: t("projectContextEmpty"),
      refresh: t("projectContextRefresh"),
      tasksLabel: t("projectContextTasksLabel"),
      openItemsLabel: t("projectContextOpenItemsLabel"),
      checklistLabel: t("projectContextChecklistLabel"),
      useTask: t("projectContextUseTask"),
      warningsLabel: t("projectContextWarningsLabel"),
      updatedLabel: t("projectContextUpdatedLabel", { time: "{time}" }),
    }),
    [t]
  );

  const approvalTranslations = React.useMemo(
    () => ({
      title: t("approvalTitle"),
      approve: t("approvalApprove"),
      reject: t("approvalReject"),
      riskLabel: t("approvalRiskLabel"),
      reasonLabel: t("approvalReasonLabel"),
      argumentsLabel: t("approvalArgumentsLabel"),
      pendingLabel: t("approvalPendingLabel"),
      errorLabel: t("approvalErrorLabel"),
    }),
    [t]
  );

  return {
    t,
    statusLabels,
    alertLabels,
    suggestions,
    messageListTranslations,
    headerTranslations,
    attachmentsMeta,
    inputTranslations,
    contextStatusTranslations,
    projectContextTranslations,
    approvalTranslations,
    providerLabel,
  };
}
