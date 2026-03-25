// 게임 공통 인터페이스 (추상 클래스 형태)
// 모든 게임 종목은 이 클래스를 상속하여 구현해야 함
class GameBase {
  constructor(room) {
    this.room = room;           // { id, players, gameType, ... }
    this.state = 'waiting';     // 'waiting' | 'countdown' | 'playing' | 'finished'
    this.startTime = null;      // 게임 시작 시간 (countdown 후)
    this.results = [];          // 완주 순서대로 저장
    this.broadcastInterval = null;
  }

  // 플레이어 입력 처리 (하위 클래스에서 구현)
  onPlayerInput(userId, inputData) {
    throw new Error('Not implemented: onPlayerInput');
  }

  // 현재 게임 상태 반환 (하위 클래스에서 구현)
  getGameState() {
    throw new Error('Not implemented: getGameState');
  }

  // 게임 시작 (하위 클래스에서 구현)
  start() {
    throw new Error('Not implemented: start');
  }

  // 게임 리소스 정리
  cleanup() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }
}

module.exports = GameBase;
