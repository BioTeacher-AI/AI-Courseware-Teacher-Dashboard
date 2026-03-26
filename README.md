# AI Courseware Teacher Dashboard

React + Vite 기반의 교사용 AI 코스웨어 대시보드입니다. Netlify Function을 통해 Google Apps Script 조회 API를 호출하고, 학생 답안을 필터링/비교 조회할 수 있습니다.

## 필수 환경변수 (Netlify 서버 환경변수)

아래 환경변수를 Netlify Site settings > Environment variables에 설정하세요.

```bash
GOOGLE_SCRIPT_READ_URL=https://script.google.com/macros/s/XXXXXX/exec
```

> 프론트엔드에서는 Apps Script URL을 직접 호출하지 않습니다.
> `VITE_` 변수 대신 서버 측 `GOOGLE_SCRIPT_READ_URL`만 사용합니다.

## 실행 방법

```bash
npm install
npm run dev
npm run build
```

## 주요 기능

- 답안 데이터 로딩(로딩/오류 상태 처리)
- 조회 모드 전환: 학생별 조회 / 차시·단계별 조회
- 학생별 조회: 이름/학번 필터 + 답안별 보기/학생별 묶음 보기
- 차시·단계별 조회: lesson/section 필터 + 질문별 그룹 비교 보기
- 모드별 요약 카드(학생 답안/차시·단계 참여 현황)

## Netlify 배포 설정

Netlify 사이트 설정에서 아래 값을 사용하세요.

- Build command: `npm run build`
- Publish directory: `dist`

`dist` 폴더는 Git에 커밋하지 않고, Netlify가 빌드 과정에서 생성한 결과물을 배포합니다.

## API 호출 구조

- 브라우저: `/.netlify/functions/read-answers`
- Netlify Function: `netlify/functions/read-answers.js`
- Function -> `GOOGLE_SCRIPT_READ_URL`로 GET 재요청

필요하면 query string도 전달할 수 있습니다.

- `/.netlify/functions/read-answers?lesson=lesson2&section=호흡계 설명하기`
- `/.netlify/functions/read-answers?studentId=2401`
- `/.netlify/functions/read-answers?name=김민지`
