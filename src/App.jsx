import { useEffect, useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_GOOGLE_SCRIPT_READ_URL;

const LESSON_OPTIONS = ['all', 'lesson1', 'lesson2', 'lesson3'];
const SECTION_OPTIONS = [
  'all',
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

const INITIAL_FILTERS = {
  name: '',
  studentId: '',
  lesson: 'all',
  section: 'all'
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
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [viewMode, setViewMode] = useState('byAnswer');

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
      } catch (err) {
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

  const filteredRows = useMemo(() => {
    const nameKeyword = appliedFilters.name.trim().toLowerCase();
    const idKeyword = appliedFilters.studentId.trim().toLowerCase();

    const matched = rows.filter((row) => {
      const rowName = String(row.name ?? '').toLowerCase();
      const rowId = String(row.studentId ?? '').toLowerCase();
      const rowLesson = String(row.lesson ?? '');
      const rowSection = String(row.section ?? '');

      const matchName = !nameKeyword || rowName.includes(nameKeyword);
      const matchId = !idKeyword || rowId.includes(idKeyword);
      const matchLesson = appliedFilters.lesson === 'all' || rowLesson === appliedFilters.lesson;
      const matchSection = appliedFilters.section === 'all' || rowSection === appliedFilters.section;

      return matchName && matchId && matchLesson && matchSection;
    });

    return sortByLatest(matched);
  }, [rows, appliedFilters]);

  const groupedByStudent = useMemo(() => {
    const groups = new Map();

    filteredRows.forEach((row) => {
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

    return [...groups.values()].sort((a, b) => b.answers.length - a.answers.length);
  }, [filteredRows]);

  const summary = useMemo(() => {
    const uniqueStudentIds = new Set(rows.map((row) => String(row.studentId ?? '')));
    return {
      totalAnswers: rows.length,
      totalStudents: uniqueStudentIds.size,
      lesson1Count: rows.filter((row) => row.lesson === 'lesson1').length,
      lesson2Count: rows.filter((row) => row.lesson === 'lesson2').length,
      lesson3Count: rows.filter((row) => row.lesson === 'lesson3').length,
      filteredCount: filteredRows.length
    };
  }, [rows, filteredRows.length]);

  const onFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const onSearch = () => {
    setAppliedFilters(filters);
  };

  const onReset = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
  };

  return (
    <div className="page-shell">
      <header className="header-card">
        <h1>AI 코스웨어 교사용 대시보드</h1>
        <p>학생들이 각 차시와 활동 단계에서 작성한 답안을 조회할 수 있습니다.</p>
      </header>

      <section className="summary-grid">
        <article className="summary-card">
          <p className="summary-label">전체 답안 수</p>
          <p className="summary-value">{summary.totalAnswers}</p>
        </article>
        <article className="summary-card">
          <p className="summary-label">학생 수(중복 제거)</p>
          <p className="summary-value">{summary.totalStudents}</p>
        </article>
        <article className="summary-card">
          <p className="summary-label">1차시 답안 수</p>
          <p className="summary-value">{summary.lesson1Count}</p>
        </article>
        <article className="summary-card">
          <p className="summary-label">2차시 답안 수</p>
          <p className="summary-value">{summary.lesson2Count}</p>
        </article>
        <article className="summary-card">
          <p className="summary-label">3차시 답안 수</p>
          <p className="summary-value">{summary.lesson3Count}</p>
        </article>
      </section>

      <section className="filter-panel">
        <div className="filter-grid">
          <label>
            이름 검색
            <input
              type="text"
              placeholder="예: 김민지"
              value={filters.name}
              onChange={(e) => onFilterChange('name', e.target.value)}
            />
          </label>

          <label>
            학번 검색
            <input
              type="text"
              placeholder="예: 2401"
              value={filters.studentId}
              onChange={(e) => onFilterChange('studentId', e.target.value)}
            />
          </label>

          <label>
            차시 선택
            <select value={filters.lesson} onChange={(e) => onFilterChange('lesson', e.target.value)}>
              {LESSON_OPTIONS.map((lesson) => (
                <option key={lesson} value={lesson}>
                  {lesson === 'all' ? '전체' : lesson}
                </option>
              ))}
            </select>
          </label>

          <label>
            활동 단계 선택
            <select value={filters.section} onChange={(e) => onFilterChange('section', e.target.value)}>
              {SECTION_OPTIONS.map((section) => (
                <option key={section} value={section}>
                  {section === 'all' ? '전체' : section}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="actions-row">
          <div className="left-actions">
            <button type="button" className="btn-primary" onClick={onSearch}>
              조회
            </button>
            <button type="button" className="btn-secondary" onClick={onReset}>
              초기화
            </button>
          </div>

          <div className="view-toggle">
            <button
              type="button"
              className={viewMode === 'byAnswer' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setViewMode('byAnswer')}
            >
              답안별 보기
            </button>
            <button
              type="button"
              className={viewMode === 'byStudent' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setViewMode('byStudent')}
            >
              학생별 보기
            </button>
          </div>
        </div>

        <p className="result-count">현재 필터 결과: {summary.filteredCount}건</p>
      </section>

      {loading && <section className="state-card loading">답안을 불러오는 중입니다...</section>}
      {!loading && error && <section className="state-card error">{error}</section>}

      {!loading && !error && (
        <section className="answers-section">
          {filteredRows.length === 0 && (
            <article className="state-card empty">조건에 맞는 학생 답안이 없습니다.</article>
          )}

          {filteredRows.length > 0 && viewMode === 'byAnswer' && (
            <div className="answer-list">
              {filteredRows.map((row, idx) => (
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

          {filteredRows.length > 0 && viewMode === 'byStudent' && (
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
    </div>
  );
}

export default App;
