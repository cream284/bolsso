# 볼쏘 프로젝트 모듈 및 역할

이 문서는 볼쏘 프로젝트에서 사용하는 화면, 코드, PocketBase 컬렉션, 서버 훅, 마이그레이션과 NAS 배포 모듈의 이름과 책임을 설명한다.

실제 회원정보, 회비자료, 규약 원본과 인증정보는 이 저장소에 포함하지 않는다. 이 문서의 이름은 모두 코드상 모듈명 또는 합성된 역할명이다.

## 1. 전체 구조

```text
회원 브라우저
  └─ GitHub Pages 정적 화면
       ├─ index.html        화면 구조
       ├─ styles.css        디자인과 반응형 레이아웃
       └─ app.js            인증, 권한, 조회, 저장과 화면 렌더링
            │
            ▼
NAS API 프록시
  ├─ PocketBase            인증, 컬렉션, 파일, 규칙과 서버 훅
  └─ Rule Converter        규약 원본을 Markdown으로 변환
            │
            ▼
NAS 영구 저장소
  ├─ pb_data               데이터베이스와 보호 파일
  └─ runtime.env           암호화 키 등 런타임 비밀정보
```

GitHub에는 공개 가능한 소스만 저장하고, 실제 운영 데이터는 NAS에만 저장한다.

## 2. 사용자 역할

| 이름 | 코드 값 | 역할 | 주요 권한 |
| --- | --- | --- | --- |
| 회원 | `member` | 일반 모임 구성원 | 공개 회비내역, 회원목록, 일정, 참석자와 게시된 규약 조회 |
| 회장 | `chair` | 규약과 모임 운영 담당 | 회원 권한과 분리된 규약 개정·게시, 일정·참석·결과 기록, 확정 장부 조회 |
| 총무 | `treasurer` | 회비와 장부 담당 | 회비정책·납부기간·회원별 납부상태·거래 초안과 확정 처리 |
| 시스템 관리자 | `isAdmin = true` | 장애·부재 시 시스템 운영 대행 | 회원 계정, 활성 상태, 직책, 비밀번호 초기화와 전체 관리 기능 |
| 이전 운영자 | `operator`, `admin` | 과거 데이터 호환용 역할 | 신규 배정에는 사용하지 않으며 현재 권한 체계와의 호환에만 남김 |

한 회원은 `chair` 또는 `treasurer` 직책과 `isAdmin` 권한을 동시에 가질 수 있다. 이 경우 회원 목록에는 한 명을 한 행으로만 표시하고, 역할은 `회장 · 관리자` 또는 `총무 · 관리자`처럼 함께 나열한다.

## 3. 프런트엔드 모듈

### 3.1 파일 단위

| 파일 | 역할 |
| --- | --- |
| `index.html` | 로그인, 가입요청, 최초 비밀번호 설정, 대시보드와 역할별 관리 화면의 HTML 구조 |
| `styles.css` | 데스크톱·모바일 레이아웃, 표, 카드, 배지, 모달과 관리 폼 디자인 |
| `app.js` | NAS API 통신, 세션, 권한 판정, 데이터 조회·저장, Markdown 처리와 DOM 렌더링 |

### 3.2 화면 이름

| 화면 ID | 표시 대상 | 역할 |
| --- | --- | --- |
| `loginView` | 비로그인 사용자 | 로그인 ID와 비밀번호 인증 |
| `signupView` | 비로그인 사용자 | 이름·휴대폰번호·로그인 ID로 가입 승인 요청 |
| `passwordChangeView` | 최초 로그인 회원 | 임시 비밀번호를 본인 비밀번호로 변경 |
| `dashboard` | 로그인 회원 | 회원수, 회비, 최근 거래와 NAS 연결 상태 요약 |
| `dues` | 로그인 회원 | 현재 회비기간과 공개 가능한 납부 현황 조회 |
| `members` | 로그인 회원 | 활성 회원과 회장·총무·관리자 역할 카드 조회 |
| `events` | 로그인 회원 | 정기모임·여행·특별모임 일정, 참석자와 결과 조회 |
| `rules` | 로그인 회원 | 현재 게시 규약 요약과 Markdown 원문 열람 |
| `adminPanel` | 시스템 관리자 | 회원 현황, 계정 발급, 상태·직책·관리자 권한 변경, 비밀번호 초기화와 가입 승인 |
| `chairPanel` | 회장·시스템 관리자 | 규약 개정·게시, 일정·참석·결과 관리와 확정 장부 조회 |
| `treasurerPanel` | 총무·시스템 관리자 | 회비정책, 납부기간, 납부상태와 거래 관리 |
| `auditPanel` | 권한 있는 운영진 | 역할별 허용 범위의 변경 이력 조회 |
| `rulesModal` | 로그인 회원 | 규약 Markdown과 보호된 원본 파일 열기 |

### 3.3 `app.js` 기능 그룹

| 기능 그룹 | 주요 이름 | 역할 |
| --- | --- | --- |
| API·세션 | `API_BASE`, `AUTH_KEY`, `apiRequest`, `listPath`, `login`, `refreshAuth` | NAS API 요청과 세션 토큰 관리, 만료 시 로그아웃 처리 |
| 화면 전환 | `showLogin`, `showSignup`, `showPasswordChange`, `showApp` | 인증 상태에 맞는 화면 표시 |
| 권한 판정 | `isAdmin`, `canManageRules`, `canManageFinance`, `isAdminFinanceDelegate` | 관리자·회장·총무 기능 노출과 처리 가능 여부 결정 |
| 공통 표시 | `roleLabel`, `memberRoleLabel`, `formatWon`, `formatDate`, `setConnection` | 역할, 금액, 날짜와 NAS 상태 표시 |
| 회원 표시 | `renderMembers`, `renderMemberRecords` | 회원용 역할 카드와 관리자용 회원 레코드 현황 생성 |
| 회비 표시 | `renderDues`, `renderTransactions` | 회원별 납부상태와 공개 거래내역 표시 |
| 일정 표시 | `renderEvents`, `eventTypeLabel`, `eventStatusLabel` | 일정 종류·상태·참석자·기록 표시 |
| 규약 표시 | `renderRule`, `renderMarkdown`, `showRuleRevisionPreview`, `openProtectedRuleDocument` | 게시 규약, 표, 목록과 보호 원본 처리 |
| 임원 횟수 | `historicalOfficerTableFromMarkdown`, `updateHistoricalOfficerCounts` | `역대 임원진` 표의 회장·총무 횟수를 합산하고 가나다순 자동 생성 |
| 대시보드 조회 | `loadDashboard`, `refreshAllData` | 회원에게 필요한 컬렉션을 병렬 조회하고 화면 갱신 |
| 운영 데이터 | `operationData`, `loadOperations`, `renderOperationControls` | 관리자·회장·총무용 데이터와 폼 선택지 관리 |
| 회원 관리 | `renderMemberRecords`, `approveSignupRequest`, `rejectSignupRequest`, `createTemporaryPassword` | 회원 상태 조회, 가입 승인·거절과 임시 비밀번호 생성 |
| 규약 개정 | `startRuleRevision`, `syncRuleRevisionMetadata`, `convertRuleSourceToMarkdown`, `sortRulesByLastSaved` | 기존본 승계, 버전·시행일 자동 갱신, 원본 변환, 최신 저장순 정렬 |
| 공통 저장 | `submitJsonForm`, `fieldMessage`, 각 폼 `submit` 처리기 | 입력 검증, API 저장, 성공·실패 메시지와 재조회 |

## 4. PocketBase 컬렉션

### 4.1 원본 컬렉션

| 이름 | 유형 | 역할 | 주요 관리 주체 |
| --- | --- | --- | --- |
| `members` | Auth | 로그인 계정과 회원 이름, 로그인 ID, 직책, 활성 상태, 관리자 여부와 최초 비밀번호 변경 상태 | 시스템 관리자 |
| `signup_requests` | Base | 공개 회원가입 요청과 승인 상태 보관. 결정 후 휴대폰번호 제거 | 시스템 관리자 |
| `officer_terms` | Base | 연도별 회장·총무 임기 기록 | 시스템 관리자 |
| `dues_policies` | Base | 연도별 월납·연납 금액과 납부일 정책 | 총무·시스템 관리자 |
| `dues_periods` | Base | 실제 회비 청구기간과 상태 | 총무·시스템 관리자 |
| `dues_payments` | Base | 기간별 회원 납부·면제 상태 | 총무·시스템 관리자 |
| `transactions` | Base | 수입·지출 초안, 확정 상태, 잔액, 증빙과 관리자 대행 사유 | 총무·시스템 관리자 |
| `rules` | Base | 규약 Markdown, 버전, 시행일, 개정 사유, 이전 개정본과 보호 원본 파일 | 회장·시스템 관리자 |
| `events` | Base | 정기모임·여행·특별모임 일정, 장소, 상태와 결과 메모 | 회장·시스템 관리자 |
| `event_attendees` | Base | 일정별 회원 참석예정·참석·불참 상태 | 회장·시스템 관리자 |
| `audit_logs` | Base | 변경 주체, 동작, 업무 영역, 대상 레코드와 변경 필드 기록 | 역할별 제한 조회 |
| `bank_imports` | Base | 은행 원본 파일의 NAS 내부 가져오기 단위 | 총무·시스템 관리자 |
| `bank_transactions` | Base | 가져온 은행 거래와 회원 연결 정보 | 총무·시스템 관리자 |

`users` 컬렉션은 볼쏘의 인증 원본으로 사용하지 않는다. 실제 로그인과 회원 관리는 `members` 컬렉션을 기준으로 한다.

### 4.2 조회 전용 컬렉션

| 이름 | 원본 | 역할 |
| --- | --- | --- |
| `member_directory` | `members` | 활성 회원의 이름, 직책과 관리자 여부를 회원 화면에 제공 |
| `member_dues_status` | `dues_payments`, `dues_periods`, `members` | 회원명과 기간 정보를 결합한 납부 현황 |
| `member_transactions` | `transactions` | 확정됐고 회원 공개가 허용된 거래만 제공 |
| `chair_ledger` | `transactions` | 회장에게 확정 장부와 관리자 대행 사유를 읽기 전용 제공 |

조회 전용 컬렉션은 원본 레코드를 별도로 저장하지 않는다. 원본이 비활성이거나 조회 훅에서 오류가 발생하면 비어 보일 수 있으므로 실제 데이터 확인은 원본 컬렉션에서 한다.

## 5. PocketBase 서버 훅

파일: `backend/pb_hooks/roles_and_audit.pb.js`

| 모듈 이름 | 연결 대상 | 역할 |
| --- | --- | --- |
| `registerAudit` | 주요 업무 컬렉션 | 생성·수정·삭제 요청의 주체, 도메인과 변경 필드만 감사 로그로 기록 |
| 가입요청 정규화 | `signup_requests` | 이름·휴대폰번호·로그인 ID 검증, 중복 ID 차단, 요청 상태와 시각 설정 |
| 가입요청 완료 처리 | `signup_requests` | 승인·거절 후 휴대폰번호 제거, 처리자와 처리시각 기록 |
| `encryptMemberRecord` | `members`, `signup_requests` | 이름과 가입요청 휴대폰번호를 NAS 암호화 키로 저장 전 암호화 |
| `onRecordEnrich` 복호화 | 회원 관련 응답 | 권한 있는 응답에만 이름·휴대폰번호를 복호화하고 나머지는 숨김 |
| `unpublishOlderRuleRevisions` | `rules` | 새 규약을 게시하면 다른 게시본을 자동으로 이력 상태로 변경 |
| 관리자 재정 대행 검증 | `transactions` | 총무가 아닌 관리자의 재정 처리에 5자 이상 사유를 강제 |
| 확정 장부 보호 | `transactions` | 확정 거래 직접 수정·삭제 차단, 생성자·확정자·확정시각 기록 |
| 회비행 자동 생성 | `dues_periods` | 새 납부기간 생성 후 모든 활성 회원의 미납 행을 트랜잭션으로 생성 |

감사 로그에는 비밀번호, 휴대폰번호, 증빙파일, 규약 원본과 은행 원본 내용을 기록하지 않는다.

## 6. PocketBase 마이그레이션

마이그레이션은 파일명의 숫자 순서대로 한 번씩 적용된다. 앞부분은 최초 스키마, 뒷부분은 현재 운영 요구사항을 누적 반영한다.

| 파일 | 역할 |
| --- | --- |
| `1755810000_initial_collections.js` | 회원, 회비기간, 납부, 거래, 규약과 은행 가져오기 기본 컬렉션 생성 |
| `1755810100_secure_defaults.js` | 앱 이름, 요청 제한, 로그 보존과 인증 주체 기록 기본값 설정 |
| `1787448600_harden_member_access.js` | `loginId` 인증, 활성 회원 제한, 회원·회비 조회 뷰와 접근규칙 강화 |
| `1787494564_protect_rule_documents.js` | 규약 문서 필드를 보호 파일로 구성 |
| `1787531400_require_password_change.js` | 최초 로그인 비밀번호 변경 상태와 제한된 본인 비밀번호 변경 경로 추가 |
| `1787531500_set_password_minimum_to_8.js` | 회원 비밀번호 최소 길이를 8자로 설정 |
| `1787533000_add_role_management.js` | 회장·총무·관리자 권한, 임기, 회비정책, 거래 상태, 감사 로그와 회장 장부 추가 |
| `1787533600_add_rule_revisions.js` | 규약 Markdown, 개정 사유, 이전 버전 연결과 다양한 형식의 원본 파일 지원 |
| `1787534200_add_admin_finance_delegation.js` | 관리자 재정 대행 여부와 사유 필드 추가 |
| `1787534300_add_event_schedule.js` | 일정과 참석자 컬렉션, 이벤트 감사 도메인 추가 |
| `1787534400_add_signup_requests.js` | 공개 가입요청과 관리자 승인 컬렉션 추가 |
| `1787534500_encrypt_member_personal_fields.js` | 기존 회원 이름과 가입요청 개인정보를 암호화 상태로 전환 |
| `1787534600_include_admin_in_member_directory.js` | 회원 디렉터리에 관리자 여부를 포함해 별도 관리자 카드 표시 지원 |
| `1787534700_allow_legacy_member_email_login.js` | 과거 호환 검토 단계에서 ID·이메일 인증을 잠시 허용한 이력 |
| `1787534800_restore_login_id_only.js` | 최종 인증 방식을 로그인 ID 전용으로 복원 |

현재 최종 상태는 `loginId` 전용 로그인이다. 마이그레이션 파일은 이미 적용된 NAS 이력을 보존하기 위해 삭제하거나 순서를 바꾸지 않는다.

## 7. NAS 배포 모듈

### 7.1 서비스

| 서비스 이름 | 구현 | 역할 |
| --- | --- | --- |
| `pocketbase` | `deploy/nas/Dockerfile` | 인증, 컬렉션 API, 파일보호, 마이그레이션과 서버 훅 실행 |
| `api` | Caddy | 외부 회원 API 프록시, 보안 헤더, 관리자 API 차단과 규약 변환 경로 분기 |
| `rule-converter` | FastAPI + MarkItDown | 권한 확인 후 PDF·Office·Markdown·텍스트 원본을 Markdown 초안으로 변환 |
| `internal` | Docker network | 세 서비스 간 내부 통신 전용 네트워크 |

### 7.2 배포 파일

| 파일 | 역할 |
| --- | --- |
| `deploy/nas/docker-compose.yml` | 서비스, 영구 볼륨, 읽기 전용 파일시스템, 메모리·권한과 로컬 포트 구성 |
| `deploy/nas/Caddyfile` | 회원 API와 변환 API 라우팅, 관리자 경로 외부 차단과 보안 헤더 |
| `deploy/nas/Dockerfile` | 검증된 PocketBase 바이너리로 비루트 컨테이너 이미지 생성 |
| `deploy/nas/install.sh` | NAS 디렉터리·암호화 키·권한·고정 배포 파일의 최초 설치 |
| `deploy/nas/pull-deploy.sh` | 최신 GitHub 커밋 확인, 릴리스 설치, 컨테이너 재생성, 건강검사와 코드 롤백 |
| `deploy/nas/markitdown/app.py` | 규약 관리자 권한 확인, 파일 크기·확장자 검증과 Markdown 변환 API |
| `deploy/nas/markitdown/Dockerfile` | 변환 서비스를 비루트 사용자로 실행하는 이미지 |
| `deploy/nas/markitdown/requirements.txt` | 변환 서비스 Python 의존성 고정 |

PocketBase 관리자 화면은 NAS의 로컬 전용 포트를 SSH 터널로 연결할 때만 접근한다. 외부 공개 API에서는 관리자 경로를 차단한다.

## 8. 개인정보와 품질 검사

| 파일 | 역할 |
| --- | --- |
| `PRIVACY.md` | 공개 저장소에 넣을 수 있는 소스와 NAS에만 보관할 데이터의 경계 정의 |
| `AGENTS.md` | 자동화 작업이 따라야 하는 개인정보·비밀정보 금지 규칙 |
| `scripts/privacy-check.sh` | 이메일형 값, 사설 IP, 키·토큰, 데이터베이스·문서·로그 파일의 커밋 차단 |
| `.githooks/pre-commit` | 커밋 직전에 개인정보 검사를 자동 실행 |
| `.github/workflows/privacy-check.yml` | push와 pull request마다 동일 검사를 GitHub Actions에서 실행 |
| `.gitignore` | 런타임 데이터, 비밀정보와 생성 파일의 추적 방지 |
| `.gitattributes` | 저장소 파일 처리 방식 통일 |

## 9. 주요 업무 흐름

### 로그인

```text
loginView
  → members/auth-with-password
  → active 확인
  → mustChangePassword=true이면 최초 비밀번호 설정
  → 역할별 대시보드와 관리 메뉴 표시
```

### 회원가입

```text
signupView
  → signup_requests 생성
  → 시스템 관리자 승인
  → members 계정과 임시 비밀번호 생성
  → 신청정보 처리 완료 및 휴대폰번호 제거
  → 회원 최초 로그인에서 본인 비밀번호 설정
```

### 규약 개정

```text
기존 개정본 선택 또는 원본 파일 업로드
  → Markdown 변환·편집
  → 역대 임원진 표가 있으면 역임 횟수 자동 계산
  → 버전·시행일·개정 사유 설정
  → 새 rules 레코드 저장
  → 게시 시 기존 게시본 자동 해제
```

### 회비와 장부

```text
연도별 회비정책
  → 납부기간 생성
  → 활성 회원별 납부행 자동 생성
  → 납부상태 갱신
  → 거래 초안 작성
  → 총무 또는 사유를 남긴 시스템 관리자가 확정
  → 회원 공개 거래와 회장 읽기 전용 장부에 반영
```

### 일정과 참석

```text
일정 등록
  → 참석자와 예정 상태 등록
  → 모임 후 참석·불참 갱신
  → 일정 상태와 결과 메모 저장
  → 회원 대시보드에서 일정·참석자·기록 조회
```

## 10. 데이터의 기준 위치

| 대상 | 기준 위치 |
| --- | --- |
| 화면과 기능 코드 | GitHub 저장소 |
| 컬렉션 스키마와 권한 | `backend/pb_migrations` |
| 자동 검증과 업무 규칙 | `backend/pb_hooks` |
| 실제 회원·회비·거래·규약 데이터 | NAS `pb_data` 런타임 |
| 회원정보 암호화 키 | NAS 비밀 환경파일 |
| 규약·증빙·은행 원본 | NAS 보호 파일 필드 |
| 자동 배포 상태와 로그 | NAS 배포 상태·로그 디렉터리 |

소스 코드 롤백은 데이터베이스 마이그레이션을 자동으로 되돌리지 않는다. 데이터 구조 변경은 새 마이그레이션을 추가하고, 실제 데이터 복구는 별도 NAS 백업을 기준으로 수행한다.
