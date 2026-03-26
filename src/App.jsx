import { useEffect, useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_GOOGLE_SCRIPT_READ_URL;

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

const INITIAL_STUDENT_FILTERS = {
  name: '',
  studentId: ''
};

const INITIAL_LESSON_SECTION_FILTERS = {
  lesson: 'lesson1',
  section: '생각열기'
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

function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [queryMode, setQueryMode] = useState('student');
  const [studentFilters, setStudentFilters] = useState(INITIAL_STUDENT_FILTERS);
  const [appliedStudentFilters, setAppliedStudentFilters] = useState(INITIAL_STUDENT_FILTERS);

  const [lessonSectionFilters, setLessonSectionFilters] = useState(INITIAL_LESSON_SECTION_FILTERS);
  const [appliedLessonSectionFilters, setAppliedLessonSectionFilters] = useState(INITIAL_LESSON_SECTION_FILTERS);

  const [studentViewMode, setStudentViewMode] = useState('byAnswer');

  useEffect(() => {
    let ignore = false;

    async function fetchRows() {
      if (!API_URL) {
        setError('답안을 불러오지 못했습니다. API 설정을 확인해주세요. (VITE_GOOGLE_SCRIPT_READ_URL 누락)');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const res = await fetch(API_URL, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (!json?.ok) {
          throw new Error('API 응답 ok=false');
        }

        const data = Array.isArray(json.data) ? json.data : [];
        if (!ignore) {
          setRows(data);
        }
      } catch {
        if (!ignore) {
          setError('답안을 불러오지 못했습니다. API 설정을 확인해주세요.');
          setRows([]);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchRows();
    return () => {
      ignore = true;
    };
  }, []);

  const studentFilteredRows = useMemo(() => {
    const nameKeyword = appliedStudentFilters.name.trim().toLowerCase();
    const idKeyword = appliedStudentFilters.studentId.trim().toLowerCase();

    const matched = rows.filter((row) => {
      const rowName = String(row.name ?? '').toLowerCase();
      const rowId = String(row.studentId ?? '').toLowerCase();
      const matchName = !nameKeyword || rowName.includes(nameKeyword);
      const matchId = !idKeyword || rowId.includes(idKeyword);
      return matchName && matchId;
    });

    return sortByLatest(matched);
  }, [rows, appliedStudentFilters]);

  const groupedByStudent = useMemo(() => {
    const groups = new Map();

    studentFilteredRows.forEach((row) => {
      const key = `${row.studentId || ''}__${row.name || ''}`;
      if (!groups.has(key)) {
        groups.set(key, {
          studentId: row.studentId || '-',
          name: row.name || '이름 없음',
          answers: []
        });
      }
      groups.get(key).answers.push(row);
    });

    return [...groups.values()].sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name, 'ko-KR');
      return nameCompare !== 0 ? nameCompare : a.studentId.localeCompare(b.studentId, 'ko-KR');
    });
  }, [studentFilteredRows]);

  const lessonSectionFilteredRows = useMemo(() => {
    return rows.filter((row) => {
      return (
        String(row.lesson ?? '') === appliedLessonSectionFilters.lesson &&
        String(row.section ?? '') === appliedLessonSectionFilters.section
      );
    });
  }, [rows, appliedLessonSectionFilters]);

  const groupedByQuestion = useMemo(() => {
    const grouped = lessonSectionFilteredRows.reduce((acc, row) => {
      const key = String(row.questionId ?? '질문없음');
      if (!acc[key]) {
        acc[key] = {
          questionId: row.questionId || '-',
          questionText: row.questionText || '(질문 없음)',
          answers: []
        };
      }
      acc[key].answers.push(row);
      return acc;
    }, {});

    return Object.values(grouped)
      .sort((a, b) => a.questionId.localeCompare(b.questionId, 'ko-KR'))
      .map((group) => ({
        ...group,
        answers: [...group.answers].sort((a, b) => {
          const nameCompare = String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko-KR');
          if (nameCompare !== 0) return nameCompare;
          return String(a.studentId ?? '').localeCompare(String(b.studentId ?? ''), 'ko-KR');
        })
      }));
  }, [lessonSectionFilteredRows]);

  const studentSummary = useMemo(() => {
    const lessons = new Set(studentFilteredRows.map((row) => String(row.lesson ?? '')));
    const sections = new Set(studentFilteredRows.map((row) => String(row.section ?? '')));

    return {
      answerCount: studentFilteredRows.length,
      lessonCount: [...lessons].filter(Boolean).length,
      sectionCount: [...sections].filter(Boolean).length
    };
  }, [studentFilteredRows]);

  const lessonSectionSummary = useMemo(() => {
    return {
      answerCount: lessonSectionFilteredRows.length,
      studentCount: new Set(lessonSectionFilteredRows.map((row) => String(row.studentId ?? ''))).size,
      questionCount: new Set(lessonSectionFilteredRows.map((row) => String(row.questionId ?? ''))).size
    };
  }, [lessonSectionFilteredRows]);

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
        <p>학생들이 각 차시와 활동 단계에서 작성한 답안을 조회할 수 있습니다.</p>
      </header>

      <section className="mode-switch-card">
        <p className="mode-title">조회 모드</p>
        <div className="mode-toggle">
          <button
            type="button"
            className={queryMode === 'student' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setQueryMode('student')}
          >
            학생별 조회
          </button>
          <button
            type="button"
            className={queryMode === 'lessonSection' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setQueryMode('lessonSection')}
          >
            차시/단계별 조회
          </button>
        </div>
      </section>

      {queryMode === 'student' && (
        <>
          <section className="summary-grid three-col">
            <article className="summary-card">
              <p className="summary-label">해당 학생 답안 수</p>
              <p className="summary-value">{studentSummary.answerCount}</p>
            </article>
            <article className="summary-card">
              <p className="summary-label">작성한 차시 수</p>
              <p className="summary-value">{studentSummary.lessonCount}</p>
            </article>
            <article className="summary-card">
              <p className="summary-label">작성한 단계 수</p>
              <p className="summary-value">{studentSummary.sectionCount}</p>
            </article>
          </section>

          <section className="filter-panel">
            <p className="panel-title">학생별 조회 필터</p>
            <div className="filter-grid two-col">
              <label>
                이름 검색
                <input
                  type="text"
                  placeholder="예: 김민지"
                  value={studentFilters.name}
                  onChange={(e) => setStudentFilters((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>

              <label>
                학번 검색
                <input
                  type="text"
                  placeholder="예: 2401"
                  value={studentFilters.studentId}
                  onChange={(e) => setStudentFilters((prev) => ({ ...prev, studentId: e.target.value }))}
                />
              </label>
            </div>

            <div className="actions-row">
              <div className="left-actions">
                <button type="button" className="btn-primary" onClick={onApplyStudentFilters}>
                  조회
                </button>
                <button type="button" className="btn-secondary" onClick={onResetStudentFilters}>
                  초기화
                </button>
              </div>

              <div className="view-toggle">
                <button
                  type="button"
                  className={studentViewMode === 'byAnswer' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setStudentViewMode('byAnswer')}
                >
                  답안별 보기
                </button>
                <button
                  type="button"
                  className={studentViewMode === 'byStudent' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setStudentViewMode('byStudent')}
                >
                  학생별 묶음 보기
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {queryMode === 'lessonSection' && (
        <>
          <section className="summary-grid three-col">
            <article className="summary-card">
              <p className="summary-label">현재 조건의 전체 답안 수</p>
              <p className="summary-value">{lessonSectionSummary.answerCount}</p>
            </article>
            <article className="summary-card">
              <p className="summary-label">참여 학생 수</p>
              <p className="summary-value">{lessonSectionSummary.studentCount}</p>
            </article>
            <article className="summary-card">
              <p className="summary-label">질문 수</p>
              <p className="summary-value">{lessonSectionSummary.questionCount}</p>
            </article>
          </section>

          <section className="filter-panel">
            <p className="panel-title">차시/단계별 조회 필터</p>
            <div className="filter-grid two-col">
              <label>
                차시 선택
                <select
                  value={lessonSectionFilters.lesson}
                  onChange={(e) => setLessonSectionFilters((prev) => ({ ...prev, lesson: e.target.value }))}
                >
                  {LESSON_OPTIONS.map((lesson) => (
                    <option key={lesson} value={lesson}>
                      {lesson}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                단계 선택
                <select
                  value={lessonSectionFilters.section}
                  onChange={(e) => setLessonSectionFilters((prev) => ({ ...prev, section: e.target.value }))}
                >
                  {SECTION_OPTIONS.map((section) => (
                    <option key={section} value={section}>
                      {section}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="actions-row">
              <div className="left-actions">
                <button type="button" className="btn-primary" onClick={onApplyLessonSectionFilters}>
                  조회
                </button>
                <button type="button" className="btn-secondary" onClick={onResetLessonSectionFilters}>
                  초기화
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {loading && <section className="state-card loading">답안을 불러오는 중입니다...</section>}
      {!loading && error && <section className="state-card error">{error}</section>}

      {!loading && !error && queryMode === 'student' && (
        <section className="answers-section">
          {studentFilteredRows.length === 0 && (
            <article className="state-card empty">조건에 맞는 학생 답안이 없습니다.</article>
          )}

          {studentFilteredRows.length > 0 && studentViewMode === 'byAnswer' && (
            <div className="answer-list">
              {studentFilteredRows.map((row, idx) => (
                <article className="answer-card" key={`${row.timestamp}-${row.studentId}-${row.questionId}-${idx}`}>
                  <div className="answer-meta">
                    <span>{row.name || '-'}</span>
                    <span>{row.studentId || '-'}</span>
                    <span className="badge lesson">{row.lesson || '-'}</span>
                    <span className="badge section">{row.section || '-'}</span>
                    <span>{formatTimestamp(row.timestamp)}</span>
                  </div>
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
                  <header className="student-header">
                    <h3>{group.name}</h3>
                    <p>학번: {group.studentId} · 답안 {group.answers.length}건</p>
                  </header>

                  <div className="student-answers">
                    {group.answers.map((row, idx) => (
                      <div className="student-answer-item" key={`${row.timestamp}-${row.questionId}-${idx}`}>
                        <div className="answer-meta">
                          <span className="badge lesson">{row.lesson || '-'}</span>
                          <span className="badge section">{row.section || '-'}</span>
                          <span>{formatTimestamp(row.timestamp)}</span>
                        </div>
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
          {groupedByQuestion.length === 0 && (
            <article className="state-card empty">선택한 차시와 단계에 해당하는 학생 답안이 없습니다.</article>
          )}

          {groupedByQuestion.map((group) => (
            <article className="question-group-card" key={group.questionId}>
              <div className="question-group-header">
                <span className="question-badge">{group.questionId}</span>
                <h3>{group.questionText}</h3>
              </div>

              <div className="question-answer-list">
                {group.answers.map((row, idx) => (
                  <div className="question-answer-item" key={`${row.studentId}-${row.timestamp}-${idx}`}>
                    <div className="answer-meta">
                      <span className="student-name">{row.name || '-'}</span>
                      <span>{row.studentId || '-'}</span>
                      <span>{formatTimestamp(row.timestamp)}</span>
                    </div>
                    <p className="answer-text">{row.answer || '(답안 없음)'}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

export default App;
