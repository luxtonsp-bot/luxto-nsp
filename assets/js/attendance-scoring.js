export function getAnnualEvaluationAssemblies(
    assemblies,
    attendanceMap,
    memberStartDate,
    asOfDate = new Date()
) {
    const today = asOfDate.toISOString().slice(0, 10);
    const currentYear = today.slice(0, 4);
    const yearStart = `${currentYear}-01-01`;
    const assembliesThisYear = assemblies.filter(assembly =>
        assembly.fecha.startsWith(`${currentYear}-`) && assembly.fecha <= today
    );

    let startDate = memberStartDate;
    if (startDate && typeof startDate.toDate === 'function') {
        startDate = startDate.toDate().toISOString().slice(0, 10);
    } else if (startDate && typeof startDate === 'object' && Number.isFinite(startDate.seconds)) {
        startDate = new Date(startDate.seconds * 1000).toISOString().slice(0, 10);
    } else if (typeof startDate === 'string') {
        startDate = startDate.slice(0, 10);
    } else {
        startDate = null;
    }

    const attendedBeforeYear = [...attendanceMap.keys()].some(date => date < yearStart);
    if (attendedBeforeYear || (startDate && startDate < yearStart)) {
        return assembliesThisYear;
    }

    const firstAttendance = assembliesThisYear.find(assembly =>
        attendanceMap.has(assembly.fecha)
    );

    if (!firstAttendance) return [];

    return assembliesThisYear.filter(assembly =>
        assembly.fecha >= firstAttendance.fecha
    );
}
