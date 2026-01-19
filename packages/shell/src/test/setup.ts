import * as React from "react";

const globalScope = globalThis as typeof globalThis & {
  React?: typeof React;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

globalScope.React = React;
globalScope.IS_REACT_ACT_ENVIRONMENT = true;
