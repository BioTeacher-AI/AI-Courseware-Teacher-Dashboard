export function normalizeStudentRecord(row) {
  const keyMap = Object.keys(row || {}).reduce((acc, key) => {
    acc[key.toLowerCase()] = row[key];
    return acc;
  }, {});

  const pick = (keys) => {
    for (const key of keys) {
      if (row?.[key] !== undefined) return row[key];
      const lower = key.toLowerCase();
      if (keyMap[lower] !== undefined) return keyMap[lower];
    }
    return '';
  };

  const studentId = String(pick(['studentId', 'student_id', '학번', 'id', '번호']) ?? '').trim();
  const name = String(pick(['name', '이름', 'studentName', 'student_name']) ?? '').trim();
  return { studentId, name, key: `${studentId}__${name}` };
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[^0-9.-]/g, '');
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function extractComparableScore(row) {
  const preferredKeys = ['score', 'totalScore', 'motivationScore', 'taskPersistenceScore', '점수', '총점'];

  for (const key of preferredKeys) {
    const value = row?.[key] ?? row?.[key.toLowerCase()] ?? row?.[key.toUpperCase()];
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }

  for (const [key, value] of Object.entries(row || {})) {
    if (!/score|점수|총점/i.test(key)) continue;
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }

  return null;
}

function average(list) {
  if (!list.length) return null;
  const sum = list.reduce((acc, cur) => acc + cur, 0);
  return Number((sum / list.length).toFixed(2));
}

function getChangeStatus(delta) {
  if (delta === null) return 'insufficient';
  if (delta > 0) return 'improved';
  if (delta < 0) return 'declined';
  return 'same';
}

export function comparePrePostResults(preRows = [], postRows = []) {
  const map = new Map();

  preRows.forEach((row) => {
    const student = normalizeStudentRecord(row);
    if (!student.key.trim()) return;
    if (!map.has(student.key)) map.set(student.key, { ...student, preRows: [], postRows: [] });
    map.get(student.key).preRows.push(row);
  });

  postRows.forEach((row) => {
    const student = normalizeStudentRecord(row);
    if (!student.key.trim()) return;
    if (!map.has(student.key)) map.set(student.key, { ...student, preRows: [], postRows: [] });
    map.get(student.key).postRows.push(row);
  });

  return [...map.values()]
    .map((entry) => {
      const preScores = entry.preRows.map(extractComparableScore).filter((v) => v !== null);
      const postScores = entry.postRows.map(extractComparableScore).filter((v) => v !== null);
      const preAvg = average(preScores);
      const postAvg = average(postScores);
      const delta = preAvg !== null && postAvg !== null ? Number((postAvg - preAvg).toFixed(2)) : null;

      return {
        ...entry,
        preAvg,
        postAvg,
        delta,
        status: getChangeStatus(delta)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR') || a.studentId.localeCompare(b.studentId, 'ko-KR'));
}
