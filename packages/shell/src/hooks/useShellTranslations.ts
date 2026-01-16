export const useShellTranslations = (_namespace: string) => {
  // This is a temporary mockup to remove next-intl dependency.
  // Ideally this should use the I18nContext or similar from the shell.
  // For now returning keys or English defaults.
  return (key: string) => {
    const translations: Record<string, string> = {
      // Model Selector
      modelTagBalanced: "Balanced",
      modelTagQuality: "Quality",
      modelTagLite: "Lite",
      modelProviderGoogle: "Google Gemini",
      modelProviderAnthropic: "Anthropic Claude",
      modelProviderOpenAI: "OpenAI",
      modelProviderDeepSeek: "DeepSeek",
      modelProviderMeta: "Meta Llama",
      modelProviderAlibaba: "Alibaba Qwen",
      modelProviderMiniMax: "MiniMax",
      modelProviderMoonshot: "Moonshot AI",
      modelProviderXAI: "xAI Grok",
      modelProviderZAI: "Zhipu AI",
      modelProviderStealth: "Stealth",
      modelFeatureFast: "Fast",
      modelFeatureVision: "Vision",
      modelFeatureReasoning: "Reasoning",
      modelFeatureEffort: "Thinking",
      modelFeatureToolCalling: "Tools",
      modelFeatureImageGeneration: "Image",
      modelFeaturePDF: "PDF",
      modelFeatureVideo: "Video",
      modelFavoritesLabel: "Favorites",
      modelCategoryAll: "All Models",
      modelProviderSettings: "Provider Settings",
      modelBackToModels: "Back to Models",
      providerSettingsTitle: "Provider Configuration",
      modelFavoriteAdd: "Add to Favorites",
      modelFavoriteRemove: "Remove from Favorites",
      modelDetailOpen: "View Details",

      // Artifacts
      artifactTitle: "Artifact",
      artifactPlanLabel: "Plan",
      artifactDiffLabel: "Diff",
      artifactChecklistLabel: "Checklist",
      artifactReportLabel: "Report",
      artifactCollapse: "Collapse",
      artifactExpand: "Expand",
      artifactStepsLabel: "Steps",
      artifactFilesLabel: "Files",
      artifactChecklistItemsLabel: "Items",
      artifactSectionsLabel: "Sections",
      artifactApprove: "Approve",
      artifactReject: "Reject",
      artifactApply: "Apply",
      artifactApproved: "Approved",
      artifactRejected: "Rejected",
      artifactApplied: "Applied",
    };
    return translations[key] || key;
  };
};
