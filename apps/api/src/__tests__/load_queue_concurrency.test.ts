import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BoundedWorkerQueue } from "../../../realtime-gateway/src/services/workerQueue.js";

describe("Load & Concurrency Tests: Bounded Worker Queue", () => {
  it("Enforces bounded worker concurrency and queue capacity under burst load", async () => {
    // Max 2 concurrent workers, queue capacity 3, timeout 2000ms
    const queue = new BoundedWorkerQueue(2, 3);

    let currentActive = 0;
    let maxActiveObserved = 0;
    let completedCount = 0;

    const taskFactory = (id: number) => async () => {
      currentActive++;
      if (currentActive > maxActiveObserved) {
        maxActiveObserved = currentActive;
      }

      // Simulate async CPU/IO work
      await new Promise((resolve) => setTimeout(resolve, 50));

      currentActive--;
      completedCount++;
      return `task_${id}_success`;
    };

    const initialMem = process.memoryUsage().heapUsed;

    // Dispatch a burst of 10 tasks concurrently
    const promises: Promise<string>[] = [];

    for (let i = 0; i < 10; i++) {
      promises.push(queue.run(taskFactory(i), 2000));
    }

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Concurrency check: Active concurrent workers MUST NOT exceed 2
    assert.ok(
      maxActiveObserved <= 2,
      `Max active workers observed was ${maxActiveObserved}, exceeding configured limit of 2`
    );

    // Queue capacity check: 2 executing + 3 in queue = 5 accepted, remaining 5 rejected
    assert.ok(
      fulfilled.length <= 5,
      `Accepted tasks (${fulfilled.length}) exceeded max system capacity (5)`
    );

    assert.equal(completedCount, fulfilled.length);
    assert.ok(rejected.length >= 5, `Rejected tasks count was ${rejected.length}`);

    const finalMem = process.memoryUsage().heapUsed;
    const memDeltaMb = (finalMem - initialMem) / (1024 * 1024);

    // Memory stability assertion: Memory growth under burst must remain under 20MB
    assert.ok(
      memDeltaMb < 20,
      `Memory growth during burst was ${memDeltaMb.toFixed(2)}MB, exceeding 20MB stability threshold`
    );
  });
});
