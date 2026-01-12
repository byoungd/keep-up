import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";
import { ToastProvider, useToast } from "./Toast";

const meta = {
  title: "UI/Toast",
  component: ToastProvider,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ToastProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

function ToastDemo() {
  const { toast } = useToast();

  return (
    <div className="flex flex-wrap gap-2 p-6">
      <Button type="button" onClick={() => toast("Saved successfully", "success")}>
        Success
      </Button>
      <Button type="button" variant="secondary" onClick={() => toast("Heads up!", "info")}>
        Info
      </Button>
      <Button type="button" variant="outline" onClick={() => toast("Check your inputs", "warning")}>
        Warning
      </Button>
      <Button type="button" variant="destructive" onClick={() => toast("Something broke", "error")}>
        Error
      </Button>
    </div>
  );
}

export const Playground: Story = {
  args: {
    children: null,
  },
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
};
