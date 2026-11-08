import { auth, db, appId, BOT_CITY_NAMES, RESERVE_BOT_NAMES, POSITIONS, FOREIGN_NAMES, RICH_CLUBS, STORE_ITEMS, getPrizeMoney, recalculateOVR } from './firebase-config.js';
import { showLoading, hideLoading, showToast } from './ui-helpers.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global State Variables (Giữ nguyên)
let currentUserId = null; let myClubName = "My Club"; let myBudget = 0; let myFame = 30;
let globalPlayersList = []; let globalPlayersMap = {};
let currentFormation = '4-4-2'; let startingXI = new Array(11).fill(null);
let teamPower = { OVR: 0 };
let leagueState = { currentRound: 1, standings: [], schedule: [], friendlyMatchesPlayed: 0, promotedBots: [], pendingBuys: [], pendingSells: [], rankHistory: [] };
let currentMarketList = []; let currentlyViewingPlayerId = null; let currentSlotToFill = null; let currentItemToApply = null;

// Các hàm UI gán vào window để HTML gọi được
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;

const updateHeaderDisplay = () => {
    document.getElementById('budget-display').textContent = `€${myBudget.toLocaleString()}`;
    let fameDiv = document.getElementById('fame-display-container');
    if (!fameDiv) {
        fameDiv = document.createElement('div'); fameDiv.id = 'fame-display-container';
        fameDiv.className = 'bg-slate-800 px-4 py-2 rounded-lg border border-slate-700 mr-3 hidden sm:inline-block';
        const budgetContainer = document.getElementById('budget-display').parentElement;
        budgetContainer.parentElement.insertBefore(fameDiv, budgetContainer);
    }
    fameDiv.innerHTML = `<span class="text-slate-400 text-sm mr-2">Danh tiếng:</span><span class="text-yellow-400 font-bold">🌟 ${myFame}</span>`;
};

const switchView = (v) => {
    ['view-overview', 'view-squad', 'view-tactics', 'view-league', 'view-transfer', 'view-store'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['nav-overview', 'nav-squad', 'nav-tactics', 'nav-league', 'nav-transfer', 'nav-store'].forEach(id => { document.getElementById(id).className = "block px-4 py-3 hover:bg-slate-800 text-slate-300 rounded-lg border border-transparent"; });
    document.getElementById(`view-${v}`).classList.remove('hidden'); document.getElementById(`nav-${v}`).className = "block px-4 py-3 bg-green-900/40 text-green-400 font-medium rounded-lg border border-green-900/50";
    if(v === 'league') renderLeagueView(); if(v === 'transfer') renderTransferMarket(); if(v === 'store') renderStore(); if(v === 'overview') renderOverview();
};
['overview', 'squad', 'tactics', 'league', 'transfer', 'store'].forEach(v => document.getElementById(`nav-${v}`).addEventListener('click', () => switchView(v)));

const renderOverview = () => {
    const overviewDiv = document.getElementById('view-overview'); if (!overviewDiv) return;
    let userTeam = leagueState.standings.find(t => t.isUser); let currentRank = userTeam ? leagueState.standings.findIndex(t => t.isUser) + 1 : '-';
    let nextOpponent = null; if (leagueState.currentRound <= 31 && leagueState.schedule) { const oppId = leagueState.schedule[leagueState.currentRound - 1]; nextOpponent = leagueState.standings.find(t => t.id === oppId); }
    const posCount = { GK: 0, DEF: 0, MID: 0, FWD: 0 }; globalPlayersList.forEach(p => { if (posCount[p.pos] !== undefined) posCount[p.pos]++; });

    let chartHtml = `<div class="h-32 flex items-center justify-center text-slate-500 italic">Chưa có dữ liệu thi đấu mùa này. Hãy đá vòng đầu tiên!</div>`;
    if (leagueState.rankHistory && leagueState.rankHistory.length > 0) {
        let pointsStr = ""; let labelsStr = ""; const w = 800; const h = 200; const xStep = w / 30; 
        leagueState.rankHistory.forEach((rank, idx) => {
            const x = idx * xStep; const y = 20 + ((rank - 1) / 31) * 160; pointsStr += `${x},${y} `;
            labelsStr += `<circle cx="${x}" cy="${y}" r="6" fill="#22c55e" stroke="#0f172a" stroke-width="2" class="hover:fill-yellow-400 hover:r-8 transition-all cursor-pointer"><title>Vòng ${idx+1}: Hạng ${rank}</title></circle>`;
        });
        chartHtml = `<div class="relative w-full h-full overflow-x-auto overflow-y-hidden scrollbar-hide py-2"><svg viewBox="-20 0 ${w + 40} ${h}" class="min-w-[600px] w-full h-48 drop-shadow-xl"><text x="-15" y="25" fill="#64748b" font-size="12" font-weight="bold">Top 1</text><text x="-15" y="105" fill="#334155" font-size="12">Top 16</text><text x="-15" y="185" fill="#64748b" font-size="12" font-weight="bold">Top 32</text><line x1="25" y1="20" x2="${w}" y2="20" stroke="#334155" stroke-dasharray="4" /><line x1="25" y1="100" x2="${w}" y2="100" stroke="#1e293b" stroke-dasharray="4" /><line x1="25" y1="180" x2="${w}" y2="180" stroke="#334155" stroke-dasharray="4" /><polyline points="${pointsStr}" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${labelsStr}</svg></div>`;
    }

    overviewDiv.innerHTML = `<div class="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-green-900/30 p-8 rounded-2xl shadow-xl"><h3 class="text-3xl font-bold text-white mb-2">Chào mừng HLV của <span class="text-green-400">${myClubName}</span></h3><p class="text-slate-300 text-lg mb-4">Mùa giải đang diễn ra ở <span class="font-bold text-yellow-400">Vòng ${leagueState.currentRound <= 31 ? leagueState.currentRound : 'Kết thúc'}</span>. ${nextOpponent ? `Đối thủ tiếp theo: <b>${nextOpponent.name}</b>` : 'Đang trong kỳ nghỉ Hậu mùa giải.'}</p><button onclick="document.getElementById('nav-league').click()" class="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition-colors">Tới Sân Cỏ Ngay ⚽</button></div><div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6"><div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg flex flex-col justify-center"><h4 class="text-slate-400 font-bold mb-4 border-b border-slate-700 pb-2">🏢 CÂU LẠC BỘ</h4><div class="flex justify-between items-center mb-2"><span class="text-slate-300">Ngân sách:</span><span class="text-2xl font-bold text-green-400">€${(myBudget/1000000).toFixed(2)}M</span></div><div class="flex justify-between items-center"><span class="text-slate-300">Danh tiếng (Fame):</span><span class="text-xl font-bold text-yellow-400">🌟 ${myFame}</span></div></div><div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg"><h4 class="text-slate-400 font-bold mb-4 border-b border-slate-700 pb-2">👕 ĐỘI HÌNH (${globalPlayersList.length}/25)</h4><div class="grid grid-cols-2 gap-2 text-sm"><div class="bg-red-900/30 border border-red-900/50 p-2 rounded text-center"><div class="font-bold text-red-400">${posCount.FWD}</div><div class="text-slate-400 text-[11px] uppercase">Tiền đạo</div></div><div class="bg-green-900/30 border border-green-900/50 p-2 rounded text-center"><div class="font-bold text-green-400">${posCount.MID}</div><div class="text-slate-400 text-[11px] uppercase">Tiền vệ</div></div><div class="bg-blue-900/30 border border-blue-900/50 p-2 rounded text-center"><div class="font-bold text-blue-400">${posCount.DEF}</div><div class="text-slate-400 text-[11px] uppercase">Hậu vệ</div></div><div class="bg-yellow-900/30 border border-yellow-900/50 p-2 rounded text-center"><div class="font-bold text-yellow-400">${posCount.GK}</div><div class="text-slate-400 text-[11px] uppercase">Thủ môn</div></div></div></div><div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg flex flex-col justify-center"><h4 class="text-slate-400 font-bold mb-4 border-b border-slate-700 pb-2">📈 PHONG ĐỘ (Hạng ${currentRank})</h4><div class="flex justify-between text-center"><div><div class="text-2xl font-bold text-green-400">${userTeam ? userTeam.won : 0}</div><div class="text-slate-400 text-xs">Thắng</div></div><div><div class="text-2xl font-bold text-slate-300">${userTeam ? userTeam.drawn : 0}</div><div class="text-slate-400 text-xs">Hòa</div></div><div><div class="text-2xl font-bold text-red-400">${userTeam ? userTeam.lost : 0}</div><div class="text-slate-400 text-xs">Thua</div></div><div><div class="text-2xl font-bold text-yellow-400">${userTeam ? userTeam.points : 0}</div><div class="text-slate-400 text-xs">Điểm</div></div></div></div></div><div class="bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-lg mt-6"><h4 class="text-slate-400 font-bold mb-4 border-b border-slate-700 pb-2">📊 BIỂU ĐỒ THỨ HẠNG MÙA GIẢI</h4>${chartHtml}</div>`;
};

let isLogin = true; 
document.getElementById('toggle-mode-btn').addEventListener('click', (e) => { 
    e.preventDefault(); isLogin = !isLogin; document.getElementById('auth-submit-btn').textContent = isLogin ? "Đăng Nhập" : "Đăng Ký"; document.getElementById('auth-toggle-text').textContent = isLogin ? "Chưa có tài khoản?" : "Đã có tài khoản?";
});

document.getElementById('auth-form').addEventListener('submit', async (e) => { 
    e.preventDefault(); const btn = document.getElementById('auth-submit-btn'); btn.disabled = true; const errDiv = document.getElementById('auth-error'); errDiv.classList.add('hidden');
    showLoading(isLogin ? "ĐANG XÁC THỰC..." : "ĐANG TẠO TÀI KHOẢN...");
    try { if(isLogin) await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); else await createUserWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); } 
    catch(err) { errDiv.textContent = err.message; errDiv.classList.remove('hidden'); btn.disabled = false; } 
    finally { hideLoading(); }
});
document.getElementById('logout-btn').addEventListener('click', () => { showLoading("ĐANG ĐĂNG XUẤT..."); signOut(auth).then(() => hideLoading()); });

onAuthStateChanged(auth, (user) => {
    if (user) { document.getElementById('auth-container').classList.add('hidden'); document.getElementById('dashboard-section').classList.remove('hidden'); currentUserId = user.uid; document.getElementById('user-email-display').textContent = user.email; loadGameData(user.uid); } 
    else { document.getElementById('dashboard-section').classList.add('hidden'); document.getElementById('auth-container').classList.remove('hidden'); }
});

const loadGameData = async (uid) => {
    showLoading("ĐANG TẢI DỮ LIỆU CLB...");
    try {
        const profileSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'profile', 'info'));
        if (profileSnap.exists()) {
            const profileData = profileSnap.data(); myClubName = profileData.clubName; myBudget = profileData.budget || 10000000; myFame = profileData.fame || 30;
            updateHeaderDisplay();
            const pSnap = await getDocs(collection(db, 'artifacts', appId, 'users', uid, 'players'));
            globalPlayersList = []; globalPlayersMap = {};
            pSnap.forEach(doc => { 
                const d = doc.data(); d.id = doc.id; d.itemsUsed = d.itemsUsed || 0; 
                if (!d.stats || isNaN(d.ovr)) { const fallback = Math.floor(Math.random() * 20) + 50; d.stats = { PAC:fallback, SHO:fallback, PAS:fallback, DRI:fallback, DEF:fallback, PHY:fallback }; d.ovr = recalculateOVR(d.pos, d.stats); setDoc(doc.ref, { stats: d.stats, ovr: d.ovr }, { merge: true }); }
                if(!d.bonusStats) d.bonusStats = { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }; if (d.stamina === undefined || isNaN(d.stamina)) d.stamina = 100;
                globalPlayersList.push(d); globalPlayersMap[d.id] = d; 
            });
            renderSquadList(); 
            const tacSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'profile', 'tactics'));
            if(tacSnap.exists()) { const tData = tacSnap.data(); currentFormation = tData.formation || '4-4-2'; document.getElementById('formation-select').value = currentFormation; startingXI = tData.startingXI || new Array(11).fill(null); } 
            else if(globalPlayersList.length >= 11) {
                startingXI = new Array(11).fill(null); const layout = currentFormation.split('-').map(Number); layout.reverse(); layout.push(1);
                const posNames = ['FWD', 'MID', 'DEF', 'GK']; let expectedPositions = []; layout.forEach((count, idx) => { for(let i=0; i<count; i++) expectedPositions.push(posNames[idx]); });
                let usedIds = new Set();
                expectedPositions.forEach((reqPos, index) => { let best = globalPlayersList.filter(p => p.pos === reqPos && !usedIds.has(p.id)).sort((a,b)=>b.ovr - a.ovr)[0]; if(best) { startingXI[index] = best.id; usedIds.add(best.id); } });
                startingXI.forEach((val, index) => { if(!val) { let best = globalPlayersList.filter(p => !usedIds.has(p.id)).sort((a,b)=>b.ovr - a.ovr)[0]; if(best) { startingXI[index] = best.id; usedIds.add(best.id); } } });
            }
            renderPitch();
            const leagueSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'league', 'state'));
            if (leagueSnap.exists()) {
                leagueState = leagueSnap.data(); if (!leagueState.promotedBots) leagueState.promotedBots = []; if (!leagueState.pendingBuys) leagueState.pendingBuys = []; if (!leagueState.pendingSells) leagueState.pendingSells = []; if (!leagueState.rankHistory) leagueState.rankHistory = [];
            } else { await initLeagueData(uid, myClubName); }
            switchView('overview');
        } else { document.getElementById('init-club-modal').classList.remove('hidden'); }
    } catch(e) { showToast("Lỗi tải dữ liệu: " + e.message); } finally { hideLoading(); }
};

document.getElementById('create-club-btn').addEventListener('click', async () => {
    const clubName = document.getElementById('club-name-input').value.trim(); if(!clubName) { showToast("Vui lòng nhập tên Câu lạc bộ!"); return; }
    const btn = document.getElementById('create-club-btn'); btn.textContent = "Đang tạo..."; btn.disabled = true; showLoading("ĐANG KHỞI TẠO ĐỘI HÌNH TÂN BINH...");
    try {
        const batch = writeBatch(db); const userRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'); batch.set(userRef, { clubName: clubName, budget: 10000000, fame: 30 });
        const INITIAL_POS = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'FWD']; const superstarIndex = Math.floor(Math.random() * 16);
        INITIAL_POS.forEach((pos, i) => {
            const isStar = (i === superstarIndex); const baseMin = isStar ? 75 : 30; const baseMax = isStar ? 95 : 45; const rnd = () => Math.floor(Math.random() * (baseMax - baseMin + 1)) + baseMin;
            let stats = { PAC: rnd(), SHO: rnd(), PAS: rnd(), DRI: rnd(), DEF: rnd(), PHY: rnd() }; let ovr = recalculateOVR(pos, stats);
            const playerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players'));
            batch.set(playerRef, { name: FOREIGN_NAMES[i % FOREIGN_NAMES.length] + (isStar ? " ⭐" : ""), pos: pos, ovr: ovr, stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }, stamina: 100, value: ovr * 100000, isListed: false, itemsUsed: 0 });
        });
        await batch.commit(); await initLeagueData(currentUserId, clubName); document.getElementById('init-club-modal').classList.add('hidden'); showToast("Khởi tạo Câu lạc bộ thành công!", "success"); await loadGameData(currentUserId);
    } catch(e) { showToast("Lỗi khi tạo CLB: " + e.message); } finally { hideLoading(); }
});

const initLeagueData = async (uid, overrideName = null) => {
    let bots = []; for (let i = 0; i < 31; i++) { const ovr = Math.floor(Math.random() * 20) + 60; bots.push({ id: `bot_${Date.now()}_${i}`, name: `${BOT_CITY_NAMES[i]} FC`, isUser: false, ovr: ovr, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }); }
    let initialStandings = [...bots, { id: 'user', name: overrideName || myClubName, isUser: true, ovr: 0, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }];
    let userSchedule = bots.map(b => b.id).sort(() => Math.random() - 0.5);
    leagueState = { currentRound: 1, standings: initialStandings, schedule: userSchedule, friendlyMatchesPlayed: 0, promotedBots: [], pendingBuys: [], pendingSells: [], rankHistory: [] };
    await setDoc(doc(db, 'artifacts', appId, 'users', uid, 'league', 'state'), leagueState);
};

const renderSquadList = () => {
    const tbody = document.getElementById('squad-list-body'); tbody.innerHTML = '';
    const order = { 'GK': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 }; globalPlayersList.sort((a, b) => order[a.pos] - order[b.pos] || b.ovr - a.ovr);
    const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    globalPlayersList.forEach(p => {
        let statusHtml = p.isListed ? '<span class="text-xs bg-red-900 text-red-300 px-2 py-1 rounded">Đang chờ duyệt Bán</span>' : '<span class="text-xs bg-green-900 text-green-300 px-2 py-1 rounded">Tại CLB</span>';
        const stColor = p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400'); const stBg = p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500');
        tbody.innerHTML += `<tr class="hover:bg-slate-700/50 transition-colors cursor-pointer" onclick="window.openPlayerDetail('${p.id}')"><td class="p-4 pl-6"><span class="${posColors[p.pos]} text-white text-xs font-bold px-2 py-1 rounded w-12 inline-block text-center">${p.pos}</span></td><td class="p-4 font-medium text-white"><div class="mb-1">${p.name}</div><div class="flex items-center gap-2 text-[10px] ${stColor}"><span>⚡ ${p.stamina}%</span><div class="w-16 bg-slate-700 h-1.5 rounded-full overflow-hidden"><div class="${stBg} h-full" style="width: ${p.stamina}%"></div></div></div></td><td class="p-4 text-center font-bold text-green-400">${p.ovr}</td><td class="p-4 text-center">${statusHtml}</td><td class="p-4 text-right pr-6 text-yellow-400">€${(p.value || p.ovr*100000).toLocaleString()}</td></tr>`;
    });
};

window.openPlayerDetail = (playerId) => {
    const p = globalPlayersMap[playerId]; if(!p) return; currentlyViewingPlayerId = playerId;
    const st = p.stats || { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 }; const bSt = p.bonusStats || { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 };
    const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    document.getElementById('detail-name').textContent = p.name; document.getElementById('detail-pos').textContent = p.pos; document.getElementById('detail-pos').className = `${posColors[p.pos]} text-white text-xs font-bold px-2 py-1 rounded`; document.getElementById('detail-bg-pos').textContent = p.pos; document.getElementById('detail-ovr').textContent = p.ovr; document.getElementById('detail-items-used').textContent = p.itemsUsed || 0;
    ['pac','sho','pas','dri','def','phy'].forEach(s => {
        const upperS = s.toUpperCase(); const total = st[upperS] || 0; const bonus = bSt[upperS] || 0; const base = total - bonus; const displayEl = document.getElementById(`detail-${s}`);
        if (bonus > 0) { displayEl.innerHTML = `${base} <span class="text-green-400 font-bold ml-1">+${bonus}</span>`; } else { displayEl.textContent = total; }
    });
    document.getElementById('detail-value').textContent = `€${(p.value || p.ovr*100000).toLocaleString()}`;
    
    let staminaDiv = document.getElementById('detail-stamina-bar');
    if (!staminaDiv) { staminaDiv = document.createElement('div'); staminaDiv.id = 'detail-stamina-bar'; staminaDiv.className = 'mt-3 mb-2 flex flex-col items-center justify-center'; const pModal = document.getElementById('sell-player-container').parentElement; pModal.insertBefore(staminaDiv, document.getElementById('sell-player-container')); }
    const stColor = p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400'); const stBg = p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500');
    staminaDiv.innerHTML = `<div class="text-sm text-slate-300 mb-1">Thể lực hiện tại: <span class="font-bold ${stColor}">${p.stamina}%</span></div><div class="w-3/4 bg-slate-700 h-2 rounded-full overflow-hidden mb-2"><div class="${stBg} h-full transition-all" style="width: ${p.stamina}%"></div></div>`;
    const sellContainer = document.getElementById('sell-player-container');
    if (p.isListed) { sellContainer.innerHTML = `<button disabled class="w-full py-2 bg-slate-700 text-slate-400 rounded font-bold cursor-not-allowed">Đang chờ duyệt Bán (Đá 1 trận để xem kết quả)</button>`; } else { sellContainer.innerHTML = `<button onclick="window.listPlayerForSale()" class="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold shadow-lg transition mb-2">Đưa lên TTCN</button><button onclick="window.terminateContract()" class="w-full py-2 bg-transparent border border-red-800 text-red-500 hover:bg-red-900/30 rounded text-sm transition">Thanh lý Hợp đồng (Phạt 10-15%)</button>`; }
    document.getElementById('player-detail-modal').classList.remove('hidden');
};
document.getElementById('close-detail-modal').addEventListener('click', () => { document.getElementById('player-detail-modal').classList.add('hidden'); });

const calcTeamPower = () => {
    let totalOVR = 0, count = 0;
    startingXI.forEach(id => { if(id && globalPlayersMap[id]) { let p = globalPlayersMap[id]; let penalty = p.stamina < 60 ? Math.floor((60 - p.stamina) / 2) : 0; totalOVR += Math.max(1, p.ovr - penalty); count++; } });
    teamPower.OVR = count > 0 ? Math.round(totalOVR/count) : 0; document.getElementById('team-ovr').textContent = teamPower.OVR;
    if(leagueState && leagueState.standings) { let userTeam = leagueState.standings.find(t => t.isUser); if(userTeam) userTeam.ovr = teamPower.OVR; }
};

const renderPitch = () => {
    const container = document.getElementById('pitch-container'); container.innerHTML = ''; const layout = currentFormation.split('-').map(Number); layout.reverse(); layout.push(1); const posNames = ['FWD', 'MID', 'DEF', 'GK']; let slotIndex = 0;
    layout.forEach((rowCount, rowIndex) => {
        const expectedPos = posNames[rowIndex]; const rowDiv = document.createElement('div'); rowDiv.className = "flex justify-center items-center w-full gap-2 sm:gap-6";
        for(let i=0; i<rowCount; i++) {
            const p = startingXI[slotIndex] ? globalPlayersMap[startingXI[slotIndex]] : null; const currentIndex = slotIndex; let pHtml = "";
            if (p) {
                const isOutOfPos = p.pos !== expectedPos; const borderClass = isOutOfPos ? 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'border-green-500'; const penalty = p.stamina < 60 ? Math.floor((60 - p.stamina) / 2) : 0; const effOvr = Math.max(1, p.ovr - penalty); const stBg = p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500');
                pHtml = `<div class="w-10 h-10 bg-slate-800 border-2 ${borderClass} rounded-full flex items-center justify-center font-bold text-sm z-10 shadow-lg relative">${effOvr}${penalty > 0 ? `<div class="absolute -top-2 -right-2 bg-red-600 text-white text-[9px] font-bold px-1 rounded-full shadow">-${penalty}</div>` : ''}</div><div class="mt-1 w-14 flex flex-col items-center"><div class="bg-black/80 px-1.5 py-0.5 rounded text-[10px] text-white truncate max-w-full z-10">${p.name}</div><div class="w-full bg-slate-800 h-1.5 mt-0.5 rounded border border-slate-700 overflow-hidden z-10"><div class="${stBg} h-full" style="width: ${p.stamina}%"></div></div></div>`;
            } else { pHtml = `<div class="w-10 h-10 bg-white/10 hover:bg-white/20 border-2 border-dashed border-white/40 rounded-full flex items-center justify-center text-white/50 text-xs font-bold z-10 transition">${expectedPos}</div>`; }
            rowDiv.innerHTML += `<div class="relative flex flex-col items-center w-16 cursor-pointer hover:scale-110 transition-transform" onclick="window.openBenchSelect(${currentIndex}, '${expectedPos}')">${pHtml}</div>`; slotIndex++;
        }
        container.appendChild(rowDiv);
    });
    calcTeamPower();
};

document.getElementById('formation-select').addEventListener('change', (e) => { 
    currentFormation = e.target.value; const layout = currentFormation.split('-').map(Number); layout.reverse(); layout.push(1); const posNames = ['FWD', 'MID', 'DEF', 'GK']; let expectedPositions = []; layout.forEach((count, idx) => { for(let i=0; i<count; i++) expectedPositions.push(posNames[idx]); });
    let newXI = new Array(11).fill(null); let availablePlayers = startingXI.filter(id => id !== null).map(id => globalPlayersMap[id]);
    expectedPositions.forEach((reqPos, index) => { let matchIdx = availablePlayers.findIndex(p => p && p.pos === reqPos); if (matchIdx !== -1) { newXI[index] = availablePlayers[matchIdx].id; availablePlayers.splice(matchIdx, 1); } });
    newXI.forEach((val, index) => { if (!val && availablePlayers.length > 0) { newXI[index] = availablePlayers[0].id; availablePlayers.splice(0, 1); } });
    startingXI = newXI; renderPitch(); 
});

window.openBenchSelect = (slotIndex, expectedPos) => {
    currentSlotToFill = slotIndex; const container = document.getElementById('bench-list-container'); container.innerHTML = ''; const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    let benchList = [...globalPlayersList].sort((a, b) => { if (a.pos === expectedPos && b.pos !== expectedPos) return -1; if (a.pos !== expectedPos && b.pos === expectedPos) return 1; return b.ovr - a.ovr; });
    benchList.forEach(p => {
        const isPlaying = startingXI.includes(p.id); if (isPlaying && startingXI[slotIndex] !== p.id) return;
        const isCurrent = startingXI[slotIndex] === p.id; const stColor = p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400');
        container.innerHTML += `<div onclick="window.assignPlayerToSlot('${p.id}')" class="flex justify-between items-center p-3 hover:bg-slate-700/50 border-b border-slate-700/50 cursor-pointer rounded ${isCurrent ? 'bg-green-900/30' : ''}"><div class="flex items-center gap-3"><span class="${posColors[p.pos]} text-white text-[10px] font-bold px-2 py-0.5 rounded w-10 text-center">${p.pos}</span><div class="flex flex-col"><span class="text-white text-sm ${isCurrent ? 'font-bold' : ''}">${p.name}</span><span class="text-[10px] ${stColor}">⚡ ${p.stamina}%</span></div></div><span class="text-green-400 font-bold">${p.ovr}</span></div>`;
    });
    document.getElementById('select-player-modal').classList.remove('hidden');
};
window.closeBenchSelect = () => { document.getElementById('select-player-modal').classList.add('hidden'); };
window.assignPlayerToSlot = (playerId) => { if(currentSlotToFill !== null) { startingXI[currentSlotToFill] = playerId; renderPitch(); window.closeBenchSelect(); } };
window.removePlayerFromSlot = () => { if(currentSlotToFill !== null) { startingXI[currentSlotToFill] = null; renderPitch(); window.closeBenchSelect(); } };

document.getElementById('save-tactics-btn').addEventListener('click', async () => { 
    showLoading("ĐANG LƯU CHIẾN THUẬT...");
    try { await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'tactics'), { formation: currentFormation, startingXI: startingXI }); showToast("Đã lưu chiến thuật vào CSDL!", "success"); } 
    catch(e) { showToast("Lỗi khi lưu chiến thuật: " + e.message); } finally { hideLoading(); }
});

// ================= MODULE 6: TRANSFER MARKET =================
document.getElementById('tab-transfer-market').addEventListener('click', () => { document.getElementById('transfer-market-section').classList.remove('hidden'); document.getElementById('transfer-offers-section').classList.add('hidden'); document.getElementById('tab-transfer-market').className = "px-4 py-2 font-bold text-green-400 border-b-2 border-green-400"; document.getElementById('tab-transfer-offers').className = "px-4 py-2 font-medium text-slate-400 hover:text-white transition"; document.getElementById('tab-transfer-offers').textContent = `Thương vụ chờ xử lý (${(leagueState.pendingBuys?.length || 0) + (leagueState.pendingSells?.length || 0)})`; });
document.getElementById('tab-transfer-offers').addEventListener('click', () => { document.getElementById('transfer-market-section').classList.add('hidden'); document.getElementById('transfer-offers-section').classList.remove('hidden'); document.getElementById('tab-transfer-market').className = "px-4 py-2 font-medium text-slate-400 hover:text-white transition"; document.getElementById('tab-transfer-offers').className = "px-4 py-2 font-bold text-green-400 border-b-2 border-green-400"; renderPendingTransfers(); });

const generateMarketPlayers = () => {
    currentMarketList = []; for(let i=0; i<8; i++) { const isStar = Math.random() > 0.8; const pos = POSITIONS[Math.floor(Math.random()*POSITIONS.length)]; const name = FOREIGN_NAMES[Math.floor(Math.random()*FOREIGN_NAMES.length)] + " " + Math.floor(Math.random()*99); const ovr = isStar ? Math.floor(Math.random()*15)+80 : Math.floor(Math.random()*20)+50; const val = ovr * (isStar ? 150000 : 80000); let stats = { PAC: ovr, SHO: ovr, PAS: ovr, DRI: ovr, DEF: ovr, PHY: ovr };
        currentMarketList.push({ id: 'market_' + Date.now() + i, name: name + (isStar?"⭐":""), pos: pos, ovr: ovr, value: val, stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }, stamina: 100, isListed: false, itemsUsed: 0 });
    }
};

const renderTransferMarket = () => {
    if(currentMarketList.length === 0) generateMarketPlayers(); document.getElementById('tab-transfer-offers').textContent = `Thương vụ chờ xử lý (${(leagueState.pendingBuys?.length || 0) + (leagueState.pendingSells?.length || 0)})`;
    const tbody = document.getElementById('market-list-body'); tbody.innerHTML = ''; const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    currentMarketList.forEach(p => {
        let isPending = leagueState.pendingBuys?.find(b => b.marketId === p.id); let btnHtml = isPending ? `<button disabled class="bg-slate-700 text-slate-400 text-xs px-3 py-1.5 rounded font-bold shadow cursor-not-allowed">Đang chờ duyệt</button>` : `<button onclick="window.makeBuyOffer('${p.id}')" class="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded font-bold shadow transition">Đặt Mua</button>`;
        tbody.innerHTML += `<tr class="hover:bg-slate-700/50 border-b border-slate-700/30 transition-colors"><td class="p-4 pl-6"><span class="${posColors[p.pos]} text-white text-xs font-bold px-2 py-1 rounded w-12 inline-block text-center">${p.pos}</span></td><td class="p-4 font-medium text-white">${p.name} ${p.ovr >= 85 ? '<span class="text-xs text-yellow-400 ml-1">(Đòi hỏi Fame > 60)</span>' : ''}</td><td class="p-4 text-center font-bold text-green-400">${p.ovr}</td><td class="p-4 text-right pr-6 text-yellow-400">€${p.value.toLocaleString()}</td><td class="p-4">${btnHtml}</td></tr>`;
    });
};
document.getElementById('refresh-market-btn').addEventListener('click', () => { generateMarketPlayers(); renderTransferMarket(); });

window.makeBuyOffer = async (marketId) => {
    const p = currentMarketList.find(x => x.id === marketId); if(!p) return;
    if (p.ovr >= 85 && myFame < 60) { showToast(`CLB của bạn chưa đủ Danh tiếng (Fame < 60). ${p.name} từ chối đàm phán!`, "error"); return; }
    if (globalPlayersList.length + (leagueState.pendingBuys?.length || 0) >= 25) { showToast("Đội hình và danh sách chờ đã đầy (Tối đa 25 người)!"); return; }
    const offerStr = prompt(`Nhập mức giá bạn muốn đề nghị cho ${p.name} (Giá gốc: €${p.value.toLocaleString()}):\n- Trả càng cao, tỷ lệ nẫng tay trên càng giảm.\n- Thương vụ chốt sau 1 vòng đấu.`, p.value);
    if (offerStr === null) return; const bidAmount = parseInt(offerStr.replace(/,/g, ''));
    if (isNaN(bidAmount) || bidAmount <= 0) { showToast("Giá không hợp lệ!"); return; }
    if (myBudget < bidAmount) { showToast("Bạn không đủ ngân sách!"); return; }
    showLoading("ĐANG ĐÀM PHÁN CHUYỂN NHƯỢNG...");
    try {
        myBudget -= bidAmount; updateHeaderDisplay(); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
        if(!leagueState.pendingBuys) leagueState.pendingBuys = []; leagueState.pendingBuys.push({ marketId: p.id, playerInfo: p, bidAmount: bidAmount }); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        renderTransferMarket(); showToast(`Đã nộp đơn mua ${p.name} với giá €${bidAmount.toLocaleString()}. Đang tạm giữ tiền chờ duyệt sau 1 trận đấu!`, "success");
    } catch (e) { showToast("Lỗi khi nộp đơn mua!"); } finally { hideLoading(); }
};

window.listPlayerForSale = async () => {
    if(!currentlyViewingPlayerId) return; const p = globalPlayersMap[currentlyViewingPlayerId]; if(p.isListed) return;
    const askStr = prompt(`Nhập mức giá TỐI THIỂU bạn muốn bán cho ${p.name} (Giá gốc: €${(p.value).toLocaleString()}):\n- Hét giá quá cao Bot sẽ chê.\n- Bán rẻ sẽ dễ thanh khoản. Kèo chốt sau 1 vòng đấu.`, p.value);
    if (askStr === null) return; const askAmount = parseInt(askStr.replace(/,/g, ''));
    if (isNaN(askAmount) || askAmount <= 0) { showToast("Giá không hợp lệ!"); return; }
    showLoading("ĐANG GỬI FAX CHO CÁC CLB KHÁC...");
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { isListed: true }, { merge: true }); p.isListed = true;
        if(!leagueState.pendingSells) leagueState.pendingSells = []; leagueState.pendingSells.push({ playerId: p.id, playerName: p.name, askAmount: askAmount, baseValue: p.value }); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        window.openPlayerDetail(p.id); renderSquadList(); showToast(`Đã đưa ${p.name} lên chợ với giá €${askAmount.toLocaleString()}. Chờ đối tác phản hồi sau trận đấu!`, "success");
    } catch(e) { showToast("Lỗi cập nhật trạng thái!"); } finally { hideLoading(); }
};

window.terminateContract = async () => {
    if(!currentlyViewingPlayerId) return; const p = globalPlayersMap[currentlyViewingPlayerId];
    const penaltyRate = 0.10 + (Math.random() * 0.05); const penaltyFee = Math.floor(p.value * penaltyRate);
    if (myBudget < penaltyFee) { showToast(`Bạn cần ít nhất €${penaltyFee.toLocaleString()} để đuổi cầu thủ này!`, "error"); return; }
    if(confirm(`CẢNH BÁO: ĐUỔI THẲNG ${p.name}? \nCLB sẽ phải bồi thường ${Math.round(penaltyRate*100)}% giá trị thẻ, tương đương: -€${penaltyFee.toLocaleString()}`)) {
        showLoading("ĐANG THANH LÝ HỢP ĐỒNG...");
        try {
            document.getElementById('player-detail-modal').classList.add('hidden'); myBudget -= penaltyFee; updateHeaderDisplay();
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true }); await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id));
            globalPlayersList = globalPlayersList.filter(x => x.id !== p.id); delete globalPlayersMap[p.id]; startingXI = startingXI.map(id => id === p.id ? null : id);
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'tactics'), { formation: currentFormation, startingXI: startingXI });
            if (leagueState.pendingSells) { leagueState.pendingSells = leagueState.pendingSells.filter(x => x.playerId !== p.id); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState); }
            renderSquadList(); renderPitch(); showToast(`Đã thanh lý hợp đồng. CLB mất €${penaltyFee.toLocaleString()} tiền đền bù!`, "warning");
        } catch(e) { showToast("Lỗi khi thanh lý!"); } finally { hideLoading(); }
    }
};

const renderPendingTransfers = () => {
    const container = document.getElementById('offers-list-container'); container.innerHTML = '';
    let totalPending = (leagueState.pendingBuys?.length || 0) + (leagueState.pendingSells?.length || 0);
    if(totalPending === 0) { container.innerHTML = '<div class="text-slate-400 text-center py-8 border border-dashed border-slate-700 rounded-xl">Chưa có giao dịch nào đang chờ. Hãy mua/bán cầu thủ và thi đấu thêm 1 vòng để xem kết quả.</div>'; return; }
    if (leagueState.pendingBuys && leagueState.pendingBuys.length > 0) {
        container.innerHTML += `<h4 class="text-white font-bold mb-3 border-b border-slate-700 pb-1 mt-4">🛒 Đơn Mua Chờ Duyệt</h4>`;
        leagueState.pendingBuys.forEach(b => { container.innerHTML += `<div class="bg-slate-900 border border-slate-700 p-4 rounded-xl flex justify-between items-center shadow-lg mb-3 opacity-70"><div><div class="font-bold text-blue-400 mb-1">Đang đàm phán mua: <span class="text-white">${b.playerInfo.name}</span></div><div class="text-sm text-slate-400">Giá đề nghị: €${b.bidAmount.toLocaleString()}</div></div><div class="text-right"><span class="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded">Chờ kết thúc vòng đấu</span></div></div>`; });
    }
    if (leagueState.pendingSells && leagueState.pendingSells.length > 0) {
        container.innerHTML += `<h4 class="text-white font-bold mb-3 border-b border-slate-700 pb-1 mt-4">💰 Đơn Bán Chờ Duyệt</h4>`;
        leagueState.pendingSells.forEach(s => { container.innerHTML += `<div class="bg-slate-900 border border-slate-700 p-4 rounded-xl flex justify-between items-center shadow-lg mb-3 opacity-70"><div><div class="font-bold text-red-400 mb-1">Đang rao bán: <span class="text-white">${s.playerName}</span></div><div class="text-sm text-slate-400">Giá mong muốn: €${s.askAmount.toLocaleString()}</div></div><div class="text-right"><span class="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded">Chờ Bot trả giá</span></div></div>`; });
    }
};

const processTransferMarket = async (logContainer) => {
    let resolvedLogs = []; let budgetRefunded = 0; let budgetEarned = 0;
    if (leagueState.pendingBuys && leagueState.pendingBuys.length > 0) {
        for (let b of leagueState.pendingBuys) {
            let p = b.playerInfo; let bidRatio = b.bidAmount / p.value; let fameFactor = myFame / 100; let successChance = (bidRatio * 0.5) + (fameFactor * 0.5); let hijackRng = Math.random();
            if (hijackRng <= successChance) {
                const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players')); p.isListed = false; p.itemsUsed = 0; p.stamina = 100; await setDoc(newPlayerRef, p);
                p.id = newPlayerRef.id; globalPlayersList.push(p); globalPlayersMap[p.id] = p; resolvedLogs.push(`<div class="text-blue-400 mb-1">✅ <b>THÀNH CÔNG:</b> Chiêu mộ ${p.name} với giá €${b.bidAmount.toLocaleString()}.</div>`);
            } else {
                let randomClub = RICH_CLUBS[Math.floor(Math.random()*RICH_CLUBS.length)]; budgetRefunded += b.bidAmount; resolvedLogs.push(`<div class="text-red-400 mb-1">❌ <b>THẤT BẠI:</b> Thương vụ ${p.name} đổ vỡ! Bị <b>${randomClub}</b> nẫng tay trên! Đã hoàn lại €${b.bidAmount.toLocaleString()}.</div>`);
            }
            currentMarketList = currentMarketList.filter(x => x.id !== b.marketId);
        }
        leagueState.pendingBuys = [];
    }

    if (leagueState.pendingSells && leagueState.pendingSells.length > 0) {
        let remainingSells = [];
        for (let s of leagueState.pendingSells) {
            let botOffer = Math.floor(s.baseValue * (0.7 + Math.random() * 0.5));
            if (botOffer >= s.askAmount) {
                budgetEarned += botOffer; let randomBot = BOT_CITY_NAMES[Math.floor(Math.random()*BOT_CITY_NAMES.length)] + " FC";
                await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', s.playerId)); globalPlayersList = globalPlayersList.filter(x => x.id !== s.playerId); delete globalPlayersMap[s.playerId]; startingXI = startingXI.map(id => id === s.playerId ? null : id);
                resolvedLogs.push(`<div class="text-green-400 mb-1">🤝 <b>CHỐT ĐƠN:</b> Đã bán ${s.playerName} cho ${randomBot} với mức giá <b>€${botOffer.toLocaleString()}</b>.</div>`);
            } else { remainingSells.push(s); resolvedLogs.push(`<div class="text-slate-400 mb-1">⏳ <b>Ế ẨM:</b> ${s.playerName} chưa tìm được đối tác mua. Đang tiếp tục rao.</div>`); }
        }
        leagueState.pendingSells = remainingSells;
    }

    if (resolvedLogs.length > 0) {
        logContainer.innerHTML += `<div class="mt-4 mb-2 bg-slate-900 border border-blue-500/50 p-4 rounded-xl text-sm animate-log shadow-lg"><div class="font-bold text-blue-400 mb-3 border-b border-slate-700 pb-2 text-center">📠 FAX CHUYỂN NHƯỢNG VÒNG ĐẤU</div>${resolvedLogs.join('')}</div>`;
        myBudget = myBudget + budgetRefunded + budgetEarned; updateHeaderDisplay(); renderSquadList(); renderPitch();
    }
};

// ================= MODULE 7: LEAGUE & MATCH LOGIC =================
const updateSquadStamina = async () => {
    const batch = writeBatch(db);
    globalPlayersList.forEach(p => {
        if (startingXI.includes(p.id)) p.stamina = Math.max(0, p.stamina - (Math.floor(Math.random() * 11) + 15)); else p.stamina = Math.min(100, p.stamina + (Math.floor(Math.random() * 11) + 25));
        batch.update(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { stamina: p.stamina });
    });
    await batch.commit(); renderSquadList(); renderPitch();
};

const sortStandings = () => { leagueState.standings.sort((a, b) => { if (b.points !== a.points) return b.points - a.points; const gdA = a.gf - a.ga; const gdB = b.gf - b.ga; if (gdB !== gdA) return gdB - gdA; return b.gf - a.gf; }); };

const renderLeagueView = () => {
    sortStandings();
    if (leagueState.currentRound > 31) {
        document.getElementById('match-setup').classList.add('hidden'); document.getElementById('season-end-panel').classList.remove('hidden');
        let userRank = leagueState.standings.findIndex(t => t.isUser) + 1; let prize = getPrizeMoney(userRank); document.getElementById('final-rank').textContent = userRank; document.getElementById('final-prize').textContent = `€${prize.toLocaleString()}`;
        const summaryBoard = document.getElementById('season-summary-board'); let goldTeam = leagueState.standings[0]; let silverTeam = leagueState.standings[10]; let bronzeTeam = leagueState.standings[20];
        let goldBoard = `<div class="flex-1"><h4 class="font-bold text-yellow-400 mb-2 border-b border-slate-700 pb-1">🏆 Các Nhà Vô Địch</h4><div class="text-yellow-400">🥇 Cúp Vàng: <span class="font-bold">${goldTeam?.name || 'N/A'}</span></div><div class="text-slate-300">🥈 Đĩa Bạc: <span class="font-bold">${silverTeam?.name || 'N/A'}</span></div><div class="text-orange-400">🥉 Khiên Đồng: <span class="font-bold">${bronzeTeam?.name || 'N/A'}</span></div></div>`;
        let botStandings = leagueState.standings.filter(t => !t.isUser); let relegatedBots = botStandings.slice(-2);
        if(!leagueState.promotedBots || leagueState.promotedBots.length === 0) {
            let currentNames = leagueState.standings.map(t => t.name.replace(' FC', '')); let availableReserves = RESERVE_BOT_NAMES.filter(name => !currentNames.includes(name)); availableReserves.sort(() => Math.random() - 0.5);
            leagueState.promotedBots = [ { name: availableReserves[0] + " FC" }, { name: availableReserves[1] + " FC" } ]; setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        }
        let relegateBoard = `<div class="flex-1"><h4 class="font-bold text-red-400 mb-2 border-b border-slate-700 pb-1">🔄 Lên / Xuống Hạng</h4><div class="text-red-400">🔻 Rớt hạng: ${relegatedBots.map(b=>b.name).join(', ')}</div><div class="text-green-400 mt-1">🔺 Thăng hạng: ${leagueState.promotedBots.map(b=>b.name).join(', ')}</div></div>`;
        summaryBoard.innerHTML = goldBoard + relegateBoard;
        const friendlyBtn = document.getElementById('play-friendly-btn'); const playedFriendly = leagueState.friendlyMatchesPlayed || 0;
        if (playedFriendly >= 5) { friendlyBtn.disabled = true; friendlyBtn.classList.add('opacity-50', 'cursor-not-allowed'); friendlyBtn.textContent = `⚽ Hết lượt Giao Hữu (5/5)`; } else { friendlyBtn.disabled = false; friendlyBtn.classList.remove('opacity-50', 'cursor-not-allowed'); friendlyBtn.textContent = `⚽ Đá Giao Hữu (+Tài Trợ) (${playedFriendly}/5)`; }
    } else {
        document.getElementById('match-setup').classList.remove('hidden'); document.getElementById('season-end-panel').classList.add('hidden'); document.getElementById('league-current-round').textContent = leagueState.currentRound; document.getElementById('league-home-name').textContent = myClubName;
        const opponentId = leagueState.schedule[leagueState.currentRound - 1]; const opponent = leagueState.standings.find(t => t.id === opponentId); if(opponent) document.getElementById('league-away-name').textContent = opponent.name;
    }

    const tbody = document.getElementById('league-table-body'); tbody.innerHTML = '';
    leagueState.standings.forEach((team, index) => {
        const rank = index + 1; const gd = team.gf - team.ga; let rowClass = "hover:bg-slate-700/30 transition-colors "; if (team.isUser) rowClass += "bg-green-900/30 font-bold "; 
        if (rank <= 2) rowClass += "rank-gold"; else if (rank === 11 || rank === 12) rowClass += "rank-silver"; else if (rank === 21 || rank === 22) rowClass += "rank-bronze"; else if (rank >= 31) rowClass += "rank-relegate";
        tbody.innerHTML += `<tr class="${rowClass}"><td class="p-3 pl-6 font-mono text-slate-400">${rank}</td><td class="p-3 ${team.isUser ? 'text-green-400' : 'text-white'}">${team.name}</td><td class="p-3 text-center text-slate-400">${team.played}</td><td class="p-3 text-center text-slate-300">${team.won}</td><td class="p-3 text-center text-slate-300">${team.drawn}</td><td class="p-3 text-center text-slate-300">${team.lost}</td><td class="p-3 text-center ${gd > 0 ? 'text-green-400' : gd < 0 ? 'text-red-400' : 'text-slate-400'}">${gd > 0 ? '+'+gd : gd}</td><td class="p-3 text-center font-bold text-white text-base">${team.points}</td></tr>`;
    });
};

let activeOpponent = null;
const startMatchEngine = (opponent, isFriendly) => {
    if(startingXI.includes(null) || teamPower.OVR === 0) { showToast("Vui lòng xếp đủ 11 cầu thủ vào Sân (Tab Chiến Thuật)!"); return; }
    let lowStaminaCount = startingXI.filter(id => globalPlayersMap[id] && globalPlayersMap[id].stamina < 30).length; if (lowStaminaCount >= 3) showToast("Cảnh báo: Bạn có nhiều cầu thủ đang cạn kiệt thể lực (dưới 30%). Hãy cân nhắc thay người!", "warning");
    document.getElementById('match-setup').classList.add('hidden'); document.getElementById('season-end-panel').classList.add('hidden'); document.getElementById('league-table-container').classList.add('hidden'); document.getElementById('match-live').classList.remove('hidden'); document.getElementById('finish-match-btn').classList.add('hidden');
    let minute = 0; let homeScore = 0; let awayScore = 0;
    const logContainer = document.getElementById('match-logs-container'); logContainer.innerHTML = `<div class="text-slate-400 text-center text-sm py-2">Trọng tài thổi còi bắt đầu trận đấu ${isFriendly ? "Giao Hữu" : ""}!</div>`;
    document.getElementById('live-home-name').textContent = myClubName; document.getElementById('live-away-name').textContent = opponent.name; document.getElementById('score-home').textContent = "0"; document.getElementById('score-away').textContent = "0"; document.getElementById('match-minute').textContent = "0";
    const homeOVR = teamPower.OVR; const awayOVR = opponent.ovr;

    const matchTimer = setInterval(() => {
        minute += Math.floor(Math.random() * 4) + 2; if(minute >= 90) minute = 90; document.getElementById('match-minute').textContent = minute;
        const rng = Math.random() * 100; const homeGoalChance = (homeOVR / (homeOVR + awayOVR)) * 14; const awayGoalChance = (awayOVR / (awayOVR + homeOVR)) * 14;
        if (rng < homeGoalChance) { homeScore++; document.getElementById('score-home').textContent = homeScore; logContainer.innerHTML += `<div class="text-green-400 font-bold bg-green-900/20 p-2 rounded border border-green-900/50">⚽ Phút ${minute}': VÀOOOO! Một pha dứt điểm quá đẳng cấp của ${myClubName.toUpperCase()}!</div>`; } 
        else if (rng > 100 - awayGoalChance) { awayScore++; document.getElementById('score-away').textContent = awayScore; logContainer.innerHTML += `<div class="text-red-400 font-bold bg-red-900/20 p-2 rounded border border-red-900/50">⚽ Phút ${minute}': BÀN THẮNG CHO ${opponent.name.toUpperCase()}! Hàng thủ chủ nhà mắc sai lầm!</div>`; } 
        else if (rng > 40 && rng < 50) { logContainer.innerHTML += `<div class="text-slate-400 italic px-2">⏱ Phút ${minute}': Thế trận đang giằng co quyết liệt ở khu vực giữa sân...</div>`; } 
        else if (rng > 70 && rng < 75) { logContainer.innerHTML += `<div class="text-yellow-400 px-2">Phút ${minute}': 🧤 Nguy hiểm! Thủ môn cản phá xuất thần một cú sút xa!</div>`; }
        logContainer.scrollTop = logContainer.scrollHeight; 

        if (minute >= 90) {
            clearInterval(matchTimer); logContainer.innerHTML += '<div class="text-yellow-400 font-bold text-center mt-4 text-xl uppercase">Hết giờ! Trận đấu kết thúc!</div>';
            let matchFee = isFriendly ? 0 : -50000; let perfBonus = (homeScore > awayScore) ? (isFriendly ? 50000 : 300000) : (homeScore === awayScore ? (isFriendly ? 20000 : 100000) : 0);
            let cleanSheet = (awayScore === 0) ? (isFriendly ? 20000 : 150000) : 0; let bigWin = (homeScore - awayScore >= 3) ? (isFriendly ? 20000 : 200000) : 0; let sponsorMoney = isFriendly ? 100000 : 0; let totalEarnings = matchFee + perfBonus + cleanSheet + bigWin + sponsorMoney;
            logContainer.innerHTML += `<div class="mt-4 mb-2 bg-slate-800 border border-yellow-500/50 p-4 rounded-xl text-sm shadow-lg"><div class="font-bold text-yellow-400 mb-3 border-b border-slate-700 pb-2 text-center">📊 TỔNG KẾT TÀI CHÍNH TRẬN ĐẤU</div><div class="flex justify-between text-slate-300 py-1"><span>Phí tổ chức trận:</span><span class="text-red-400">${matchFee < 0 ? '- €50,000' : 'Miễn phí'}</span></div>${sponsorMoney ? `<div class="flex justify-between text-slate-300 py-1"><span>Tiền tài trợ giao hữu:</span><span class="text-green-400">+ €${sponsorMoney.toLocaleString()}</span></div>` : ''}${perfBonus ? `<div class="flex justify-between text-slate-300 py-1"><span>Thưởng thành tích:</span><span class="text-green-400">+ €${perfBonus.toLocaleString()}</span></div>` : ''}${cleanSheet ? `<div class="flex justify-between text-slate-300 py-1"><span>Thưởng sạch lưới:</span><span class="text-green-400">+ €${cleanSheet.toLocaleString()}</span></div>` : ''}${bigWin ? `<div class="flex justify-between text-slate-300 py-1"><span>Thưởng thắng đậm (>= 3 bàn):</span><span class="text-green-400">+ €${bigWin.toLocaleString()}</span></div>` : ''}<div class="flex justify-between font-bold mt-3 pt-3 border-t border-slate-700 text-lg"><span>Tổng nhận:</span><span class="${totalEarnings > 0 ? 'text-green-400' : 'text-red-400'}">${totalEarnings > 0 ? '+' : ''} €${totalEarnings.toLocaleString()}</span></div></div>`;
            logContainer.scrollTop = logContainer.scrollHeight;
            const finishBtn = document.getElementById('finish-match-btn'); finishBtn.classList.remove('hidden');
            finishBtn.onclick = async () => { finishBtn.textContent = "Đang xử lý kết quả ngầm..."; finishBtn.disabled = true; await processTransferMarket(logContainer); finishBtn.textContent = "Lưu thành tích vòng đấu"; finishBtn.disabled = false; finishBtn.onclick = () => { if(isFriendly) finishFriendlyMatch(totalEarnings); else finishLeagueRound(homeScore, awayScore, totalEarnings); }; };
        }
    }, 300); 
};

document.getElementById('start-league-match-btn').addEventListener('click', () => { const opponentId = leagueState.schedule[leagueState.currentRound - 1]; activeOpponent = leagueState.standings.find(t => t.id === opponentId); startMatchEngine(activeOpponent, false); });
document.getElementById('play-friendly-btn').addEventListener('click', () => { if ((leagueState.friendlyMatchesPlayed || 0) >= 5) { showToast("Bạn đã hết lượt đá giao hữu!"); return; } activeOpponent = leagueState.standings[Math.floor(Math.random() * leagueState.standings.length)]; while (activeOpponent.isUser) { activeOpponent = leagueState.standings[Math.floor(Math.random() * leagueState.standings.length)]; } startMatchEngine(activeOpponent, true); });

const finishLeagueRound = async (userScore, botScore, totalEarnings) => {
    showLoading("ĐANG CẬP NHẬT BXH...");
    try {
        let currentTotalEarnings = totalEarnings; let userTeam = leagueState.standings.find(t => t.isUser); let botTeam = leagueState.standings.find(t => t.id === activeOpponent.id);
        userTeam.played++; botTeam.played++; userTeam.gf += userScore; botTeam.gf += botScore; userTeam.ga += botScore; botTeam.ga += userScore;
        if (userScore > botScore) { userTeam.won++; botTeam.lost++; userTeam.points += 3; } else if (userScore < botScore) { botTeam.won++; userTeam.lost++; botTeam.points += 3; } else { userTeam.drawn++; botTeam.drawn++; userTeam.points += 1; botTeam.points += 1; }
        let playedIds = [userTeam.id, botTeam.id]; let remainingBots = leagueState.standings.filter(t => !playedIds.includes(t.id)); remainingBots.sort(() => Math.random() - 0.5); 
        for(let i=0; i < remainingBots.length; i+=2) {
            if (i+1 >= remainingBots.length) break; let t1 = remainingBots[i]; let t2 = remainingBots[i+1]; let diff = t1.ovr - t2.ovr; let t1Score = 0, t2Score = 0; let matchRng = Math.random();
            if (diff > 5) { t1Score = Math.floor(Math.random() * 3) + 1; t2Score = Math.floor(Math.random() * 2); } else if (diff < -5) { t2Score = Math.floor(Math.random() * 3) + 1; t1Score = Math.floor(Math.random() * 2); } else { if(matchRng < 0.4) { t1Score = Math.floor(Math.random() * 2) + 1; t2Score = 0; } else if(matchRng < 0.8) { t2Score = Math.floor(Math.random() * 2) + 1; t1Score = 0; } else { t1Score = Math.floor(Math.random() * 2); t2Score = t1Score; } }
            t1.played++; t2.played++; t1.gf += t1Score; t2.gf += t2Score; t1.ga += t2Score; t2.ga += t1Score;
            if(t1Score > t2Score) { t1.won++; t2.lost++; t1.points += 3; } else if(t1Score < t2Score) { t2.won++; t1.lost++; t2.points += 3; } else { t1.drawn++; t2.drawn++; t1.points += 1; t2.points += 1; }
        }
        sortStandings(); if (!leagueState.rankHistory) leagueState.rankHistory = []; let finalRankInRound = leagueState.standings.findIndex(t => t.isUser) + 1; leagueState.rankHistory.push(finalRankInRound);
        leagueState.currentRound++; let endSeasonMessage = "";
        if (leagueState.currentRound === 32) {
            let finalRank = leagueState.standings.findIndex(t => t.isUser) + 1; let seasonPrize = getPrizeMoney(finalRank);
            let fameDiff = 0; if(finalRank === 1) fameDiff = 20; else if(finalRank === 11 || finalRank === 12) fameDiff = 10; else if(finalRank === 21 || finalRank === 22) fameDiff = 5; else if(finalRank >= 30) fameDiff = -15; else fameDiff = 2; 
            myFame = Math.max(0, Math.min(100, myFame + fameDiff)); currentTotalEarnings += seasonPrize; endSeasonMessage = `MÙA GIẢI ĐÃ KẾT THÚC! Đứng thứ ${finalRank}, nhận €${seasonPrize.toLocaleString()}! Danh tiếng: ${fameDiff > 0 ? '+'+fameDiff : fameDiff}`; leagueState.promotedBots = [];
        }
        myBudget += currentTotalEarnings; updateHeaderDisplay(); await updateSquadStamina();
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget, fame: myFame }, { merge: true }); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'tactics'), { formation: currentFormation, startingXI: startingXI });
        if(endSeasonMessage) showToast(endSeasonMessage, "success"); else showToast("Đã lưu kết quả trận đấu. Thể lực toàn đội đã giảm!", "success");
        document.getElementById('match-live').classList.add('hidden'); document.getElementById('league-table-container').classList.remove('hidden'); renderLeagueView();
    } catch (e) { showToast("Lỗi lưu kết quả: " + e.message); } finally { hideLoading(); }
};

const finishFriendlyMatch = async (totalEarnings) => {
    showLoading("ĐANG LƯU KẾT QUẢ GIAO HỮU...");
    try {
        myBudget += totalEarnings; updateHeaderDisplay(); leagueState.friendlyMatchesPlayed = (leagueState.friendlyMatchesPlayed || 0) + 1; await updateSquadStamina();
        const batch = writeBatch(db); batch.set(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true }); batch.set(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState); batch.set(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'tactics'), { formation: currentFormation, startingXI: startingXI }); await batch.commit();
        document.getElementById('match-live').classList.add('hidden'); document.getElementById('season-end-panel').classList.remove('hidden'); document.getElementById('league-table-container').classList.remove('hidden'); showToast("Hoàn tất trận giao hữu! Thể lực cầu thủ đã thay đổi.", "success"); renderLeagueView(); 
    } catch (e) { showToast("Lỗi: " + e.message); } finally { hideLoading(); }
};

document.getElementById('start-new-season-btn').addEventListener('click', async () => {
    showLoading("ĐANG THIẾT LẬP MÙA GIẢI MỚI...");
    try {
        let botStandings = leagueState.standings.filter(t => !t.isUser); let relegatedBotIds = botStandings.slice(-2).map(b => b.id); leagueState.standings = leagueState.standings.filter(t => !relegatedBotIds.includes(t.id));
        if (leagueState.promotedBots && leagueState.promotedBots.length === 2) { leagueState.promotedBots.forEach(b => { const ovr = Math.floor(Math.random() * 20) + 60; leagueState.standings.push({ id: `bot_${Date.now()}_${Math.random()}`, name: b.name, isUser: false, ovr: ovr, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }); }); }
        leagueState.promotedBots = []; leagueState.currentRound = 1; leagueState.friendlyMatchesPlayed = 0; leagueState.rankHistory = [];
        leagueState.standings.forEach(t => { t.played = 0; t.won = 0; t.drawn = 0; t.lost = 0; t.gf = 0; t.ga = 0; t.points = 0; });
        leagueState.schedule = leagueState.standings.filter(t => !t.isUser).map(b => b.id).sort(() => Math.random() - 0.5);
        const batch = writeBatch(db); globalPlayersList.forEach(p => { p.stamina = 100; batch.update(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { stamina: 100 }); }); await batch.commit();
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        renderSquadList(); renderPitch(); renderLeagueView(); showToast("🎉 Mùa giải mới! Các cầu thủ đã hồi phục 100% thể lực.", "success");
    } catch(e) { showToast("Lỗi: " + e.message); } finally { hideLoading(); }
});

// ================= MODULE 8: STORE (CỬA HÀNG VẬT PHẨM) =================
const renderStore = () => {
    const container = document.getElementById('store-items-container'); container.innerHTML = '';
    STORE_ITEMS.forEach(item => { container.innerHTML += `<div class="bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-lg flex flex-col justify-between hover:border-indigo-500/50 transition-colors"><div><div class="text-4xl mb-3">${item.icon}</div><h3 class="text-xl font-bold text-white mb-1">${item.name}</h3><p class="text-slate-400 text-sm mb-4">${item.desc}</p></div><div><div class="text-yellow-400 font-bold mb-3 text-lg">€${item.price.toLocaleString()}</div><button onclick="window.buyItem('${item.id}')" class="w-full py-2 ${item.type === 'gacha' ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-indigo-600 hover:bg-indigo-500'} text-white font-bold rounded-lg transition shadow-lg">${item.type === 'gacha' ? 'Mở Gói Ngay' : 'Mua & Sử dụng'}</button></div></div>`; });
};

window.buyItem = async (itemId) => {
    const item = STORE_ITEMS.find(x => x.id === itemId); if (!item) return;
    if (myBudget < item.price) { showToast("Bạn không đủ tiền để mua vật phẩm này!", "error"); return; }
    if (item.type === 'gacha') {
        if(globalPlayersList.length + (leagueState.pendingBuys?.length || 0) >= 25) { showToast("Đội hình đã đầy (Tối đa 25 người)!"); return; }
        if (confirm(`Xác nhận chi €${item.price.toLocaleString()} để mở gói cầu thủ ngẫu nhiên?`)) { await rollGacha(item.price); }
    } else {
        currentItemToApply = item; document.getElementById('apply-item-name').textContent = item.name; const container = document.getElementById('apply-item-list-container'); container.innerHTML = '';
        let sortedPlayers = [...globalPlayersList].sort((a,b) => b.ovr - a.ovr);
        sortedPlayers.forEach(p => {
            const usedCount = p.itemsUsed || 0; const canUse = usedCount < 5;
            container.innerHTML += `<div class="flex justify-between items-center p-3 hover:bg-slate-700/50 border-b border-slate-700/50 rounded ${canUse ? 'cursor-pointer' : 'opacity-50 grayscale'}" ${canUse ? `onclick="window.applyItemToPlayer('${p.id}')"` : ''}><div><div class="text-white font-medium">${p.name}</div><div class="text-xs text-indigo-300">Đã dùng: ${usedCount}/5</div></div><div class="text-right"><div class="text-green-400 font-bold">OVR ${p.ovr}</div>${!canUse ? `<div class="text-red-400 text-xs">Đã đạt giới hạn</div>` : ''}</div></div>`;
        });
        document.getElementById('apply-item-modal').classList.remove('hidden');
    }
};
window.closeApplyItemModal = () => { document.getElementById('apply-item-modal').classList.add('hidden'); currentItemToApply = null; };

window.applyItemToPlayer = async (playerId) => {
    const p = globalPlayersMap[playerId]; const item = currentItemToApply; if (!p || !item) return;
    if (myBudget < item.price) { showToast("Bạn không đủ tiền!", "error"); return; }
    if (confirm(`Sử dụng [${item.name}] cho ${p.name}?`)) {
        showLoading("ĐANG ÁP DỤNG GIÁO ÁN...");
        try {
            window.closeApplyItemModal(); myBudget -= item.price; updateHeaderDisplay();
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
            if (!p.bonusStats) p.bonusStats = { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 };
            if (item.type === 'stat') { p.stats[item.stat] += item.amount; p.bonusStats[item.stat] = (p.bonusStats[item.stat] || 0) + item.amount; if(p.stats[item.stat] > 99) { const excess = p.stats[item.stat] - 99; p.stats[item.stat] = 99; p.bonusStats[item.stat] -= excess; } } 
            else if (item.type === 'stat_multi') { for (const [key, value] of Object.entries(item.stats)) { p.stats[key] += value; p.bonusStats[key] = (p.bonusStats[key] || 0) + value; if(p.stats[key] > 99) { const excess = p.stats[key] - 99; p.stats[key] = 99; p.bonusStats[key] -= excess; } } }
            p.ovr = recalculateOVR(p.pos, p.stats); p.value = p.ovr * 100000; p.itemsUsed = (p.itemsUsed || 0) + 1;
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { stats: p.stats, bonusStats: p.bonusStats, ovr: p.ovr, value: p.value, itemsUsed: p.itemsUsed }, { merge: true });
            renderSquadList(); renderPitch(); showToast(`Sử dụng vật phẩm thành công! OVR mới của ${p.name} là ${p.ovr}.`, 'success');
        } catch(e) { showToast("Lỗi khi dùng vật phẩm: " + e.message); } finally { hideLoading(); }
    }
};

const rollGacha = async (price) => {
    showLoading("ĐANG MỞ GÓI CẦU THỦ...");
    try {
        myBudget -= price; updateHeaderDisplay(); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
        const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)]; const name = "Young " + FOREIGN_NAMES[Math.floor(Math.random() * FOREIGN_NAMES.length)];
        const ovr = Math.floor(Math.random() * 16) + 60; const val = ovr * 70000; let stats = { PAC: ovr+2, SHO: ovr-2, PAS: ovr+1, DRI: ovr, DEF: ovr, PHY: ovr }; 
        const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players'));
        const playerData = { name: name, pos: pos, ovr: recalculateOVR(pos, stats), stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }, stamina: 100, value: val, isListed: false, itemsUsed: 0 };
        await setDoc(newPlayerRef, playerData); playerData.id = newPlayerRef.id; globalPlayersList.push(playerData); globalPlayersMap[playerData.id] = playerData;
        renderSquadList(); showToast(`Tuyệt vời! Bạn vừa mở ra ${name} (OVR ${playerData.ovr})!`, 'success');
    } catch (e) { showToast("Lỗi khi mở gói cầu thủ: " + e.message); } finally { hideLoading(); }
};
