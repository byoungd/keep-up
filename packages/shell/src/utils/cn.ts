import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Utility for merging Tailwind classes with clsx */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
