export class BatchScheduler {
  async runCollectBatches<TInput, TResult>(
    items: TInput[],
    batchSize: number,
    concurrency: number,
    worker: (batch: TInput[]) => Promise<TResult[]>,
  ): Promise<TResult[]> {
    if (items.length === 0) {
      return [];
    }

    const batches = chunk(items, batchSize);
    const results: TResult[][] = new Array(batches.length);
    let nextIndex = 0;

    await Promise.all(
      Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
        while (nextIndex < batches.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          results[currentIndex] = await worker(batches[currentIndex]);
        }
      }),
    );

    return results.flat();
  }

  async runVoidBatches<TInput>(
    items: TInput[],
    batchSize: number,
    concurrency: number,
    worker: (batch: TInput[]) => Promise<void>,
  ): Promise<void> {
    await this.runCollectBatches(items, batchSize, concurrency, async (batch) => {
      await worker(batch);
      return [];
    });
  }
}

function chunk<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}