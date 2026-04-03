document.addEventListener('DOMContentLoaded', () => {
    const playerCountInput = document.getElementById('player-count');
    const playersContainer = document.getElementById('players-inputs');
    const resultsContainer = document.getElementById('results-inputs');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const gameSection = document.getElementById('game-section');
    const startsContainer = document.getElementById('starts-container');
    const endsContainer = document.getElementById('ends-container');
    const canvas = document.getElementById('ladder-canvas');
    const ctx = canvas.getContext('2d');

    let players = [];
    let results = [];
    let horizontalLines = [];
    let lineCount = 0;
    let isDrawing = false;
    let canvasWidth, canvasHeight;
    let animationFrame;

    // 테마 설정 (봄)
    const lineColor = '#ffd1f3';
    const pathColor = '#ff3b7c';
    const highlightWidth = 6;
    const baseWidth = 4;

    function updateForms() {
        let count = parseInt(playerCountInput.value);
        if (count < 2) count = 2;
        if (count > 10) count = 10;
        playerCountInput.value = count;

        playersContainer.innerHTML = '<h3>참가자</h3>';
        resultsContainer.innerHTML = '<h3>결과</h3>';

        const defaultResults = ['당첨 😎', '꽝 😭', '선발대 🏃', '교육참석 📚', '간식쏘기 🍕', '휴식 ☕', '꽝 😭', '당첨 😎', '선발대 🏃', '꽝 😭'];

        for (let i = 0; i < count; i++) {
            const pRow = document.createElement('div');
            pRow.className = 'input-row';
            pRow.innerHTML = `
                <span>${i + 1}</span>
                <input type="text" id="player-${i}" value="참가자 ${i + 1}" placeholder="이름 입력">
            `;
            playersContainer.appendChild(pRow);

            const rRow = document.createElement('div');
            rRow.className = 'input-row';
            const defaultRes = defaultResults[i % defaultResults.length];
            rRow.innerHTML = `
                <span>${i + 1}</span>
                <input type="text" id="result-${i}" value="${defaultRes}" placeholder="결과 입력">
            `;
            resultsContainer.appendChild(rRow);
        }
    }

    playerCountInput.addEventListener('change', updateForms);
    updateForms();

    generateBtn.addEventListener('click', () => {
        const count = parseInt(playerCountInput.value);
        players = [];
        results = [];
        
        for (let i = 0; i < count; i++) {
            players.push(document.getElementById(`player-${i}`).value);
            results.push(document.getElementById(`result-${i}`).value);
        }

        lineCount = count;
        document.querySelector('.config-section').style.display = 'none';
        gameSection.style.display = 'block';

        setupLadder();
    });

    resetBtn.addEventListener('click', () => {
        gameSection.style.display = 'none';
        document.querySelector('.config-section').style.display = 'flex';
        if (animationFrame) cancelAnimationFrame(animationFrame);
    });

    function setupLadder() {
        startsContainer.innerHTML = '';
        endsContainer.innerHTML = '';

        players.forEach((p, idx) => {
            const startNode = document.createElement('div');
            startNode.className = 'start-node';
            startNode.innerText = p;
            startNode.title = p; // hover full text
            startNode.dataset.index = idx;
            startNode.addEventListener('click', () => startAnimation(idx));
            startsContainer.appendChild(startNode);
        });

        results.forEach((r, idx) => {
            const endNode = document.createElement('div');
            endNode.className = 'end-node';
            endNode.innerText = r;
            endNode.title = r;
            endNode.dataset.index = idx;
            endsContainer.appendChild(endNode);
        });

        resizeCanvas();
        generateLadderData();
        drawBaseLadder();
    }

    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        canvasWidth = rect.width;
        canvasHeight = rect.height;
    }

    window.addEventListener('resize', () => {
        if (gameSection.style.display === 'block') {
            resizeCanvas();
            drawBaseLadder();
        }
    });

    function generateLadderData() {
        horizontalLines = [];
        for (let col = 0; col < lineCount - 1; col++) {
            let numLines = Math.floor(Math.random() * 2) + 2; // 2~3 lines
            for (let i = 0; i < numLines; i++) {
                let y, valid = false, attempts = 0;
                while(!valid && attempts < 30) {
                    attempts++;
                    y = 0.15 + Math.random() * 0.7; // 15% ~ 85%
                    const closeLine = horizontalLines.find(l => 
                        (l.col === col || l.col === col - 1 || l.col === col + 1) && Math.abs(l.y - y) < 0.1
                    );
                    if (!closeLine) valid = true;
                }
                if (valid) {
                    horizontalLines.push({ col, y });
                }
            }
        }
        horizontalLines.sort((a, b) => a.y - b.y);
    }

    function getDrawCoordinates() {
        const colSpacing = canvasWidth / lineCount;
        return { colSpacing };
    }

    function drawBaseLadder() {
        const { colSpacing } = getDrawCoordinates();
        
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.lineWidth = baseWidth;
        ctx.strokeStyle = lineColor;
        ctx.lineCap = 'round';

        // Draw vertical lines
        for (let i = 0; i < lineCount; i++) {
            const x = colSpacing * (i + 0.5);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvasHeight);
            ctx.stroke();
        }

        // Draw horizontal lines
        horizontalLines.forEach(line => {
            const x1 = colSpacing * (line.col + 0.5);
            const x2 = colSpacing * (line.col + 1.5);
            const y = line.y * canvasHeight;
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();
        });
    }

    function tracePath(startIndex) {
        let path = [];
        let currentIdx = startIndex;
        const { colSpacing } = getDrawCoordinates();

        path.push({ x: colSpacing * (currentIdx + 0.5), y: 0 });

        horizontalLines.forEach(line => {
            if (line.col === currentIdx) {
                path.push({ x: colSpacing * (currentIdx + 0.5), y: line.y * canvasHeight });
                currentIdx++;
                path.push({ x: colSpacing * (currentIdx + 0.5), y: line.y * canvasHeight });
            } else if (line.col === currentIdx - 1) {
                path.push({ x: colSpacing * (currentIdx + 0.5), y: line.y * canvasHeight });
                currentIdx--;
                path.push({ x: colSpacing * (currentIdx + 0.5), y: line.y * canvasHeight });
            }
        });

        path.push({ x: colSpacing * (currentIdx + 0.5), y: canvasHeight });
        return { path, endIndex: currentIdx };
    }

    function startAnimation(startIndex) {
        if (isDrawing) return;
        isDrawing = true;

        if (animationFrame) cancelAnimationFrame(animationFrame);

        drawBaseLadder();
        document.querySelectorAll('.start-node').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.end-node').forEach(el => el.classList.remove('active'));
        
        const startNodes = document.querySelectorAll('.start-node');
        startNodes[startIndex].classList.add('active');

        const { path, endIndex } = tracePath(startIndex);
        
        let currentSegment = 0;
        let progress = 0; 
        const speed = 0.04;

        function animate() {
            if (currentSegment >= path.length - 1) {
                isDrawing = false;
                const endNodes = document.querySelectorAll('.end-node');
                endNodes[endIndex].classList.add('active');
                return;
            }

            const p1 = path[currentSegment];
            const p2 = path[currentSegment + 1];

            progress += speed;
            if (progress >= 1) {
                progress = 1;
                currentSegment++;
                progress = 0;
            }

            drawBaseLadder(); 
            
            ctx.lineWidth = highlightWidth;
            ctx.strokeStyle = pathColor;
            ctx.beginPath();
            ctx.moveTo(path[0].x, path[0].y);

            for(let i=1; i<=currentSegment; i++) {
                ctx.lineTo(path[i].x, path[i].y);
            }

            if (currentSegment < path.length - 1) {
                const cx = p1.x + (p2.x - p1.x) * progress;
                const cy = p1.y + (p2.y - p1.y) * progress;
                ctx.lineTo(cx, cy);
            }

            ctx.stroke();

            const lastX = currentSegment < path.length - 1 ? (p1.x + (p2.x - p1.x) * progress) : path[path.length-1].x;
            const lastY = currentSegment < path.length - 1 ? (p1.y + (p2.y - p1.y) * progress) : path[path.length-1].y;
            
            ctx.fillStyle = '#ff1744';
            ctx.beginPath();
            ctx.arc(lastX, lastY, 7, 0, Math.PI * 2);
            ctx.fill();

            animationFrame = requestAnimationFrame(animate);
        }

        animate();
    }
});
