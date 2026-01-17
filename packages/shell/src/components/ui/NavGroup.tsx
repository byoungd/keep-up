import type { NavGroupProps } from "@ku0/shared/ui/nav";
import { NavGroup as SharedNavGroup } from "@ku0/shared/ui/nav";
import { ChevronRight } from "lucide-react";

export function NavGroup(props: NavGroupProps) {
  return <SharedNavGroup {...props} indicator={<ChevronRight className="h-3 w-3" />} />;
}

export type { NavGroupProps };
