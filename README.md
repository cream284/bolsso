# bolsso

모임 일정과 멤버, 회비, 할 일을 한곳에서 관리하고 운영 규약을 함께 공유하는 한국어 웹 대시보드입니다.

## 주요 기능

- 다가오는 모임과 월간 일정 확인
- 활동 멤버와 회비 현황 요약
- 운영진 할 일 관리
- 새 모임 추가
- 모임 운영 규약 열람과 Markdown 개정 이력 관리
- 데스크톱과 모바일에 대응하는 반응형 화면

## 실행 방법

별도의 설치 과정 없이 `index.html`을 브라우저에서 열어 확인할 수 있습니다.

로컬 웹 서버로 실행하려면 다음 명령을 사용하세요.

```bash
python3 -m http.server 8000
```

실행 후 브라우저에서 <http://localhost:8000>으로 접속합니다.

## 프로젝트 구조

```text
bolsso/
├── backend/      # PocketBase 스키마와 서버 훅
├── deploy/nas/   # Synology Docker 자동 배포 구성
├── index.html    # 대시보드 화면
├── styles.css    # 레이아웃과 반응형 스타일
├── app.js        # 모임, 할 일, 모달 인터랙션
└── README.md
```

공개 가능한 기능 개요는 [`MODULES.md`](MODULES.md)를 참고합니다. 보안과 운영 세부사항은 공개하지 않습니다.

## 데이터와 보안 원칙

- GitHub Pages에는 정적 화면 코드만 배포합니다.
- 로그인, 회원, 회비, 거래 및 규약 데이터는 개인 NAS의 PocketBase에 저장합니다. 비밀번호는 PocketBase가 해시로 저장하고, 이름·가입 요청의 휴대폰번호 같은 식별정보는 NAS 비밀키 기반 AES-256-GCM으로 암호화합니다. 로그인한 회원에게는 기존 권한 규칙에 따라 서버가 필요한 범위만 복호화해 응답합니다.
- 모든 로그인 회원은 회원 이름과 회비 납부 여부를 볼 수 있습니다.
- 이메일과 원본 은행 거래 파일은 운영진에게만 공개합니다.
- NAS의 Docker 소켓, PocketBase 관리자 화면, 비밀 키는 외부에 공개하지 않습니다.
- 규약 원본(PDF·Word·PowerPoint·Excel·Markdown·텍스트)은 NAS의 보호 파일로 보관합니다. 회장은 NAS 내부 MarkItDown 변환 결과를 검토·수정한 뒤 새 개정본으로 게시합니다.
- 스캔 이미지형 PDF는 텍스트 추출이 되지 않을 수 있으므로 Markdown 내용을 직접 보완해야 합니다.
- NAS 자동 배포 방법은 [`deploy/nas/README.md`](deploy/nas/README.md)를 참고합니다.

## GitHub Pages 배포

이 프로젝트는 정적 웹사이트이므로 별도의 빌드 과정 없이 GitHub Pages에 배포할 수 있습니다.

1. 변경사항을 `main` 브랜치에 푸시합니다.
2. GitHub 저장소의 **Settings → Pages**로 이동합니다.
3. **Source**에서 `Deploy from a branch`를 선택합니다.
4. 브랜치를 `main`, 폴더를 `/(root)`로 선택하고 저장합니다.

배포가 완료되면 `https://cream284.github.io/bolsso/`에서 확인할 수 있습니다.
