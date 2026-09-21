# SADARI ARENA

우리팀 실시간 사다리타기. 기존 SADARI의 참가자 설정, CSV 업로드, 릴레이 애니메이션, 결과 복사 기능을 유지한 개선판입니다.

## 개선 내용

- 게임을 만든 브라우저만 시작·전체 결과 공개·초기화를 수행할 수 있습니다. 서버가 HttpOnly 세션 쿠키의 해시와 방 소유자를 비교합니다. HTTPS에서는 Secure 및 __Host- 쿠키를 사용합니다.
- 단일 공용 방을 유지합니다. 접속자는 이름표를 눌러 차례를 시작합니다. 개인별 계정/이름 소유권 인증은 제공하지 않습니다.
- D1의 조건부 갱신(version, owner, 원본 state 비교)으로 동시 선택을 직렬화합니다. 이전 라운드에서 늦게 도착한 요청도 거부합니다.
- 각 차례는 서버 시각 기준 4.2초입니다. 요청자의 탭이 닫혀도 다른 사용자의 조회가 종료 상태를 확정합니다. 아무도 접속하지 않았다가 돌아와도 같은 방식으로 복구합니다.
- 마지막 변경 후 24시간 지난 공용 방은 만료됩니다. 방장 권한은 같은 브라우저의 세션 쿠키에 유지됩니다. 쿠키를 지운 경우 복구 기능은 없습니다.
- 결과 매칭은 서버의 암호학적 난수로 균등 순열을 먼저 고른 뒤 그 순열에 대응하는 사다리를 만듭니다. 사다리 자체는 공개되므로 결과 비밀 유지 용도로 사용하지 않습니다.
- 이름·결과는 textContent로 표시합니다. CSV의 따옴표·쉼표와 UTF-8/UTF-16/EUC-KR을 처리합니다.

## 실행 및 배포

Node.js 24 이상에서 `npm ci`, `npm run db:generate`(스키마 변경 시), `npm run dev`를 실행합니다. 로컬 주소는 http://127.0.0.1:4173 입니다.

`npm test`는 권한·동시성·중단 복구·입력 검증·사다리 매칭을 검증합니다. `node tests/browser.mjs`는 실행 중인 로컬 서버와 Playwright Chromium 또는 Microsoft Edge를 사용합니다.

`npm run build`는 정적 화면을 포함한 Cloudflare Worker와 D1 마이그레이션을 dist에 생성합니다. `.openai/hosting.json`의 Sites 프로젝트와 DB 바인딩을 사용해 배포합니다. 스키마는 `db/schema.ts`, 생성된 마이그레이션은 `drizzle/`에서 관리합니다.

새 배포본은 Firebase 대신 Sites D1을 사용합니다. 기존 Firebase 데이터/규칙은 변경하지 않으며 과거 게임을 가져오지 않습니다. 브라우저만으로 서버 권한을 강제할 수 없어 도입한 서버 구조입니다. GitHub Pages 단독으로는 새 버전의 API를 실행할 수 없습니다.

## 구조

- `index.html`, `style.css`, `script.js`: 접근성·모바일 대응 게임 화면
- `server/worker.js`: 요청 검증, 방장 권한, 서버 시각, 원자적 게임 상태 갱신
- `db/schema.ts`, `drizzle/`: 게임 상태 테이블 및 배포 마이그레이션
- `dev.mjs`, `build.mjs`: 로컬 SQLite 어댑터와 배포 빌드

## 화면 방향

경쟁 게임의 명확한 로비 구조와 파티게임의 경쾌한 색감을 결합했습니다. 참고: https://playvalorant.com/en-us/ 및 https://www.fallguys.com/about . 특정 게임의 로고나 자산은 사용하지 않았습니다.
