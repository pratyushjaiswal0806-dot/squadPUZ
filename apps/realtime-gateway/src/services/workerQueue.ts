import { AppError } from "../errors.js";

type TaskFn<T> = () => Promise<T>;

interface QueueTask<T> {
  taskFn: TaskFn<T>;
  timeoutMs: number;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export class BoundedWorkerQueue {
  private maxConcurrent: number;
  private maxQueueLength: number;
  private activeCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private queue: QueueTask<any>[] = [];

  constructor(maxConcurrent = 4, maxQueueLength = 100) {
    this.maxConcurrent = Number(process.env.MAX_CONCURRENT_JOBS ?? maxConcurrent);
    this.maxQueueLength = Number(process.env.MAX_QUEUE_LENGTH ?? maxQueueLength);
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  public get activeJobs(): number {
    return this.activeCount;
  }

  public async run<T>(taskFn: TaskFn<T>, timeoutMs = 5000): Promise<T> {
    if (this.queue.length >= this.maxQueueLength) {
      throw new AppError(
        "RATE_LIMITED",
        "Server processing queue is at maximum capacity. Please retry later.",
        { statusCode: 429, retryable: true }
      );
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        taskFn,
        timeoutMs,
        resolve,
        reject
      });
      this.processNext();
    });
  }

  private processNext(): void {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      task.reject(
        new AppError("GENERATION_TIMEOUT", "Image puzzle processing timed out (exceeded 5s limit)", {
          statusCode: 504,
          retryable: true
        })
      );
    }, task.timeoutMs);

    task
      .taskFn()
      .then((res) => {
        if (!timedOut) {
          clearTimeout(timer);
          task.resolve(res);
        }
      })
      .catch((err) => {
        if (!timedOut) {
          clearTimeout(timer);
          task.reject(err);
        }
      })
      .finally(() => {
        this.activeCount--;
        this.processNext();
      });
  }
}

export const globalWorkerQueue = new BoundedWorkerQueue();
