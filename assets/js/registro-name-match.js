const STOP_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'di']);

export function normalizeRegistrationName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(token => token && !STOP_WORDS.has(token));
}

function editDistance(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
        let diagonal = previous[0];
        previous[0] = leftIndex;
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
            const above = previous[rightIndex];
            previous[rightIndex] = Math.min(
                previous[rightIndex] + 1,
                previous[rightIndex - 1] + 1,
                diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
            );
            diagonal = above;
        }
    }
    return previous[right.length];
}

function tokenScore(left, right) {
    if (left === right) return 1;
    const shorter = left.length <= right.length ? left : right;
    const longer = left.length <= right.length ? right : left;
    if (shorter.length >= 3 && longer.startsWith(shorter)) return 0.9;

    const tolerance = shorter.length >= 8 ? 2 : shorter.length >= 4 ? 1 : 0;
    if (tolerance && Math.abs(left.length - right.length) <= tolerance &&
        editDistance(left, right) <= tolerance) {
        return 0.7;
    }
    return 0;
}

function bestTokenAssignment(shorter, longer) {
    const edges = shorter.map(token => longer
        .map((candidate, index) => ({ index, score: tokenScore(token, candidate) }))
        .filter(edge => edge.score >= 0.7)
        .sort((left, right) => right.score - left.score));

    if (edges.some(matches => matches.length === 0)) return null;

    const tokenOrder = edges
        .map((matches, index) => ({ index, options: matches.length }))
        .sort((left, right) => left.options - right.options);
    const assigned = new Map();

    function assign(shorterIndex, visited) {
        for (const edge of edges[shorterIndex]) {
            if (visited.has(edge.index)) continue;
            visited.add(edge.index);
            const current = assigned.get(edge.index);
            if (current === undefined || assign(current, visited)) {
                assigned.set(edge.index, shorterIndex);
                return true;
            }
        }
        return false;
    }

    for (const token of tokenOrder) {
        if (!assign(token.index, new Set())) return null;
    }

    const scores = [...assigned.entries()].map(([longerIndex, shorterIndex]) =>
        tokenScore(shorter[shorterIndex], longer[longerIndex])
    );
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function findRegistrationNameMatches(query, candidates) {
    const queryTokens = normalizeRegistrationName(query);
    if (queryTokens.length < 2) return [];

    return candidates
        .map(candidate => {
            const nameTokens = normalizeRegistrationName(candidate.nombre);
            if (nameTokens.length < 2) return null;
            const shorter = queryTokens.length <= nameTokens.length ? queryTokens : nameTokens;
            const longer = queryTokens.length <= nameTokens.length ? nameTokens : queryTokens;
            const score = bestTokenAssignment(shorter, longer);
            return score === null ? null : { ...candidate, score };
        })
        .filter(Boolean)
        .sort((left, right) =>
            right.score - left.score ||
            String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es')
        );
}
