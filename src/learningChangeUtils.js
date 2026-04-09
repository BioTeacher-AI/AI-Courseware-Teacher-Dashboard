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

export const REVERSE_SCORED_MOTIVATION_ITEMS = [
  // TODO: 실제 역채점 문항 텍스트를 확인해 추가
];

export const REVERSE_SCORED_TASK_ITEMS = [
  // TODO: 실제 역채점 문항 텍스트를 확인해 추가
];

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

function normalizeLikert(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function likertToScore(value) {
  const numeric = toNumber(value);
  if (numeric !== null) return numeric;

  const normalized = normalizeLikert(value);
  if (!normalized) return null;

  const map = {
    '전혀아니다': 1,
    '아니다': 2,
    '보통이다': 3,
    '보통': 3,
    '그렇다': 4,
    '매우그렇다': 5
  };

  return map[normalized] ?? null;
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

function indexByQuestion(items = []) {
  const map = new Map();
  items.forEach((item) => {
    map.set(item.question, item.score);
  });
  return map;
}

function buildDetails(preItems = [], postItems = [], typeLabel) {
  const preMap = indexByQuestion(preItems);
  const postMap = indexByQuestion(postItems);
  const questionSet = new Set([...preMap.keys(), ...postMap.keys()]);

  return [...questionSet].map((question) => {
    const preValue = preMap.has(question) ? preMap.get(question) : null;
    const postValue = postMap.has(question) ? postMap.get(question) : null;
    const diff = preValue !== null && postValue !== null ? Number((postValue - preValue).toFixed(2)) : null;
    const status = diff === null ? '비교 불가' : diff > 0 ? '상승' : diff < 0 ? '하락' : '동일';

    return {
      question,
      type: typeLabel,
      preValue,
      postValue,
      difference: diff,
      status
    };
  });
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
    const preMisconceptionAverage = average(pre.groups.misconception.map((i) => i.score));
    const postMisconceptionAverage = post ? average(post.groups.misconception.map((i) => i.score)) : null;
    const misconceptionDifference =
      preMisconceptionAverage !== null && postMisconceptionAverage !== null
        ? Number((postMisconceptionAverage - preMisconceptionAverage).toFixed(2))
        : null;

    const preScientificAverage = average(pre.groups.scientific.map((i) => i.score));
    const postScientificAverage = post ? average(post.groups.scientific.map((i) => i.score)) : null;
    const scientificDifference =
      preScientificAverage !== null && postScientificAverage !== null
        ? Number((postScientificAverage - preScientificAverage).toFixed(2))
        : null;

    const preMisconceptionItems = pre.groups.misconception;
    const postMisconceptionItems = post ? post.groups.misconception : [];
    const preScientificItems = pre.groups.scientific;
    const postScientificItems = post ? post.groups.scientific : [];

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
      preMisconceptionAverage,
      postMisconceptionAverage,
      misconceptionDifference,
      preScientificAverage,
      postScientificAverage,
      scientificDifference,
      preMisconceptionItems,
      postMisconceptionItems,
      preScientificItems,
      postScientificItems,
      misconceptionDetails: buildDetails(preMisconceptionItems, postMisconceptionItems, '오개념 문항'),
      scientificDetails: buildDetails(preScientificItems, postScientificItems, '과학적 개념 문항')
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
      preMisconceptionAverage: null,
      postMisconceptionAverage: average(post.groups.misconception.map((i) => i.score)),
      misconceptionDifference: null,
      preScientificAverage: null,
      postScientificAverage: average(post.groups.scientific.map((i) => i.score)),
      scientificDifference: null,
      preMisconceptionItems: [],
      postMisconceptionItems: post.groups.misconception,
      preScientificItems: [],
      postScientificItems: post.groups.scientific,
      misconceptionDetails: buildDetails([], post.groups.misconception, '오개념 문항'),
      scientificDetails: buildDetails([], post.groups.scientific, '과학적 개념 문항')
    });
  });

  return results.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR') || a.studentId.localeCompare(b.studentId, 'ko-KR'));
}

function shouldIncludeLikertItem(question, domain) {
  const q = normalizeText(question);
  if (!q) return false;
  if (isMetadataKey(q)) return false;
  if (/타임스탬프|동의|휴대폰|나이|성별|이름|학번|_rowNumber/.test(q)) return false;
  if (/이유|작성|자유롭게|서술|학습한적이있습니까/.test(q.replace(/\s+/g, ''))) return false;

  const numMatch = q.match(/^(\d{1,2})\./);
  if (!numMatch) return false;
  const noHyphenPrefix = !/^\d+-\d+/.test(q);
  if (!noHyphenPrefix) return false;

  const num = Number(numMatch[1]);
  if (!Number.isFinite(num)) return false;

  if (domain === 'motivation') return num >= 1 && num <= 36;
  if (domain === 'task') return num >= 1 && num <= 25;
  return false;
}

function getLikertItems(row, domain) {
  return Object.entries(row || [])
    .filter(([question]) => shouldIncludeLikertItem(question, domain))
    .map(([question, rawValue]) => {
      const score = likertToScore(rawValue);
      return { question, rawValue, score };
    })
    .filter((item) => item.score !== null);
}

function applyReverseScore(item, reverseItems) {
  const isReverse = reverseItems.some((keyword) => item.question.includes(keyword));
  return isReverse ? { ...item, score: 6 - item.score } : item;
}

function buildLikertMap(rows = [], domain) {
  const reverseItems = domain === 'motivation' ? REVERSE_SCORED_MOTIVATION_ITEMS : REVERSE_SCORED_TASK_ITEMS;
  return rows.map((row) => {
    const student = normalizeStudentRecord(row);
    const items = getLikertItems(row, domain).map((item) => applyReverseScore(item, reverseItems));
    const avg = average(items.map((i) => i.score));

    return { raw: row, student, items, avg };
  });
}

export function compareLikertPrePostResults(preRows = [], postRows = [], domain = 'motivation') {
  const preRecords = buildLikertMap(preRows, domain);
  const postRecords = buildLikertMap(postRows, domain);

  const postById = new Map();
  const postByName = new Map();
  postRecords.forEach((rec) => {
    if (rec.student.idKey) postById.set(rec.student.idKey, rec);
    if (rec.student.nameKey) postByName.set(rec.student.nameKey, rec);
  });

  const usedPost = new Set();
  const results = preRecords.map((pre, idx) => {
    let post = null;
    if (pre.student.idKey && postById.has(pre.student.idKey)) post = postById.get(pre.student.idKey);
    else if (pre.student.nameKey && postByName.has(pre.student.nameKey)) post = postByName.get(pre.student.nameKey);

    if (post) usedPost.add(post);

    const preAvg = pre.avg;
    const postAvg = post ? post.avg : null;
    const delta = preAvg !== null && postAvg !== null ? Number((postAvg - preAvg).toFixed(2)) : null;

    return {
      key: pre.student.idKey || pre.student.nameKey || `likert-pre-${idx}`,
      studentId: pre.student.studentId || post?.student.studentId || '',
      name: pre.student.name || post?.student.name || '이름 없음',
      preRows: [pre.raw],
      postRows: post ? [post.raw] : [],
      preAvg,
      postAvg,
      delta,
      status: getChangeStatus(delta),
      details: buildDetails(
        pre.items.map((i) => ({ question: i.question, score: i.score })),
        (post?.items || []).map((i) => ({ question: i.question, score: i.score })),
        domain === 'motivation' ? '동기 문항' : '과제집착력 문항'
      )
    };
  });

  postRecords.forEach((post, idx) => {
    if (usedPost.has(post)) return;
    results.push({
      key: post.student.idKey || post.student.nameKey || `likert-post-${idx}`,
      studentId: post.student.studentId,
      name: post.student.name || '이름 없음',
      preRows: [],
      postRows: [post.raw],
      preAvg: null,
      postAvg: post.avg,
      delta: null,
      status: 'insufficient',
      details: buildDetails([], post.items.map((i) => ({ question: i.question, score: i.score })), domain === 'motivation' ? '동기 문항' : '과제집착력 문항')
    });
  });

  return results.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR') || a.studentId.localeCompare(b.studentId, 'ko-KR'));
}
