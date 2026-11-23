import { db, appId } from './firebase-config.js';
import { showLoading, hideLoading, showToast } from './ui-helpers.js';
import { doc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { gameState, PVP_BOTS, updateHeaderDisplay } from './state.js';

export function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

export function getPvpRankInfo(points) {
    if (points >= 2100) return { name: 'Huyền Thoại', icon: '👑', color: 'text-fuchsia-400' };
    if (points >= 1800) return { name: 'Kim Cương', icon: '💎', color: 'text-cyan-400' };
    if (points >= 1500) return { name: 'Bạch Kim', icon: '💠', color: 'text-teal-300' };
    if (points >= 1300) return { name: 'Vàng', icon: '🥇', color: 'text-yellow-400' };
    if (points >= 1100) return { name: 'Bạc', icon: '🥈', color: 'text-slate-300' };
    return { name: 'Đồng', icon: '🥉', color: 'text-amber-500' };
}

export async function syncToLeaderboard() {
    if (!gameState.currentUserId || !gameState.myClubName) return;
    try {
        await setDoc(doc(db, 'artifacts', appId, 'leaderboard', gameState.currentUserId), {
            uid: gameState.currentUserId,
            clubName: gameState.myClubName,
            logo: gameState.myClubLogo || '🛡️',
            ovr: gameState.teamPower.OVR || 0,
            att: gameState.teamPower.ATT || 0,
            mid: gameState.teamPower.MID || 0,
            def: gameState.teamPower.DEF || 0,
            formation: gameState.currentFormation || '4-4-2',
            pvpPoints: gameState.myPvp.points || 1000,
            pvpWins: gameState.myPvp.wins || 0,
            pvpLosses: gameState.myPvp.losses || 0,
            updatedAt: Date.now()
        }, { merge: true });
    } catch (e) {
        console.error('Lỗi đồng bộ BXH:', e);
    }
}

export async function renderPvpView() {
    const today = getTodayKey();
    if (gameState.myPvp.lastPlayDate !== today) {
        gameState.myPvp.dailyPlays = 0;
        gameState.myPvp.lastPlayDate = today;
    }

    const rank = getPvpRankInfo(gameState.myPvp.points);
    if (document.getElementById('pvp-my-rank-icon')) document.getElementById('pvp-my-rank-icon').textContent = rank.icon;
    const rankNameEl = document.getElementById('pvp-my-rank-name');
    if (rankNameEl) {
        rankNameEl.textContent = rank.name;
        rankNameEl.className = `text-xl font-black ${rank.color}`;
    }
    if (document.getElementById('pvp-my-points')) document.getElementById('pvp-my-points').textContent = gameState.myPvp.points;
    if (document.getElementById('pvp-my-record')) document.getElementById('pvp-my-record').textContent = `${gameState.myPvp.wins}T - ${gameState.myPvp.draws || 0}H - ${gameState.myPvp.losses}B`;
    if (document.getElementById('pvp-daily-plays')) document.getElementById('pvp-daily-plays').textContent = `${gameState.myPvp.dailyPlays}/5`;

    const tbody = document.getElementById('pvp-leaderboard-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400 italic">Đang tải Bảng Xếp Hạng...</td></tr>';

    try {
        await syncToLeaderboard();
        const snap = await getDocs(collection(db, 'artifacts', appId, 'leaderboard'));
        gameState.serverLeaderboard = [];
        snap.forEach(function(d) {
            const data = d.data();
            if (data && data.clubName && data.ovr > 0) {
                gameState.serverLeaderboard.push(data);
            }
        });

        if (gameState.serverLeaderboard.length < 15) {
            PVP_BOTS.forEach(function(bot) {
                gameState.serverLeaderboard.push(bot);
            });
        }

        gameState.serverLeaderboard.sort(function(a, b) {
            if ((b.pvpPoints || 1000) !== (a.pvpPoints || 1000)) return (b.pvpPoints || 1000) - (a.pvpPoints || 1000);
            return (b.ovr || 0) - (a.ovr || 0);
        });

        const top50 = gameState.serverLeaderboard.slice(0, 50);
        tbody.innerHTML = '';

        if (top50.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-500 italic">Chưa có CLB nào trên BXH.</td></tr>';
            return;
        }

        top50.forEach(function(club, idx) {
            const isMe = club.uid === gameState.currentUserId;
            const cRank = getPvpRankInfo(club.pvpPoints || 1000);
            const logoHtml = (club.logo && club.logo.startsWith('http'))
                ? `<img src="${club.logo}" class="w-5 h-5 rounded-full object-contain inline mr-1.5" />`
                : `<span class="mr-1.5">${club.logo || '🛡️'}</span>`;

            const actionHtml = isMe
                ? `<span class="text-[10px] text-green-400 font-bold bg-green-900/40 px-2 py-1 rounded">CLB Bạn</span>`
                : `<button onclick="window.challengePvpOpponent('${club.uid}')" class="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow transition">⚔️ Đấu</button>`;

            tbody.innerHTML += `
                <tr class="${isMe ? 'bg-green-900/30 font-bold' : 'hover:bg-slate-700/40'} transition-colors">
                    <td class="p-3 text-center font-mono text-slate-400">${idx + 1}</td>
                    <td class="p-3 min-w-[150px] whitespace-nowrap ${isMe ? 'text-green-400' : 'text-white'}">${logoHtml}${club.clubName}</td>
                    <td class="p-3 text-center font-black text-yellow-400">${club.ovr}</td>
                    <td class="p-3 text-center whitespace-nowrap ${cRank.color} font-bold">${cRank.icon} ${cRank.name}</td>
                    <td class="p-3 text-center font-bold text-white">${club.pvpPoints || 1000}</td>
                    <td class="p-3 text-center whitespace-nowrap">${actionHtml}</td>
                </tr>
            `;
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-red-400">Không thể tải BXH. Kiểm tra quyền Firestore Rules!</td></tr>';
    }
}

export function quickMatchPvp() {
    const rivals = gameState.serverLeaderboard.filter(function(c) { return c.uid !== gameState.currentUserId; });
    if (rivals.length === 0) {
        showToast("Chưa có đối thủ nào khác trên server!", "warning");
        return;
    }
    const randomRival = rivals[Math.floor(Math.random() * rivals.length)];
    challengePvpOpponent(randomRival.uid);
}

export function challengePvpOpponent(targetUid) {
    if (gameState.startingXI.includes(null) || gameState.teamPower.OVR === 0) {
        showToast("Xếp đủ 11 cầu thủ vào Sân trước khi đá PvP!", "error");
        return;
    }
    const today = getTodayKey();
    if (gameState.myPvp.lastPlayDate !== today) {
        gameState.myPvp.dailyPlays = 0;
        gameState.myPvp.lastPlayDate = today;
    }
    if (gameState.myPvp.dailyPlays >= 5) {
        showToast("Bạn đã hết 5 lượt PvP hôm nay! Hãy quay lại vào ngày mai.", "warning");
        return;
    }
    const rival = gameState.serverLeaderboard.find(function(c) { return c.uid === targetUid; });
    if (!rival) {
        showToast("Không tìm thấy đối thủ!", "error");
        return;
    }
    const opponentObj = {
        id: rival.uid,
        name: rival.clubName,
        ovr: rival.ovr,
        pvpPoints: rival.pvpPoints || 1000
    };
    if (typeof window.switchView === 'function') window.switchView('league');
    if (typeof window.startMatchEngine === 'function') window.startMatchEngine(opponentObj, false, true);
}

export async function finishPvpMatch(homeScore, awayScore, opponent) {
    showLoading("ĐANG CẬP NHẬT RANK PVP...");
    try {
        let pointsDelta = 0;
        let rewardMoney = 0;
        const today = getTodayKey();

        if (homeScore > awayScore) {
            gameState.myPvp.wins = (gameState.myPvp.wins || 0) + 1;
            pointsDelta = 25 + (opponent.ovr > gameState.teamPower.OVR ? 10 : 0);
            rewardMoney = 150000;
        } else if (homeScore === awayScore) {
            gameState.myPvp.draws = (gameState.myPvp.draws || 0) + 1;
            pointsDelta = 5;
            rewardMoney = 50000;
        } else {
            gameState.myPvp.losses = (gameState.myPvp.losses || 0) + 1;
            pointsDelta = -15;
        }

        gameState.myPvp.points = Math.max(800, (gameState.myPvp.points || 1000) + pointsDelta);
        gameState.myPvp.dailyPlays = (gameState.myPvp.dailyPlays || 0) + 1;
        gameState.myPvp.lastPlayDate = today;
        gameState.myBudget += rewardMoney;

        updateHeaderDisplay();
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), {
            budget: gameState.myBudget,
            pvp: gameState.myPvp
        }, { merge: true });
        await syncToLeaderboard();

        document.getElementById('match-live').classList.add('hidden');
        document.getElementById('league-table-container').classList.remove('hidden');
        if (typeof window.toggleNavLock === 'function') window.toggleNavLock(false);
        if (gameState.leagueState.currentRound <= 31 && document.getElementById('quick-play-btn')) {
            document.getElementById('quick-play-btn').classList.remove('hidden');
        }

        const msg = pointsDelta >= 0
            ? `⚔️ PvP kết thúc! +${pointsDelta} điểm Rank & +€${rewardMoney.toLocaleString()}`
            : `⚔️ PvP thất bại! ${pointsDelta} điểm Rank.`;
        showToast(msg, pointsDelta >= 0 ? "success" : "warning");
        if (typeof window.switchView === 'function') window.switchView('pvp');
    } catch (e) {
        showToast("Lỗi lưu kết quả PvP!", "error");
    } finally {
        hideLoading();
    }
}
