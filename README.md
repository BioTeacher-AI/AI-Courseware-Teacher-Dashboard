# AI Courseware Teacher Dashboard

React + Vite 기반의 교사용 AI 코스웨어 대시보드입니다. Netlify Function 프록시를 통해 답안/설문 데이터를 조회하며, 학습 변화/동기·과제집착력 변화를 교사용 관점에서 확인할 수 있습니다.

## 필수 환경변수

### 1) Netlify 서버 환경변수 (Functions)

```bash
GOOGLE_SCRIPT_READ_URL=

MISCONCEPTION_PRE_API=
MISCONCEPTION_POST_API=

MOTIVATION_PRE_API=
MOTIVATION_POST_API=

TASK_PERSISTENCE_PRE_API=
TASK_PERSISTENCE_POST_API=
```

> 호환을 위해 `VITE_MISCONCEPTION_PRE_API` 등 기존 `VITE_*` 이름도 Functions에서 fallback으로 읽을 수 있습니다.

### 2) 프론트 환경변수 (선택)

프론트는 외부 Apps Script URL을 직접 fetch 하지 않습니다. 따라서 설문 조회용 `VITE_*`는 필수는 아니며, 서버 환경변수 사용을 권장합니다.

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
- 설문/변화 분석
  - 브라우저 -> `/.netlify/functions/proxy-survey?target=...` -> 서버 환경변수 URL
  - 예시 target: `misconception-pre`, `misconception-post`, `motivation-pre`, `motivation-post`, `task-pre`, `task-post`
