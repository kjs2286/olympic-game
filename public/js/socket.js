// 소켓 통신 모듈
const SocketManager = (() => {
  let socket = null;
  const listeners = new Map();

  // 소켓 연결 초기화
  function connect() {
    socket = io();

    socket.on('connect', () => {
      console.log('[Socket] 연결 성공:', socket.id);
      emit('_connected');
    });

    socket.on('disconnect', () => {
      console.log('[Socket] 연결 해제');
      emit('_disconnected');
    });

    // 서버 이벤트 리스닝 (자동 포워딩)
    const serverEvents = [
      'lobby_info', 'room_list', 'room_joined', 'room_updated',
      'game_started', 'game_playing', 'game_state', 'game_finished',
      'coin_update', 'return_to_lobby', 'leaderboard',
      'daily_limit_reached', 'insufficient_coins', 'error'
    ];

    serverEvents.forEach(evt => {
      socket.on(evt, (data) => {
        emit(evt, data);
      });
    });
  }

  // 서버로 이벤트 전송
  function send(event, data) {
    if (socket && socket.connected) {
      socket.emit(event, data);
    }
  }

  // 내부 이벤트 리스너 등록
  function on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(callback);
  }

  // 내부 이벤트 리스너 제거
  function off(event, callback) {
    if (!listeners.has(event)) return;
    const cbs = listeners.get(event);
    const idx = cbs.indexOf(callback);
    if (idx !== -1) cbs.splice(idx, 1);
  }

  // 내부 이벤트 발생
  function emit(event, data) {
    const cbs = listeners.get(event);
    if (cbs) cbs.forEach(cb => cb(data));
  }

  return { connect, send, on, off };
})();
