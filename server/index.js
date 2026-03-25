// Express + Socket.io 서버 진입점
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');
const { initSocketEvents } = require('./roomManager');

const PORT = process.env.PORT || 3000;

// Express 앱 설정
const app = express();
const server = http.createServer(app);

// Socket.io 설정
const io = new Server(server, {
  cors: { origin: '*' }
});

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, '..', 'public')));

// 헬스체크 엔드포인트
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 국가별 메달 API (스코어보드용)
app.get('/api/medals', (req, res) => {
  const medals = db.getCountryMedals();
  res.json(medals);
});

// DB 초기화
db.initDB();
console.log('[DB] 데이터베이스 초기화 완료');

// 소켓 이벤트 초기화
initSocketEvents(io);

// 서버 시작
server.listen(PORT, () => {
  console.log(`[Server] 올림픽 게임 서버 시작: http://localhost:${PORT}`);
});

// graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] 서버 종료 중...');
  db.close();
  server.close(() => {
    process.exit(0);
  });
});
