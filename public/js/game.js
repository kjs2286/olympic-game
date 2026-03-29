// 대기실 + 게임 화면 공통 로직

// ===== 대기실 =====
const WaitingRoom = (() => {
  let roomId = null;
  let players = [];
  let isHost = false;
  let myIndex = 0;

  function enter(data) {
    roomId = data.roomId;
    players = data.players;
    myIndex = data.yourIndex;
    isHost = data.isHost;
    render();
  }

  function render() {
    document.getElementById('waiting-room-id').textContent = `ROOM: ${roomId}`;

    const container = document.getElementById('waiting-players');
    let html = '';
    for (let i = 0; i < 6; i++) {
      const p = players[i];
      if (p) {
        const flagEmoji = App.getFlag(p.countryCode);
        const isBot = p.isBot || (p.userId && p.userId.startsWith('bot-'));
        const hostTag = (i === 0 && !isBot) ? '<div class="slot-host">👑 HOST</div>' : '';
        const botTag = isBot ? '<div class="slot-host">🤖 CPU</div>' : '';
        html += `
          <div class="player-slot occupied">
            <div class="slot-flag">${flagEmoji}</div>
            <div class="slot-name">${p.nickname}</div>
            ${hostTag}${botTag}
          </div>`;
      } else {
        html += '<div class="player-slot empty"><div class="slot-flag">❓</div><div class="slot-name">대기중...</div></div>';
      }
    }
    container.innerHTML = html;

    // 시작 버튼 표시 (방장만)
    const startBtn = document.getElementById('btn-start-game');
    startBtn.style.display = isHost ? 'inline-block' : 'none';
    startBtn.disabled = players.length < 2;
  }

  function init() {
    document.getElementById('btn-start-game').addEventListener('click', () => {
      SocketManager.send('start_game', {});
    });

    document.getElementById('btn-leave-room').addEventListener('click', () => {
      SocketManager.send('leave_room', {});
      App.showScreen('lobby');
    });

    SocketManager.on('room_updated', (data) => {
      players = data.players;
      if (data.hostUserId) {
        isHost = (players[0] && players[0].userId === App.getUserId());
      }
      render();
    });

    SocketManager.on('game_started', (data) => {
      GameScreen.startCountdown(data);
      App.showScreen('game');
    });
  }

  return { init, enter, getRoomId: () => roomId };
})();

// ===== 게임 화면 공통 =====
const GameScreen = (() => {
  let countdownValue = 3;
  let countdownInterval = null;
  let gameActive = false;

  function startCountdown(data) {
    countdownValue = data.countdown;
    const overlay = document.getElementById('countdown-overlay');
    overlay.classList.remove('hidden');
    overlay.textContent = countdownValue;

    document.querySelector('.input-buttons').classList.add('hidden');

    countdownInterval = setInterval(() => {
      countdownValue--;
      if (countdownValue > 0) {
        overlay.textContent = countdownValue;
      } else if (countdownValue === 0) {
        overlay.textContent = 'GO!';
      } else {
        clearInterval(countdownInterval);
        overlay.classList.add('hidden');
        document.querySelector('.input-buttons').classList.remove('hidden');
        gameActive = true;
      }
    }, 1000);
  }

  function init() {
    // 입력 버튼 이벤트
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');

    function handleInput(key) {
      if (!gameActive) return;
      SocketManager.send('player_input', { key });

      // 시각적 피드백
      const btn = key === 'left' ? btnLeft : btnRight;
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 80);
    }

    // 키보드 입력
    document.addEventListener('keydown', (e) => {
      if (!gameActive) return;
      if (e.code === 'ArrowLeft') { e.preventDefault(); handleInput('left'); }
      if (e.code === 'ArrowRight') { e.preventDefault(); handleInput('right'); }
    });

    // 터치/클릭 입력
    btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput('left'); });
    btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput('right'); });
    btnLeft.addEventListener('mousedown', (e) => { e.preventDefault(); handleInput('left'); });
    btnRight.addEventListener('mousedown', (e) => { e.preventDefault(); handleInput('right'); });

    // 게임 상태 수신
    SocketManager.on('game_state', (data) => {
      Sprint100mRenderer.updateState(data);
    });

    SocketManager.on('game_playing', () => {
      // 카운트다운 끝, 게임 시작
    });

    // 게임 종료
    SocketManager.on('game_finished', (data) => {
      gameActive = false;
      document.querySelector('.input-buttons').classList.add('hidden');
      ResultScreen.show(data);
    });
  }

  function stop() {
    gameActive = false;
    if (countdownInterval) clearInterval(countdownInterval);
  }

  return { init, startCountdown, stop, isActive: () => gameActive };
})();

// ===== 결과 화면 =====
const ResultScreen = (() => {
  let returnTimer = null;

  function show(data) {
    const container = document.getElementById('result-rankings');
    const medalEmojis = { gold: '🥇', silver: '🥈', bronze: '🥉' };
    const rowClasses = { gold: 'gold-row', silver: 'silver-row', bronze: 'bronze-row' };

    let html = '';
    data.rankings.forEach((r, i) => {
      const medal = r.medal ? medalEmojis[r.medal] : '';
      const rowClass = r.medal ? rowClasses[r.medal] : '';
      const timeStr = r.finishTime ? `${(r.finishTime / 1000).toFixed(2)}s` : 'DNF';
      const flag = App.getFlag(r.countryCode);

      html += `
        <div class="result-row ${rowClass}">
          <div class="rank">${i + 1}</div>
          <div class="player-info">
            <div class="name">${flag} ${r.nickname}</div>
            <div class="time">${timeStr}</div>
          </div>
          <div class="medal">${medal}</div>
        </div>`;
    });
    container.innerHTML = html;

    App.showScreen('result');

    // 10초 카운트다운 후 로비 복귀
    let sec = 10;
    const timerEl = document.getElementById('return-timer');
    timerEl.textContent = `${sec}초 후 로비로 이동합니다`;
    returnTimer = setInterval(() => {
      sec--;
      timerEl.textContent = `${sec}초 후 로비로 이동합니다`;
      if (sec <= 0) {
        clearInterval(returnTimer);
      }
    }, 1000);
  }

  function init() {
    document.getElementById('btn-back-to-lobby').addEventListener('click', () => {
      if (returnTimer) clearInterval(returnTimer);
      App.showScreen('lobby');
    });

    SocketManager.on('return_to_lobby', () => {
      if (returnTimer) clearInterval(returnTimer);
      App.showScreen('lobby');
    });

    SocketManager.on('coin_update', (data) => {
      if (data.reward && data.reward > 0) {
        document.getElementById('result-coins').textContent =
          `${data.medal === 'gold' ? '🥇' : data.medal === 'silver' ? '🥈' : '🥉'} +${data.reward} 코인!`;
      } else {
        document.getElementById('result-coins').textContent = '';
      }
    });
  }

  return { init, show };
})();
