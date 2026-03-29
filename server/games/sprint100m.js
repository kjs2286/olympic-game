// 100m 달리기 게임 로직
const GameBase = require('./gameBase');

class Sprint100m extends GameBase {
  constructor(room, io) {
    super(room);
    this.io = io;
    this.trackLength = 100;     // progress 0~100
    this.timeout = 30000;       // 30초 타임아웃
    this.timeoutHandle = null;
    this.countdownHandle = null;

    // 플레이어별 상태 초기화
    this.players = {};
    this.botIntervals = [];       // 봇 AI 타이머
    for (const p of room.players) {
      this.players[p.userId] = {
        userId: p.userId,
        nickname: p.nickname,
        countryCode: p.countryCode,
        progress: 0,
        lastKey: null,            // 마지막으로 누른 키 (null | 'left' | 'right')
        lastInputTime: 0,         // 마지막 유효 입력 시간
        inputCountInSecond: 0,    // 현재 1초 내 유효 입력 횟수
        inputSecondStart: 0,      // 1초 카운트 시작 시간
        finishTime: null,         // 완주 시간 (ms)
        finished: false,
        isBot: !!p.isBot,
      };
    }
  }

  // 게임 시작 (3초 카운트다운 후 플레이)
  start() {
    this.state = 'countdown';
    const roomId = this.room.id;

    // 카운트다운 이벤트 전송
    this.io.to(roomId).emit('game_started', {
      gameType: 'sprint100m',
      trackLength: this.trackLength,
      countdown: 3
    });

    // 3초 후 실제 게임 시작
    this.countdownHandle = setTimeout(() => {
      this.state = 'playing';
      this.startTime = Date.now();

      this.io.to(roomId).emit('game_playing', {});

      // 100ms마다 게임 상태 브로드캐스트
      this.broadcastInterval = setInterval(() => {
        if (this.state !== 'playing') return;
        this.io.to(roomId).emit('game_state', this.getGameState());
      }, 100);

      // 30초 타임아웃
      this.timeoutHandle = setTimeout(() => {
        this.finishGame();
      }, this.timeout);

      // 봇 AI 시작
      this.startBotAI();
    }, 3000);
  }

  // 봇 AI: 각 봇마다 다른 속도로 자동 입력
  startBotAI() {
    const bots = Object.values(this.players).filter(p => p.isBot);

    bots.forEach((bot, i) => {
      // 봇마다 다른 실력 (입력 간격 ms) — 90~180ms 범위
      // 약간의 랜덤성을 추가해서 자연스럽게
      const baseSpeed = 100 + Math.random() * 80;
      let currentKey = 'left';

      const interval = setInterval(() => {
        if (this.state !== 'playing' || bot.finished) {
          clearInterval(interval);
          return;
        }

        // 자연스러운 속도 변화 (±20ms 흔들림)
        const jitter = (Math.random() - 0.5) * 40;
        const actualDelay = baseSpeed + jitter;

        // 교대 입력
        this.onPlayerInput(bot.userId, { key: currentKey });
        currentKey = currentKey === 'left' ? 'right' : 'left';
      }, baseSpeed);

      this.botIntervals.push(interval);
    });
  }

  // 플레이어 입력 처리
  onPlayerInput(userId, inputData) {
    if (this.state !== 'playing') return;

    const player = this.players[userId];
    if (!player || player.finished) return;

    const key = inputData.key; // 'left' | 'right'
    if (key !== 'left' && key !== 'right') return;

    const now = Date.now();

    // 같은 키 연속 입력 무효
    if (player.lastKey === key) return;

    // 1초 내 최대 10회 유효 입력 제한
    if (now - player.inputSecondStart > 1000) {
      player.inputCountInSecond = 0;
      player.inputSecondStart = now;
    }
    if (player.inputCountInSecond >= 10) return;

    // 유효 입력 처리
    player.lastKey = key;
    player.inputCountInSecond++;

    // 기본 progress 증가
    let increment = 1.5;

    // 리듬 보너스: 입력 간격이 150ms 이하이면 추가
    if (player.lastInputTime > 0 && (now - player.lastInputTime) <= 150) {
      increment += 0.2;
    }
    player.lastInputTime = now;

    // progress 적용
    player.progress = Math.min(this.trackLength, player.progress + increment);

    // 완주 체크
    if (player.progress >= this.trackLength && !player.finished) {
      player.finished = true;
      player.finishTime = now - this.startTime;
      this.results.push({
        userId: player.userId,
        nickname: player.nickname,
        countryCode: player.countryCode,
        finishTime: player.finishTime
      });

      // 모든 플레이어 완주 시 게임 종료
      const allFinished = Object.values(this.players).every(p => p.finished);
      if (allFinished) {
        this.finishGame();
      }
    }
  }

  // 현재 게임 상태 반환
  getGameState() {
    const positions = Object.values(this.players).map(p => ({
      userId: p.userId,
      progress: Math.round(p.progress * 100) / 100,
      finished: p.finished,
      finishTime: p.finishTime
    }));

    return {
      positions,
      time: this.startTime ? Date.now() - this.startTime : 0
    };
  }

  // 게임 종료 처리
  finishGame() {
    if (this.state === 'finished') return;
    this.state = 'finished';

    // 미완주 플레이어도 progress 순으로 결과에 추가
    const unfinished = Object.values(this.players)
      .filter(p => !p.finished)
      .sort((a, b) => b.progress - a.progress);

    for (const p of unfinished) {
      this.results.push({
        userId: p.userId,
        nickname: p.nickname,
        countryCode: p.countryCode,
        finishTime: null
      });
    }

    // 메달 배정
    const medalTypes = ['gold', 'silver', 'bronze'];
    const rankings = this.results.map((r, i) => ({
      ...r,
      rank: i + 1,
      medal: i < 3 && r.finishTime !== null ? medalTypes[i] : null
    }));

    // 최종 상태 한 번 더 브로드캐스트
    this.io.to(this.room.id).emit('game_state', this.getGameState());

    // game_finished 이벤트
    this.io.to(this.room.id).emit('game_finished', {
      rankings,
      gameType: 'sprint100m'
    });

    this.cleanup();
  }

  // 리소스 정리
  cleanup() {
    super.cleanup();
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    if (this.countdownHandle) {
      clearTimeout(this.countdownHandle);
      this.countdownHandle = null;
    }
    // 봇 AI 인터벌 정리
    if (this.botIntervals) {
      this.botIntervals.forEach(iv => clearInterval(iv));
      this.botIntervals = [];
    }
  }
}

module.exports = Sprint100m;
