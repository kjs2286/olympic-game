// IP 기반 국가 코드 조회 모듈
// ip-api.com 무료 API 사용, 10분 캐시, 로컬호스트 폴백

const cache = new Map(); // { ip: { code, expiry } }
const CACHE_TTL = 10 * 60 * 1000; // 10분

// 국가별 캐릭터 색상 매핑
const COUNTRY_COLORS = {
  KR: { name: '한국',   main: '#CD313A', sub: '#0047A0', accent: '#FFFFFF' },
  JP: { name: '일본',   main: '#BC002D', sub: '#FFFFFF', accent: '#BC002D' },
  US: { name: '미국',   main: '#3C3B6E', sub: '#B22234', accent: '#FFFFFF' },
  CN: { name: '중국',   main: '#DE2910', sub: '#FFDE00', accent: '#DE2910' },
  GB: { name: '영국',   main: '#012169', sub: '#C8102E', accent: '#FFFFFF' },
  FR: { name: '프랑스', main: '#002395', sub: '#ED2939', accent: '#FFFFFF' },
  DE: { name: '독일',   main: '#000000', sub: '#DD0000', accent: '#FFCC00' },
  AU: { name: '호주',   main: '#00008B', sub: '#FF0000', accent: '#FFFFFF' },
  BR: { name: '브라질', main: '#009739', sub: '#FEDD00', accent: '#009739' },
  IN: { name: '인도',   main: '#FF9933', sub: '#FFFFFF', accent: '#138808' },
  UN: { name: 'Unknown', main: '#888888', sub: '#AAAAAA', accent: '#CCCCCC' },
};

// 국기 이모지 매핑
const COUNTRY_FLAGS = {
  KR: '🇰🇷', JP: '🇯🇵', US: '🇺🇸', CN: '🇨🇳', GB: '🇬🇧',
  FR: '🇫🇷', DE: '🇩🇪', AU: '🇦🇺', BR: '🇧🇷', IN: '🇮🇳',
  UN: '🏳️',
};

// IP로 국가 코드 조회
async function getCountryCode(ip) {
  // 로컬호스트 폴백
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') {
    return 'KR';
  }

  // ::ffff: 접두사 제거
  const cleanIp = ip.replace(/^::ffff:/, '');

  // 사설 IP 대역 체크
  if (cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || cleanIp.startsWith('172.')) {
    return 'KR';
  }

  // 캐시 확인
  const cached = cache.get(cleanIp);
  if (cached && cached.expiry > Date.now()) {
    return cached.code;
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${cleanIp}?fields=countryCode`);
    const data = await response.json();
    const code = data.countryCode || 'UN';

    // 캐시 저장
    cache.set(cleanIp, { code, expiry: Date.now() + CACHE_TTL });
    return code;
  } catch (err) {
    console.error(`[GeoIP] API 호출 실패 (${cleanIp}):`, err.message);
    return 'UN';
  }
}

// 국가 색상 정보 조회
function getCountryInfo(code) {
  return COUNTRY_COLORS[code] || COUNTRY_COLORS['UN'];
}

// 국기 이모지 조회
function getFlag(code) {
  return COUNTRY_FLAGS[code] || COUNTRY_FLAGS['UN'];
}

module.exports = {
  getCountryCode,
  getCountryInfo,
  getFlag,
  COUNTRY_COLORS,
  COUNTRY_FLAGS
};
