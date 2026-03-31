import { useEffect, useMemo, useState } from 'react';

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
    throw new Error(json?.message || '설문 데이터를 불러오지 못했습니다.');
  }

  return parseRows(json);
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
  const [compareFilters, setCompareFilters] = useState({ name: '', studentId: '' });
  const [selectedStudentKey, setSelectedStudentKey] = useState('');

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
    const controller = new AbortController();

    async function loadPair({ preTarget, postTarget, setState, label }) {
      setState((prev) => ({ ...prev, loading: true, error: '', warning: '' }));
      try {
        const [preRows, postRows] = await Promise.all([
          fetchSurveyRows(preTarget, controller.signal),
          fetchSurveyRows(postTarget, controller.signal)
        ]);
        setState({ loading: false, error: '', warning: '', preRows, postRows });
      } catch (err) {
        console.error(`${label} 데이터 조회 오류:`, err);
        const message = String(err?.message || '');
        const warning = message.includes('환경변수가 설정되지 않았습니다')
          ? 'API 환경변수가 설정되지 않았습니다.'
          : '';
        setState({
          loading: false,
          error: warning ? '' : '설문 데이터를 불러오지 못했습니다.',
          warning,
          preRows: [],
          postRows: []
        });
      }
    }

    async function loadComparisons() {
      await Promise.all([
        loadPair({
          preTarget: 'misconception-pre',
          postTarget: 'misconception-post',
          setState: setMisconceptionState,
          label: '학습 변화'
        }),
        loadPair({
          preTarget: 'motivation-pre',
          postTarget: 'motivation-post',
          setState: setMotivationState,
          label: '동기'
        }),
        loadPair({
          preTarget: 'task-pre',
          postTarget: 'task-post',
          setState: setTaskState,
          label: '과제집착력'
        })
      ]);
    }

    loadComparisons();
    return () => controller.abort();
  }, []);

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
    () => buildStudentComparisons(misconceptionState.preRows || [], misconceptionState.postRows || []),
    [misconceptionState.preRows, misconceptionState.postRows]
  );
  const motivationComparisons = useMemo(
    () => buildStudentComparisons(motivationState.preRows || [], motivationState.postRows || []),
    [motivationState.preRows, motivationState.postRows]
  );
  const taskComparisons = useMemo(
    () => buildStudentComparisons(taskState.preRows || [], taskState.postRows || []),
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
            <article className="summary-card"><p className="summary-label">향상 학생 수</p><p className="summary-value">{filteredMisconceptionComparisons.filter((v) => v.status === 'improved').length}</p></article>
            <article className="summary-card"><p className="summary-label">데이터 부족 학생 수</p><p className="summary-value">{filteredMisconceptionComparisons.filter((v) => v.status === 'insufficient').length}</p></article>
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
                <p><strong>사전 평균 점수:</strong> {selectedMisconception.preAvg ?? '데이터 없음'}</p>
                <p><strong>사후 평균 점수:</strong> {selectedMisconception.postAvg ?? '데이터 없음'}</p>
                <p><strong>변화량:</strong> {selectedMisconception.delta ?? '계산 불가'}</p>
                <p><strong>변화 분류:</strong> {selectedMisconception.status === 'improved' ? '향상' : selectedMisconception.status === 'same' ? '유지' : selectedMisconception.status === 'declined' ? '저하' : '비교 불가'}</p>
              </div>
              <p className="teacher-suggestion">{getTeacherSuggestion(selectedMisconception.status, '학습 성취')}</p>
            </article>
          )}

          {!misconceptionState.loading && !misconceptionState.error && !misconceptionState.warning && !selectedMisconception && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>학생</th><th>사전 평균</th><th>사후 평균</th><th>변화량</th><th>분류</th><th>교사용 제안</th></tr></thead>
                <tbody>
                  {filteredMisconceptionComparisons.map((item) => (
                    <tr key={item.key}>
                      <td>{item.name} ({item.studentId || '학번 없음'})</td>
                      <td>{item.preAvg ?? '-'}</td>
                      <td>{item.postAvg ?? '-'}</td>
                      <td>{item.delta ?? '-'}</td>
                      <td>{item.status === 'improved' ? '향상' : item.status === 'same' ? '유지' : item.status === 'declined' ? '저하' : '비교 불가'}</td>
                      <td>{getTeacherSuggestion(item.status, '학습 성취')}</td>
                    </tr>
                  ))}
                  {filteredMisconceptionComparisons.length === 0 && <tr><td colSpan={6}>비교 가능한 데이터가 부족합니다.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {topTab === 'motivationTask' && (
        <section className="analytics-section">
          <section className="summary-grid three-col">
            <article className="summary-card"><p className="summary-label">비교 대상 학생 수</p><p className="summary-value">{mergedMotivationTask.length}</p></article>
            <article className="summary-card"><p className="summary-label">동기 향상 학생 수</p><p className="summary-value">{mergedMotivationTask.filter((v) => v.motivation?.status === 'improved').length}</p></article>
            <article className="summary-card"><p className="summary-label">과제집착력 저하 학생 수</p><p className="summary-value">{mergedMotivationTask.filter((v) => v.task?.status === 'declined').length}</p></article>
          </section>

          {(motivationState.loading || taskState.loading) && <article className="state-card loading">동기/과제집착력 데이터를 불러오는 중입니다...</article>}
          {(motivationState.warning || taskState.warning) && <article className="state-card empty">API 환경변수가 설정되지 않았습니다.</article>}
          {(motivationState.error || taskState.error) && <article className="state-card error">설문 데이터를 불러오지 못했습니다.</article>}

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
                      <th>과제집착 사전</th>
                      <th>과제집착 사후</th>
                      <th>과제집착 변화량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergedMotivationTask.map((item) => (
                      <tr key={item.key}>
                        <td>{item.name} ({item.studentId || '학번 없음'})</td>
                        <td>{item.motivation?.preAvg ?? '-'}</td>
                        <td>{item.motivation?.postAvg ?? '-'}</td>
                        <td>{item.motivation?.delta ?? '-'}</td>
                        <td>{item.task?.preAvg ?? '-'}</td>
                        <td>{item.task?.postAvg ?? '-'}</td>
                        <td>{item.task?.delta ?? '-'}</td>
                      </tr>
                    ))}
                    {mergedMotivationTask.length === 0 && <tr><td colSpan={7}>비교 가능한 데이터가 부족합니다.</td></tr>}
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
