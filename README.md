# AI Courseware Teacher Dashboard

React + Vite 기반의 교사용 AI 코스웨어 대시보드입니다. Google Apps Script 조회 API를 통해 학생 답안을 불러와 필터링/조회할 수 있습니다.

## 필수 환경변수

아래 환경변수를 Netlify(또는 로컬 `.env`)에 설정하세요.

```bash
VITE_GOOGLE_SCRIPT_READ_URL=https://script.google.com/macros/s/xxxxx/exec
```

## 실행 방법

```bash
npm install
npm run dev
npm run build
```

## 주요 기능

- 답안 데이터 로딩(로딩/오류 상태 처리)
- 이름/학번/차시/활동단계 필터
- 답안별 보기, 학생별 묶음 보기 토글
- 전체 요약 카드(전체 답안 수/학생 수/차시별 건수)

## Netlify 배포 설정

Netlify 사이트 설정에서 아래 값을 사용하세요.

- Build command: `npm run build`
- Publish directory: `dist`

`dist` 폴더는 Git에 커밋하지 않고, Netlify가 빌드 과정에서 생성한 결과물을 배포합니다.
