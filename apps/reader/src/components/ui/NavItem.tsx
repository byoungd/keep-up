import { Link } from "@/i18n/navigation";
import { NavItem as SharedNavItem } from "@ku0/shared/ui/nav";
import type { NavItemProps as SharedNavItemProps } from "@ku0/shared/ui/nav";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

export interface NavItemProps extends Omit<SharedNavItemProps, "render" | "href" | "icon"> {
  href: string;
  icon?: LucideIcon;
}

export const NavItem = React.memo(function NavItem({ href, icon, ...props }: NavItemProps) {
  const iconNode = icon ? React.createElement(icon, { className: "h-full w-full" }) : undefined;

  return (
    <SharedNavItem
      {...props}
      icon={iconNode}
      render={({ className, children, ariaCurrent }) => (
        <Link href={href} aria-current={ariaCurrent} className={className}>
          {children}
        </Link>
      )}
    />
  );
});
