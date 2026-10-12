export function createSerialQueue() {
  let chain = Promise.resolve();

  return {
    enqueue(task) {
      const runner = () => Promise.resolve().then(task);
      const next = chain.then(runner, runner);
      chain = next.catch(() => {});
      return next;
    },
    get pending() {
      return chain;
    }
  };
}
