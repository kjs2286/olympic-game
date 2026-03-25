// 로비 화면 로직
const Lobby = (() => {
  let rooms = [];

  function init() {
    // 방 생성 버튼
    document.getElementById('btn-create-room').addEventListener('click', () => {
      SocketManager.send('create_room', { gameType: 'sprint100m' });
    });

    // 스코어보드 버튼
    document.getElementById('btn-scoreboard').addEventListener('click', () => {
      SocketManager.send('request_leaderboard');
      App.showScreen('scoreboard');
    });

    // 서버 이벤트 리스닝
    SocketManager.on('room_list', (data) => {
      rooms = data;
      renderRoomList();
    });

    SocketManager.on('room_joined', (data) => {
      WaitingRoom.enter(data);
      App.showScreen('waiting');
    });
  }

  // 방 목록 렌더링
  function renderRoomList() {
    const container = document.getElementById('room-list');
    const waitingRooms = rooms.filter(r => r.status === 'waiting');

    if (waitingRooms.length === 0) {
      container.innerHTML = '<div class="no-rooms">대기 중인 방이 없습니다.<br>새 방을 만들어보세요!</div>';
      return;
    }

    container.innerHTML = waitingRooms.map(r => `
      <div class="room-card" data-room-id="${r.roomId}">
        <div class="room-info">
          <div class="game-type">🏃 100m 달리기</div>
          <div class="host">방장: ${r.hostNickname}</div>
        </div>
        <div class="player-count">${r.playerCount}/${r.maxPlayers}</div>
      </div>
    `).join('');

    // 방 클릭 이벤트
    container.querySelectorAll('.room-card').forEach(card => {
      card.addEventListener('click', () => {
        const roomId = card.dataset.roomId;
        SocketManager.send('join_room', { roomId });
      });
    });
  }

  return { init, renderRoomList };
})();
