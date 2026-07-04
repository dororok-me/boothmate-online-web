# BoothmateOnline — 정책 & 구현 명세서 (인계 문서)

> **목적**: 데스크탑 앱(BoothmateG) 작업 세션에서 확정한 BoothmateOnline 웹 서비스의 사업 정책·DB 구조·구현 청사진을 한 곳에 정리한 인계 문서.
> 새 대화창(이 레포 디렉토리)에서 이 파일을 읽고 곧바로 이어서 구현하기 위함.
>
> - **작성일**: 2026-06-27
> - **이 레포**: `boothmate-online-web` (웹 통역 서비스) — 데스크탑 앱(`C:\BoothmateG_Windows`)과 **완전 별개**
> - **타겟 사용자**: **전문 통역사 보조 도구** (정확도·용어집·입소문·가격 정책이 여기에 맞춰짐)

---

## 0. 프로젝트 구분 (헷갈리지 말 것)

| 구분 | BoothmateG (데스크탑) | **BoothmateOnline (이 레포)** |
|---|---|---|
| 형태 | Electron 데스크탑 앱 | 웹에서 도는 서비스 (HTML/JS) |
| 위치 | `C:\BoothmateG_Windows` | GitHub `dororok-me/boothmate-online-web` |
| 번역 엔진 | Gemini API + Firebase(청중 QR) | Gemini Live (중계 서버 Railway 경유) |

---

## 1. 현재 구현 상태 (코드 기준, 2026-06-27)

이미 들어가 있는 것 (`index.html` 변경 로그 기준):

- **구글 로그인 게이트** (v0.9.85~86): 로그인해야 통역 사용. OAuth 클라이언트 ID 박힘. `ALLOWED_EMAILS` 비움=누구나 통과.
- **무료 쿼터(방식 A, localStorage)** (v0.9.87~90): 신규 로그인 시 **5시간(18000초)** 부여, 이메일별 `boothmate_quota_<이메일>` 저장. 상단에 "남은 시간" 배지. 통역 중 1초씩 차감.
- **5분 세션 제한** (v0.9.96~97): 시작 후 5분이면 자동 정지(비용 누수 방지). 창 닫힘/이탈 시 자동 정지(pagehide).
- **무제한 계정**: `UNLIMITED_EMAILS` (현재 `dororok@gmail.com`) → 5분/5시간 모두 면제, 배지 "무제한".
- **중계 서버 모드**: `RELAY_SERVER_URL = wss://boothmateonline-production.up.railway.app`, 베타 통과키 `RELAY_PASS_KEY = boothmate2026secure` (server-beta.js v3.0.0과 짝). **티켓 방식(`?ticket=`)도 코드에 있음** → 결제 연동 시 전환 예정.
- **용어집(글로서리)**: 양방향, 프롬프트 주입 + 후처리 치환 + 수동 변이형 3중. localStorage 저장. CSV/TXT/Excel 입출력.
- **환율·도량형 환산**: `currency.js`. 자막 금액에 괄호로 환산값 병기.
- **오버레이/OBS 모드**: `overlay.html`, BroadcastChannel 수신. `?obs`로 투명 합성.
- **세션 자동 저장**: 정지/새 시작 시 원문+번역 localStorage 저장(최대 50세션).

> ⚠️ **핵심 한계**: 현재 쿼터·등급 통제가 **브라우저 localStorage**라서 시크릿창/다른 브라우저/저장값 삭제로 리셋 가능(정직한 사용자용). **진짜 통제는 이 명세서의 Firebase 서버 기반(방식 B)으로 전환**해야 함. 비용 폭주 1차 방어는 GCP 동시세션 5개 제한.

---

## 2. 사업 정책 (확정)

### 2.1 요금 / 등급

| 등급(grade) | 가격 | 권한 |
|---|---|---|
| **무료 체험(free)** | 0원 | 30분 1회 + 통역 + (체험 중) 용어집 사용 |
| **1시간권(1h)** | (확정 요금) | **통역만** — 용어집 저장/내보내기 잠금 |
| **5시간권(5h)** | (확정 요금) | **전 기능** — 용어집·불러오기·내보내기 |
| **10시간권(10h)** | (확정 요금) | 전 기능 (5h과 동일 권한, 시간만 많음) |

> 💡 요금 숫자는 이번 세션에서 "그대로 확정"으로 합의됨. 실제 금액은 구현 시 결제 상품 설정에 반영(아래 8장 TODO).
> ⚠️ 현재 코드의 무료 쿼터는 **5시간**으로 되어 있으나, 새 정책의 무료 체험은 **30분 1회**. 구현 시 `FREE_QUOTA_SECONDS`를 1800으로 조정 + 1회 제한 로직 추가 필요.

### 2.2 정책 규칙

- **무료 체험**: 30분(1800초), 휴대폰 번호당 1회만 (중복 차단).
- **단어장 lock-in**: 무료 체험 종료 시 사용자가 만든 단어장을 잠금(`locked=true`). **5시간권 이상 구매 시 해제**. → 재구매 유도 장치.
- **지인 평생 50% 할인**: 화이트리스트 이메일은 가입 시 `discount=0.5` 영구 적용.
- **매 구매 시 휴대폰 재인증**: 결제 직전 휴대폰 인증 통과해야 구매 기록.

---

## 3. Firebase 데이터 구조 (제안)

> 이미 쓰고 있는 Firebase(청중 QR의 그것) 위에 얹음.

```
users/{uid}/
  profile:          { email, phone, name, createdAt }
  remainingSeconds: 1800            // 잔여 시간(초). 무료=1800(30분)
  grade:            "free"|"1h"|"5h"|"10h"   // 보유 등급(기능 권한)
  trialUsed:        true            // 무료 체험 소진 여부
  discount:         0.5             // 지인 할인(없으면 없음)

users/{uid}/glossaries/{gid}/       // 단어장 — 행사별
  eventName:        "ABC 컨퍼런스"
  date:             "2026-07-01"
  entries:          [{a, b, synA, synB}, ...]   // synA/synB = 언어별 별칭 (v1.13.52)
  locked:           false           // 무료 종료 후 true → 5h+ 사야 해제

users/{uid}/purchases/{pid}/        // 구매 내역
  product, amount, paymentKey, orderId, ts

premiumEmails/{이메일}:  { discount: 0.5 }   // 지인 화이트리스트(관리자)
phoneVerified/{번호해시}: { uid, ts }         // 번호당 무료체험 1회(중복 차단)
```

---

## 4. 정책 → 필드 매핑

| 정책 | 처리 위치 |
|---|---|
| 잔여 시간 차감 | `remainingSeconds` (시작 시 카운트, 0되면 자동 중지) |
| 무료 체험 30분·1회 | `trialUsed` + `phoneVerified/{번호}` (번호 중복 차단) |
| 1시간권=통역만 | `grade` 검사 → 단어장/내보내기 버튼 잠금 |
| 5h+=전 기능 | `grade in [5h,10h]` → 단어장·불러오기·내보내기 허용 |
| 단어장 lock-in | `glossaries.locked` (무료 종료 시 잠금, 5h+ 구매 시 해제) |
| 지인 평생 50% | `premiumEmails` 등록 → 가입 시 `discount=0.5` |
| 매 구매 문자 인증 | 결제 직전 휴대폰 재인증 → 통과해야 `purchases` 기록 |

---

## 5. 권한 체크 (핵심 로직)

```js
const canUseGlossary = grade === 'free_trial_active' || ['5h','10h'].includes(grade)
const canExport      = ['5h','10h'].includes(grade)
const canInterpret   = remainingSeconds > 0
```

---

## 6. 결제 → 시간 적립 흐름

```
토스 결제 성공 → 백엔드 승인(secretKey) → amount 검증
  → users/{uid}/remainingSeconds += 구매시간
  → grade 갱신 → glossaries.locked = false (5h+면)
```

- 토스 결제창 데모는 작동 확인됨(이전 세션, localhost:4321 데모 서버).
- **백엔드 승인은 secretKey로 서버에서** 처리(클라이언트 노출 금지).

---

## 7. 구현 로드맵

1. **기능 명세서** (이 문서) — 정책 → 화면·DB·등급 체크·관리자 페이지 청사진. ✅ (이 파일)
2. **Firebase 연동** — 기존 localStorage 쿼터(방식 A)를 서버 기반(방식 B)으로 전환. `users/{uid}` 구조 생성, 로그인 시 프로필/쿼터 동기화.
3. **결제 백엔드** — 토스 secretKey로 최종 승인 + amount 검증 + `remainingSeconds` 적립 + `grade` 갱신.
4. **등급 게이팅 UI** — `canUseGlossary`/`canExport`/`canInterpret`로 버튼 잠금·해제. 단어장 lock-in.
5. **휴대폰 인증** — 무료 체험 1회 차단 + 구매 시 재인증.
6. **관리자 페이지** — `premiumEmails`(지인 할인) 등록, 사용 현황.

---

## 8. 미결/TODO (구현 시 확정할 것)

- [ ] 1h/5h/10h **실제 판매 금액** 숫자 확정 → 토스 상품 설정 반영.
- [ ] 무료 체험 `FREE_QUOTA_SECONDS` 5시간 → **30분(1800)** 으로 조정 + 1회 제한.
- [ ] 휴대폰 인증 수단 선택(예: Firebase Phone Auth vs 외부 SMS).
- [ ] `grade` 상태 머신: 무료체험 중 = `free_trial_active`, 소진 후 = `free`(만료) 구분 명확화.
- [ ] 중계 서버를 **통과키 방식 → 티켓(결제 연동) 방식**으로 전환 (`RELAY_PASS_KEY` 비우면 티켓 방식 활성).
- [ ] Firebase 보안 규칙(유저별 read/write 격리).

---

## 부록 A. 참고 상수 (현재 코드)

- `RELAY_SERVER_URL = wss://boothmateonline-production.up.railway.app`
- `RELAY_PASS_KEY = boothmate2026secure` (베타 통과키, 결제 연동 시 비움)
- `FREE_QUOTA_SECONDS = 18000` (현재 5시간 → 새 정책 1800초로 변경 예정)
- `SESSION_LIMIT_MS` = 5분 (세션당 자동 정지)
- `UNLIMITED_EMAILS` = `["dororok@gmail.com"]`
