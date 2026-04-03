import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCq1xjPaoUX6RY1_HpTUivo69lWXWuNqKQ",
    authDomain: "sadari-1b34d.firebaseapp.com",
    projectId: "sadari-1b34d",
    storageBucket: "sadari-1b34d.firebasestorage.app",
    messagingSenderId: "576169886908",
    appId: "1:576169886908:web:9661f1c92117027a60bcb9",
    databaseURL: "https://sadari-1b34d-default-rtdb.firebaseio.com" // 수동 추가
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const roomRef = ref(db, 'room');

document.addEventListener('DOMContentLoaded', () => {
    const configSection = document.getElementById('config-section');
    const gameSection = document.getElementById('game-section');
    const playerCountInput = document.getElementById('player-count');
    const playersContainer = document.getElementById('players-inputs');
    const resultsContainer = document.getElementById('results-inputs');
    const csvUploadInput = document.getElementById('csv-upload');

    // UI Elements
    const statusText = document.getElementById('room-status-text');
    const gameHeader = document.getElementById('game-header');
    const startsContainer = document.getElementById('starts-container');
    const endsContainer = document.getElementById('ends-container');
    const adminControls = document.getElementById('admin-controls');
    
    // Canvas
    const canvas = document.getElementById('ladder-canvas');
    const ctx = canvas.getContext('2d');

    // Modals
    const resultModal = document.getElementById('result-modal');
    const resultTableBody = document.querySelector('#result-table tbody');
    
    // Colors for multiple lines
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB', '#F1C40F', '#E67E22'];
    const lineColor = '#ffd1f3';
    
    let localData = null;
    let canvasWidth, canvasHeight, colSpacing;
    let isAdmin = false;

    // --- Firebase Sync ---
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            // No room exists. Show Config to first person.
            statusText.innerText = "새 게임 방을 생성해주세요.";
            configSection.style.display = 'flex';
            gameSection.style.display = 'none';
            resultModal.style.display = 'none';
            updateForms(); // init default
        } else {
            // Room exists!
            localData = data;
            configSection.style.display = 'none';
            gameSection.style.display = 'block';
            
            if (data.status === 'waiting') {
                statusText.innerText = "참가자들이 대기 중입니다!";
                gameHeader.innerText = "현재 사다리가 세팅되었습니다. 방장의 시작을 기다려주세요.";
                setupLadderBoard(data);
                drawBaseLadder();
            } 
            else if (data.status === 'playing') {
                statusText.innerText = "사다리타기 진행 중! 🚀";
                gameHeader.innerText = "결과를 확인해 보세요!";
                setupLadderBoard(data);
                startSimultaneousAnimation(data);
            }
            else if (data.status === 'finished') {
                statusText.innerText = "게임 종료!";
                gameHeader.innerText = "게임이 종료되었습니다.";
                setupLadderBoard(data);
                showResultModal(data.finalMatches);
            }
        }
    });

    // --- CSV Upload ---
    csvUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            const rows = text.split('\n').map(r => r.trim()).filter(r => r);
            let count = rows.length;
            if (count > 10) count = 10;
            playerCountInput.value = count;
            updateForms();

            rows.slice(0, count).forEach((row, i) => {
                const parts = row.split(',');
                if (parts[0]) document.getElementById(`player-${i}`).value = parts[0].trim();
                if (parts[1]) document.getElementById(`result-${i}`).value = parts[1].trim();
            });
            csvUploadInput.value = ''; // reset
        };
        reader.readAsText(file);
    });

    // --- Form handling ---
    function updateForms() {
        let count = parseInt(playerCountInput.value);
        if (count < 2) count = 2;
        if (count > 10) count = 10;
        playerCountInput.value = count;

        playersContainer.innerHTML = '<h3>참가자</h3>';
        resultsContainer.innerHTML = '<h3>결과</h3>';
        const defaultResults = ['당첨 😎', '꽝 😭', '선발대 🏃', '교육참석 📚', '간식쏘기 🍕', '휴식 ☕', '꽝 😭', '당첨 😎', '선발대 🏃', '꽝 😭'];

        for (let i = 0; i < count; i++) {
            playersContainer.innerHTML += `
                <div class="input-row">
                    <span>${i+1}</span>
                    <input type="text" id="player-${i}" value="참가자 ${i+1}">
                </div>`;
            const defRes = defaultResults[i % defaultResults.length];
            resultsContainer.innerHTML += `
                <div class="input-row">
                    <span>${i+1}</span>
                    <input type="text" id="result-${i}" value="${defRes}">
                </div>`;
        }
    }
    playerCountInput.addEventListener('change', updateForms);

    // --- Create Room ---
    document.getElementById('open-room-btn').addEventListener('click', () => {
        const count = parseInt(playerCountInput.value);
        let players = [], results = [];
        for (let i = 0; i < count; i++) {
            players.push(document.getElementById(`player-${i}`).value);
            results.push(document.getElementById(`result-${i}`).value);
        }

        // Generate lines
        let lines = [];
        for (let col = 0; col < count - 1; col++) {
            let numLines = Math.floor(Math.random() * 2) + 2; 
            for (let i = 0; i < numLines; i++) {
                let y, valid = false, attempts = 0;
                while(!valid && attempts < 30) {
                    attempts++;
                    y = 0.15 + Math.random() * 0.7; // 15%~85%
                    const closeLine = lines.find(l => 
                        (l.col === col || l.col === col - 1 || l.col === col + 1) && Math.abs(l.y - y) < 0.1
                    );
                    if (!closeLine) valid = true;
                }
                if (valid) lines.push({ col, y });
            }
        }
        lines.sort((a,b) => a.y - b.y);

        // Pre-calculate results
        let finalMatches = [];
        for(let start = 0; start < count; start++) {
            let c = start;
            lines.forEach(l => {
                if (l.col === c) c++;
                else if (l.col === c - 1) c--;
            });
            finalMatches.push({ player: players[start], result: results[c] });
        }

        isAdmin = true; // only creator sees admin panel
        adminControls.style.display = 'block';

        set(roomRef, {
            status: 'waiting',
            players,
            results,
            lines,
            lineCount: count,
            finalMatches
        });
    });

    // --- Admin Controls ---
    document.getElementById('start-game-btn').addEventListener('click', () => {
        update(roomRef, { status: 'playing' });
        document.getElementById('start-game-btn').disabled = true;
    });

    document.getElementById('reset-game-btn').addEventListener('click', () => {
        remove(roomRef);
        resultModal.style.display = 'none';
        isAdmin = false;
        adminControls.style.display = 'none';
        document.getElementById('start-game-btn').disabled = false;
    });

    // --- Rendering ---
    function setupLadderBoard(data) {
        startsContainer.innerHTML = '';
        endsContainer.innerHTML = '';
        data.players.forEach((p, idx) => {
            const el = document.createElement('div');
            el.className = 'start-node';
            el.innerText = p;
            el.style.borderBottom = `4px solid ${colors[idx % colors.length]}`;
            startsContainer.appendChild(el);
        });
        data.results.forEach((r, idx) => {
            const el = document.createElement('div');
            el.className = 'end-node';
            el.innerText = r;
            endsContainer.appendChild(el);
        });
        resizeCanvas(data.lineCount);
    }

    function resizeCanvas(count) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        canvasWidth = rect.width;
        canvasHeight = rect.height;
        colSpacing = canvasWidth / count;
    }

    window.addEventListener('resize', () => {
        if (localData) {
            resizeCanvas(localData.lineCount);
            if(localData.status !== 'playing') drawBaseLadder();
        }
    });

    function drawBaseLadder() {
        if(!localData) return;
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.lineWidth = 4;
        ctx.strokeStyle = lineColor;
        ctx.lineCap = 'round';
        
        for (let i = 0; i < localData.lineCount; i++) {
            const x = colSpacing * (i + 0.5);
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasHeight); ctx.stroke();
        }
        (localData.lines || []).forEach(line => {
            const x1 = colSpacing * (line.col + 0.5);
            const x2 = colSpacing * (line.col + 1.5);
            const y = line.y * canvasHeight;
            ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        });
    }

    // Generate Path points for a player
    function buildPathPts(startCol) {
        let pts = [];
        let curCol = startCol;
        pts.push({ x: colSpacing*(curCol+0.5), y: 0 });
        
        (localData.lines || []).forEach(l => {
            if (l.col === curCol) {
                pts.push({ x: colSpacing*(curCol+0.5), y: l.y*canvasHeight });
                curCol++;
                pts.push({ x: colSpacing*(curCol+0.5), y: l.y*canvasHeight });
            } else if (l.col === curCol - 1) {
                pts.push({ x: colSpacing*(curCol+0.5), y: l.y*canvasHeight });
                curCol--;
                pts.push({ x: colSpacing*(curCol+0.5), y: l.y*canvasHeight });
            }
        });
        pts.push({ x: colSpacing*(curCol+0.5), y: canvasHeight });
        return pts;
    }

    // Calculate segments lengths
    function getPathData(pts) {
        let total = 0;
        let segments = [];
        for(let i=0; i<pts.length-1; i++) {
            let dist = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
            total += dist;
            segments.push({ p1: pts[i], p2: pts[i+1], dist });
        }
        return { total, segments };
    }

    let isAnimating = false;
    function startSimultaneousAnimation(data) {
        if(isAnimating) return;
        isAnimating = true;

        const allPaths = [];
        let maxDist = 0;

        for(let i=0; i<data.lineCount; i++) {
            const pts = buildPathPts(i);
            const pData = getPathData(pts);
            if(pData.total > maxDist) maxDist = pData.total;
            allPaths.push({ ...pData, color: colors[i % colors.length] });
        }

        let currentDist = 0;
        const speed = canvasHeight * 0.015; // Animation speed

        function animLoop() {
            currentDist += speed;
            if(currentDist >= maxDist) currentDist = maxDist;

            drawBaseLadder();

            let allFinished = true;

            allPaths.forEach(path => {
                if(currentDist < path.total) allFinished = false;

                ctx.beginPath();
                ctx.lineWidth = 6;
                ctx.strokeStyle = path.color;
                
                let distLeft = currentDist;
                let lastX = path.segments[0].p1.x, lastY = path.segments[0].p1.y;

                ctx.moveTo(lastX, lastY);

                for(let seg of path.segments) {
                    if (distLeft >= seg.dist) {
                        ctx.lineTo(seg.p2.x, seg.p2.y);
                        distLeft -= seg.dist;
                        lastX = seg.p2.x; lastY = seg.p2.y;
                    } else {
                        // partial segment
                        const ratio = distLeft / seg.dist;
                        lastX = seg.p1.x + (seg.p2.x - seg.p1.x)*ratio;
                        lastY = seg.p1.y + (seg.p2.y - seg.p1.y)*ratio;
                        ctx.lineTo(lastX, lastY);
                        distLeft = 0;
                        break;
                    }
                }
                ctx.stroke();

                // Draw leading dot
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(lastX, lastY, 5, 0, Math.PI*2);
                ctx.fill();
                ctx.lineWidth = 3;
                ctx.strokeStyle = path.color;
                ctx.stroke();
            });

            if(allFinished) {
                isAnimating = false;
                if(isAdmin) {
                    // update status to finished
                    update(roomRef, { status: 'finished' });
                } else if(data.status === 'finished') {
                    showResultModal(data.finalMatches);
                }
            } else {
                requestAnimationFrame(animLoop);
            }
        }
        animLoop();
    }

    // --- Result Modal ---
    function showResultModal(matches) {
        resultTableBody.innerHTML = '';
        matches.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><b>${m.player}</b></td><td>${m.result}</td>`;
            resultTableBody.appendChild(tr);
        });
        resultModal.style.display = 'flex';
    }

    document.getElementById('close-modal-btn').addEventListener('click', () => {
        resultModal.style.display = 'none';
        drawBaseLadder(); // keep final lines but close modal
    });

    document.getElementById('copy-result-btn').addEventListener('click', () => {
        const text = localData.finalMatches.map(m => `${m.player} : ${m.result}`).join('\n');
        navigator.clipboard.writeText("🌸 웹 사다리타기 결과 🌸\n" + text).then(() => {
            alert('클립보드에 결과가 복사되었습니다!');
        });
    });

});
