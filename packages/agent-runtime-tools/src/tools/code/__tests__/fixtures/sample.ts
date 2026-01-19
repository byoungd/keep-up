import type { Bar } from "./bar";
import { something } from "./foo";

export interface SampleInterface {
  id: string;
}

export type SampleType = {
  name: string;
  bar?: Bar;
};

const sampleVariable = 42;

export class SampleClass {
  constructor(private readonly value: string) {}

  public methodA(): string {
    this.methodB();
    return this.value;
  }

  private methodB(): void {
    if (this.value === String(sampleVariable)) {
      return;
    }
  }
}

export async function helperFunction(): Promise<void> {
  return;
}

export const arrowFunction = (value: number) => {
  return value * 2 + sampleVariable + something;
};
