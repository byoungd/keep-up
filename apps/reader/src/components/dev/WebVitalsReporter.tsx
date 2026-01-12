"use client";

import * as React from "react";

/**
 * Reports Web Vitals metrics to console in development.
 * In production, you can send these to an analytics endpoint.
 */
export function WebVitalsReporter() {
  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const reportWebVitals = async () => {
      const { onCLS, onLCP, onTTFB, onINP } = await import("web-vitals");

      const logMetric = (metric: { name: string; value: number; rating: string }) => {
        if (process.env.NODE_ENV === "development") {
          // biome-ignore lint/suspicious/noConsoleLog: Intentional dev-only logging
          console.log(`[Web Vitals] ${metric.name}:`, {
            value: metric.value.toFixed(2),
            rating: metric.rating,
          });
        }
        // TODO: Send to analytics service in production
        // sendToAnalytics(metric);
      };

      onCLS(logMetric);
      onLCP(logMetric);
      onTTFB(logMetric);
      onINP(logMetric);
    };

    reportWebVitals().catch(console.error);
  }, []);

  return null;
}
