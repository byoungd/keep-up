import { cn } from "@ku0/shared/utils";
import { Loader2 } from "lucide-react";
import * as React from "react";
import type { ApprovalRiskLevel } from "../chat/types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "../ui/Card";

export interface ApprovalCardProps {
  toolName: string;
  toolDescription?: string;
  parameters: Record<string, unknown>;
  riskLevel?: ApprovalRiskLevel;
  onApprove: () => void;
  onReject: () => void;
  pendingAction?: "approve" | "reject" | null;
  isDisabled?: boolean;
  className?: string;
}

const RISK_STYLES: Record<ApprovalRiskLevel, string> = {
  low: "bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20",
  medium: "bg-accent-amber/10 text-accent-amber border-accent-amber/20",
  high: "bg-accent-rose/10 text-accent-rose border-accent-rose/20",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
};

export function ApprovalCard({
  toolName,
  toolDescription,
  parameters,
  riskLevel = "medium",
  onApprove,
  onReject,
  pendingAction = null,
  isDisabled = false,
  className,
}: ApprovalCardProps) {
  const isBusy = pendingAction !== null;
  const formattedParameters = React.useMemo(() => {
    try {
      return JSON.stringify(parameters, null, 2);
    } catch {
      return "Unable to display parameters.";
    }
  }, [parameters]);

  return (
    <Card className={cn("bg-surface-1", className)} padding="sm">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={RISK_STYLES[riskLevel]}>{riskLevel.toUpperCase()}</Badge>
          <span className="text-sm font-semibold text-foreground">{toolName}</span>
        </div>
        {toolDescription ? (
          <CardDescription className="text-xs text-muted-foreground">
            {toolDescription}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="pt-3">
        <pre className="text-xs bg-surface-2/60 border border-border/40 p-2.5 rounded-lg overflow-x-auto text-muted-foreground">
          {formattedParameters}
        </pre>
      </CardContent>
      <CardFooter className="gap-2 justify-end pt-3">
        <Button
          variant="destructive"
          size="sm"
          onClick={onReject}
          disabled={isDisabled || isBusy}
          aria-busy={pendingAction === "reject"}
        >
          {pendingAction === "reject" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Reject
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onApprove}
          disabled={isDisabled || isBusy}
          aria-busy={pendingAction === "approve"}
        >
          {pendingAction === "approve" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Approve
        </Button>
      </CardFooter>
    </Card>
  );
}
