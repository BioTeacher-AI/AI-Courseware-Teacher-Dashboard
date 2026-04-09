import { useEffect, useMemo, useState } from 'react';
import { compareLikertPrePostResults, comparePrePostResults } from './learningChangeUtils';

const ANSWERS_API_URL = '/.netlify/functions/read-answers';

const LESSON_OPTIONS = ['lesson1', 'lesson2', 'lesson3'];
const SECTION_OPTIONS = [
  '생각열기',
  '예상하기',
  '관찰하기',
  '설명하기',
  '정리하기',
  '생각변화',
  '순환계 예상하기',
  '호흡계 예상하기',
  '순환계 관찰하기',
  '호흡계 관찰하기',
  '순환계 설명하기',
  '호흡계 설명하기'
];

const INITIAL_STUDENT_FILTERS = { name: '', studentId: '' };
const INITIAL_LESSON_SECTION_FILTERS = { lesson: 'lesson1', section: '생각열기' };

const SURVEY_PROXY_BASE = '/.netlify/functions/proxy-survey';
const REMEDIAL_API_URL = '/.netlify/functions/recommend-remedial-lesson';

const LESSON_TOPIC_MAP = {
  lesson1: { label: '1차시', topic: '소화계' },
  lesson2: { label: '2차시', topic: '순환계·호흡계' },
  lesson3: { label: '3차시', topic: '배설계' }
};

function formatTimestamp(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function sortByLatest(rows) {
  return [...rows].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime() || 0;
    const timeB = new Date(b.timestamp).getTime() || 0;
    return timeB - timeA;
  });
}

function parseRows(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (json?.data && typeof json.data === 'object') return parseRows(json.data);
  if (Array.isArray(json?.rows)) return json.rows;
  if (Array.isArray(json?.result)) return json.result;
  return [];
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[^0-9.-]/g, '');
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function getByKeysInsensitive(row, keys) {
  const keyMap = Object.keys(row || {}).reduce((acc, key) => {
    acc[key.toLowerCase()] = row[key];
    return acc;
  }, {});

  for (const key of keys) {
    if (row?.[key] !== undefined) return row[key];
    const lower = key.toLowerCase();
    if (keyMap[lower] !== undefined) return keyMap[lower];
  }
  return undefined;
}

function normalizeStudentInfo(row) {
  const studentId = String(
    getByKeysInsensitive(row, ['studentId', 'student_id', '학번', 'id', '번호']) ?? ''
  ).trim();
  const name = String(getByKeysInsensitive(row, ['name', '이름', 'studentName', 'student_name']) ?? '').trim();
  return {
    studentId,
    name,
    key: `${studentId}__${name}`
  };
}

function extractScore(row) {
  const directKeys = [
    'score',
    'totalScore',
    'motivationScore',
    'taskPersistenceScore',
    '점수',
    '총점',
    'resultScore'
  ];

  for (const key of directKeys) {
    const value = getByKeysInsensitive(row, [key]);
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

function getTeacherSuggestion(status, domainLabel) {
  if (status === 'improved') {
    return `사전 대비 ${domainLabel}이(가) 향상되었습니다. 현재 학습 전략을 유지하며 심화 활동을 제안해볼 수 있습니다.`;
  }
  if (status === 'same') {
    return `${domainLabel} 변화가 크지 않습니다. 수업 중 추가 관찰과 짧은 피드백 활동을 안내해볼 수 있습니다.`;
  }
  if (status === 'declined') {
    return `${domainLabel} 저하가 보여 추가 설명, 개별 격려, 단계적 과제를 함께 지도해볼 수 있습니다.`;
  }
  return '비교 가능한 데이터가 부족합니다. 해당 학생의 사전/사후 기록 입력 여부를 확인해보실 수 있습니다.';
}

function interpretScientificConfidence(diff) {
  if (diff === null) return '비교 가능한 데이터가 부족해 과학적 개념 확신도의 변화를 판단하기 어렵습니다.';
  if (diff > 0) return '사전 대비 사후 평균이 상승하여 과학적으로 타당한 개념에 대한 확신이 높아진 것으로 볼 수 있습니다.';
  if (diff < 0) return '사전 대비 사후 평균이 하락하여 과학적 개념 확신이 낮아졌을 가능성이 있어 추가 설명이 필요해 보입니다.';
  return '사전·사후 평균이 동일하여 과학적 개념 확신도의 큰 변화는 관찰되지 않습니다.';
}

function interpretMisconceptionConfidence(diff) {
  if (diff === null) return '비교 가능한 데이터가 부족해 오개념 확신도의 변화를 판단하기 어렵습니다.';
  if (diff < 0) return '사전 대비 사후 평균이 낮아져 오개념에 대한 확신이 줄어든 것으로 해석할 수 있습니다.';
  if (diff > 0) return '사전 대비 사후 평균이 높아져 일부 오개념이 유지되거나 강화되었을 가능성이 있습니다.';
  return '사전·사후 평균이 동일하여 오개념 확신도 변화는 크지 않습니다.';
}

function interpretEngagementChange(diff, label) {
  if (diff === null) return `${label} 변화 데이터가 부족합니다.`;
  if (diff > 0) return `사전 대비 사후 점수가 상승하여 ${label}이 향상된 것으로 볼 수 있습니다.`;
  if (diff < 0) return `${label} 점수가 낮아져 추가 관찰 및 개별 지도가 필요할 수 있습니다.`;
  return `${label} 점수 변화가 크지 않아 유지 수준으로 볼 수 있습니다.`;
}

function inferLessonFromText(text) {
  const raw = String(text || '').toLowerCase();
  if (/소화|영양소|흡수/.test(raw)) return 'lesson1';
  if (/순환|호흡|심박|기체|혈액|심장/.test(raw)) return 'lesson2';
  if (/배설|콩팥|여과|오줌/.test(raw)) return 'lesson3';
  return null;
}

function inferLessonFromRow(row) {
  const rawLesson = String(row?.lesson ?? '').toLowerCase().trim();
  if (LESSON_TOPIC_MAP[rawLesson]) return rawLesson;

  const text = `${row?.questionText ?? ''} ${row?.questionId ?? ''} ${row?.answer ?? ''}`.toLowerCase();
  if (/소화|영양소|흡수/.test(text)) return 'lesson1';
  if (/순환|호흡|심박|기체/.test(text)) return 'lesson2';
  if (/배설|콩팥|여과|오줌/.test(text)) return 'lesson3';
  return null;
}

function buildRemedialInput(studentComparison) {
  if (!studentComparison) return null;

  const preCounts = { lesson1: 0, lesson2: 0, lesson3: 0 };
  const postCounts = { lesson1: 0, lesson2: 0, lesson3: 0 };

  if (Array.isArray(studentComparison.preMisconceptionItems) || Array.isArray(studentComparison.postMisconceptionItems)) {
    (studentComparison.preMisconceptionItems || []).forEach((item) => {
      const lessonKey = inferLessonFromText(item.question);
      if (lessonKey) preCounts[lessonKey] += 1;
    });
    (studentComparison.postMisconceptionItems || []).forEach((item) => {
      const lessonKey = inferLessonFromText(item.question);
      if (lessonKey) postCounts[lessonKey] += 1;
    });
  } else {
    studentComparison.preRows.forEach((row) => {
      const lessonKey = inferLessonFromRow(row);
      if (lessonKey) preCounts[lessonKey] += 1;
    });
    studentComparison.postRows.forEach((row) => {
      const lessonKey = inferLessonFromRow(row);
      if (lessonKey) postCounts[lessonKey] += 1;
    });
  }

  const lessonSummary = Object.keys(LESSON_TOPIC_MAP).map((lessonKey) => {
    const pre = preCounts[lessonKey] || 0;
    const post = postCounts[lessonKey] || 0;
    const delta = post - pre;
    const status = delta > 0 ? '혼동 증가 가능성' : delta < 0 ? '혼동 감소' : '변화 없음';
    return {
      lesson_key: lessonKey,
      lesson: LESSON_TOPIC_MAP[lessonKey].label,
      topic: LESSON_TOPIC_MAP[lessonKey].topic,
      pre_confusion_count: pre,
      post_confusion_count: post,
      delta,
      status
    };
  });

  const remainingConfusion = lessonSummary.filter((item) => item.post_confusion_count > 0);

  return {
    student: {
      name: studentComparison.name,
      studentId: studentComparison.studentId
    },
    score_summary: {
      pre_average: studentComparison.preAvg,
      post_average: studentComparison.postAvg,
      delta: studentComparison.delta,
      status: studentComparison.status
    },
    lesson_summary: lessonSummary,
    improved_concepts: lessonSummary
      .filter((item) => item.delta < 0)
      .map((item) => `${item.lesson} ${item.topic}`),
    unchanged_concepts: lessonSummary
      .filter((item) => item.delta === 0)
      .map((item) => `${item.lesson} ${item.topic}`),
    remaining_confusions: remainingConfusion.map((item) => `${item.lesson} ${item.topic}`)
  };
}

function buildStudentComparisons(preRows, postRows) {
  const map = new Map();

  preRows.forEach((row) => {
    const student = normalizeStudentInfo(row);
    if (!student.key.trim()) return;
    if (!map.has(student.key)) map.set(student.key, { ...student, preRows: [], postRows: [] });
    map.get(student.key).preRows.push(row);
  });

  postRows.forEach((row) => {
    const student = normalizeStudentInfo(row);
    if (!student.key.trim()) return;
    if (!map.has(student.key)) map.set(student.key, { ...student, preRows: [], postRows: [] });
    map.get(student.key).postRows.push(row);
  });

  return [...map.values()]
    .map((entry) => {
      const preScores = entry.preRows.map(extractScore).filter((v) => v !== null);
      const postScores = entry.postRows.map(extractScore).filter((v) => v !== null);
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

function isAbortError(error) {
  return error?.name === 'AbortError' || String(error?.message || '').includes('aborted');
}

async function fetchSurveyRows(target, signal) {
  const endpoint = `${SURVEY_PROXY_BASE}?target=${encodeURIComponent(target)}`;
  const res = await fetch(endpoint, { cache: 'no-store', signal });
  const text = await res.text();

  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('프록시 서버를 통해 데이터를 조회하는 중 오류가 발생했습니다.');
  }

  if (!res.ok || json?.ok === false) {
    const rawMessage = json?.message || '설문 데이터를 불러오지 못했습니다.';
    const isHtmlError = /HTML 오류 페이지|JSON 대신 HTML/i.test(rawMessage);
    const details = json?.details || json?.responsePreview || '';
    const guide = isHtmlError
      ? '웹앱 URL이 올바른 /exec 배포 주소인지, 익명 접근 권한이 열려 있는지 확인해보세요.'
      : '';
    const merged = [rawMessage, guide, details ? `원인 단서: ${details}` : ''].filter(Boolean).join(' ');
    throw new Error(merged);
  }

  const rows = parseRows(json);
  return {
    rows,
    meta: json?.meta || { target }
  };
}

function App() {
  const [topTab, setTopTab] = useState('answers');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [queryMode, setQueryMode] = useState('student');
  const [studentFilters, setStudentFilters] = useState(INITIAL_STUDENT_FILTERS);
  const [appliedStudentFilters, setAppliedStudentFilters] = useState(INITIAL_STUDENT_FILTERS);
  const [lessonSectionFilters, setLessonSectionFilters] = useState(INITIAL_LESSON_SECTION_FILTERS);
  const [appliedLessonSectionFilters, setAppliedLessonSectionFilters] = useState(INITIAL_LESSON_SECTION_FILTERS);
  const [studentViewMode, setStudentViewMode] = useState('byAnswer');

  const [misconceptionState, setMisconceptionState] = useState({ loading: false, error: '', warning: '', preRows: [], postRows: [] });
  const [motivationState, setMotivationState] = useState({ loading: false, error: '', warning: '', preRows: [], postRows: [] });
  const [taskState, setTaskState] = useState({ loading: false, error: '', warning: '', preRows: [], postRows: [] });
  const [loadedFlags, setLoadedFlags] = useState({ misconception: false, motivation: false, task: false });
  const [compareFilters, setCompareFilters] = useState({ name: '', studentId: '' });
  const [selectedStudentKey, setSelectedStudentKey] = useState('');
  const [remedialState, setRemedialState] = useState({ loading: false, error: '', warning: '', byStudentKey: {} });
  const [motivationNameFilter, setMotivationNameFilter] = useState('');

  useEffect(() => {
    let ignore = false;

    async function fetchRows() {
      try {
        setLoading(true);
        setError('');

        const res = await fetch(ANSWERS_API_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`API 요청 실패: ${res.status}`);

        const json = await res.json();
        if (json?.ok === false) throw new Error(json?.message || '학생 답안을 불러오지 못했습니다.');

        const data = Array.isArray(json?.data) ? json.data : [];
        if (!ignore) setRows(data);
      } catch (err) {
        console.error('답안 조회 오류:', err);
        if (!ignore) {
          setError('학생 답안을 불러오지 못했습니다. API 설정을 확인해주세요.');
          setRows([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchRows();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (topTab !== 'learningChange' || loadedFlags.misconception) return;
    const controller = new AbortController();

    async function loadMisconception() {
      setMisconceptionState((prev) => ({ ...prev, loading: true, error: '', warning: '' }));
      try {
        const [preResult, postResult] = await Promise.all([
          fetchSurveyRows('misconception-pre', controller.signal),
          fetchSurveyRows('misconception-post', controller.signal)
        ]);
        const preRows = preResult.rows;
        const postRows = postResult.rows;
        console.debug('[learningChange] loaded', {
          preTarget: preResult.meta?.target,
          postTarget: postResult.meta?.target,
          preCount: preRows.length,
          postCount: postRows.length
        });
        setMisconceptionState({ loading: false, error: '', warning: '', preRows, postRows });
      } catch (err) {
        if (isAbortError(err)) {
          console.debug('[learningChange] misconception fetch aborted (cleanup).');
          return;
        }
        console.error('학습 변화 데이터 조회 오류:', err);
        const message = String(err?.message || '');
        const warning = message.includes('환경변수가 설정되지 않았습니다')
          ? 'API 환경변수가 설정되지 않았습니다.'
          : '';
        setMisconceptionState({
          loading: false,
          error: warning ? '' : `학습 변화 데이터를 불러오지 못했습니다: ${message || '상세 원인 없음'}`,
          warning,
          preRows: [],
          postRows: []
        });
      } finally {
        if (!controller.signal.aborted) {
          setLoadedFlags((prev) => ({ ...prev, misconception: true }));
        }
      }
    }

    loadMisconception();
    return () => controller.abort();
  }, [topTab, loadedFlags.misconception]);

  useEffect(() => {
    if (topTab !== 'motivationTask') return;
    const motivationController = new AbortController();
    const taskController = new AbortController();

    async function loadPairOnce({ key, preTarget, postTarget, setState, label, controller }) {
      if (loadedFlags[key]) return;
      setState((prev) => ({ ...prev, loading: true, error: '', warning: '' }));
      try {
        const [preResult, postResult] = await Promise.all([
          fetchSurveyRows(preTarget, controller.signal),
          fetchSurveyRows(postTarget, controller.signal)
        ]);
        const preRows = preResult.rows;
        const postRows = postResult.rows;
        const sameSourceWarning =
          preResult.meta?.target === postResult.meta?.target ||
          (preRows.length && postRows.length && JSON.stringify(preRows) === JSON.stringify(postRows));

        console.debug(`[motivationTask] ${label} loaded`, {
          preTarget: preResult.meta?.target,
          postTarget: postResult.meta?.target,
          preCount: preRows.length,
          postCount: postRows.length,
          sameSourceWarning
        });

        if (sameSourceWarning) {
          console.warn(`[motivationTask] ${label} pre/post 데이터가 동일하게 보입니다. target/env 매핑을 확인하세요.`);
        }
        setState({ loading: false, error: '', warning: '', preRows, postRows });
      } catch (err) {
        if (isAbortError(err)) {
          console.debug(`[motivationTask] ${label} fetch aborted (cleanup).`);
          return;
        }
        console.error(`${label} 데이터 조회 오류:`, err);
        const message = String(err?.message || '');
        const warning = message.includes('환경변수가 설정되지 않았습니다')
          ? 'API 환경변수가 설정되지 않았습니다.'
          : '';
        setState({
          loading: false,
          error: warning ? '' : `${label} 데이터를 불러오지 못했습니다: ${message || '상세 원인 없음'}`,
          warning,
          preRows: [],
          postRows: []
        });
      } finally {
        if (!controller.signal.aborted) {
          setLoadedFlags((prev) => ({ ...prev, [key]: true }));
        }
      }
    }

    loadPairOnce({
      key: 'motivation',
      preTarget: 'motivation-pre',
      postTarget: 'motivation-post',
      setState: setMotivationState,
      label: '동기',
      controller: motivationController
    });
    loadPairOnce({
      key: 'task',
      preTarget: 'task-pre',
      postTarget: 'task-post',
      setState: setTaskState,
      label: '과제집착력',
      controller: taskController
    });
    return () => {
      motivationController.abort();
      taskController.abort();
    };
  }, [topTab, loadedFlags]);

  const studentFilteredRows = useMemo(() => {
    const nameKeyword = appliedStudentFilters.name.trim().toLowerCase();
    const idKeyword = appliedStudentFilters.studentId.trim().toLowerCase();

    return sortByLatest(
      rows.filter((row) => {
        const rowName = String(row?.name ?? '').toLowerCase();
        const rowId = String(row?.studentId ?? '').toLowerCase();
        return (!nameKeyword || rowName.includes(nameKeyword)) && (!idKeyword || rowId.includes(idKeyword));
      })
    );
  }, [rows, appliedStudentFilters]);

  const groupedByStudent = useMemo(() => {
    const groups = new Map();
    studentFilteredRows.forEach((row) => {
      const key = `${row?.studentId || ''}__${row?.name || ''}`;
      if (!groups.has(key)) groups.set(key, { studentId: row?.studentId || '-', name: row?.name || '이름 없음', answers: [] });
      groups.get(key).answers.push(row);
    });

    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
  }, [studentFilteredRows]);

  const lessonSectionFilteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          String(row?.lesson ?? '') === appliedLessonSectionFilters.lesson &&
          String(row?.section ?? '') === appliedLessonSectionFilters.section
      ),
    [rows, appliedLessonSectionFilters]
  );

  const groupedByQuestion = useMemo(() => {
    const grouped = lessonSectionFilteredRows.reduce((acc, row) => {
      const key = String(row?.questionId ?? '질문없음');
      if (!acc[key]) acc[key] = { questionId: row?.questionId || '-', questionText: row?.questionText || '(질문 없음)', answers: [] };
      acc[key].answers.push(row);
      return acc;
    }, {});

    return Object.values(grouped)
      .sort((a, b) => a.questionId.localeCompare(b.questionId, 'ko-KR'))
      .map((group) => ({
        ...group,
        answers: [...group.answers].sort(
          (a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'ko-KR') || String(a?.studentId ?? '').localeCompare(String(b?.studentId ?? ''), 'ko-KR')
        )
      }));
  }, [lessonSectionFilteredRows]);

  const studentSummary = useMemo(() => {
    const lessons = new Set(studentFilteredRows.map((row) => String(row?.lesson ?? '')).filter(Boolean));
    const sections = new Set(studentFilteredRows.map((row) => String(row?.section ?? '')).filter(Boolean));
    return { answerCount: studentFilteredRows.length, lessonCount: lessons.size, sectionCount: sections.size };
  }, [studentFilteredRows]);

  const lessonSectionSummary = useMemo(
    () => ({
      answerCount: lessonSectionFilteredRows.length,
      studentCount: new Set(lessonSectionFilteredRows.map((row) => String(row?.studentId ?? ''))).size,
      questionCount: new Set(lessonSectionFilteredRows.map((row) => String(row?.questionId ?? ''))).size
    }),
    [lessonSectionFilteredRows]
  );

  const misconceptionComparisons = useMemo(
    () => comparePrePostResults(misconceptionState.preRows || [], misconceptionState.postRows || []),
    [misconceptionState.preRows, misconceptionState.postRows]
  );
  const motivationComparisons = useMemo(
    () => compareLikertPrePostResults(motivationState.preRows || [], motivationState.postRows || [], 'motivation'),
    [motivationState.preRows, motivationState.postRows]
  );
  const taskComparisons = useMemo(
    () => compareLikertPrePostResults(taskState.preRows || [], taskState.postRows || [], 'task'),
    [taskState.preRows, taskState.postRows]
  );

  const filteredMisconceptionComparisons = useMemo(() => {
    const nameKey = compareFilters.name.trim().toLowerCase();
    const idKey = compareFilters.studentId.trim().toLowerCase();
    return misconceptionComparisons.filter(
      (item) =>
        (!nameKey || item.name.toLowerCase().includes(nameKey)) && (!idKey || item.studentId.toLowerCase().includes(idKey))
    );
  }, [misconceptionComparisons, compareFilters]);

  const selectedMisconception = useMemo(
    () => filteredMisconceptionComparisons.find((item) => item.key === selectedStudentKey) || null,
    [filteredMisconceptionComparisons, selectedStudentKey]
  );

  const selectedRemedial = selectedMisconception ? remedialState.byStudentKey[selectedMisconception.key] : null;

  const mergedMotivationTask = useMemo(() => {
    const map = new Map();

    motivationComparisons.forEach((m) => {
      map.set(m.key, { studentId: m.studentId, name: m.name, key: m.key, motivation: m, task: null });
    });

    taskComparisons.forEach((t) => {
      if (!map.has(t.key)) map.set(t.key, { studentId: t.studentId, name: t.name, key: t.key, motivation: null, task: t });
      else map.get(t.key).task = t;
    });

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR') || a.studentId.localeCompare(b.studentId, 'ko-KR'));
  }, [motivationComparisons, taskComparisons]);

  const filteredMotivationTask = useMemo(() => {
    const keyword = motivationNameFilter.trim().toLowerCase();
    if (!keyword) return mergedMotivationTask;
    return mergedMotivationTask.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [mergedMotivationTask, motivationNameFilter]);

  const onApplyStudentFilters = () => setAppliedStudentFilters(studentFilters);
  const onResetStudentFilters = () => {
    setStudentFilters(INITIAL_STUDENT_FILTERS);
    setAppliedStudentFilters(INITIAL_STUDENT_FILTERS);
  };
  const onApplyLessonSectionFilters = () => setAppliedLessonSectionFilters(lessonSectionFilters);
  const onResetLessonSectionFilters = () => {
    setLessonSectionFilters(INITIAL_LESSON_SECTION_FILTERS);
    setAppliedLessonSectionFilters(INITIAL_LESSON_SECTION_FILTERS);
  };

  const onRecommendRemedial = async () => {
    if (!selectedMisconception) return;

    const payload = buildRemedialInput(selectedMisconception);
    if (!payload || (!payload.score_summary?.pre_average && !payload.score_summary?.post_average)) {
      setRemedialState((prev) => ({
        ...prev,
        warning: '비교 가능한 데이터가 부족하여 보완 차시를 제안하기 어렵습니다.'
      }));
      return;
    }

    setRemedialState((prev) => ({ ...prev, loading: true, error: '', warning: '' }));
    try {
      const res = await fetch(REMEDIAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || 'AI 추천을 불러오지 못했습니다');
      }
      setRemedialState((prev) => ({
        ...prev,
        loading: false,
        error: '',
        warning: '',
        byStudentKey: {
          ...prev.byStudentKey,
          [selectedMisconception.key]: json
        }
      }));
    } catch (err) {
      const message = String(err?.message || '');
      setRemedialState((prev) => ({
        ...prev,
        loading: false,
        error: message.includes('OpenAI API 환경변수가 설정되지 않았습니다')
          ? 'OpenAI API 환경변수가 설정되지 않았습니다'
          : 'AI 추천을 불러오지 못했습니다'
      }));
    }
  };

  return (
    <div className="page-shell">
      <header className="header-card">
        <h1>AI 코스웨어 교사용 대시보드</h1>
        <p>학생들이 각 차시와 활동 단계에서 작성한 답안을 조회하고 학습 변화를 확인할 수 있습니다.</p>
      </header>

      <section className="mode-switch-card">
        <p className="mode-title">대시보드 탭</p>
        <div className="mode-toggle">
          <button type="button" className={topTab === 'answers' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTopTab('answers')}>
            답안 조회
          </button>
          <button type="button" className={topTab === 'learningChange' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTopTab('learningChange')}>
            학습 변화 확인
          </button>
          <button type="button" className={topTab === 'motivationTask' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTopTab('motivationTask')}>
            동기 및 과제집착력 수준 변화
          </button>
        </div>
      </section>

      {topTab === 'answers' && (
        <>
          <section className="mode-switch-card">
            <p className="mode-title">조회 모드</p>
            <div className="mode-toggle">
              <button type="button" className={queryMode === 'student' ? 'btn-primary' : 'btn-secondary'} onClick={() => setQueryMode('student')}>
                학생별 조회
              </button>
              <button type="button" className={queryMode === 'lessonSection' ? 'btn-primary' : 'btn-secondary'} onClick={() => setQueryMode('lessonSection')}>
                차시/단계별 조회
              </button>
            </div>
          </section>

          {queryMode === 'student' && (
            <>
              <section className="summary-grid three-col">
                <article className="summary-card"><p className="summary-label">해당 학생 답안 수</p><p className="summary-value">{studentSummary.answerCount}</p></article>
                <article className="summary-card"><p className="summary-label">작성한 차시 수</p><p className="summary-value">{studentSummary.lessonCount}</p></article>
                <article className="summary-card"><p className="summary-label">작성한 단계 수</p><p className="summary-value">{studentSummary.sectionCount}</p></article>
              </section>

              <section className="filter-panel">
                <p className="panel-title">학생별 조회 필터</p>
                <div className="filter-grid two-col">
                  <label>이름 검색<input type="text" placeholder="예: 김민지" value={studentFilters.name} onChange={(e) => setStudentFilters((p) => ({ ...p, name: e.target.value }))} /></label>
                  <label>학번 검색<input type="text" placeholder="예: 2401" value={studentFilters.studentId} onChange={(e) => setStudentFilters((p) => ({ ...p, studentId: e.target.value }))} /></label>
                </div>
                <div className="actions-row">
                  <div className="left-actions">
                    <button type="button" className="btn-primary" onClick={onApplyStudentFilters}>조회</button>
                    <button type="button" className="btn-secondary" onClick={onResetStudentFilters}>초기화</button>
                  </div>
                  <div className="view-toggle">
                    <button type="button" className={studentViewMode === 'byAnswer' ? 'btn-primary' : 'btn-secondary'} onClick={() => setStudentViewMode('byAnswer')}>답안별 보기</button>
                    <button type="button" className={studentViewMode === 'byStudent' ? 'btn-primary' : 'btn-secondary'} onClick={() => setStudentViewMode('byStudent')}>학생별 묶음 보기</button>
                  </div>
                </div>
              </section>
            </>
          )}

          {queryMode === 'lessonSection' && (
            <>
              <section className="summary-grid three-col">
                <article className="summary-card"><p className="summary-label">현재 조건의 전체 답안 수</p><p className="summary-value">{lessonSectionSummary.answerCount}</p></article>
                <article className="summary-card"><p className="summary-label">참여 학생 수</p><p className="summary-value">{lessonSectionSummary.studentCount}</p></article>
                <article className="summary-card"><p className="summary-label">질문 수</p><p className="summary-value">{lessonSectionSummary.questionCount}</p></article>
              </section>

              <section className="filter-panel">
                <p className="panel-title">차시/단계별 조회 필터</p>
                <div className="filter-grid two-col">
                  <label>차시 선택<select value={lessonSectionFilters.lesson} onChange={(e) => setLessonSectionFilters((p) => ({ ...p, lesson: e.target.value }))}>{LESSON_OPTIONS.map((lesson) => <option key={lesson} value={lesson}>{lesson}</option>)}</select></label>
                  <label>단계 선택<select value={lessonSectionFilters.section} onChange={(e) => setLessonSectionFilters((p) => ({ ...p, section: e.target.value }))}>{SECTION_OPTIONS.map((section) => <option key={section} value={section}>{section}</option>)}</select></label>
                </div>
                <div className="actions-row"><div className="left-actions"><button type="button" className="btn-primary" onClick={onApplyLessonSectionFilters}>조회</button><button type="button" className="btn-secondary" onClick={onResetLessonSectionFilters}>초기화</button></div></div>
              </section>
            </>
          )}

          {loading && <section className="state-card loading">답안을 불러오는 중입니다...</section>}
          {!loading && error && <section className="state-card error">{error}</section>}

          {!loading && !error && queryMode === 'student' && (
            <section className="answers-section">
              {studentFilteredRows.length === 0 && <article className="state-card empty">조건에 맞는 학생 답안이 없습니다.</article>}
              {studentFilteredRows.length > 0 && studentViewMode === 'byAnswer' && (
                <div className="answer-list">
                  {studentFilteredRows.map((row, idx) => (
                    <article className="answer-card" key={`${row.timestamp}-${row.studentId}-${row.questionId}-${idx}`}>
                      <div className="answer-meta"><span>{row.name || '-'}</span><span>{row.studentId || '-'}</span><span className="badge lesson">{row.lesson || '-'}</span><span className="badge section">{row.section || '-'}</span><span>{formatTimestamp(row.timestamp)}</span></div>
                      <p className="question-id">{row.questionId || '-'}</p>
                      <h3 className="question-text">{row.questionText || '(질문 없음)'}</h3>
                      <p className="answer-text">{row.answer || '(답안 없음)'}</p>
                    </article>
                  ))}
                </div>
              )}

              {studentFilteredRows.length > 0 && studentViewMode === 'byStudent' && (
                <div className="student-group-list">
                  {groupedByStudent.map((group) => (
                    <article className="student-card" key={`${group.studentId}-${group.name}`}>
                      <header className="student-header"><h3>{group.name}</h3><p>학번: {group.studentId} · 답안 {group.answers.length}건</p></header>
                      <div className="student-answers">
                        {group.answers.map((row, idx) => (
                          <div className="student-answer-item" key={`${row.timestamp}-${row.questionId}-${idx}`}>
                            <div className="answer-meta"><span className="badge lesson">{row.lesson || '-'}</span><span className="badge section">{row.section || '-'}</span><span>{formatTimestamp(row.timestamp)}</span></div>
                            <p className="question-id">{row.questionId || '-'}</p>
                            <p className="question-text">{row.questionText || '(질문 없음)'}</p>
                            <p className="answer-text">{row.answer || '(답안 없음)'}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {!loading && !error && queryMode === 'lessonSection' && (
            <section className="question-group-section">
              {groupedByQuestion.length === 0 && <article className="state-card empty">선택한 차시와 단계에 해당하는 학생 답안이 없습니다.</article>}
              {groupedByQuestion.map((group) => (
                <article className="question-group-card" key={group.questionId}>
                  <div className="question-group-header"><span className="question-badge">{group.questionId}</span><h3>{group.questionText}</h3></div>
                  <div className="question-answer-list">
                    {group.answers.map((row, idx) => (
                      <div className="question-answer-item" key={`${row.studentId}-${row.timestamp}-${idx}`}>
                        <div className="answer-meta"><span className="student-name">{row.name || '-'}</span><span>{row.studentId || '-'}</span><span>{formatTimestamp(row.timestamp)}</span></div>
                        <p className="answer-text">{row.answer || '(답안 없음)'}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {topTab === 'learningChange' && (
        <section className="analytics-section">
          <section className="summary-grid three-col">
            <article className="summary-card"><p className="summary-label">비교 가능 학생 수</p><p className="summary-value">{filteredMisconceptionComparisons.length}</p></article>
            <article className="summary-card">
              <p className="summary-label">과학적 개념 확신 상승 학생 수</p>
              <p className="summary-value">{filteredMisconceptionComparisons.filter((v) => (v.scientificDifference ?? 0) > 0).length}</p>
            </article>
            <article className="summary-card">
              <p className="summary-label">오개념 확신 감소 학생 수</p>
              <p className="summary-value">{filteredMisconceptionComparisons.filter((v) => (v.misconceptionDifference ?? 0) < 0).length}</p>
            </article>
          </section>

          <section className="filter-panel">
            <p className="panel-title">학생별 사전/사후 비교 조회</p>
            <div className="filter-grid three-col-input">
              <label>이름<input type="text" value={compareFilters.name} onChange={(e) => setCompareFilters((p) => ({ ...p, name: e.target.value }))} /></label>
              <label>학번<input type="text" value={compareFilters.studentId} onChange={(e) => setCompareFilters((p) => ({ ...p, studentId: e.target.value }))} /></label>
              <label>학생 선택<select value={selectedStudentKey} onChange={(e) => setSelectedStudentKey(e.target.value)}><option value="">전체 보기</option>{filteredMisconceptionComparisons.map((item) => <option value={item.key} key={item.key}>{item.name} ({item.studentId || '학번 없음'})</option>)}</select></label>
            </div>
          </section>

          {misconceptionState.loading && <article className="state-card loading">학습 변화 데이터를 불러오는 중입니다...</article>}
          {misconceptionState.warning && <article className="state-card empty">{misconceptionState.warning}</article>}
          {misconceptionState.error && <article className="state-card error">{misconceptionState.error}</article>}

          {!misconceptionState.loading && !misconceptionState.error && !misconceptionState.warning && selectedMisconception && (
            <article className="insight-card">
              <h3>{selectedMisconception.name} ({selectedMisconception.studentId || '학번 없음'})</h3>
              <div className="insight-grid">
                <p><strong>과학적 개념 확신도(사전):</strong> {selectedMisconception.preScientificAverage ?? '데이터 없음'}</p>
                <p><strong>과학적 개념 확신도(사후):</strong> {selectedMisconception.postScientificAverage ?? '데이터 없음'}</p>
                <p><strong>과학적 개념 변화량:</strong> {selectedMisconception.scientificDifference ?? '계산 불가'}</p>
                <p><strong>오개념 확신도(사전):</strong> {selectedMisconception.preMisconceptionAverage ?? '데이터 없음'}</p>
                <p><strong>오개념 확신도(사후):</strong> {selectedMisconception.postMisconceptionAverage ?? '데이터 없음'}</p>
                <p><strong>오개념 변화량:</strong> {selectedMisconception.misconceptionDifference ?? '계산 불가'}</p>
                <p><strong>오개념 문항 수:</strong> 사전 {selectedMisconception.preMisconceptionItems?.length ?? 0} / 사후 {selectedMisconception.postMisconceptionItems?.length ?? 0}</p>
                <p><strong>과학적 개념 문항 수:</strong> 사전 {selectedMisconception.preScientificItems?.length ?? 0} / 사후 {selectedMisconception.postScientificItems?.length ?? 0}</p>
              </div>
              <p className="teacher-suggestion"><strong>AI 추천 학습 제시:</strong> {getTeacherSuggestion(selectedMisconception.status, '학습 성취')}</p>
              <p className="teacher-suggestion"><strong>과학적 개념 해석:</strong> {interpretScientificConfidence(selectedMisconception.scientificDifference)}</p>
              <p className="teacher-suggestion"><strong>오개념 해석:</strong> {interpretMisconceptionConfidence(selectedMisconception.misconceptionDifference)}</p>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>문항명</th>
                      <th>문항 유형</th>
                      <th>사전</th>
                      <th>사후</th>
                      <th>변화량</th>
                      <th>해석</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMisconception.scientificDetails?.map((item, idx) => (
                      <tr key={`sci-${idx}`}>
                        <td>{item.question}</td>
                        <td>{item.type}</td>
                        <td>{item.preValue ?? '-'}</td>
                        <td>{item.postValue ?? '-'}</td>
                        <td>{item.difference ?? '-'}</td>
                        <td>{item.status}</td>
                      </tr>
                    ))}
                    {selectedMisconception.misconceptionDetails?.map((item, idx) => (
                      <tr key={`mis-${idx}`}>
                        <td>{item.question}</td>
                        <td>{item.type}</td>
                        <td>{item.preValue ?? '-'}</td>
                        <td>{item.postValue ?? '-'}</td>
                        <td>{item.difference ?? '-'}</td>
                        <td>{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="remedial-box">
                <div className="remedial-head">
                  <h4>AI 보완 수업 차시 제안</h4>
                  <button type="button" className="btn-primary" onClick={onRecommendRemedial} disabled={remedialState.loading}>
                    {remedialState.loading ? '추천 생성 중...' : '보완 차시 추천 생성'}
                  </button>
                </div>
                {remedialState.warning && <p className="state-inline">{remedialState.warning}</p>}
                {remedialState.error && <p className="state-inline error">{remedialState.error}</p>}
                {selectedRemedial?.recommendation?.summary && (
                  <p className="teacher-suggestion">{selectedRemedial.recommendation.summary}</p>
                )}
                {Array.isArray(selectedRemedial?.recommendation?.recommended_lessons) &&
                  selectedRemedial.recommendation.recommended_lessons.map((item, idx) => (
                    <div className="remedial-item" key={`${item.lesson}-${idx}`}>
                      <p><strong>추천 보완 차시:</strong> {item.lesson} ({item.topic})</p>
                      <p><strong>제안 이유:</strong> {item.reason}</p>
                      <p><strong>지도 제안:</strong> {item.teaching_suggestion}</p>
                    </div>
                  ))}
                {selectedRemedial?.raw_text && !selectedRemedial?.recommendation && (
                  <p className="teacher-suggestion">{selectedRemedial.raw_text}</p>
                )}
              </div>
            </article>
          )}

          {!misconceptionState.loading && !misconceptionState.error && !misconceptionState.warning && !selectedMisconception && (
            <>
              <section className="summary-grid two-col">
                <article className="summary-card">
                  <p className="summary-label">과학적 개념 평균 변화량(전체)</p>
                  <p className="summary-value">
                    {formatNumber(
                      average(
                        filteredMisconceptionComparisons
                          .map((item) => item.scientificDifference)
                          .filter((value) => value !== null && value !== undefined)
                      )
                    ) ?? '-'}
                  </p>
                </article>
                <article className="summary-card">
                  <p className="summary-label">오개념 평균 변화량(전체)</p>
                  <p className="summary-value">
                    {formatNumber(
                      average(
                        filteredMisconceptionComparisons
                          .map((item) => item.misconceptionDifference)
                          .filter((value) => value !== null && value !== undefined)
                      )
                    ) ?? '-'}
                  </p>
                </article>
              </section>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>학생</th>
                      <th>과학적 개념 확신도 (사전/사후/변화량)</th>
                      <th>과학적 개념 해석</th>
                      <th>오개념 확신도 (사전/사후/변화량)</th>
                      <th>오개념 해석</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMisconceptionComparisons.map((item) => (
                      <tr key={item.key}>
                        <td>{item.name} ({item.studentId || '학번 없음'})</td>
                        <td>
                          사전 {item.preScientificAverage ?? '-'} / 사후 {item.postScientificAverage ?? '-'} / 변화량 {item.scientificDifference ?? '-'}
                        </td>
                        <td>{interpretScientificConfidence(item.scientificDifference)}</td>
                        <td>
                          사전 {item.preMisconceptionAverage ?? '-'} / 사후 {item.postMisconceptionAverage ?? '-'} / 변화량 {item.misconceptionDifference ?? '-'}
                        </td>
                        <td>{interpretMisconceptionConfidence(item.misconceptionDifference)}</td>
                      </tr>
                    ))}
                    {filteredMisconceptionComparisons.length === 0 && <tr><td colSpan={5}>비교 가능한 데이터가 부족합니다.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {topTab === 'motivationTask' && (
        <section className="analytics-section">
          <section className="summary-grid three-col">
            <article className="summary-card"><p className="summary-label">비교 대상 학생 수</p><p className="summary-value">{filteredMotivationTask.length}</p></article>
            <article className="summary-card"><p className="summary-label">동기 향상 학생 수</p><p className="summary-value">{filteredMotivationTask.filter((v) => v.motivation?.status === 'improved').length}</p></article>
            <article className="summary-card"><p className="summary-label">과제집착력 저하 학생 수</p><p className="summary-value">{filteredMotivationTask.filter((v) => v.task?.status === 'declined').length}</p></article>
          </section>

          <section className="filter-panel">
            <p className="panel-title">학생 이름으로 조회</p>
            <label>
              이름 입력
              <input
                type="text"
                value={motivationNameFilter}
                placeholder="예: 김대한"
                onChange={(e) => setMotivationNameFilter(e.target.value)}
              />
            </label>
          </section>

          {(motivationState.loading || taskState.loading) && <article className="state-card loading">동기/과제집착력 데이터를 불러오는 중입니다...</article>}
          {(motivationState.warning || taskState.warning) && <article className="state-card empty">API 환경변수가 설정되지 않았습니다.</article>}
          {(motivationState.error || taskState.error) && (
            <article className="state-card error">
              {motivationState.error || taskState.error}
            </article>
          )}

          {!motivationState.loading && !taskState.loading && !motivationState.error && !taskState.error && !motivationState.warning && !taskState.warning && (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>학생</th>
                      <th>동기 사전</th>
                      <th>동기 사후</th>
                      <th>동기 변화량</th>
                      <th>동기 해석</th>
                      <th>과제집착 사전</th>
                      <th>과제집착 사후</th>
                      <th>과제집착 변화량</th>
                      <th>과제집착 해석</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMotivationTask.map((item) => (
                      <tr key={item.key}>
                        <td>{item.name} ({item.studentId || '학번 없음'})</td>
                        <td>{item.motivation?.preAvg ?? '-'}</td>
                        <td>{item.motivation?.postAvg ?? '-'}</td>
                        <td>{item.motivation?.delta ?? '-'}</td>
                        <td>{interpretEngagementChange(item.motivation?.delta ?? null, '과학 활동 동기')}</td>
                        <td>{item.task?.preAvg ?? '-'}</td>
                        <td>{item.task?.postAvg ?? '-'}</td>
                        <td>{item.task?.delta ?? '-'}</td>
                        <td>{interpretEngagementChange(item.task?.delta ?? null, '과제집착력')}</td>
                      </tr>
                    ))}
                    {filteredMotivationTask.length === 0 && <tr><td colSpan={9}>비교 가능한 데이터가 부족합니다.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="double-card-grid">
                <article className="insight-card">
                  <h3>과학 활동 동기 해석 가이드</h3>
                  <p>사전 대비 사후 점수가 상승한 학생은 과학 활동 동기가 향상된 것으로 볼 수 있습니다.</p>
                  <p>변화가 크지 않은 학생은 수업 참여 패턴을 추가로 관찰해볼 수 있습니다.</p>
                </article>
                <article className="insight-card">
                  <h3>과제 집착력 해석 가이드</h3>
                  <p>과제 집착력 점수가 낮아진 학생은 학습 지속성 강화를 위한 전략을 함께 지도해볼 수 있습니다.</p>
                  <p>상승한 학생은 현재 학습 루틴을 유지하며 점진적 난이도 조정을 제안해볼 수 있습니다.</p>
                </article>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
