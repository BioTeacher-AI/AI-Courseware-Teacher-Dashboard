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
  '3. 나이(만_세)',
  '3. (만)나이',
  '4. 성별',
  '5. 휴대폰 번호',
  '_rowNumber'
]);

const MISCONCEPTION_QUESTIONS = [
  '혈액은 단순한 빨간 액체이다.',
  '심장은 몸의 왼쪽에 있다.',
  '모든 동맥에서는 산소를 많이 포함한 혈액만 흐른다.',
  '심장은 공기를 펌프질한다.',
  '심장이 피를 만든다.',
  '심장이 피를 만든다.',
  '소화는 음식으로부터 에너지를 방출하는 과정이다.',
  '소화 효소는 세포로 구성되어 있다.',
  '이자액에 의해 음식물이 소화되는 곳은 이자이다.',
  '몸 전체에 공기 튜브가 있다.',
  '호흡은 폐에서만 일어난다.',
  '들숨의 성분은 대부분 산소이고, 날숨의 성분은 대부분 이산화탄소이다.',
  '공기는 폐에서 바로 심장으로 들어간다.',
  '배설은 대변을 배출하는 것이다.',
  '오줌을 형성하는 것은 방광이다.',
  '방광은 오줌을 걸러내는 기관이다.'
];

const SCIENTIFIC_QUESTIONS = [
  '심장은 우리 몸에 필요한 영양소, 산소를 온몸으로 운반한다.',
  '소화 기관에는 입, 식도, 위, 작은 창자, 큰 창자, 항문 등이 있다.',
  '몸 밖에서 들어온 산소를 받아들이고 몸속에서 생긴 이산화탄소를 몸 밖으로 내보내는 기관은 ‘폐’이다.',
  '노폐물을 몸 밖으로 내보내는 과정을 배설이라고 한다.'
];

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

function normalizeQuestionKey(value) {
  return normalizeText(value)
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[0-9]+\s*[\.\)]\s*/, '')
    .trim();
}

function buildNormalizedFieldMap(row) {
  const map = new Map();
  Object.entries(row || {}).forEach(([key, value]) => {
    const normalizedKey = normalizeQuestionKey(key);
    if (!normalizedKey || isMetadataKey(normalizedKey)) return;
    map.set(normalizedKey, value);
  });
  return map;
}

function buildFixedQuestionGroup(normalizedFieldMap, questions) {
  return questions.map((question) => {
    const rawValue = normalizedFieldMap.get(normalizeQuestionKey(question));
    const score = toNumber(rawValue);
    return { question, score: score ?? 0 };
  });
}

function splitQuestionGroups(row) {
  const normalizedFieldMap = buildNormalizedFieldMap(row);
  const misconception = buildFixedQuestionGroup(normalizedFieldMap, MISCONCEPTION_QUESTIONS);
  const scientific = buildFixedQuestionGroup(normalizedFieldMap, SCIENTIFIC_QUESTIONS);

  return { misconception, scientific };
}

function average(list) {
  if (!list.length) return null;
  return Number((list.reduce((acc, cur) => acc + cur, 0) / list.length).toFixed(2));
}

function fixedAverage(list, denominator) {
  if (!denominator) return null;
  const total = (list || []).reduce((acc, cur) => acc + (toNumber(cur) ?? 0), 0);
  return Number((total / denominator).toFixed(2));
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
    const preMisconceptionAverage = fixedAverage(pre.groups.misconception.map((i) => i.score), 16);
    const postMisconceptionAverage = post ? fixedAverage(post.groups.misconception.map((i) => i.score), 16) : null;
    const misconceptionDifference =
      preMisconceptionAverage !== null && postMisconceptionAverage !== null
        ? Number((postMisconceptionAverage - preMisconceptionAverage).toFixed(2))
        : null;

    const preScientificAverage = fixedAverage(pre.groups.scientific.map((i) => i.score), 4);
    const postScientificAverage = post ? fixedAverage(post.groups.scientific.map((i) => i.score), 4) : null;
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
      postMisconceptionAverage: fixedAverage(post.groups.misconception.map((i) => i.score), 16),
      misconceptionDifference: null,
      preScientificAverage: null,
      postScientificAverage: fixedAverage(post.groups.scientific.map((i) => i.score), 4),
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
