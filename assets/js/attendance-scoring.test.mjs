import assert from 'node:assert/strict';
import { getAnnualEvaluationAssemblies } from './attendance-scoring.js';

const assemblies = [
    { fecha: '2025-12-27' },
    { fecha: '2026-01-03' },
    { fecha: '2026-01-10' },
    { fecha: '2026-04-04' },
    { fecha: '2026-04-11' },
    { fecha: '2026-04-18' },
    { fecha: '2026-12-26' }
];
const asOfDate = new Date('2026-04-20T12:00:00.000Z');

assert.deepEqual(
    getAnnualEvaluationAssemblies(
        assemblies,
        new Map([['2026-04-04', {}], ['2026-04-18', {}]]),
        '2026-04-04',
        asOfDate
    ).map(assembly => assembly.fecha),
    ['2026-04-04', '2026-04-11', '2026-04-18'],
    'starts the denominator at a mid-year member’s first attendance and counts later absences'
);

assert.deepEqual(
    getAnnualEvaluationAssemblies(
        assemblies,
        new Map([['2026-01-03', {}], ['2026-04-18', {}]]),
        '2024-01-01',
        asOfDate
    ).map(assembly => assembly.fecha),
    ['2026-01-03', '2026-01-10', '2026-04-04', '2026-04-11', '2026-04-18'],
    'a member attending from the start of the year is evaluated across all assemblies since then'
);

assert.deepEqual(
    getAnnualEvaluationAssemblies(assemblies, new Map(), '2026-04-04', asOfDate),
    [],
    'does not penalize a member for assemblies before their first attendance this year'
);

assert.deepEqual(
    getAnnualEvaluationAssemblies(
        assemblies,
        new Map([['2025-12-27', {}], ['2026-04-18', {}]]),
        '2024-01-01',
        asOfDate
    ).map(assembly => assembly.fecha),
    ['2026-01-03', '2026-01-10', '2026-04-04', '2026-04-11', '2026-04-18'],
    'a returning member with past attendance is evaluated from the first assembly of the year'
);

console.log('annual attendance scoring: 4 passed');
