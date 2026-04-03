const firebaseConfig = {
    apiKey: "AIzaSyCq1xjPaoUX6RY1_HpTUivo69lWXWuNqKQ",
    authDomain: "sadari-1b34d.firebaseapp.com",
    projectId: "sadari-1b34d",
    storageBucket: "sadari-1b34d.firebasestorage.app",
    messagingSenderId: "576169886908",
    appId: "1:576169886908:web:9661f1c92117027a60bcb9",
    databaseURL: "https://sadari-1b34d-default-rtdb.firebaseio.com"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const roomRef = db.ref('room');

document.addEventListener('DOMContentLoaded', () => {
    const configSection = document.getElementById('config-section');
    const gameSection = document.getElementById('game-section');
    const playerCountInput = document.getElementById('player-count');
    const playersContainer = document.getElementById('players-inputs');
    const resultsContainer = document.getElementById('results-inputs');
    const csvUploadInput = document.getElementById('csv-upload');
    const downloadCsvBtn = document.getElementById('download-csv-btn');

    // UI Elements
    const statusText = document.getElementById('room-status-text');
    const gameHeader = document.getElementById('game-header');
    const startsContainer = document.getElementById('starts-container');
    const endsContainer = document.getElementById('ends-container');
    const adminControls = document.getElementById('admin-controls');
    
    // Canvas
    const canvas = document.getElementById('ladder-canvas');
    const ctx = canvas.getContext('2d');

    const resultModal = document.getElementById('result-modal');
    const resultTableBody = document.querySelector('#result-table tbody');
    
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB', '#F1C40F', '#E67E22'];
    const lineColor = '#ffd1f3';
    
    let localData = null;
    let canvasWidth, canvasHeight, colSpacing;
    let isAdmin = false;

    let isAnimating = false;
    let currentlyAnimatingPlayer = null;
    let myTriggeredPlayer = null;

    // --- Firebase Sync ---
    roomRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            statusText.innerText = "새 게임 방을 생성해주세요.";
            configSection.style.display = 'flex';
            gameSection.style.display = 'none';
            resultModal.style.display = 'none';
            updateForms(); 
            isAnimating = false;
            currentlyAnimatingPlayer = null;
            myTriggeredPlayer = null;
        } else {
            localData = data;
            configSection.style.display = 'none';
            gameSection.style.display = 'block';

            if (isAdmin) {
                adminControls.style.display = 'block';
                if (data.status === 'waiting') {
                    document.getElementById('start-game-btn').style.display = 'inline-block';
                    document.getElementById('force-finish-btn').style.display = 'none';
                } else if (data.status === 'playing') {
                    document.getElementById('start-game-btn').style.display = 'none';
                    document.getElementById('force-finish-btn').style.display = 'inline-block';
                } else {
                    document.getElementById('start-game-btn').style.display = 'none';
                    document.getElementById('force-finish-btn').style.display = 'none';
                }
            } else {
                adminControls.style.display = 'none';
            }
            
            if (data.status === 'waiting') {
                statusText.innerText = "참가자들이 대기 중입니다!";
                gameHeader.innerText = "현재 사다리가 세팅되었습니다. 방장의 오픈을 기다려주세요.";
                setupLadderBoard(data);
                drawBaseLadderWithPlayed(data);
            } 
            else if (data.status === 'playing') {
                statusText.innerText = "릴레이 사다리 진행 중! 🚀";
                gameHeader.innerText = "내 이름표를 클릭해서 사다리를 출발하세요!";
                setupLadderBoard(data); // Re-render nodes (to disable played ones)
                
                if (data.activePlayer !== undefined && data.activePlayer !== null) {
                    if (currentlyAnimatingPlayer !== data.activePlayer) {
                        startSingleAnimation(data.activePlayer, data);
                    }
                } else {
                    if (!isAnimating) drawBaseLadderWithPlayed(data);
                }
            }
            else if (data.status === 'finished') {
                statusText.innerText = "모든 릴레이 종료!";
                gameHeader.innerText = "모두의 게임이 종료되었습니다.";
                setupLadderBoard(data);
                drawBaseLadderWithPlayed(data);
                showResultModal(data.finalMatches);
            }
        }
    }, (error) => {
        statusText.innerText = "데이터 접근 권한 에러: " + (error.message || error);
    });

    if(downloadCsvBtn) {
        downloadCsvBtn.addEventListener('click', () => {
            const csvContent = "\uFEFF이름,결과\n참가자1,당첨 😎\n참가자2,꽝 😭\n참가자3,꽝 😭\n참가자4,선발대 🏃\n참가자5,휴식 ☕";
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.setAttribute("href", URL.createObjectURL(blob));
            link.setAttribute("download", "사다리타기_명단양식.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    csvUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            const rows = text.split('\n').map(r => r.trim()).filter(r => r);
            let actualRows = rows.filter(r => !r.includes('이름,결과') && !r.includes('이름\t결과'));
            let count = actualRows.length;
            if (count > 10) count = 10;
            if (count < 2) count = 2;
            playerCountInput.value = count;
            updateForms();

            actualRows.slice(0, count).forEach((row, i) => {
                let parts = row.split(',');
                if(parts.length < 2) parts = row.split('\t');
                if (parts[0]) document.getElementById(`player-${i}`).value = parts[0].trim();
                if (parts[1]) document.getElementById(`result-${i}`).value = parts[1].trim();
            });
            csvUploadInput.value = ''; 
        };
        reader.readAsText(file);
    });

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

    document.getElementById('open-room-btn').addEventListener('click', () => {
        const count = parseInt(playerCountInput.value);
        let players = [], results = [];
        for (let i = 0; i < count; i++) {
            players.push(document.getElementById(`player-${i}`).value);
            results.push(document.getElementById(`result-${i}`).value);
        }

        let lines = [];
        for (let col = 0; col < count - 1; col++) {
            let numLines = Math.floor(Math.random() * 2) + 2; 
            for (let i = 0; i < numLines; i++) {
                let y, valid = false, attempts = 0;
                while(!valid && attempts < 30) {
                    attempts++;
                    y = 0.15 + Math.random() * 0.7; 
                    const closeLine = lines.find(l => 
                        (l.col === col || l.col === col - 1 || l.col === col + 1) && Math.abs(l.y - y) < 0.1
                    );
                    if (!closeLine) valid = true;
                }
                if (valid) lines.push({ col, y });
            }
        }
        lines.sort((a,b) => a.y - b.y);

        let finalMatches = [];
        for(let start = 0; start < count; start++) {
            let c = start;
            lines.forEach(l => {
                if (l.col === c) c++;
                else if (l.col === c - 1) c--;
            });
            finalMatches.push({ player: players[start], result: results[c] });
        }

        isAdmin = true; 
        
        roomRef.set({
            status: 'waiting',
            players,
            results,
            lines: lines.length ? lines : false,
            lineCount: count,
            finalMatches,
            played: new Array(count).fill(false),
            activePlayer: null
        }).catch(e => alert("방 생성 실패: " + e.message));
    });

    document.getElementById('start-game-btn').addEventListener('click', () => {
        roomRef.update({ status: 'playing' }).catch(e => alert(e.message));
    });

    document.getElementById('force-finish-btn').addEventListener('click', () => {
        let allPlayed = new Array(localData.lineCount).fill(true);
        roomRef.update({ status: 'finished', played: allPlayed, activePlayer: null }).catch(e => alert(e.message));
    });

    document.getElementById('reset-game-btn').addEventListener('click', () => {
        roomRef.remove().catch(e => alert(e.message));
    });

    function setupLadderBoard(data) {
        startsContainer.innerHTML = '';
        endsContainer.innerHTML = '';
        data.players.forEach((p, idx) => {
            const el = document.createElement('div');
            el.className = 'start-node';
            el.innerText = p;
            
            if (data.played && data.played[idx]) {
                // 이미 탄 사람
                el.style.backgroundColor = '#f0f0f0';
                el.style.color = '#999';
                el.style.borderBottom = `4px solid ${colors[idx % colors.length]}50`; // 반투명
                el.style.boxShadow = 'none';
                el.style.cursor = 'default';
            } else {
                // 안 탄 사람
                el.style.borderBottom = `4px solid ${colors[idx % colors.length]}`;
                el.style.cursor = 'pointer';
                el.addEventListener('click', () => {
                    if (localData.status !== 'playing') return;
                    if (localData.activePlayer !== undefined && localData.activePlayer !== null) {
                        alert("다른 분이 방금 사다리를 출발시켰습니다! 잠시만 기다려주세요 👀🍿");
                        return;
                    }
                    if (localData.played && localData.played[idx]) return;

                    myTriggeredPlayer = idx;
                    let newPlayed = [...(localData.played || [])];
                    newPlayed[idx] = true;
                    
                    roomRef.update({ 
                        activePlayer: idx,
                        played: newPlayed
                    });
                });
            }
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
            if(!isAnimating) drawBaseLadderWithPlayed(localData);
        }
    });

    function drawBaseLadderWithPlayed(data) {
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

        // 궤적을 이미 남긴 플레이어의 선을 반투명하게 덧그림
        if (data.played) {
            data.played.forEach((isPlayed, idx) => {
                if (isPlayed && idx !== currentlyAnimatingPlayer) {
                    const pts = buildPathPts(idx);
                    ctx.beginPath();
                    ctx.lineWidth = 6;
                    ctx.strokeStyle = colors[idx % colors.length] + '60'; // 60% 투명도 (Hex 60)
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for(let i=1; i<pts.length; i++) {
                        ctx.lineTo(pts[i].x, pts[i].y);
                    }
                    ctx.stroke();
                }
            });
        }
    }

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

    function startSingleAnimation(idx, data) {
        if(isAnimating) return;
        isAnimating = true;
        currentlyAnimatingPlayer = idx;

        const pts = buildPathPts(idx);
        const pData = getPathData(pts);
        
        let currentDist = 0;
        const speed = canvasHeight * 0.018; 

        function animLoop() {
            currentDist += speed;
            if(currentDist >= pData.total) currentDist = pData.total;

            drawBaseLadderWithPlayed(data);

            ctx.beginPath();
            ctx.lineWidth = 6;
            ctx.strokeStyle = colors[idx % colors.length];
            
            let distLeft = currentDist;
            let lastX = pData.segments[0].p1.x, lastY = pData.segments[0].p1.y;
            ctx.moveTo(lastX, lastY);

            for(let seg of pData.segments) {
                if (distLeft >= seg.dist) {
                    ctx.lineTo(seg.p2.x, seg.p2.y);
                    distLeft -= seg.dist;
                    lastX = seg.p2.x; lastY = seg.p2.y;
                } else {
                    const ratio = distLeft / seg.dist;
                    lastX = seg.p1.x + (seg.p2.x - seg.p1.x)*ratio;
                    lastY = seg.p1.y + (seg.p2.y - seg.p1.y)*ratio;
                    ctx.lineTo(lastX, lastY);
                    break;
                }
            }
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(lastX, lastY, 6, 0, Math.PI*2);
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = colors[idx % colors.length];
            ctx.stroke();

            if (currentDist >= pData.total) {
                isAnimating = false;
                currentlyAnimatingPlayer = null;

                if (myTriggeredPlayer === idx) {
                    myTriggeredPlayer = null;
                    roomRef.update({ activePlayer: null });
                }

                // 전체가 끝났는지 검사 (오직 방장이나 마지막 진행자만 호출하도록)
                if (data.played && !data.played.includes(false)) {
                    // 모두 끝났으면 status 변경
                    if (isAdmin) {
                        roomRef.update({ status: 'finished' });
                    }
                }

            } else {
                requestAnimationFrame(animLoop);
            }
        }
        animLoop();
    }

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
        drawBaseLadderWithPlayed(localData); 
    });

    document.getElementById('restart-game-btn').addEventListener('click', () => {
        roomRef.remove().catch(e => alert(e.message));
        resultModal.style.display = 'none';
    });

    document.getElementById('copy-result-btn').addEventListener('click', () => {
        const text = localData.finalMatches.map(m => `${m.player} : ${m.result}`).join('\n');
        navigator.clipboard.writeText("🌸 웹 사다리타기 결과 🌸\n" + text).then(() => {
            alert('클립보드에 결과가 복사되었습니다!');
        });
    });

});
