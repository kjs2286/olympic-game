// 100m 달리기 Canvas 렌더링 및 시각 처리
const Sprint100mRenderer = (() => {
  let canvas, ctx;
  let animFrame = null;
  let gameState = null;   // 서버에서 수신한 게임 상태
  let players = [];       // 방 플레이어 목록
  let renderFrame = 0;

  // 국가별 색상
  const COUNTRY_COLORS = {
    KR: { main: '#CD313A', sub: '#0047A0', accent: '#FFFFFF' },
    JP: { main: '#BC002D', sub: '#FFFFFF', accent: '#BC002D' },
    US: { main: '#3C3B6E', sub: '#B22234', accent: '#FFFFFF' },
    CN: { main: '#DE2910', sub: '#FFDE00', accent: '#DE2910' },
    GB: { main: '#012169', sub: '#C8102E', accent: '#FFFFFF' },
    FR: { main: '#002395', sub: '#ED2939', accent: '#FFFFFF' },
    DE: { main: '#000000', sub: '#DD0000', accent: '#FFCC00' },
    AU: { main: '#00008B', sub: '#FF0000', accent: '#FFFFFF' },
    BR: { main: '#009739', sub: '#FEDD00', accent: '#009739' },
    IN: { main: '#FF9933', sub: '#FFFFFF', accent: '#138808' },
    UN: { main: '#888888', sub: '#AAAAAA', accent: '#CCCCCC' },
  };

  const FLAGS = {
    KR: '🇰🇷', JP: '🇯🇵', US: '🇺🇸', CN: '🇨🇳', GB: '🇬🇧',
    FR: '🇫🇷', DE: '🇩🇪', AU: '🇦🇺', BR: '🇧🇷', IN: '🇮🇳', UN: '🏳️'
  };

  const MEDAL_EMOJI = { gold: '🥇', silver: '🥈', bronze: '🥉' };

  // 보간용 (서버 상태를 부드럽게 따라가기)
  let interpolatedPositions = {};

  function init(canvasEl, playerList) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    players = playerList;
    gameState = null;
    interpolatedPositions = {};

    players.forEach(p => {
      interpolatedPositions[p.userId] = 0;
    });

    resize();
    window.addEventListener('resize', resize);
    startRenderLoop();
  }

  function resize() {
    const container = canvas.parentElement;
    const w = container.clientWidth;
    canvas.width = Math.max(w, 400);
    canvas.height = 400;
  }

  function updateState(state) {
    gameState = state;
    // 타이머 업데이트
    const timerEl = document.getElementById('game-timer');
    if (timerEl && state.time) {
      timerEl.textContent = `⏱ ${(state.time / 1000).toFixed(1)}s`;
    }
  }

  function startRenderLoop() {
    function loop() {
      render();
      renderFrame++;
      animFrame = requestAnimationFrame(loop);
    }
    animFrame = requestAnimationFrame(loop);
  }

  function stopRenderLoop() {
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
  }

  function render() {
    if (!canvas || !ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // === 배경 ===
    // 하늘
    const skyH = H * 0.25;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, skyH);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(1, '#B0E0FF');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, skyH);

    // 구름
    drawCloud(W * 0.15, skyH * 0.3, 2);
    drawCloud(W * 0.5, skyH * 0.2, 2.5);
    drawCloud(W * 0.8, skyH * 0.4, 1.8);

    // 관중석/스탠드 배경
    ctx.fillStyle = '#666680';
    ctx.fillRect(0, skyH, W, 20);
    // 관중 도트
    for (let sx = 0; sx < W; sx += 8) {
      const row = Math.floor(Math.random() * 1000) % 3;
      const colors = ['#e07050', '#50a0e0', '#e0d050', '#50e070', '#e050a0'];
      ctx.fillStyle = colors[(sx * 7 + row * 13) % colors.length];
      ctx.fillRect(sx, skyH + 4 + row * 5, 5, 5);
    }

    // 트랙 영역
    const trackTop = skyH + 20;
    const trackH = H * 0.55;
    const grassH = H - trackTop - trackH;

    // 트랙 배경
    ctx.fillStyle = '#D2691E';
    ctx.fillRect(0, trackTop, W, trackH);

    // 레인 구분
    const laneCount = Math.max(players.length, 2);
    const laneH = trackH / laneCount;

    for (let i = 0; i < laneCount; i++) {
      const ly = trackTop + i * laneH;

      // 교대 레인 색상
      ctx.fillStyle = i % 2 === 0 ? '#C85A30' : '#D06838';
      ctx.fillRect(0, ly, W, laneH);

      // 레인 구분선
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, ly, W, 1);

      // 레인 번호
      ctx.fillStyle = '#fff';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`${i + 1}`, 4, ly + laneH / 2 + 4);
    }
    // 마지막 레인 하단 선
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, trackTop + laneCount * laneH - 1, W, 1);

    // 결승선
    const finishX = W - 60;
    for (let fy = trackTop; fy < trackTop + trackH; fy += 8) {
      for (let fx = 0; fx < 16; fx += 8) {
        const isWhite = ((fy / 8 + fx / 8) % 2 === 0);
        ctx.fillStyle = isWhite ? '#fff' : '#000';
        ctx.fillRect(finishX + fx, fy, 8, 8);
      }
    }
    ctx.fillStyle = '#fff';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('FINISH', finishX - 10, trackTop - 4);

    // 잔디
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, trackTop + trackH, W, grassH);
    // 잔디 도트 패턴
    ctx.fillStyle = '#388E3C';
    for (let gx = 0; gx < W; gx += 12) {
      ctx.fillRect(gx, trackTop + trackH + 4, 4, grassH - 8);
    }

    // === 캐릭터 렌더링 ===
    const startX = 40;
    const trackWidth = finishX - startX;

    players.forEach((player, i) => {
      const ly = trackTop + i * laneH;
      const colors = COUNTRY_COLORS[player.countryCode] || COUNTRY_COLORS['UN'];
      const flag = FLAGS[player.countryCode] || FLAGS['UN'];

      // 서버 progress 보간
      let targetProgress = 0;
      let finished = false;
      let finishTime = null;
      if (gameState && gameState.positions) {
        const pos = gameState.positions.find(p => p.userId === player.userId);
        if (pos) {
          targetProgress = pos.progress;
          finished = pos.finished;
          finishTime = pos.finishTime;
        }
      }

      // 부드러운 보간
      const current = interpolatedPositions[player.userId] || 0;
      const lerp = current + (targetProgress - current) * 0.15;
      interpolatedPositions[player.userId] = lerp;

      const charX = startX + trackWidth * (lerp / 100);
      const charY = ly + laneH / 2;

      // 이름 + 국기 표시 (레인 좌측)
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${flag}${player.nickname.slice(0, 5)}`, startX - 36, ly + 12);

      // 캐릭터 그리기
      const animSpeed = targetProgress > (interpolatedPositions[player.userId] - 0.5) ? 1 : 0;
      const runFrame = animSpeed > 0 ? Math.floor(renderFrame / 8) % 2 : 0;
      drawRunner(charX - 12, charY - 20, colors, runFrame, i + 1, finished);

      // 프로그레스 바 (캐릭터 위)
      const barW = 30;
      const barH = 4;
      const barX = charX - barW / 2;
      const barY = charY - 24;
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = colors.main;
      ctx.fillRect(barX, barY, barW * (lerp / 100), barH);

      // 완주 시 메달 표시
      if (finished && gameState) {
        // rankings에서 메달 확인
        const rankIndex = gameState.positions
          .filter(p => p.finished)
          .sort((a, b) => a.finishTime - b.finishTime)
          .findIndex(p => p.userId === player.userId);

        const medals = ['gold', 'silver', 'bronze'];
        if (rankIndex >= 0 && rankIndex < 3) {
          ctx.font = '16px serif';
          ctx.fillText(MEDAL_EMOJI[medals[rankIndex]], charX - 8, charY - 26);
        }
      }
    });
  }

  // 구름 그리기 (픽셀 아트)
  function drawCloud(x, y, scale) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const s = scale;
    ctx.fillRect(x + 2*s, y, 8*s, 2*s);
    ctx.fillRect(x, y + 2*s, 12*s, 2*s);
    ctx.fillRect(x + 1*s, y + 4*s, 10*s, 2*s);
  }

  // 도트 캐릭터 그리기 (24x32 기준)
  function drawRunner(x, y, colors, frame, laneNum, finished) {
    const s = 2; // 픽셀 크기

    // 머리 (살구색)
    ctx.fillStyle = '#FDBCB4';
    fillBlock(x + 4*s, y, 4*s, 4*s);

    // 머리카락
    ctx.fillStyle = '#333';
    fillBlock(x + 4*s, y, 4*s, s);

    // 눈
    ctx.fillStyle = '#333';
    fillBlock(x + 5*s, y + 1.5*s, s*0.8, s*0.8);
    fillBlock(x + 7*s, y + 1.5*s, s*0.8, s*0.8);

    // 몸통 (유니폼 — 국가 메인컬러)
    ctx.fillStyle = colors.main;
    fillBlock(x + 3*s, y + 4*s, 6*s, 6*s);

    // 번호 비브
    ctx.fillStyle = '#fff';
    fillBlock(x + 4.5*s, y + 5*s, 3*s, 3*s);
    ctx.fillStyle = '#333';
    ctx.font = `${s * 3}px "Press Start 2P", monospace`;
    ctx.fillText(`${laneNum}`, x + 5*s, y + 7.5*s);

    // 팔 (살구색 + 애니메이션)
    ctx.fillStyle = '#FDBCB4';
    if (frame === 0) {
      // 프레임1: 오른팔 앞, 왼팔 뒤
      fillBlock(x + 1*s, y + 5*s, 2*s, 3*s);  // 왼팔 (뒤)
      fillBlock(x + 9*s, y + 4*s, 2*s, 3*s);  // 오른팔 (앞)
    } else {
      // 프레임2: 왼팔 앞, 오른팔 뒤
      fillBlock(x + 1*s, y + 4*s, 2*s, 3*s);  // 왼팔 (앞)
      fillBlock(x + 9*s, y + 5*s, 2*s, 3*s);  // 오른팔 (뒤)
    }

    // 반바지 (국가 서브컬러)
    ctx.fillStyle = colors.sub;
    fillBlock(x + 3*s, y + 10*s, 3*s, 3*s);   // 왼쪽
    fillBlock(x + 6*s, y + 10*s, 3*s, 3*s);   // 오른쪽

    // 다리 (살구색 + 애니메이션)
    ctx.fillStyle = '#FDBCB4';
    if (finished) {
      // 완주: 정지 자세
      fillBlock(x + 3*s, y + 13*s, 3*s, 3*s);
      fillBlock(x + 6*s, y + 13*s, 3*s, 3*s);
    } else if (frame === 0) {
      fillBlock(x + 3*s, y + 13*s, 3*s, 4*s);  // 왼다리 (뒤)
      fillBlock(x + 6*s, y + 13*s, 3*s, 3*s);  // 오른다리 (앞)
    } else {
      fillBlock(x + 3*s, y + 13*s, 3*s, 3*s);  // 왼다리 (앞)
      fillBlock(x + 6*s, y + 13*s, 3*s, 4*s);  // 오른다리 (뒤)
    }

    // 운동화
    ctx.fillStyle = '#fff';
    if (finished) {
      fillBlock(x + 2*s, y + 16*s, 4*s, 2*s);
      fillBlock(x + 6*s, y + 16*s, 4*s, 2*s);
    } else if (frame === 0) {
      fillBlock(x + 2*s, y + 17*s, 4*s, 2*s);
      fillBlock(x + 6*s, y + 16*s, 4*s, 2*s);
    } else {
      fillBlock(x + 2*s, y + 16*s, 4*s, 2*s);
      fillBlock(x + 6*s, y + 17*s, 4*s, 2*s);
    }
    // 신발 밑 줄
    ctx.fillStyle = '#333';
    if (finished) {
      fillBlock(x + 2*s, y + 17.5*s, 4*s, s*0.5);
      fillBlock(x + 6*s, y + 17.5*s, 4*s, s*0.5);
    }
  }

  function fillBlock(x, y, w, h) {
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function cleanup() {
    stopRenderLoop();
    window.removeEventListener('resize', resize);
  }

  return { init, updateState, cleanup, stopRenderLoop };
})();
