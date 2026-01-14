import { generateAllCss } from "@ku0/app";

const annotationCss = generateAllCss();

export function LfccAnnotationStyles() {
  return <style data-lfcc-annotation-styles>{annotationCss}</style>;
}
