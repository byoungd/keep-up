import type { Meta, StoryObj } from "@storybook/react";
import { Search, X } from "lucide-react";
import { Input } from "./Input";

const meta = {
  title: "UI/Input",
  component: Input,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "Type a message",
  },
  render: (args) => (
    <div className="w-80">
      <Input {...args} aria-label="Default input" />
    </div>
  ),
};

export const SearchField: Story = {
  args: {
    placeholder: "Search documents",
    variant: "search",
    leftIcon: <Search className="h-4 w-4" />,
  },
  render: (args) => (
    <div className="w-80">
      <Input {...args} aria-label="Search input" />
    </div>
  ),
};

export const WithIcons: Story = {
  args: {
    placeholder: "Command",
    leftIcon: <Search className="h-4 w-4" />,
    rightIcon: <X className="h-4 w-4" />,
  },
  render: (args) => (
    <div className="w-80">
      <Input {...args} aria-label="Input with icons" />
    </div>
  ),
};

export const ErrorState: Story = {
  args: {
    placeholder: "Email",
    error: true,
  },
  render: (args) => (
    <div className="w-80">
      <Input {...args} aria-label="Input error state" />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    placeholder: "Disabled input",
    disabled: true,
  },
  render: (args) => (
    <div className="w-80">
      <Input {...args} aria-label="Disabled input" />
    </div>
  ),
};
