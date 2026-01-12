/**
 * Priority Heap for Task Queue
 *
 * Efficient O(log n) priority queue implementation using binary heap.
 * Replaces O(n) array insertion with heap-based operations.
 *
 * Features:
 * - Binary min-heap for priority ordering
 * - O(log n) insert and extract
 * - O(1) peek
 * - Configurable priority comparison
 */

import type { Task, TaskPriority } from "./types";

// ============================================================================
// Priority Ordering
// ============================================================================

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

// ============================================================================
// Priority Heap
// ============================================================================

/**
 * Priority Heap
 *
 * Binary min-heap for efficient priority queue operations.
 */
export class PriorityHeap {
  private heap: Task[] = [];
  private indexMap = new Map<string, number>(); // taskId -> heap index

  /**
   * Get heap size.
   */
  get size(): number {
    return this.heap.length;
  }

  /**
   * Check if heap is empty.
   */
  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Insert a task into the heap.
   */
  insert(task: Task): void {
    this.heap.push(task);
    const index = this.heap.length - 1;
    this.indexMap.set(task.id, index);
    this.bubbleUp(index);
  }

  /**
   * Extract the highest priority task.
   */
  extract(): Task | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    if (this.heap.length === 1) {
      const task = this.heap.pop();
      if (!task) {
        return undefined;
      }
      this.indexMap.delete(task.id);
      return task;
    }

    const top = this.heap[0];
    const last = this.heap.pop();
    if (!last) {
      return top;
    }

    this.heap[0] = last;
    this.indexMap.set(last.id, 0);
    this.indexMap.delete(top.id);

    this.bubbleDown(0);

    return top;
  }

  /**
   * Peek at the highest priority task without removing.
   */
  peek(): Task | undefined {
    return this.heap[0];
  }

  /**
   * Remove a task by ID.
   */
  remove(taskId: string): boolean {
    const index = this.indexMap.get(taskId);
    if (index === undefined) {
      return false;
    }

    if (index === this.heap.length - 1) {
      this.heap.pop();
      this.indexMap.delete(taskId);
      return true;
    }

    // Move last element to removed position
    const last = this.heap.pop();
    if (!last) {
      return false;
    }
    this.heap[index] = last;
    this.indexMap.set(last.id, index);
    this.indexMap.delete(taskId);

    // Restore heap property
    const parentIndex = Math.floor((index - 1) / 2);
    if (index > 0 && this.compare(this.heap[parentIndex], this.heap[index]) > 0) {
      this.bubbleUp(index);
    } else {
      this.bubbleDown(index);
    }

    return true;
  }

  /**
   * Check if task exists.
   */
  has(taskId: string): boolean {
    return this.indexMap.has(taskId);
  }

  /**
   * Get task by ID.
   */
  get(taskId: string): Task | undefined {
    const index = this.indexMap.get(taskId);
    return index !== undefined ? this.heap[index] : undefined;
  }

  /**
   * Clear all tasks.
   */
  clear(): void {
    this.heap = [];
    this.indexMap.clear();
  }

  /**
   * Convert to array (for iteration).
   */
  toArray(): Task[] {
    return [...this.heap];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private compare(a: Task, b: Task): number {
    // Higher priority number = higher priority
    const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    // If same priority, earlier created = higher priority
    return a.createdAt - b.createdAt;
  }

  private bubbleUp(index: number): void {
    let currentIndex = index;
    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);
      const parent = this.heap[parentIndex];
      const current = this.heap[currentIndex];

      if (this.compare(parent, current) <= 0) {
        break;
      }

      // Swap
      this.heap[parentIndex] = current;
      this.heap[currentIndex] = parent;
      this.indexMap.set(current.id, parentIndex);
      this.indexMap.set(parent.id, currentIndex);

      currentIndex = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;

    for (let currentIndex = index; ; ) {
      let smallest = currentIndex;
      const left = 2 * currentIndex + 1;
      const right = 2 * currentIndex + 2;

      if (left < length && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }

      if (right < length && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }

      if (smallest === currentIndex) {
        break;
      }

      // Swap
      const temp = this.heap[currentIndex];
      this.heap[currentIndex] = this.heap[smallest];
      this.heap[smallest] = temp;

      this.indexMap.set(this.heap[currentIndex].id, currentIndex);
      this.indexMap.set(this.heap[smallest].id, smallest);

      currentIndex = smallest;
    }
  }
}

/**
 * Create a priority heap.
 */
export function createPriorityHeap(): PriorityHeap {
  return new PriorityHeap();
}
