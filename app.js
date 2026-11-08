import { auth, db, appId, VN_CLUBS_POOL, RICH_CLUBS, STORE_ITEMS, getPrizeMoney, recalculateOVR, generatePlayerName, POSITIONS } from './firebase-config.js';
import { showLoading, hideLoading, showToast } from './ui-helpers.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global State
let currentUserId = null; let myClubName = "My Club"; let myBudget = 0; let myFame = 30;
let myFacilities = { medical: 1, scouting: 1, training: 1, finance: 1, scoutingCooldown: 5, scoutedPlayer: null, medicalSlots: [], trainingSlots: [] };
let globalPlayersList = []; let globalPlayersMap = {};
let currentFormation = '4-4-2'; let startingXI = new Array(11).fill(null); 
let teamPower = { OVR: 0, ATT: 0, MID: 0, DEF: 0 }; // Thêm 3 tuyến
let leagueState = { currentRound: 1, standings: [], schedule: [], friendlyMatchesPlayed: 0, promotedBots: [], pendingBuys: [], pendingSells: [], rankHistory: [] };
let currentMarketList = []; let currentlyViewingPlayerId = null; let currentSlotToFill = null; let currentItemToApply = null;

const TABS = ['overview', 'squad', 'tactics', 'league', 'transfer', 'store', 'facilities'];

window.showToast = showToast; window.showLoading = showLoading; window.hideLoading = hideLoading;

// HÀM HỖ TRỢ ĐỘ HIẾM (RARITY)
const getRarityClass = (ovr) => {
    if (ovr >= 90) return { text: 'text-fuchsia-400 drop-shadow-[0_0_5px_rgba(232,121,249,0.8)]', bg: 'bg-fuchsia-900', border: 'border-fuchsia-500 shadow-[0_0_15px_rgba(232,121,249,0.5)]' };
    if (ovr >= 80) return { text: 'text-yellow-400', bg: 'bg-yellow-900/50', border: 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]' };
    if (ovr >= 65) return { text: 'text-slate-300', bg: 'bg-slate-700', border: 'border-slate-400' };
    return { text: 'text-orange-600', bg: 'bg-orange-950', border: 'border-orange-700' };
};

const updateHeaderDisplay = () => {
    document.getElementById('budget-display').textContent = `€${(myBudget/1000000).toFixed(2)}M`;
    let fameDiv = document.getElementById('fame-display-container');
    if (!fameDiv) {
        fameDiv = document.createElement('div'); fameDiv.id = 'fame-display-container';
        fameDiv.className = 'bg-slate-800 px-3 py-1.5 md:px-4 md:py-2 rounded-lg border border-slate-700 mr-2 md:mr-3 text-sm md:text-base';
        const budgetContainer = document.getElementById('budget-display').parentElement;
        budgetContainer.parentElement.insertBefore(fameDiv, budgetContainer);
    }
    fameDiv.innerHTML = `<span class="text-slate-400 mr-1 hidden sm:inline">Fame:</span><span class="text-yellow-400 font-bold">🌟 ${myFame}</span>`;
};

const switchView = (v) => {
    TABS.forEach(id => { 
        const viewEl = document.getElementById(`view-${id}`); if(viewEl) viewEl.classList.add('hidden'); 
        const navEl = document.getElementById(`nav-${id}`); if(navEl) navEl.className = "block px-4 py-3 hover:bg-slate-800 text-slate-300 rounded-lg border border-transparent";
        const navMobEl = document.getElementById(`nav-${id}-mob`); if(navMobEl) navMobEl.className = "flex flex-col items-center text-slate-400 hover:text-white min-w-[64px] snap-center transition-colors";
    });
    
    document.getElementById(`view-${v}`).classList.remove('hidden'); 
    const activeNav = document.getElementById(`nav-${v}`); if(activeNav) activeNav.className = "block px-4 py-3 bg-green-900/40 text-green-400 font-medium rounded-lg border border-green-900/50";
    const activeMob = document.getElementById(`nav-${v}-mob`); if(activeMob) activeMob.className = "flex flex-col items-center text-green-400 min-w-[64px] snap-center scale-110 transition-transform";

    if(v === 'league') renderLeagueView(); if(v === 'transfer') renderTransferMarket(); if(v === 'store') renderStore(); if(v === 'overview') renderOverview(); if(v === 'facilities') renderFacilities();
};

TABS.forEach(v => { 
    const btn = document.getElementById(`nav-${v}`); if(btn) btn.addEventListener('click', (e) => { e.preventDefault(); switchView(v); });
    const btnMob = document.getElementById(`nav-${v}-mob`); if(btnMob) btnMob.addEventListener('click', (e) => { e.preventDefault(); switchView(v); });
});

const renderOverview = () => {
    const overviewDiv = document.getElementById('view-overview'); if (!overviewDiv) return;
    let userTeam = leagueState.standings.find(t => t.isUser); let currentRank = userTeam ? leagueState.standings.findIndex(t => t.isUser) + 1 : '-';
    let nextOpponent = null; if (leagueState.currentRound <= 31 && leagueState.schedule) { const oppId = leagueState.schedule[leagueState.currentRound - 1]; nextOpponent = leagueState.standings.find(t => t.id === oppId); }
    const posCount = { GK: 0, DEF: 0, MID: 0, FWD: 0 }; globalPlayersList.forEach(p => { if (posCount[p.pos] !== undefined) posCount[p.pos]++; });

    let chartHtml = `<div class="h-32 flex items-center justify-center text-slate-500 italic text-sm">Chưa có dữ liệu thi đấu mùa này.</div>`;
    if (leagueState.rankHistory && leagueState.rankHistory.length > 0) {
        let pointsStr = ""; let labelsStr = ""; const w = 800; const h = 200; const xStep = w / 30; 
        leagueState.rankHistory.forEach((rank, idx) => {
            const x = idx * xStep; const y = 20 + ((rank - 1) / 31) * 160; pointsStr += `${x},${y} `;
            labelsStr += `<circle cx="${x}" cy="${y}" r="6" fill="#22c55e" stroke="#0f172a" stroke-width="2" class="hover:fill-yellow-400 hover:r-8 transition-all cursor-pointer"><title>Vòng ${idx+1}: Hạng ${rank}</title></circle>`;
        });
        chartHtml = `<div class="relative w-full h-full overflow-x-auto overflow-y-hidden hide-scrollbar py-2"><svg viewBox="-20 0 ${w + 40} ${h}" class="min-w-[600px] w-full h-40 md:h-48 drop-shadow-xl"><text x="-15" y="25" fill="#64748b" font-size="12" font-weight="bold">Top 1</text><text x="-15" y="105" fill="#334155" font-size="12">Top 16</text><text x="-15" y="185" fill="#64748b" font-size="12" font-weight="bold">Top 32</text><line x1="25" y1="20" x2="${w}" y2="20" stroke="#334155" stroke-dasharray="4" /><line x1="25" y1="100" x2="${w}" y2="100" stroke="#1e293b" stroke-dasharray="4" /><line x1="25" y1="180" x2="${w}" y2="180" stroke="#334155" stroke-dasharray="4" /><polyline points="${pointsStr}" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${labelsStr}</svg></div>`;
    }

    overviewDiv.innerHTML = `<div class="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-green-900/30 p-6 md:p-8 rounded-2xl shadow-xl"><h3 class="text-2xl md:text-3xl font-bold text-white mb-2">HLV của <span class="text-green-400">${myClubName}</span></h3><p class="text-slate-300 text-sm md:text-lg mb-4">Mùa giải đang diễn ra ở <span class="font-bold text-yellow-400">Vòng ${leagueState.currentRound <= 31 ? leagueState.currentRound : 'Kết thúc'}</span>. ${nextOpponent ? `Đối thủ tiếp theo: <b>${nextOpponent.name}</b>` : 'Đang nghỉ Hậu mùa giải.'}</p><button onclick="document.getElementById('nav-league-mob').click()" class="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition-colors text-sm md:text-base w-full md:w-auto">Tới Sân Cỏ Ngay ⚽</button></div><div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-6"><div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg flex flex-col justify-center"><h4 class="text-slate-400 font-bold mb-3 md:mb-4 border-b border-slate-700 pb-2 text-sm md:text-base">🏢 CÂU LẠC BỘ</h4><div class="flex justify-between items-center mb-2"><span class="text-slate-300 text-sm md:text-base">Ngân sách:</span><span class="text-xl md:text-2xl font-bold text-green-400">€${(myBudget/1000000).toFixed(2)}M</span></div><div class="flex justify-between items-center"><span class="text-slate-300 text-sm md:text-base">Danh tiếng:</span><span class="text-lg md:text-xl font-bold text-yellow-400">🌟 ${myFame}</span></div></div><div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg"><h4 class="text-slate-400 font-bold mb-3 md:mb-4 border-b border-slate-700 pb-2 text-sm md:text-base">👕 ĐỘI HÌNH (${globalPlayersList.length}/25)</h4><div class="grid grid-cols-2 gap-2 text-sm"><div class="bg-red-900/30 border border-red-900/50 p-2 rounded text-center"><div class="font-bold text-red-400">${posCount.FWD}</div><div class="text-slate-400 text-[10px] md:text-[11px] uppercase">Tiền đạo</div></div><div class="bg-green-900/30 border border-green-900/50 p-2 rounded text-center"><div class="font-bold text-green-400">${posCount.MID}</div><div class="text-slate-400 text-[10px] md:text-[11px] uppercase">Tiền vệ</div></div><div class="bg-blue-900/30 border border-blue-900/50 p-2 rounded text-center"><div class="font-bold text-blue-400">${posCount.DEF}</div><div class="text-slate-400 text-[10px] md:text-[11px] uppercase">Hậu vệ</div></div><div class="bg-yellow-900/30 border border-yellow-900/50 p-2 rounded text-center"><div class="font-bold text-yellow-400">${posCount.GK}</div><div class="text-slate-400 text-[10px] md:text-[11px] uppercase">Thủ môn</div></div></div></div><div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg flex flex-col justify-center"><h4 class="text-slate-400 font-bold mb-3 md:mb-4 border-b border-slate-700 pb-2 text-sm md:text-base">📈 PHONG ĐỘ (Hạng ${currentRank})</h4><div class="flex justify-between text-center"><div><div class="text-xl md:text-2xl font-bold text-green-400">${userTeam ? userTeam.won : 0}</div><div class="text-slate-400 text-[10px] md:text-xs">Thắng</div></div><div><div class="text-xl md:text-2xl font-bold text-slate-300">${userTeam ? userTeam.drawn : 0}</div><div class="text-slate-400 text-[10px] md:text-xs">Hòa</div></div><div><div class="text-xl md:text-2xl font-bold text-red-400">${userTeam ? userTeam.lost : 0}</div><div class="text-slate-400 text-[10px] md:text-xs">Thua</div></div><div><div class="text-xl md:text-2xl font-bold text-yellow-400">${userTeam ? userTeam.points : 0}</div><div class="text-slate-400 text-[10px] md:text-xs">Điểm</div></div></div></div></div><div class="bg-slate-800/80 border border-slate-700 rounded-xl p-4 md:p-6 shadow-lg mt-6"><h4 class="text-slate-400 font-bold mb-4 border-b border-slate-700 pb-2 text-sm md:text-base">📊 BIỂU ĐỒ THỨ HẠNG MÙA GIẢI</h4>${chartHtml}</div>`;
};

let isLogin = true; 
document.getElementById('toggle-mode-btn').addEventListener('click', (e) => { 
    e.preventDefault(); isLogin = !isLogin; document.getElementById('auth-submit-btn').textContent = isLogin ? "Đăng Nhập" : "Đăng Ký"; document.getElementById('auth-toggle-text').textContent = isLogin ? "Chưa có tài khoản?" : "Đã có tài khoản?";
});

document.getElementById('auth-form').addEventListener('submit', async (e) => { 
    e.preventDefault(); const btn = document.getElementById('auth-submit-btn'); btn.disabled = true; const errDiv = document.getElementById('auth-error'); errDiv.classList.add('hidden');
    showLoading(isLogin ? "ĐANG XÁC THỰC..." : "ĐANG TẠO TÀI KHOẢN...");
    try { if(isLogin) await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); else await createUserWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); } 
    catch(err) { errDiv.textContent = err.message; errDiv.classList.remove('hidden'); btn.disabled = false; } finally { hideLoading(); }
});
document.getElementById('logout-btn').addEventListener('click', () => { showLoading("ĐANG ĐĂNG XUẤT..."); signOut(auth).then(() => hideLoading()); });

onAuthStateChanged(auth, (user) => {
    if (user) { 
        document.getElementById('auth-container').classList.add('hidden'); document.getElementById('dashboard-section').classList.remove('hidden'); 
        currentUserId = user.uid; document.getElementById('user-email-display').textContent = user.email; loadGameData(user.uid); 
    } 
    else { 
        document.getElementById('dashboard-section').classList.add('hidden'); document.getElementById('auth-container').classList.remove('hidden'); 
        document.getElementById('quick-play-btn').classList.add('hidden');
    }
});

const loadGameData = async (uid) => {
    showLoading("ĐANG TẢI DỮ LIỆU CLB...");
    try {
        const profileSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'profile', 'info'));
        if (profileSnap.exists()) {
            const profileData = profileSnap.data(); myClubName = profileData.clubName; myBudget = profileData.budget || 10000000; myFame = profileData.fame || 30;
            myFacilities = profileData.facilities || { medical: 1, scouting: 1, training: 1, finance: 1, scoutingCooldown: 5, scoutedPlayer: null, medicalSlots: [], trainingSlots: [] };
            if(!myFacilities.medicalSlots) myFacilities.medicalSlots = []; if(!myFacilities.trainingSlots) myFacilities.trainingSlots = [];
            updateHeaderDisplay();
            
            const pSnap = await getDocs(collection(db, 'artifacts', appId, 'users', uid, 'players'));
            globalPlayersList = []; globalPlayersMap = {};
            pSnap.forEach(doc => { 
                const d = doc.data(); d.id = doc.id; d.itemsUsed = d.itemsUsed || 0; 
                if (!d.stats || isNaN(d.ovr)) { const fallback = Math.floor(Math.random() * 20) + 50; d.stats = { PAC:fallback, SHO:fallback, PAS:fallback, DRI:fallback, DEF:fallback, PHY:fallback }; d.ovr = recalculateOVR(d.pos, d.stats); setDoc(doc.ref, { stats: d.stats, ovr: d.ovr }, { merge: true }); }
                if(!d.bonusStats) d.bonusStats = { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }; if (d.stamina === undefined || isNaN(d.stamina)) d.stamina = 100;
                if(d.injury === undefined) d.injury = 0;
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
            
            if (leagueState.currentRound <= 31) document.getElementById('quick-play-btn').classList.remove('hidden');
            else document.getElementById('quick-play-btn').classList.add('hidden');
        } else { document.getElementById('init-club-modal').classList.remove('hidden'); }
    } catch(e) { showToast("Lỗi tải dữ liệu: " + e.message); } finally { hideLoading(); }
};

document.getElementById('create-club-btn').addEventListener('click', async () => {
    const clubName = document.getElementById('club-name-input').value.trim(); if(!clubName) { showToast("Vui lòng nhập tên Câu lạc bộ!"); return; }
    const btn = document.getElementById('create-club-btn'); btn.textContent = "Đang tạo..."; btn.disabled = true; showLoading("ĐANG KHỞI TẠO ĐỘI HÌNH TÂN BINH...");
    try {
        const batch = writeBatch(db); const userRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'); batch.set(userRef, { clubName: clubName, budget: 10000000, fame: 30, facilities: myFacilities });
        const INITIAL_POS = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'FWD']; const superstarIndex = Math.floor(Math.random() * 16);
        INITIAL_POS.forEach((pos, i) => {
            const isStar = (i === superstarIndex); const baseMin = isStar ? 75 : 30; const baseMax = isStar ? 95 : 45; const rnd = () => Math.floor(Math.random() * (baseMax - baseMin + 1)) + baseMin;
            let stats = { PAC: rnd(), SHO: rnd(), PAS: rnd(), DRI: rnd(), DEF: rnd(), PHY: rnd() }; let ovr = recalculateOVR(pos, stats);
            const playerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players'));
            batch.set(playerRef, { name: generatePlayerName(isStar), pos: pos, ovr: ovr, stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }, stamina: 100, injury: 0, value: ovr * 100000, isListed: false, itemsUsed: 0 });
        });
        await batch.commit(); await initLeagueData(currentUserId, clubName); document.getElementById('init-club-modal').classList.add('hidden'); showToast("Khởi tạo Câu lạc bộ thành công!", "success"); await loadGameData(currentUserId);
    } catch(e) { showToast("Lỗi khi tạo CLB: " + e.message); } finally { hideLoading(); }
});

const initLeagueData = async (uid, overrideName = null) => {
    let bots = []; 
    let availableClubs = [...VN_CLUBS_POOL].filter(c => c !== overrideName);
    availableClubs.sort(() => Math.random() - 0.5);

    for (let i = 0; i < 31; i++) { 
        const ovr = Math.floor(Math.random() * 20) + 60; 
        bots.push({ id: `bot_${Date.now()}_${i}`, name: availableClubs[i], isUser: false, ovr: ovr, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }); 
    }
    let initialStandings = [...bots, { id: 'user', name: overrideName || myClubName, isUser: true, ovr: 0, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }];
    let userSchedule = bots.map(b => b.id).sort(() => Math.random() - 0.5);
    leagueState = { currentRound: 1, standings: initialStandings, schedule: userSchedule, friendlyMatchesPlayed: 0, promotedBots: [], pendingBuys: [], pendingSells: [], rankHistory: [] };
    await setDoc(doc(db, 'artifacts', appId, 'users', uid, 'league', 'state'), leagueState);
};

// ================= MODULE 5: SQUAD & TACTICS =================
const renderSquadList = () => {
    const tbody = document.getElementById('squad-list-body'); tbody.innerHTML = '';
    const order = { 'GK': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 }; globalPlayersList.sort((a, b) => order[a.pos] - order[b.pos] || b.ovr - a.ovr);
    const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    
    globalPlayersList.forEach(p => {
        let statusHtml = p.isListed ? '<span class="text-[10px] md:text-xs bg-red-900 text-red-300 px-1 md:px-2 py-1 rounded">Chờ duyệt Bán</span>' : '<span class="text-[10px] md:text-xs bg-green-900 text-green-300 px-1 md:px-2 py-1 rounded">Tại CLB</span>';
        