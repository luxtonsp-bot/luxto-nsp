import assert from 'node:assert/strict';
import { createSerialQueue } from './serial-queue.js';

const queue = createSerialQueue();
const events = [];

const task = (label, delay) => () => new Promise((resolve) => {
  setTimeout(() => {
    events.push(label);
    resolve(label);
  }, delay);
});

await queue.enqueue(task('first', 25));
await queue.enqueue(task('second', 5));
await queue.enqueue(task('third', 5));

assert.deepEqual(events, ['first', 'second', 'third'], 'tasks must run in order without overlaps');
console.log('serial queue: 1 passed');
