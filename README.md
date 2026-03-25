# Olympic Mini Games

실시간 멀티플레이어 올림픽 미니게임 웹앱

## 실행 방법

```bash
cd olympic-game
npm install
node server/index.js
```

→ http://localhost:3000 에서 확인

## 현재 종목

- 🏃 100m 달리기 — 좌/우 키를 번갈아 눌러 달리기

## 조작법

- **PC**: ← → 화살표 키 번갈아 누르기
- **모바일**: 하단 ⬅ ➡ 버튼 터치

## 규칙

- 방당 최대 6명, 최소 2명이면 시작 가능
- 게임 참가 비용: 1코인
- 메달 보상: 금 +3, 은 +2, 동 +1 코인
- 신규 유저 초기 코인: 3개
- 일일 최대 3회 플레이 (UTC 기준 자정 리셋)

## 기술 스택

- Node.js + Express + Socket.io
- Canvas API (도트 그래픽)
- SQLite3 (better-sqlite3)
