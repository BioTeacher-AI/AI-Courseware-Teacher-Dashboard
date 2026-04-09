const NAME_CANDIDATES = ['이름', '1. 이름', '성명', '학생 이름', 'name', 'studentName'];
const ID_CANDIDATES = ['학번', '2. 학번', '학생번호', '번호', 'studentId', 'student_id'];

const META_KEYS = new Set([
  '타임스탬프',
  'timestamp',
  '이름',
  '1. 이름',
  '학번',
  '2. 학번',
  '성명',
  '학생 이름',
  '학생번호',
  '번호',
  '3. (만)나이',
  '4. 성별',
  '5. 휴대폰 번호',
  '_rowNumber'
]);

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickField(row, candidates) {
  const keyMap = Object.keys(row || {}).reduce((acc, key) => {
    acc[key.toLowerCase()] = row[key];
    return acc;
  }, {});

  for (const key of candidates) {
    if (row?.[key] !== undefined) return row[key];
    const lower = key.toLowerCase();
    if (keyMap[lower] !== undefined) return keyMap[lower];
  }
  return '';
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.-]/g, '');
    if (!normalized) return null;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function isMetadataKey(key) {
  const k = normalizeText(key);
  return META_KEYS.has(k);
}

function splitQuestionGroups(row) {
  const entries = Object.entries(row || {}).filter(([key, value]) => {
    if (isMetadataKey(key)) return false;
    const numeric = toNumber(value);
    return numeric !== null;
  });

  const misconception = entries.slice(0, 16).map(([question, value]) => ({ question, score: toNumber(value) ?? 0 }));
  const scientific = entries.slice(16, 20).map(([question, value]) => ({ question, score: toNumber(value) ?? 0 }));

  return { misconception, scientific };
}

function average(list) {
  if (!list.length) return null;
  return Number((list.reduce((acc, cur) => acc + cur, 0) / list.length).toFixed(2));
}

function getChangeStatus(delta) {
  if (delta === null) return 'insufficient';
  if (delta > 0) return 'improved';
  if (delta < 0) return 'declined';
  return 'same';
}

export function normalizeStudentRecord(row) {
  const studentId = normalizeText(pickField(row, ID_CANDIDATES));
  const name = normalizeText(pickField(row, NAME_CANDIDATES));

  return {
    studentId,
    name,
    idKey: studentId || '',
    nameKey: name.toLowerCase()
  };
}

function buildRecordMap(rows = []) {
  return rows.map((row) => {
    const student = normalizeStudentRecord(row);
    const groups = splitQuestionGroups(row);
    const allScores = [...groups.misconception.map((i) => i.score), ...groups.scientific.map((i) => i.score)];

    return {
      raw: row,
      student,
      groups,
      avg: average(allScores)
    };
  });
}

export function comparePrePostResults(preRows = [], postRows = []) {
  const preRecords = buildRecordMap(preRows);
  const postRecords = buildRecordMap(postRows);

  const postById = new Map();
  const postByName = new Map();
  postRecords.forEach((rec) => {
    if (rec.student.idKey) postById.set(rec.student.idKey, rec);
    if (rec.student.nameKey) postByName.set(rec.student.nameKey, rec);
  });

  const results = [];
  const usedPost = new Set();

  preRecords.forEach((pre) => {
    let post = null;
    if (pre.student.idKey && postById.has(pre.student.idKey)) {
      post = postById.get(pre.student.idKey);
    } else if (pre.student.nameKey && postByName.has(pre.student.nameKey)) {
      post = postByName.get(pre.student.nameKey);
    }

    if (post) usedPost.add(post);

    const preAvg = pre.avg;
    const postAvg = post ? post.avg : null;
    const delta = preAvg !== null && postAvg !== null ? Number((postAvg - preAvg).toFixed(2)) : null;

    results.push({
      key: pre.student.idKey || pre.student.nameKey || `unknown-pre-${results.length}`,
      studentId: pre.student.studentId || post?.student.studentId || '',
      name: pre.student.name || post?.student.name || '이름 없음',
      preRows: [pre.raw],
      postRows: post ? [post.raw] : [],
      preAvg,
      postAvg,
      delta,
      status: getChangeStatus(delta),
      preMisconceptionItems: pre.groups.misconception,
      postMisconceptionItems: post ? post.groups.misconception : [],
      preScientificItems: pre.groups.scientific,
      postScientificItems: post ? post.groups.scientific : []
    });
  });

  // 사전 데이터가 없고 사후 데이터만 있는 학생도 보조적으로 표시
  postRecords.forEach((post, idx) => {
    if (usedPost.has(post)) return;
    results.push({
      key: post.student.idKey || post.student.nameKey || `unknown-post-${idx}`,
      studentId: post.student.studentId,
      name: post.student.name || '이름 없음',
      preRows: [],
      postRows: [post.raw],
      preAvg: null,
      postAvg: post.avg,
      delta: null,
      status: 'insufficient',
      preMisconceptionItems: [],
      postMisconceptionItems: post.groups.misconception,
      preScientificItems: [],
      postScientificItems: post.groups.scientific
    });
  });

  return results.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR') || a.studentId.localeCompare(b.studentId, 'ko-KR'));
}
