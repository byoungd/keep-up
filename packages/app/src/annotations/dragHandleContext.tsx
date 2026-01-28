import * as React from "react";

import { DragHandleController, getDragHandleController } from "./dragHandle";

type DragHandleControllerProviderProps = {
  children: React.ReactNode;
  controller?: DragHandleController;
};

const DragHandleControllerContext = React.createContext<DragHandleController | null>(null);

export function DragHandleControllerProvider({
  children,
  controller,
}: DragHandleControllerProviderProps) {
  const value = React.useMemo(() => controller ?? new DragHandleController(), [controller]);

  React.useEffect(() => {
    if (controller) {
      return undefined;
    }

    return () => {
      value.destroy();
    };
  }, [controller, value]);

  return (
    <DragHandleControllerContext.Provider value={value}>
      {children}
    </DragHandleControllerContext.Provider>
  );
}

export function useDragHandleController(): DragHandleController {
  const context = React.useContext(DragHandleControllerContext);
  return context ?? getDragHandleController();
}
