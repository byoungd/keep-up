import type { CoworkWorkflowTemplate } from "@ku0/agent-runtime";
import type { WorkflowTemplateStoreLike } from "./contracts";
import { JsonStore } from "./jsonStore";

export class WorkflowTemplateStore implements WorkflowTemplateStoreLike {
  private readonly store: JsonStore<CoworkWorkflowTemplate>;

  constructor(filePath: string) {
    this.store = new JsonStore<CoworkWorkflowTemplate>({
      filePath,
      idKey: "templateId",
      fallback: [],
    });
  }

  getAll(): Promise<CoworkWorkflowTemplate[]> {
    return this.store.getAll();
  }

  getById(templateId: string): Promise<CoworkWorkflowTemplate | null> {
    return this.store.getById(templateId);
  }

  create(template: CoworkWorkflowTemplate): Promise<CoworkWorkflowTemplate> {
    return this.store.upsert(template);
  }

  update(
    templateId: string,
    updater: (template: CoworkWorkflowTemplate) => CoworkWorkflowTemplate
  ): Promise<CoworkWorkflowTemplate | null> {
    return this.store.update(templateId, updater);
  }

  delete(templateId: string): Promise<boolean> {
    return this.store.delete(templateId);
  }
}

export function createWorkflowTemplateStore(filePath: string): WorkflowTemplateStore {
  return new WorkflowTemplateStore(filePath);
}
