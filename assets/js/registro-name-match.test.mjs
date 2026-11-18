import assert from 'node:assert/strict';
import { findRegistrationNameMatches } from './registro-name-match.js';

const candidates = [
    { memberId: 'twin-1', nombre: 'Ana María Pérez' },
    { memberId: 'twin-2', nombre: 'Ana Lucía Pérez' },
    { memberId: 'sofia', nombre: 'Sofía Briseño' },
    { memberId: 'partial', nombre: 'Juan Pérez' },
    { memberId: 'unlinked', nombre: 'Sofia  Briseño', memberId: null }
];

assert.deepEqual(
    findRegistrationNameMatches('Ana María Pérez', candidates).map(member => member.memberId),
    ['twin-1'],
    'full names distinguish twins who share a surname'
);
assert.deepEqual(
    findRegistrationNameMatches('Ana Pérez', candidates).map(member => member.memberId).sort(),
    ['twin-1', 'twin-2'],
    'a shared first name and surname returns both twins for explicit selection'
);
assert.equal(
    findRegistrationNameMatches('Sofia Briceño', candidates).find(member => member.memberId === 'sofia')?.memberId,
    'sofia',
    'accent differences and a one-character typo still match'
);
assert.equal(
    findRegistrationNameMatches('Juan Carlos Pérez Gonzales', candidates)[0].memberId,
    'partial',
    'a full name matches a registry name with one given name and one surname'
);
assert.equal(
    findRegistrationNameMatches('Sofia Briseño', candidates).length,
    2,
    'duplicate registration names remain visible for repair instead of being silently dropped'
);

console.log('registration name matching: 5 passed');
