// 앱 진입점, 화면 전환 관리
const App = (() => {
  let userId = null;
  let nickname = '';
  let countryCode = 'KR';

  const FLAGS = {
    KR: '🇰🇷', JP: '🇯🇵', US: '🇺🇸', CN: '🇨🇳', GB: '🇬🇧',
    FR: '🇫🇷', DE: '🇩🇪', AU: '🇦🇺', BR: '🇧🇷', IN: '🇮🇳', UN: '🏳️'
  };

  const COUNTRY_NAMES = {
    KR: '한국', JP: '일본', US: '미국', CN: '중국', GB: '영국',
    FR: '프랑스', DE: '독일', AU: '호주', BR: '브라질', IN: '인도', UN: 'Unknown'
  };

  // UUID 생성
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // 화면 전환
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(`${name}-screen`);
    if (screen) screen.classList.add('active');

    // 게임 화면 진입 시 Canvas 초기화
    if (name === 'game') {
      const canvas = document.getElementById('gameCanvas');
      const waitingPlayers = document.querySelectorAll('#waiting-players .player-slot.occupied');
      // players 정보는 WaitingRoom에서 가져옴
    }

    // 헤더 표시/숨기기
    const header = document.getElementById('header');
    header.style.display = (name === 'onboarding') ? 'none' : 'flex';
  }

  function getFlag(code) {
    return FLAGS[code] || FLAGS['UN'];
  }

  function getUserId() { return userId; }

  // 헤더 정보 업데이트
  function updateHeader(data) {
    if (data.coins !== undefined) {
      document.getElementById('header-coins').textContent = data.coins;
    }
    if (data.dailyPlays !== undefined) {
      const remaining = (data.maxDailyPlays || 3) - data.dailyPlays;
      document.getElementById('header-plays').textContent = `${remaining}/3`;
    }
  }

  function init() {
    // 저장된 userId 확인 (세션 유지용)
    userId = sessionStorage.getItem('olympicUserId');
    nickname = sessionStorage.getItem('olympicNickname') || '';
    countryCode = sessionStorage.getItem('olympicCountry') || 'KR';

    // 소켓 연결
    SocketManager.connect();

    // 이미 세션이 있으면 로비로 바로 이동
    if (userId && nickname) {
      showScreen('lobby');
      document.getElementById('header-flag').textContent = getFlag(countryCode);
      document.getElementById('header-nickname').textContent = nickname;
      SocketManager.on('_connected', () => {
        SocketManager.send('join_lobby', { userId, nickname, countryCode });
      });
    } else {
      showScreen('onboarding');
    }

    // 온보딩: 닉네임 입력
    const nicknameInput = document.getElementById('nickname-input');
    const enterBtn = document.getElementById('btn-enter');

    // 국가 자동 감지 표시
    document.getElementById('detected-country').innerHTML =
      `<span class="flag">${getFlag(countryCode)}</span> ${COUNTRY_NAMES[countryCode] || countryCode}`;

    enterBtn.addEventListener('click', () => {
      const nick = nicknameInput.value.trim();
      if (!nick || nick.length < 1 || nick.length > 12) {
        nicknameInput.style.borderColor = '#e74c3c';
        return;
      }
      userId = generateUUID();
      nickname = nick;

      sessionStorage.setItem('olympicUserId', userId);
      sessionStorage.setItem('olympicNickname', nickname);
      sessionStorage.setItem('olympicCountry', countryCode);

      document.getElementById('header-flag').textContent = getFlag(countryCode);
      document.getElementById('header-nickname').textContent = nickname;

      SocketManager.send('join_lobby', { userId, nickname, countryCode });
      showScreen('lobby');
    });

    nicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enterBtn.click();
    });

    // 서버 이벤트: 로비 정보 갱신
    SocketManager.on('lobby_info', (data) => {
      updateHeader(data);
    });

    // 에러 처리
    SocketManager.on('error', (data) => {
      alert(data.message);
    });

    SocketManager.on('insufficient_coins', (data) => {
      alert(`코인이 부족합니다! (현재: ${data.current})`);
    });

    SocketManager.on('daily_limit_reached', (data) => {
      const resetDate = new Date(data.resetAt);
      alert(`오늘 플레이 횟수를 모두 사용했습니다.\n리셋: ${resetDate.toLocaleTimeString()}`);
    });

    // 게임 시작 시 Canvas 초기화
    SocketManager.on('game_started', (data) => {
      // 대기실 플레이어 정보로 Canvas 초기화
      const waitingSlots = document.querySelectorAll('#waiting-players .player-slot.occupied');
      const playerList = [];
      waitingSlots.forEach((slot, i) => {
        const name = slot.querySelector('.slot-name')?.textContent || `P${i+1}`;
        // 플레이어 정보는 room_joined/room_updated에서 관리
      });
    });

    // room_joined에서 플레이어 목록 저장
    let currentRoomPlayers = [];
    SocketManager.on('room_joined', (data) => {
      currentRoomPlayers = data.players;
    });
    SocketManager.on('room_updated', (data) => {
      currentRoomPlayers = data.players;
    });
    SocketManager.on('game_started', (data) => {
      const canvas = document.getElementById('gameCanvas');
      Sprint100mRenderer.init(canvas, currentRoomPlayers);
    });

    // 스코어보드
    SocketManager.on('leaderboard', (data) => {
      renderScoreboard(data.medals);
    });

    // 스코어보드 헤더 버튼
    document.getElementById('btn-header-scoreboard').addEventListener('click', () => {
      SocketManager.send('request_leaderboard');
      showScreen('scoreboard');
    });

    document.getElementById('btn-scoreboard-back').addEventListener('click', () => {
      showScreen('lobby');
    });

    document.getElementById('btn-scoreboard-refresh').addEventListener('click', () => {
      SocketManager.send('request_leaderboard');
    });

    // 모듈 초기화
    Lobby.init();
    WaitingRoom.init();
    GameScreen.init();
    ResultScreen.init();
  }

  function renderScoreboard(medals) {
    const tbody = document.getElementById('medal-tbody');
    if (!medals || medals.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;font-size:9px;color:#888;">아직 기록이 없습니다</td></tr>';
      return;
    }

    tbody.innerHTML = medals.map((m, i) => {
      const flag = FLAGS[m.country_code] || '🏳️';
      const name = COUNTRY_NAMES[m.country_code] || m.country_code;
      const rankClass = i < 3 ? `rank-${i + 1}` : '';
      return `
        <tr class="${rankClass}">
          <td>${i + 1}</td>
          <td class="country-cell"><span>${flag}</span> ${name}</td>
          <td class="medal-gold">${m.gold}</td>
          <td class="medal-silver">${m.silver}</td>
          <td class="medal-bronze">${m.bronze}</td>
        </tr>`;
    }).join('');
  }

  return { init, showScreen, getFlag, getUserId, updateHeader };
})();

// DOM 로드 후 초기화
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
