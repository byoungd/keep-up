"use client";

import * as React from "react";

const LfccEditorPanel = React.memo(function LfccEditorPanel({
  mountRef,
}: {
  mountRef: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={mountRef}
      data-lfcc-editor
      data-lfcc-editor-root="true"
      data-testid="lfcc-editor"
      className="lfcc-editor outline-none w-full h-full min-h-[500px]"
    />
  );
});

export { LfccEditorPanel };
