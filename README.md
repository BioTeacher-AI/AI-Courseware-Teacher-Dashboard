# AI Courseware Teacher Dashboard

React + Vite 기반의 교사용 AI 코스웨어 대시보드입니다. Netlify Function을 통해 학생 답안을 조회하며, 학습 변화/동기·과제집착력 변화를 교사용 관점에서 확인할 수 있습니다.

## 필수 환경변수

### 1) Netlify 서버 환경변수 (함수에서 사용)

```bash
GOOGLE_SCRIPT_READ_URL=https://script.google.com/macros/s/XXXXXX/exec
```

- 답안 조회는 브라우저가 직접 Apps Script를 호출하지 않고 `/.netlify/functions/read-answers`를 통해 프록시됩니다.

### 2) 프론트 환경변수 (Vite)

```bash
VITE_MISCONCEPTION_PRE_API=
VITE_MISCONCEPTION_POST_API=

VITE_MOTIVATION_PRE_API=
VITE_MOTIVATION_POST_API=

VITE_TASK_PERSISTENCE_PRE_API=
VITE_TASK_PERSISTENCE_POST_API=
```

- 위 값이 비어 있으면 앱은 죽지 않고, 해당 탭에서 "API 환경변수가 설정되지 않았습니다" 안내를 표시합니다.

## 실행 방법

```bash
npm install
npm run dev
npm run build
```

## 주요 기능

- 답안 조회 탭
  - 학생별 조회 (이름/학번 필터 + 답안별 보기/학생별 묶음 보기)
  - 차시·단계별 조회 (질문별 그룹 비교)
- 학습 변화 확인 탭
  - 사전/사후 오개념 데이터 학생별 비교
  - 변화량(향상/유지/저하/비교 불가) 및 교사용 제안 문구
- 동기 및 과제집착력 수준 변화 탭
  - 동기/과제집착 사전·사후 점수 비교
  - 변화량 요약과 교사용 해석 가이드

## Netlify 배포 설정

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

## API 호출 구조

- 답안 조회
  - 브라우저 -> `/.netlify/functions/read-answers` -> `GOOGLE_SCRIPT_READ_URL`
- 변화 분석
  - 브라우저 -> `VITE_*` 환경변수로 설정한 API (사전/사후)

