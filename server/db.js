// SQLite 데이터베이스 초기화 및 쿼리 함수 모듈
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'olympic.db');
const db = new Database(dbPath);

// WAL 모드 활성화 (동시 읽기 성능 향상)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 스키마 초기화
function initDB() {
  db.exec(`
    -- 유저 테이블 (세션 기반 익명 유저)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      country_code TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL
    );

    -- 코인 테이블
    CREATE TABLE IF NOT EXISTS coins (
      user_id TEXT PRIMARY KEY,
      amount INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    -- 메달 테이블
    CREATE TABLE IF NOT EXISTS medals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      country_code TEXT NOT NULL,
      game_type TEXT NOT NULL,
      medal_type TEXT NOT NULL,
      awarded_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    -- 일일 게임 횟수 테이블
    CREATE TABLE IF NOT EXISTS daily_games (
      user_id TEXT NOT NULL,
      game_date TEXT NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id, game_date)
    );

    -- 국가별 메달 집계 뷰
    CREATE VIEW IF NOT EXISTS country_medals AS
    SELECT
      country_code,
      SUM(CASE WHEN medal_type='gold' THEN 1 ELSE 0 END) AS gold,
      SUM(CASE WHEN medal_type='silver' THEN 1 ELSE 0 END) AS silver,
      SUM(CASE WHEN medal_type='bronze' THEN 1 ELSE 0 END) AS bronze
    FROM medals
    GROUP BY country_code;
  `);
}

// --- 유저 관련 ---

// 유저 생성
function createUser(id, nickname, countryCode) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO users (id, nickname, country_code, created_at, last_active)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, nickname, countryCode, now, now);

  // 초기 코인 3개 지급
  db.prepare(`INSERT INTO coins (user_id, amount) VALUES (?, 3)`).run(id);
  return { id, nickname, countryCode, coins: 3 };
}

// 유저 조회
function getUser(id) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

// 유저 마지막 활동 시간 갱신
function updateLastActive(id) {
  db.prepare(`UPDATE users SET last_active = ? WHERE id = ?`).run(Date.now(), id);
}

// --- 코인 관련 ---

// 코인 조회
function getCoins(userId) {
  const row = db.prepare(`SELECT amount FROM coins WHERE user_id = ?`).get(userId);
  return row ? row.amount : 0;
}

// 코인 증감
function addCoins(userId, amount) {
  db.prepare(`UPDATE coins SET amount = amount + ? WHERE user_id = ?`).run(amount, userId);
  return getCoins(userId);
}

// 게임 참가 비용 차감 (1코인). 성공 여부 반환
function deductGameCost(userId) {
  const current = getCoins(userId);
  if (current < 1) return false;
  db.prepare(`UPDATE coins SET amount = amount - 1 WHERE user_id = ?`).run(userId);
  return true;
}

// --- 메달 관련 ---

// 메달 수여
function awardMedal(userId, countryCode, gameType, medalType) {
  db.prepare(`
    INSERT INTO medals (user_id, country_code, game_type, medal_type, awarded_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, countryCode, gameType, medalType, Date.now());

  // 메달에 따른 코인 보상
  const coinReward = { gold: 3, silver: 2, bronze: 1 };
  const reward = coinReward[medalType] || 0;
  if (reward > 0) {
    addCoins(userId, reward);
  }
  return reward;
}

// 국가별 메달 집계 조회
function getCountryMedals() {
  return db.prepare(`
    SELECT * FROM country_medals
    ORDER BY gold DESC, silver DESC, bronze DESC
  `).all();
}

// --- 일일 게임 횟수 ---

// 오늘 날짜 (UTC 기준) 반환
function getTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// 오늘 플레이 횟수 조회
function getDailyPlayCount(userId) {
  const today = getTodayUTC();
  const row = db.prepare(`
    SELECT play_count FROM daily_games WHERE user_id = ? AND game_date = ?
  `).get(userId, today);
  return row ? row.play_count : 0;
}

// 오늘 플레이 횟수 증가. 3회 초과 시 false 반환
function incrementDailyPlay(userId) {
  const today = getTodayUTC();
  const current = getDailyPlayCount(userId);
  if (current >= 3) return false;

  db.prepare(`
    INSERT INTO daily_games (user_id, game_date, play_count) VALUES (?, ?, 1)
    ON CONFLICT(user_id, game_date) DO UPDATE SET play_count = play_count + 1
  `).run(userId, today);
  return true;
}

// 다음 UTC 자정까지 남은 시간(ms) 계산
function getResetTime() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.getTime();
}

// DB 종료
function close() {
  db.close();
}

module.exports = {
  initDB,
  createUser,
  getUser,
  updateLastActive,
  getCoins,
  addCoins,
  deductGameCost,
  awardMedal,
  getCountryMedals,
  getDailyPlayCount,
  incrementDailyPlay,
  getResetTime,
  close
};
