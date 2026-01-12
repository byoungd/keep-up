import type { Meta, StoryObj } from "@storybook/react";
import { Avatar } from "./Avatar";

const sampleAvatar = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(#g)"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="48" font-family="Arial" fill="#fff">AR</text></svg>'
)}`;

const meta = {
  title: "UI/Avatar",
  component: Avatar,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["xs", "sm", "default", "lg", "xl"],
    },
    status: {
      control: "select",
      options: ["online", "away", "busy", "offline"],
    },
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    fallback: "Alex Rivera",
    size: "default",
  },
};

export const WithImage: Story = {
  args: {
    src: sampleAvatar,
    alt: "Avatar portrait",
    fallback: "Alex Rivera",
    status: "online",
    size: "lg",
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {(["xs", "sm", "default", "lg", "xl"] as const).map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <Avatar size={size} fallback="AR" />
          <span className="text-xs text-muted-foreground">{size}</span>
        </div>
      ))}
    </div>
  ),
};

export const Statuses: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {(["online", "away", "busy", "offline"] as const).map((status) => (
        <div key={status} className="flex flex-col items-center gap-2">
          <Avatar fallback="AR" status={status} />
          <span className="text-xs text-muted-foreground">{status}</span>
        </div>
      ))}
    </div>
  ),
};
