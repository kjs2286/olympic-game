// 게임방 생성/관리 및 소켓 이벤트 처리 모듈
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const Sprint100m = require('./games/sprint100m');

// 활성 게임방 목록 { roomId: roomObject }
const rooms = new Map();

// 소켓ID → userId 매핑
const socketToUser = new Map();
// userId → socketId 매핑
const userToSocket = new Map();
// userId → roomId 매핑
const userToRoom = new Map();

// 방 객체 생성 헬퍼
function createRoomObject(gameType, hostUserId) {
  return {
    id: uuidv4().slice(0, 8),
    gameType,
    players: [],
    hostUserId,
    status: 'waiting', // 'waiting' | 'playing' | 'finished'
    game: null,        // 게임 인스턴스 (GameBase 하위 클래스)
    maxPlayers: 6,
    createdAt: Date.now()
  };
}

// 방 목록 조회 (로비에 표시할 데이터)
function getRoomList() {
  const list = [];
  for (const [id, room] of rooms) {
    list.push({
      roomId: room.id,
      gameType: room.gameType,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      status: room.status,
      hostNickname: room.players.length > 0 ? room.players[0].nickname : ''
    });
  }
  return list;
}

// 소켓 이벤트 초기화
function initSocketEvents(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] 연결: ${socket.id}`);

    // --- 로비 입장 ---
    socket.on('join_lobby', (data) => {
      const { userId, nickname, countryCode } = data;
      if (!userId || !nickname) {
        socket.emit('error', { message: '유효하지 않은 유저 정보입니다.' });
        return;
      }

      socketToUser.set(socket.id, userId);
      userToSocket.set(userId, socket.id);

      // DB에 유저가 없으면 생성
      let user = db.getUser(userId);
      if (!user) {
        db.createUser(userId, nickname, countryCode || 'UN');
      } else {
        db.updateLastActive(userId);
      }

      // 현재 코인, 일일 플레이 횟수 전송
      const coins = db.getCoins(userId);
      const dailyPlays = db.getDailyPlayCount(userId);

      socket.emit('lobby_info', {
        coins,
        dailyPlays,
        maxDailyPlays: 3,
        resetAt: db.getResetTime()
      });

      // 방 목록 전송
      socket.emit('room_list', getRoomList());
    });

    // --- 방 생성 ---
    socket.on('create_room', (data) => {
      const userId = socketToUser.get(socket.id);
      if (!userId) return;

      // 이미 방에 있으면 거부
      if (userToRoom.has(userId)) {
        socket.emit('error', { message: '이미 방에 참가 중입니다.' });
        return;
      }

      const user = db.getUser(userId);
      if (!user) return;

      const gameType = data.gameType || 'sprint100m';
      const room = createRoomObject(gameType, userId);

      // 플레이어 추가
      room.players.push({
        userId,
        nickname: user.nickname,
        countryCode: user.country_code,
        index: 0
      });

      rooms.set(room.id, room);
      userToRoom.set(userId, room.id);
      socket.join(room.id);

      socket.emit('room_joined', {
        roomId: room.id,
        players: room.players,
        yourIndex: 0,
        isHost: true
      });

      // 모든 클라이언트에 방 목록 업데이트
      io.emit('room_list', getRoomList());
    });

    // --- 방 입장 ---
    socket.on('join_room', (data) => {
      const userId = socketToUser.get(socket.id);
      if (!userId) return;

      if (userToRoom.has(userId)) {
        socket.emit('error', { message: '이미 방에 참가 중입니다.' });
        return;
      }

      const room = rooms.get(data.roomId);
      if (!room) {
        socket.emit('error', { message: '존재하지 않는 방입니다.' });
        return;
      }
      if (room.status !== 'waiting') {
        socket.emit('error', { message: '이미 게임이 진행 중인 방입니다.' });
        return;
      }
      if (room.players.length >= room.maxPlayers) {
        socket.emit('error', { message: '방이 가득 찼습니다.' });
        return;
      }

      const user = db.getUser(userId);
      if (!user) return;

      const playerIndex = room.players.length;
      room.players.push({
        userId,
        nickname: user.nickname,
        countryCode: user.country_code,
        index: playerIndex
      });

      userToRoom.set(userId, room.id);
      socket.join(room.id);

      socket.emit('room_joined', {
        roomId: room.id,
        players: room.players,
        yourIndex: playerIndex,
        isHost: false
      });

      // 방 내 다른 플레이어들에게 업데이트
      io.to(room.id).emit('room_updated', { players: room.players });
      io.emit('room_list', getRoomList());
    });

    // --- 방 나가기 ---
    socket.on('leave_room', () => {
      handleLeaveRoom(socket, io);
    });

    // --- 게임 시작 (방장만) ---
    socket.on('start_game', () => {
      const userId = socketToUser.get(socket.id);
      if (!userId) return;

      const roomId = userToRoom.get(userId);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      // 방장 확인
      if (room.hostUserId !== userId) {
        socket.emit('error', { message: '방장만 게임을 시작할 수 있습니다.' });
        return;
      }

      // 최소 인원 확인
      if (room.players.length < 2) {
        socket.emit('error', { message: '최소 2명이 필요합니다.' });
        return;
      }

      if (room.status !== 'waiting') {
        socket.emit('error', { message: '이미 게임이 진행 중입니다.' });
        return;
      }

      // 각 플레이어 코인/일일 횟수 체크
      for (const player of room.players) {
        const coins = db.getCoins(player.userId);
        if (coins < 1) {
          const playerSocket = io.sockets.sockets.get(userToSocket.get(player.userId));
          if (playerSocket) {
            playerSocket.emit('insufficient_coins', { current: coins });
          }
          socket.emit('error', { message: `${player.nickname}님의 코인이 부족합니다.` });
          return;
        }

        const dailyPlays = db.getDailyPlayCount(player.userId);
        if (dailyPlays >= 3) {
          const playerSocket = io.sockets.sockets.get(userToSocket.get(player.userId));
          if (playerSocket) {
            playerSocket.emit('daily_limit_reached', { resetAt: db.getResetTime() });
          }
          socket.emit('error', { message: `${player.nickname}님의 일일 플레이 횟수가 초과되었습니다.` });
          return;
        }
      }

      // 코인 차감 및 일일 횟수 증가
      for (const player of room.players) {
        db.deductGameCost(player.userId);
        db.incrementDailyPlay(player.userId);
      }

      // 게임 인스턴스 생성
      room.status = 'playing';
      if (room.gameType === 'sprint100m') {
        room.game = new Sprint100m(room, io);
      }

      // 각 플레이어에게 갱신된 코인/횟수 전송
      for (const player of room.players) {
        const playerSocketId = userToSocket.get(player.userId);
        const playerSocket = io.sockets.sockets.get(playerSocketId);
        if (playerSocket) {
          playerSocket.emit('lobby_info', {
            coins: db.getCoins(player.userId),
            dailyPlays: db.getDailyPlayCount(player.userId),
            maxDailyPlays: 3,
            resetAt: db.getResetTime()
          });
        }
      }

      room.game.start();
      io.emit('room_list', getRoomList());

      // game_finished 이벤트 리스닝 (메달 수여)
      // Sprint100m이 직접 emit하므로, 별도 리스너 대신 타이머로 결과 처리
      waitForGameFinish(room, io);
    });

    // --- 게임 중 플레이어 입력 ---
    socket.on('player_input', (data) => {
      const userId = socketToUser.get(socket.id);
      if (!userId) return;

      const roomId = userToRoom.get(userId);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room || !room.game) return;

      room.game.onPlayerInput(userId, data);
    });

    // --- 리더보드 요청 ---
    socket.on('request_leaderboard', () => {
      const medals = db.getCountryMedals();
      socket.emit('leaderboard', { medals });
    });

    // --- 연결 해제 ---
    socket.on('disconnect', () => {
      console.log(`[Socket] 연결 해제: ${socket.id}`);
      handleLeaveRoom(socket, io);
      const userId = socketToUser.get(socket.id);
      if (userId) {
        socketToUser.delete(socket.id);
        userToSocket.delete(userId);
      }
    });
  });
}

// 게임 종료 대기 및 메달 수여 처리
function waitForGameFinish(room, io) {
  const checkInterval = setInterval(() => {
    if (!room.game || room.game.state === 'finished') {
      clearInterval(checkInterval);

      if (room.game && room.game.results) {
        // 메달 수여 및 코인 보상
        const medalTypes = ['gold', 'silver', 'bronze'];
        const coinRewards = {};

        room.game.results.forEach((result, index) => {
          if (index < 3 && result.finishTime !== null) {
            const medal = medalTypes[index];
            const reward = db.awardMedal(result.userId, result.countryCode, room.gameType, medal);
            coinRewards[result.userId] = {
              medal,
              reward,
              totalCoins: db.getCoins(result.userId)
            };
          } else {
            coinRewards[result.userId] = {
              medal: null,
              reward: 0,
              totalCoins: db.getCoins(result.userId)
            };
          }
        });

        // 각 플레이어에게 코인 정보 전송
        for (const player of room.players) {
          const playerSocketId = userToSocket.get(player.userId);
          const playerSocket = io.sockets.sockets.get(playerSocketId);
          if (playerSocket) {
            playerSocket.emit('coin_update', coinRewards[player.userId] || {});
            playerSocket.emit('lobby_info', {
              coins: db.getCoins(player.userId),
              dailyPlays: db.getDailyPlayCount(player.userId),
              maxDailyPlays: 3,
              resetAt: db.getResetTime()
            });
          }
        }
      }

      // 10초 후 방 정리 및 로비 복귀
      setTimeout(() => {
        room.status = 'finished';
        io.to(room.id).emit('return_to_lobby', {});

        // 플레이어들 방에서 제거
        for (const player of room.players) {
          userToRoom.delete(player.userId);
          const sid = userToSocket.get(player.userId);
          const s = io.sockets.sockets.get(sid);
          if (s) s.leave(room.id);
        }

        rooms.delete(room.id);
        io.emit('room_list', getRoomList());
      }, 10000);
    }
  }, 500);
}

// 방 나가기 처리
function handleLeaveRoom(socket, io) {
  const userId = socketToUser.get(socket.id);
  if (!userId) return;

  const roomId = userToRoom.get(userId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) {
    userToRoom.delete(userId);
    return;
  }

  // 게임 중이면 나가기 무시 (연결 끊김은 별도 처리)
  if (room.status === 'playing') {
    // 게임 중 이탈 — 해당 플레이어 progress 유지, 나중에 정리
    return;
  }

  // 플레이어 제거
  room.players = room.players.filter(p => p.userId !== userId);
  userToRoom.delete(userId);
  socket.leave(roomId);

  // 방이 비었으면 삭제
  if (room.players.length === 0) {
    if (room.game) room.game.cleanup();
    rooms.delete(roomId);
  } else {
    // 방장이 나갔으면 다음 사람이 방장
    if (room.hostUserId === userId) {
      room.hostUserId = room.players[0].userId;
    }
    // 인덱스 재할당
    room.players.forEach((p, i) => { p.index = i; });
    io.to(roomId).emit('room_updated', { players: room.players, hostUserId: room.hostUserId });
  }

  io.emit('room_list', getRoomList());
}

module.exports = { initSocketEvents };
