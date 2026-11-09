import { auth, db, appId, VN_CLUBS_POOL, RICH_CLUBS, getPrizeMoney, recalculateOVR, generatePlayerName, POSITIONS } from './firebase-config.js';
import { showLoading, hideLoading, showToast } from './ui-helpers.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global State
let currentUserId = null; let myClubName = "My Club"; let myManagerName = "HLV Trưởng"; let myBudget = 0; let myFame = 30;
let myFacilities = { medical: 1, scouting: 1, training: 1, finance: 1, scoutingCooldown: 5, scoutedPlayer: null, medicalSlots: [], trainingSlots: [], pendingUpgrade: null };
let globalPlayersList = []; let globalPlayersMap = {};
let currentFormation = '4-4-2'; let startingXI = new Array(11).fill(null); let teamPower = { OVR: 0, ATT: 0, MID: 0, DEF: 0 };
let leagueState = { currentRound: 1, standings: [], schedule: [], friendlyMatchesPlayed: 0, promotedBots: [], pendingBuys: [], pendingSells: [], rankHistory: [], news: [] };
let currentMarketList = []; let currentlyViewingPlayerId = null; let currentSlotToFill = null; let currentItemToApply = null;

window.showToast = showToast; window.showLoading = showLoading; window.hideLoading = hideLoading;

// STORE ITEMS
const STORE_ITEMS = [
    { id: 'item_speed', name: 'Giày Khinh Công', icon: '👟', desc: '+3 Tốc độ (PAC)', price: 500000, type: 'stat', stat: 'PAC', amount: 3 },
    { id: 'item_shoot', name: 'Bia Đỡ Đạn', icon: '🎯', desc: '+3 Dứt điểm (SHO)', price: 600000, type: 'stat', stat: 'SHO', amount: 3 },
    { id: 'item_pass', name: 'Băng Đội Trưởng', icon: '🧠', desc: '+3 Chuyền bóng (PAS)', price: 400000, type: 'stat', stat: 'PAS', amount: 3 },
    { id: 'item_def', name: 'Tạ Chân', icon: '🛡️', desc: '+3 Phòng ngự, +2 Thể chất', price: 500000, type: 'stat_multi', stats: {DEF: 3, PHY: 2} },
    { id: 'item_gacha', name: 'Lò Đào Tạo Trẻ', icon: '⭐', desc: 'Tuyển 1 tài năng nội binh (OVR 60-75)', price: 1000000, type: 'gacha' }
];

// ================= NAVIGATION SYSTEM =================
const MAIN_TABS = ['club', 'team', 'league', 'news', 'settings'];
const ALL_VIEWS = ['view-club', 'view-facilities', 'view-stadium', 'view-trophy', 'view-team', 'view-squad-list', 'view-tactics', 'view-market', 'view-league', 'view-news', 'view-settings'];

function toggleNavLock(isLocked) {
    const navs = document.querySelectorAll('aside nav, nav.fixed');
    navs.forEach(n => {
        if(isLocked) n.classList.add('pointer-events-none', 'opacity-50');
        else n.classList.remove('pointer-events-none', 'opacity-50');
    });
}

function getRarityClass(ovr) {
    if (ovr >= 90) return { text: 'text-fuchsia-400 drop-shadow-[0_0_5px_rgba(232,121,249,0.8)]', bg: 'bg-fuchsia-900', border: 'border-fuchsia-500 shadow-[0_0_15px_rgba(232,121,249,0.5)]' };
    if (ovr >= 80) return { text: 'text-yellow-400', bg: 'bg-yellow-900/50', border: 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]' };
    if (ovr >= 65) return { text: 'text-slate-300', bg: 'bg-slate-700', border: 'border-slate-400' };
    return { text: 'text-orange-600', bg: 'bg-orange-950', border: 'border-orange-700' };
}

function updateHeaderDisplay() {
    document.getElementById('budget-display').textContent = `€${(myBudget/1000000).toFixed(2)}M`;
    document.getElementById('fame-display').textContent = `🌟 ${myFame}`;
    document.getElementById('club-welcome-name').textContent = myClubName;
    document.getElementById('setting-club-name').value = myClubName;
    document.getElementById('setting-manager-name').value = myManagerName;
    
    // Check News Badge
    let unread = leagueState.news.filter(n => !n.isRead).length;
    const badgePc = document.getElementById('news-badge-pc');
    const badgeMob = document.getElementById('news-badge-mob');
    if (unread > 0) { badgePc.classList.remove('hidden'); badgeMob.classList.remove('hidden'); }
    else { badgePc.classList.add('hidden'); badgeMob.classList.add('hidden'); }
}

window.switchMainTab = function(tabId) {
    ALL_VIEWS.forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden'); });
    MAIN_TABS.forEach(id => { 
        const navEl = document.getElementById(`nav-${id}`); if(navEl) navEl.className = "nav-btn block px-4 py-3 hover:bg-slate-800 text-slate-300 rounded-lg border border-transparent";
        const navMobEl = document.getElementById(`nav-${id}-mob`); if(navMobEl) navMobEl.className = "nav-btn flex flex-col items-center text-slate-400 hover:text-white min-w-[64px] snap-center transition-colors";
    });
    
    document.getElementById(`view-${tabId}`).classList.remove('hidden'); 
    
    const activeNav = document.getElementById(`nav-${tabId}`); if(activeNav) activeNav.className = "nav-btn block px-4 py-3 bg-green-900/40 text-green-400 font-medium rounded-lg border border-green-900/50";
    const activeMob = document.getElementById(`nav-${tabId}-mob`); if(activeMob) activeMob.className = "nav-btn flex flex-col items-center text-green-400 min-w-[64px] snap-center scale-110 transition-transform";

    if(tabId === 'league') renderLeagueView(); 
    if(tabId === 'news') renderNewsFeed();
}

window.openSubView = function(viewId) {
    ALL_VIEWS.forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden'); });
    document.getElementById(viewId).classList.remove('hidden');
    if(viewId === 'view-facilities') renderFacilities();
    if(viewId === 'view-squad-list') renderSquadList();
    if(viewId === 'view-market') { renderTransferMarket(); document.getElementById('tab-transfer-market').click(); }
}

window.closeSubView = function(hubId) {
    window.switchMainTab(hubId.replace('view-', ''));
}

MAIN_TABS.forEach(v => { 
    const btn = document.getElementById(`nav-${v}`); if(btn) btn.addEventListener('click', (e) => { e.preventDefault(); switchMainTab(v); });
    const btnMob = document.getElementById(`nav-${v}-mob`); if(btnMob) btnMob.addEventListener('click', (e) => { e.preventDefault(); switchMainTab(v); });
});

// ================= RENDER HỆ THỐNG =================
function renderSquadList() {
    const tbody = document.getElementById('squad-list-body'); tbody.innerHTML = '';
    const order = { 'GK': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 }; globalPlayersList.sort((a, b) => order[a.pos] - order[b.pos] || b.ovr - a.ovr);
    const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    
    globalPlayersList.forEach(p => {
        let statusHtml = '';
        if (p.isListed) statusHtml = '<span class="text-[10px] md:text-xs bg-red-900 text-red-300 px-1.5 md:px-2 py-1 rounded inline-block whitespace-nowrap">Chờ bán</span>';
        else if(myFacilities.medicalSlots.includes(p.id)) statusHtml = '<span class="text-[10px] md:text-xs bg-yellow-900 text-yellow-300 px-1.5 md:px-2 py-1 rounded inline-block whitespace-nowrap">🏥 Y tế</span>';
        else if(myFacilities.trainingSlots.includes(p.id)) statusHtml = '<span class="text-[10px] md:text-xs bg-blue-900 text-blue-300 px-1.5 md:px-2 py-1 rounded inline-block whitespace-nowrap">🏋️ Tập</span>';
        else if(startingXI.includes(p.id)) statusHtml = '<span class="text-[10px] md:text-xs bg-green-900 text-green-300 px-1.5 md:px-2 py-1 rounded inline-block whitespace-nowrap">⚽ Đá chính</span>';
        else statusHtml = '<span class="text-[10px] md:text-xs bg-slate-700 text-slate-300 px-1.5 md:px-2 py-1 rounded inline-block whitespace-nowrap">🪑 Dự bị</span>';

        const stColor = p.injury > 0 ? 'text-red-500 font-bold' : (p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400')); 
        const stBg = p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500');
        const rarity = getRarityClass(p.ovr);

        tbody.innerHTML += `<tr class="hover:bg-slate-700/50 transition-colors cursor-pointer" onclick="window.openPlayerDetail('${p.id}')"><td class="p-3 text-center whitespace-nowrap"><span class="${posColors[p.pos]} text-white text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-1 rounded w-10 md:w-12 inline-block text-center">${p.pos}</span></td><td class="p-3 font-medium text-white w-full"><div class="mb-1 whitespace-nowrap">${p.name}</div><div class="flex items-center gap-1 md:gap-2 text-[9px] md:text-[10px] ${stColor}"><span>⚡ ${p.stamina}%</span>${p.injury > 0 ? ' (Chấn thương)' : `<div class="w-12 md:w-16 bg-slate-700 h-1 md:h-1.5 rounded-full overflow-hidden hidden sm:block"><div class="${stBg} h-full" style="width: ${p.stamina}%"></div></div>`}</div></td><td class="p-3 text-center font-bold whitespace-nowrap ${rarity.text}">${p.ovr}</td><td class="p-3 text-center whitespace-nowrap">${statusHtml}</td><td class="p-3 text-right text-yellow-400 whitespace-nowrap">€${(p.value || p.ovr*100000).toLocaleString()}</td></tr>`;
    });
}

function renderStore() {
    const container = document.getElementById('store-items-container'); if(!container) return; container.innerHTML = '';
    STORE_ITEMS.forEach(item => { container.innerHTML += `<div class="bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-lg flex flex-col justify-between hover:border-indigo-500/50 transition-colors"><div><div class="text-4xl mb-3">${item.icon}</div><h3 class="text-xl font-bold text-white mb-1">${item.name}</h3><p class="text-slate-400 text-sm mb-4">${item.desc}</p></div><div><div class="text-yellow-400 font-bold mb-3 text-lg">€${item.price.toLocaleString()}</div><button onclick="window.buyItem('${item.id}')" class="w-full py-2 ${item.type === 'gacha' ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-indigo-600 hover:bg-indigo-500'} text-white font-bold rounded-lg transition shadow-lg">${item.type === 'gacha' ? 'Mở Gói Ngay' : 'Mua & Sử dụng'}</button></div></div>`; });
}

function renderNewsFeed() {
    const container = document.getElementById('news-feed-container'); container.innerHTML = '';
    if(!leagueState.news || leagueState.news.length === 0) {
        container.innerHTML = '<div class="bg-slate-800 border border-dashed border-slate-700 rounded-xl p-8 text-center text-slate-500">Chưa có bản tin nào mới. Hãy thi đấu thêm!</div>';
        return;
    }
    
    // Sort from newest to oldest
    const sortedNews = [...leagueState.news].reverse();
    sortedNews.forEach(n => {
        let typeStyle = "border-blue-500 bg-blue-900/20";
        if(n.type === 'good') typeStyle = "border-green-500 bg-green-900/20";
        if(n.type === 'bad') typeStyle = "border-red-500 bg-red-900/20";
        if(n.type === 'market') typeStyle = "border-yellow-500 bg-yellow-900/20";

        container.innerHTML += `<div class="bg-slate-800 border-l-4 ${typeStyle} p-4 rounded-r-xl shadow flex items-start gap-4 ${n.isRead ? 'opacity-70' : 'animate-pulse border border-slate-600'}">
            <div class="text-3xl">${n.icon || '📰'}</div>
            <div class="flex-1">
                <h4 class="font-bold text-white text-sm md:text-base">${n.title}</h4>
                <p class="text-slate-400 text-xs md:text-sm mt-1">${n.content}</p>
                <div class="text-[10px] text-slate-500 mt-2">Vòng ${n.round} - ${new Date(n.date).toLocaleDateString('vi-VN')}</div>
            </div>
        </div>`;
    });
}

document.getElementById('clear-news-btn').addEventListener('click', async () => {
    if(leagueState.news) {
        leagueState.news.forEach(n => n.isRead = true);
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        renderNewsFeed(); updateHeaderDisplay();
    }
});

// ================= AUTH EVENTS =================
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
            const profileData = profileSnap.data(); myClubName = profileData.clubName; myManagerName = profileData.managerName || "HLV Trưởng"; myBudget = profileData.budget || 10000000; myFame = profileData.fame || 30;
            myFacilities = profileData.facilities || { medical: 1, scouting: 1, training: 1, finance: 1, scoutingCooldown: 5, scoutedPlayer: null, medicalSlots: [], trainingSlots: [], pendingUpgrade: null };
            if(!myFacilities.medicalSlots) myFacilities.medicalSlots = []; if(!myFacilities.trainingSlots) myFacilities.trainingSlots = [];
            
            const pSnap = await getDocs(collection(db, 'artifacts', appId, 'users', uid, 'players'));
            globalPlayersList = []; globalPlayersMap = {};
            pSnap.forEach(doc => { 
                const d = doc.data(); d.id = doc.id; d.itemsUsed = d.itemsUsed || 0; 
                if (!d.stats || isNaN(d.ovr)) { const fallback = Math.floor(Math.random() * 20) + 50; d.stats = { PAC:fallback, SHO:fallback, PAS:fallback, DRI:fallback, DEF:fallback, PHY:fallback }; d.ovr = recalculateOVR(d.pos, d.stats); setDoc(doc.ref, { stats: d.stats, ovr: d.ovr }, { merge: true }); }
                if(!d.bonusStats) d.bonusStats = { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }; if (d.stamina === undefined || isNaN(d.stamina)) d.stamina = 100;
                if(d.injury === undefined) d.injury = 0;
                globalPlayersList.push(d); globalPlayersMap[d.id] = d; 
            });
            
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
                if(!leagueState.news) leagueState.news = [];
            } else { await initLeagueData(uid, myClubName); }
            
            updateHeaderDisplay();
            switchMainTab('club'); // Khởi động vào tab CLB
            if (leagueState.currentRound <= 31) document.getElementById('quick-play-btn').classList.remove('hidden');
            else document.getElementById('quick-play-btn').classList.add('hidden');
        } else { document.getElementById('init-club-modal').classList.remove('hidden'); }
    } catch(e) { showToast("Lỗi tải dữ liệu: Vui lòng F5 lại trang."); } finally { hideLoading(); }
};

document.getElementById('create-club-btn').addEventListener('click', async () => {
    const clubName = document.getElementById('club-name-input').value.trim(); if(!clubName) { showToast("Vui lòng nhập tên Câu lạc bộ!"); return; }
    const btn = document.getElementById('create-club-btn'); btn.textContent = "Đang tạo..."; btn.disabled = true; showLoading("ĐANG KHỞI TẠO ĐỘI HÌNH TÂN BINH...");
    try {
        const batch = writeBatch(db); const userRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'); batch.set(userRef, { clubName: clubName, managerName: "HLV Trưởng", budget: 10000000, fame: 30, facilities: myFacilities });
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
    leagueState = { currentRound: 1, standings: initialStandings, schedule: userSchedule, friendlyMatchesPlayed: 0, promotedBots: [], pendingBuys: [], pendingSells: [], rankHistory: [], news: [] };
    await setDoc(doc(db, 'artifacts', appId, 'users', uid, 'league', 'state'), leagueState);
};

// CÀI ĐẶT CHUNG
document.getElementById('save-settings-btn').addEventListener('click', async () => {
    const cName = document.getElementById('setting-club-name').value.trim();
    const mName = document.getElementById('setting-manager-name').value.trim();
    if(!cName || !mName) { showToast("Vui lòng nhập đủ thông tin!", "error"); return; }
    showLoading("ĐANG CẬP NHẬT...");
    try {
        myClubName = cName; myManagerName = mName;
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { clubName: myClubName, managerName: myManagerName }, { merge: true });
        
        let userTeam = leagueState.standings.find(t => t.isUser);
        if(userTeam) { userTeam.name = myClubName; await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState); }
        
        updateHeaderDisplay(); showToast("Đã lưu cài đặt!", "success");
    } catch(e) { showToast("Lỗi lưu cài đặt!"); } finally { hideLoading(); }
});

// CHI TIẾT CẦU THỦ
window.openPlayerDetail = (playerId) => {
    const p = globalPlayersMap[playerId]; if(!p) return; currentlyViewingPlayerId = playerId;
    const st = p.stats || { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 }; const bSt = p.bonusStats || { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 };
    const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    const rarity = getRarityClass(p.ovr);
    
    const avatarEl = document.querySelector('#player-detail-modal .rounded-full.mx-auto');
    if (avatarEl) {
        avatarEl.innerHTML = `<img src="https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(p.name.replace(/⭐/g, '').trim())}&backgroundColor=transparent" class="w-full h-full object-cover bg-slate-200" />`;
        avatarEl.className = `w-20 h-20 md:w-24 md:h-24 border-4 rounded-full mx-auto mb-3 flex items-center justify-center overflow-hidden shadow-lg transition-all ${rarity.border} ${rarity.bg}`;
    }

    document.getElementById('detail-name').textContent = p.name; 
    document.getElementById('detail-name').className = `text-xl md:text-2xl font-bold mb-1 ${rarity.text}`;
    document.getElementById('detail-pos').textContent = p.pos; document.getElementById('detail-pos').className = `${posColors[p.pos]} text-white text-[10px] md:text-xs font-bold px-2 py-1 rounded`; 
    document.getElementById('detail-bg-pos').textContent = p.pos; 
    document.getElementById('detail-ovr').textContent = p.ovr; document.getElementById('detail-ovr').className = `text-lg md:text-xl font-bold ${rarity.text}`;
    document.getElementById('detail-items-used').textContent = p.itemsUsed || 0;
    
    ['pac','sho','pas','dri','def','phy'].forEach(s => {
        const upperS = s.toUpperCase(); const total = st[upperS] || 0; const bonus = bSt[upperS] || 0; const base = total - bonus; const displayEl = document.getElementById(`detail-${s}`);
        if (bonus > 0) { displayEl.innerHTML = `${base} <span class="text-green-400 font-bold ml-1">+${bonus}</span>`; } else { displayEl.textContent = total; }
    });
    document.getElementById('detail-value').textContent = `€${(p.value || p.ovr*100000).toLocaleString()}`;
    
    let staminaDiv = document.getElementById('detail-stamina-bar');
    if (!staminaDiv) { staminaDiv = document.createElement('div'); staminaDiv.id = 'detail-stamina-bar'; staminaDiv.className = 'mt-2 mb-2 flex flex-col items-center justify-center'; const pModal = document.getElementById('sell-player-container').parentElement; pModal.insertBefore(staminaDiv, document.getElementById('sell-player-container')); }
    if(p.injury > 0) {
        staminaDiv.innerHTML = `<div class="text-[11px] md:text-sm font-bold text-red-500 mb-1">🚑 Đang chấn thương (Còn ${p.injury} vòng)</div><div class="text-[10px] md:text-xs text-slate-400">Yêu cầu đưa vào Trung tâm Y tế để chữa trị ngay!</div>`;
    } else {
        const stColor = p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400'); const stBg = p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500');
        staminaDiv.innerHTML = `<div class="text-[11px] md:text-sm text-slate-300 mb-1">Thể lực hiện tại: <span class="font-bold ${stColor}">${p.stamina}%</span></div><div class="w-3/4 bg-slate-700 h-2 rounded-full overflow-hidden mb-2"><div class="${stBg} h-full transition-all" style="width: ${p.stamina}%"></div></div>`;
    }

    const sellContainer = document.getElementById('sell-player-container');
    let facBtnHtml = '';
    if (myFacilities.medicalSlots.includes(p.id)) { facBtnHtml = `<button onclick="window.removeFromFacility('${p.id}', 'medical')" class="w-full py-1.5 md:py-2 bg-yellow-900/80 hover:bg-yellow-800 text-yellow-300 border border-yellow-700 rounded font-bold transition mb-2">Đưa ra khỏi TT Y tế</button>`; } 
    else if (myFacilities.trainingSlots.includes(p.id)) { facBtnHtml = `<button onclick="window.removeFromFacility('${p.id}', 'training')" class="w-full py-1.5 md:py-2 bg-blue-900/80 hover:bg-blue-800 text-blue-300 border border-blue-700 rounded font-bold transition mb-2">Đưa ra khỏi TT Huấn luyện</button>`; } 
    else {
        if (p.injury > 0 || p.stamina < 100) { facBtnHtml += `<button onclick="window.assignToFacility('${p.id}', 'medical')" class="w-full py-1.5 md:py-2 bg-green-900/50 hover:bg-green-800 text-green-400 border border-green-700 rounded font-bold transition mb-2">🏥 Đưa vào Y tế (Phục hồi 100%)</button>`; }
        if (p.injury === 0) { facBtnHtml += `<button onclick="window.assignToFacility('${p.id}', 'training')" class="w-full py-1.5 md:py-2 bg-blue-900/50 hover:bg-blue-800 text-blue-400 border border-blue-700 rounded font-bold transition mb-2">🏋️ Đưa vào Huấn luyện (Tăng OVR)</button>`; }
    }

    if (p.isListed) { sellContainer.innerHTML = facBtnHtml + `<button disabled class="w-full py-1.5 md:py-2 bg-slate-700 text-slate-400 rounded font-bold cursor-not-allowed mt-2">Đang chờ duyệt Bán</button>`; } 
    else { sellContainer.innerHTML = facBtnHtml + `<button onclick="window.listPlayerForSale()" class="w-full py-1.5 md:py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold shadow-lg transition mt-2 mb-2">Đưa lên TTCN</button><button onclick="window.terminateContract()" class="w-full py-1.5 bg-transparent border border-red-800 text-red-500 hover:bg-red-900/30 rounded transition">Thanh lý Hợp đồng</button>`; }
    document.getElementById('player-detail-modal').classList.remove('hidden');
};
document.getElementById('close-detail-modal').addEventListener('click', () => { document.getElementById('player-detail-modal').classList.add('hidden'); });

const calcTeamPower = () => {
    let totalOVR = 0, count = 0; let uAtt = 0, uAttC = 0, uMid = 0, uMidC = 0, uDef = 0, uDefC = 0;
    startingXI.forEach(id => { 
        if(id && globalPlayersMap[id]) { 
            let p = globalPlayersMap[id]; let penalty = p.stamina < 60 ? Math.floor((60 - p.stamina) / 2) : 0; let effOvr = Math.max(1, p.ovr - penalty); 
            totalOVR += effOvr; count++; 
            if(p.pos === 'FWD') { uAtt += effOvr; uAttC++; } else if(p.pos === 'MID') { uMid += effOvr; uMidC++; } else { uDef += effOvr; uDefC++; } 
        } 
    });
    
    teamPower.OVR = count > 0 ? Math.round(totalOVR/count) : 0; 
    teamPower.ATT = uAttC > 0 ? Math.round(uAtt/uAttC) : 0;
    teamPower.MID = uMidC > 0 ? Math.round(uMid/uMidC) : 0;
    teamPower.DEF = uDefC > 0 ? Math.round(uDef/uDefC) : 0;

    const ovrEl = document.getElementById('team-ovr'); if(ovrEl) ovrEl.textContent = teamPower.OVR;
    if(leagueState && leagueState.standings) { let userTeam = leagueState.standings.find(t => t.isUser); if(userTeam) userTeam.ovr = teamPower.OVR; }
};

const renderPitch = () => {
    const container = document.getElementById('pitch-container'); container.innerHTML = ''; const layout = currentFormation.split('-').map(Number); layout.reverse(); layout.push(1); const posNames = ['FWD', 'MID', 'DEF', 'GK']; let slotIndex = 0;
    layout.forEach((rowCount, rowIndex) => {
        const expectedPos = posNames[rowIndex]; const rowDiv = document.createElement('div'); rowDiv.className = "flex justify-center items-center w-full gap-1 sm:gap-6";
        for(let i=0; i<rowCount; i++) {
            const p = startingXI[slotIndex] ? globalPlayersMap[startingXI[slotIndex]] : null; const currentIndex = slotIndex; let pHtml = "";
            if (p) {
                const isOutOfPos = p.pos !== expectedPos; 
                const penalty = p.stamina < 60 ? Math.floor((60 - p.stamina) / 2) : 0; let effOvr = Math.max(1, p.ovr - penalty); if(p.injury > 0) effOvr = '🚑';
                const stBg = p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500');
                const rarity = getRarityClass(effOvr);
                const borderClass = isOutOfPos ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : rarity.border; 
                
                pHtml = `<div class="w-8 h-8 sm:w-10 sm:h-10 border-2 ${borderClass} ${rarity.bg} rounded-full flex items-center justify-center font-bold text-xs sm:text-sm z-10 relative overflow-hidden">${effOvr}${penalty > 0 && p.injury == 0 ? `<div class="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 bg-red-600 text-white text-[8px] sm:text-[9px] font-bold px-1 rounded-full shadow z-20">-${penalty}</div>` : ''}</div><div class="mt-1 w-12 sm:w-16 flex flex-col items-center"><div class="bg-black/80 px-1 py-0.5 rounded text-[8px] sm:text-[10px] text-white truncate max-w-full z-10">${p.name}</div>${p.injury > 0 ? '' : `<div class="w-full bg-slate-800 h-1 sm:h-1.5 mt-0.5 rounded border border-slate-700 overflow-hidden z-10"><div class="${stBg} h-full" style="width: ${p.stamina}%"></div></div>`}</div>`;
            } else { pHtml = `<div class="w-8 h-8 sm:w-10 sm:h-10 bg-white/10 hover:bg-white/20 border-2 border-dashed border-white/40 rounded-full flex items-center justify-center text-white/50 text-[10px] sm:text-xs font-bold z-10 transition">${expectedPos}</div>`; }
            rowDiv.innerHTML += `<div class="relative flex flex-col items-center w-14 sm:w-16 cursor-pointer hover:scale-110 transition-transform" onclick="window.openBenchSelect(${currentIndex}, '${expectedPos}')">${pHtml}</div>`; slotIndex++;
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
        const isCurrent = startingXI[slotIndex] === p.id; const stColor = p.injury > 0 ? 'text-red-500 font-bold' : (p.stamina >= 80 ? 'text-green-400' : 'text-yellow-400');
        const clickAction = p.injury > 0 ? `window.showToast('Cầu thủ đang chấn thương, không thể thi đấu!')` : `window.assignPlayerToSlot('${p.id}')`;
        const rarity = getRarityClass(p.ovr);
        container.innerHTML += `<div onclick="${clickAction}" class="flex justify-between items-center p-2 md:p-3 hover:bg-slate-700/50 border-b border-slate-700/50 cursor-pointer rounded ${isCurrent ? 'bg-green-900/30' : (p.injury > 0 ? 'opacity-50' : '')}"><div class="flex items-center gap-2 md:gap-3"><span class="${posColors[p.pos]} text-white text-[9px] md:text-[10px] font-bold px-1 md:px-2 py-0.5 rounded w-8 md:w-10 text-center">${p.pos}</span><div class="flex flex-col"><span class="text-white text-xs md:text-sm ${isCurrent ? 'font-bold' : ''}">${p.name}</span><span class="text-[9px] md:text-[10px] ${stColor}">${p.injury > 0 ? '🚑 Chấn thương' : `⚡ ${p.stamina}%`}</span></div></div><span class="font-bold text-sm md:text-base ${rarity.text}">${p.ovr}</span></div>`;
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
const generateMarketPlayers = () => {
    currentMarketList = []; for(let i=0; i<8; i++) { 
        const isStar = Math.random() > 0.8; const pos = POSITIONS[Math.floor(Math.random()*POSITIONS.length)]; 
        const ovr = isStar ? Math.floor(Math.random()*15)+80 : Math.floor(Math.random()*20)+50; const val = ovr * (isStar ? 150000 : 80000); let stats = { PAC: ovr, SHO: ovr, PAS: ovr, DRI: ovr, DEF: ovr, PHY: ovr };
        currentMarketList.push({ id: 'market_' + Date.now() + i, name: generatePlayerName(isStar), pos: pos, ovr: ovr, value: val, stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }, stamina: 100, injury: 0, isListed: false, itemsUsed: 0 });
    }
    const order = { 'GK': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };
    currentMarketList.sort((a, b) => order[a.pos] - order[b.pos] || b.ovr - a.ovr);
};

const renderTransferMarket = () => {
    if(currentMarketList.length === 0) generateMarketPlayers(); document.getElementById('tab-transfer-offers').textContent = `Đơn chờ xử lý (${(leagueState.pendingBuys?.length || 0) + (leagueState.pendingSells?.length || 0)})`;
    const tbody = document.getElementById('market-list-body'); tbody.innerHTML = ''; const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    currentMarketList.forEach(p => {
        let isPending = leagueState.pendingBuys?.find(b => b.marketId === p.id); let btnHtml = isPending ? `<button disabled class="bg-slate-700 text-slate-400 text-[10px] md:text-xs px-2 md:px-3 py-1.5 rounded font-bold shadow cursor-not-allowed">Chờ duyệt</button>` : `<button onclick="window.makeBuyOffer('${p.id}')" class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] md:text-xs px-2 md:px-3 py-1.5 rounded font-bold shadow transition">Đặt Mua</button>`;
        const rarity = getRarityClass(p.ovr);
        tbody.innerHTML += `<tr class="hover:bg-slate-700/50 transition-colors"><td class="p-3 text-center whitespace-nowrap"><span class="${posColors[p.pos]} text-white text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-1 rounded w-10 md:w-12 inline-block text-center">${p.pos}</span></td><td class="p-3 font-medium text-white w-full"><div class="whitespace-nowrap">${p.name} ${p.ovr >= 85 ? '<span class="text-[9px] text-yellow-400 ml-1">(Fame > 60)</span>' : ''}</div></td><td class="p-3 text-center font-bold whitespace-nowrap ${rarity.text}">${p.ovr}</td><td class="p-3 text-right text-yellow-400 whitespace-nowrap">€${p.value.toLocaleString()}</td><td class="p-3 text-center whitespace-nowrap">${btnHtml}</td></tr>`;
    });
};

document.getElementById('refresh-market-btn').addEventListener('click', async () => { 
    if(myBudget < 10000) { showToast("Bạn không đủ €10,000 để làm mới TTCN!", "error"); return; }
    if(confirm("Xác nhận chi €10,000 phí môi giới để tìm lứa cầu thủ mới?")) {
        showLoading("ĐANG LIÊN HỆ CÒ BÓNG ĐÁ...");
        try {
            myBudget -= 10000; updateHeaderDisplay();
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
            generateMarketPlayers(); renderTransferMarket(); 
            showToast("Đã làm mới Thị trường chuyển nhượng!", "success");
        } catch (e) { showToast("Lỗi làm mới!"); } finally { hideLoading(); }
    }
});

// Chuyển Tab trong Market
document.getElementById('tab-transfer-market').addEventListener('click', () => { document.getElementById('transfer-market-section').classList.remove('hidden'); document.getElementById('transfer-store-section').classList.add('hidden'); document.getElementById('tab-transfer-market').className = "px-3 py-2 font-bold text-green-400 border-b-2 border-green-400 whitespace-nowrap"; document.getElementById('tab-transfer-store').className = "px-3 py-2 font-medium text-slate-400 hover:text-white transition whitespace-nowrap"; });
document.getElementById('tab-transfer-store').addEventListener('click', () => { document.getElementById('transfer-market-section').classList.add('hidden'); document.getElementById('transfer-store-section').classList.remove('hidden'); document.getElementById('tab-transfer-market').className = "px-3 py-2 font-medium text-slate-400 hover:text-white transition whitespace-nowrap"; document.getElementById('tab-transfer-store').className = "px-3 py-2 font-bold text-green-400 border-b-2 border-green-400 whitespace-nowrap"; renderStore(); });

window.makeBuyOffer = async (marketId) => {
    const p = currentMarketList.find(x => x.id === marketId); if(!p) return;
    if (p.ovr >= 85 && myFame < 60) { showToast(`CLB chưa đủ Danh tiếng (Fame < 60) để đàm phán!`, "error"); return; }
    if (globalPlayersList.length + (leagueState.pendingBuys?.length || 0) >= 25) { showToast("Đội hình đã đầy!"); return; }
    const offerStr = prompt(`Nhập mức giá bạn đề nghị cho ${p.name} (Gốc: €${p.value.toLocaleString()}):`, p.value);
    if (offerStr === null) return; const bidAmount = parseInt(offerStr.replace(/,/g, ''));
    if (isNaN(bidAmount) || bidAmount <= 0) { showToast("Giá không hợp lệ!"); return; }
    if (myBudget < bidAmount) { showToast("Bạn không đủ ngân sách!"); return; }
    showLoading("ĐANG ĐÀM PHÁN CHUYỂN NHƯỢNG...");
    try {
        myBudget -= bidAmount; updateHeaderDisplay(); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
        if(!leagueState.pendingBuys) leagueState.pendingBuys = []; leagueState.pendingBuys.push({ marketId: p.id, playerInfo: p, bidAmount: bidAmount }); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        renderTransferMarket(); showToast(`Đã gửi đề nghị €${bidAmount.toLocaleString()} cho ${p.name}!`, "success");
    } catch (e) { showToast("Lỗi khi nộp đơn!"); } finally { hideLoading(); }
};

window.listPlayerForSale = async () => {
    if(!currentlyViewingPlayerId) return; const p = globalPlayersMap[currentlyViewingPlayerId]; if(p.isListed) return;
    const askStr = prompt(`Nhập mức giá TỐI THIỂU để bán ${p.name} (Gốc: €${(p.value).toLocaleString()}):`, p.value);
    if (askStr === null) return; const askAmount = parseInt(askStr.replace(/,/g, ''));
    if (isNaN(askAmount) || askAmount <= 0) { showToast("Giá không hợp lệ!"); return; }
    showLoading("ĐANG GỬI FAX CHO CÁC CLB KHÁC...");
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { isListed: true }, { merge: true }); p.isListed = true;
        if(!leagueState.pendingSells) leagueState.pendingSells = []; leagueState.pendingSells.push({ playerId: p.id, playerName: p.name, askAmount: askAmount, baseValue: p.value }); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        document.getElementById('player-detail-modal').classList.add('hidden');
        renderSquadList(); showToast(`Đã đưa ${p.name} lên chợ với giá €${askAmount.toLocaleString()}!`, "success");
    } catch(e) { showToast("Lỗi cập nhật trạng thái!"); } finally { hideLoading(); }
};

window.terminateContract = async () => {
    if(!currentlyViewingPlayerId) return; const p = globalPlayersMap[currentlyViewingPlayerId];
    const penaltyRate = 0.10 + (Math.random() * 0.05); const penaltyFee = Math.floor(p.value * penaltyRate);
    if (myBudget < penaltyFee) { showToast(`Cần ít nhất €${penaltyFee.toLocaleString()} để đền bù hợp đồng!`, "error"); return; }
    if(confirm(`Xác nhận ĐUỔI ${p.name}? \nMất phí bồi thường: -€${penaltyFee.toLocaleString()}`)) {
        showLoading("ĐANG THANH LÝ HỢP ĐỒNG...");
        try {
            document.getElementById('player-detail-modal').classList.add('hidden'); myBudget -= penaltyFee; updateHeaderDisplay();
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true }); await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id));
            globalPlayersList = globalPlayersList.filter(x => x.id !== p.id); delete globalPlayersMap[p.id]; startingXI = startingXI.map(id => id === p.id ? null : id);
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'tactics'), { formation: currentFormation, startingXI: startingXI });
            if (leagueState.pendingSells) { leagueState.pendingSells = leagueState.pendingSells.filter(x => x.playerId !== p.id); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState); }
            renderSquadList(); renderPitch(); showToast(`Đã thanh lý hợp đồng ${p.name}.`, "warning");
        } catch(e) { showToast("Lỗi khi thanh lý!"); } finally { hideLoading(); }
    }
};

window.buyItem = async (itemId) => {
    const item = STORE_ITEMS.find(x => x.id === itemId); if (!item) return;
    if (myBudget < item.price) { showToast("Bạn không đủ tiền!", "error"); return; }
    if (item.type === 'gacha') {
        if(globalPlayersList.length + (leagueState.pendingBuys?.length || 0) >= 25) { showToast("Đội hình đã đầy!"); return; }
        if (confirm(`Xác nhận chi €${item.price.toLocaleString()} để tuyển tài năng trẻ?`)) { 
            showLoading("ĐANG TUYỂN TÀI NĂNG TRẺ...");
            try {
                myBudget -= item.price; updateHeaderDisplay(); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
                const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)]; const name = generatePlayerName(false);
                const ovr = Math.floor(Math.random() * 16) + 60; const val = ovr * 70000; let stats = { PAC: ovr+2, SHO: ovr-2, PAS: ovr+1, DRI: ovr, DEF: ovr, PHY: ovr }; 
                const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players'));
                const playerData = { name: name, pos: pos, ovr: recalculateOVR(pos, stats), stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }, stamina: 100, injury: 0, value: val, isListed: false, itemsUsed: 0 };
                await setDoc(newPlayerRef, playerData); playerData.id = newPlayerRef.id; globalPlayersList.push(playerData); globalPlayersMap[playerData.id] = playerData;
                renderSquadList(); showToast(`Tuyệt vời! Mở ra ${name} (OVR ${playerData.ovr})!`, 'success');
            } catch (e) { showToast("Lỗi khi mở gói cầu thủ!"); } finally { hideLoading(); }
        }
    } else {
        currentItemToApply = item; document.getElementById('apply-item-name').textContent = item.name; const container = document.getElementById('apply-item-list-container'); container.innerHTML = '';
        let sortedPlayers = [...globalPlayersList].sort((a,b) => b.ovr - a.ovr);
        sortedPlayers.forEach(p => {
            const usedCount = p.itemsUsed || 0; const canUse = usedCount < 5;
            container.innerHTML += `<div class="flex justify-between items-center p-3 hover:bg-slate-700/50 border-b border-slate-700/50 rounded ${canUse ? 'cursor-pointer' : 'opacity-50 grayscale'}" ${canUse ? `onclick="window.applyItemToPlayer('${p.id}')"` : ''}><div><div class="text-white font-medium">${p.name}</div><div class="text-xs text-indigo-300">Đã dùng: ${usedCount}/5</div></div><div class="text-right"><div class="text-green-400 font-bold">OVR ${p.ovr}</div>${!canUse ? `<div class="text-red-400 text-xs">Giới hạn</div>` : ''}</div></div>`;
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
            renderSquadList(); renderPitch(); showToast(`Áp dụng thành công! OVR mới: ${p.ovr}`, 'success');
        } catch(e) { showToast("Lỗi khi dùng vật phẩm!"); } finally { hideLoading(); }
    }
};

const processTransferMarket = async () => {
    let resolvedLogs = []; let budgetRefunded = 0; let budgetEarned = 0;
    if (leagueState.pendingBuys && leagueState.pendingBuys.length > 0) {
        for (let b of leagueState.pendingBuys) {
            let p = b.playerInfo; let bidRatio = b.bidAmount / p.value; let fameFactor = myFame / 100; let successChance = (bidRatio * 0.5) + (fameFactor * 0.5); let hijackRng = Math.random();
            if (hijackRng <= successChance) {
                const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players')); p.isListed = false; p.itemsUsed = 0; p.stamina = 100; p.injury = 0; await setDoc(newPlayerRef, p);
                p.id = newPlayerRef.id; globalPlayersList.push(p); globalPlayersMap[p.id] = p; 
                resolvedLogs.push({ isRead: false, type: 'market', icon: '✅', title: 'Chiêu mộ thành công', content: `Đã đưa ${p.name} về CLB với giá €${b.bidAmount.toLocaleString()}.`, round: leagueState.currentRound, date: new Date().toISOString() });
            } else {
                let randomClub = RICH_CLUBS[Math.floor(Math.random()*RICH_CLUBS.length)]; budgetRefunded += b.bidAmount; 
                resolvedLogs.push({ isRead: false, type: 'bad', icon: '❌', title: 'Thương vụ đổ vỡ', content: `Bị ${randomClub} nẫng tay trên ${p.name}! Đã hoàn lại €${b.bidAmount.toLocaleString()}.`, round: leagueState.currentRound, date: new Date().toISOString() });
            }
        }
        leagueState.pendingBuys = [];
    }

    if (leagueState.pendingSells && leagueState.pendingSells.length > 0) {
        let remainingSells = [];
        for (let s of leagueState.pendingSells) {
            let botOffer = Math.floor(s.baseValue * (0.7 + Math.random() * 0.5));
            if (botOffer >= s.askAmount) {
                budgetEarned += botOffer; 
                let currentNames = leagueState.standings.map(t => t.name); let randomBot = currentNames[Math.floor(Math.random()*currentNames.length)];
                await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', s.playerId)); globalPlayersList = globalPlayersList.filter(x => x.id !== s.playerId); delete globalPlayersMap[s.playerId]; startingXI = startingXI.map(id => id === s.playerId ? null : id);
                resolvedLogs.push({ isRead: false, type: 'market', icon: '🤝', title: 'Bán cầu thủ thành công', content: `Bán ${s.playerName} cho ${randomBot} thu về €${botOffer.toLocaleString()}.`, round: leagueState.currentRound, date: new Date().toISOString() });
            } else { remainingSells.push(s); }
        }
        leagueState.pendingSells = remainingSells;
    }

    generateMarketPlayers();
    if (resolvedLogs.length > 0) {
        leagueState.news = leagueState.news.concat(resolvedLogs);
        myBudget = myBudget + budgetRefunded + budgetEarned; updateHeaderDisplay(); renderSquadList(); renderPitch();
    }
};

// ================= MODULE 6.5: CƠ SỞ HẠ TẦNG (CẬP NHẬT GỬI LOG VÀO HÒM THƯ) =================
const renderFacilities = () => {
    const container = document.getElementById('facilities-container'); if(!container) return; container.innerHTML = '';
    
    let medSlotsHtml = `<div class="mt-4 text-[11px] md:text-sm border-t border-slate-700 pt-3"><div class="text-slate-400 mb-2 font-bold">Đang nằm viện (${myFacilities.medicalSlots.length}/${myFacilities.medical}):</div>`;
    if (myFacilities.medicalSlots.length === 0) medSlotsHtml += `<div class="text-slate-500 italic bg-slate-900 p-2 rounded border border-dashed border-slate-700 text-center">Trống</div>`;
    else { myFacilities.medicalSlots.forEach(id => { const p = globalPlayersMap[id]; if(p) medSlotsHtml += `<div class="flex justify-between items-center text-white bg-slate-900 p-2 rounded mb-1 border border-slate-700"><span>🚑 ${p.name}</span><button onclick="window.removeFromFacility('${id}', 'medical')" class="text-red-400 hover:text-red-300 font-bold text-[10px] md:text-xs bg-red-900/30 px-2 py-1 rounded">Rút ra</button></div>`; }); }
    medSlotsHtml += `</div>`;

    let trainSlotsHtml = `<div class="mt-4 text-[11px] md:text-sm border-t border-slate-700 pt-3"><div class="text-slate-400 mb-2 font-bold">Đang tập luyện (${myFacilities.trainingSlots.length}/${myFacilities.training}):</div>`;
    if (myFacilities.trainingSlots.length === 0) trainSlotsHtml += `<div class="text-slate-500 italic bg-slate-900 p-2 rounded border border-dashed border-slate-700 text-center">Trống</div>`;
    else { myFacilities.trainingSlots.forEach(id => { const p = globalPlayersMap[id]; if(p) trainSlotsHtml += `<div class="flex justify-between items-center text-white bg-slate-900 p-2 rounded mb-1 border border-slate-700"><span>🏋️ ${p.name}</span><button onclick="window.removeFromFacility('${id}', 'training')" class="text-blue-400 hover:text-blue-300 font-bold text-[10px] md:text-xs bg-blue-900/30 px-2 py-1 rounded">Rút ra</button></div>`; }); }
    trainSlotsHtml += `</div>`;

    const facs = [
        { id: 'medical', name: '🏥 TT Y tế', desc: `Chữa chấn thương & hồi 100% thể lực ngay sau 1 vòng.`, level: myFacilities.medical, slotsHtml: medSlotsHtml },
        { id: 'training', name: '🏋️ TT Huấn luyện', desc: `Tăng +1 chỉ số ngẫu nhiên sau mỗi trận.`, level: myFacilities.training, slotsHtml: trainSlotsHtml },
        { id: 'scouting', name: '🕵️ TT Tuyển trạch', desc: `Mang về tài năng trẻ (hoặc Sách tập luyện nếu full 25 người).`, level: myFacilities.scouting, slotsHtml: '' },
        { id: 'finance', name: '🏦 TT Tài chính', desc: `Thụ động tăng ${myFacilities.finance * 5}% tổng doanh thu trận đấu.`, level: myFacilities.finance, slotsHtml: '' }
    ];

    facs.forEach(f => {
        const isMax = f.level >= 5; const cost = f.level * 3000000; 
        const upgradeTime = Math.pow(2, f.level - 1); 

        let actionHtml = '';
        if (myFacilities.pendingUpgrade && myFacilities.pendingUpgrade.id === f.id) {
            actionHtml = `<button disabled class="w-full py-2 bg-yellow-700 text-yellow-200 font-bold text-sm rounded-lg cursor-not-allowed">Đang thi công (${myFacilities.pendingUpgrade.remaining} vòng)</button>`;
        } else if (myFacilities.pendingUpgrade) {
             actionHtml = `<button disabled class="w-full py-2 bg-slate-700 text-slate-400 font-bold text-sm rounded-lg cursor-not-allowed">Chờ công trình khác</button>`;
        } else if (isMax) {
            actionHtml = `<button disabled class="w-full py-2 bg-slate-700 text-slate-400 font-bold text-sm rounded-lg cursor-not-allowed">Đã max (Lv.5)</button>`;
        } else {
            actionHtml = `<button onclick="window.upgradeFacility('${f.id}', ${cost}, ${upgradeTime})" class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-lg shadow-lg transition">Nâng cấp: €${(cost/1000000).toFixed(1)}M (${upgradeTime} trận)</button>`;
        }
        
        if(f.id === 'scouting') {
            if(myFacilities.scoutedPlayer) { actionHtml = `<div class="bg-green-900/50 border border-green-500 p-3 rounded-lg text-center mb-3"><div class="text-green-400 font-bold mb-1 text-xs">🎉 Phát hiện Tài năng!</div><div class="text-white text-xs">${myFacilities.scoutedPlayer.name} (OVR ${myFacilities.scoutedPlayer.ovr})</div><button onclick="window.claimScoutedPlayer()" class="mt-2 w-full py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded">Ký Hợp Đồng</button></div>` + actionHtml; } 
            else { actionHtml = `<div class="text-[10px] md:text-xs text-slate-400 text-center mb-3 border-t border-slate-700 pt-3">Tuyển trạch sau: <span class="font-bold text-yellow-400">${myFacilities.scoutingCooldown}</span> trận</div>` + actionHtml; }
        }
        container.innerHTML += `<div class="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-6 shadow-lg flex flex-col justify-between hover:border-blue-500/50 transition-colors"><div class="mb-4"><div class="flex justify-between items-center mb-2"><h3 class="text-lg md:text-xl font-bold text-white">${f.name}</h3><span class="bg-blue-900 text-blue-300 text-[10px] font-bold px-2 py-1 rounded">Lv. ${f.level}</span></div><p class="text-slate-400 text-xs md:text-sm">${f.desc}</p>${f.slotsHtml}</div><div>${actionHtml}</div></div>`;
    });
};

window.upgradeFacility = async (facId, cost, time) => {
    if(myBudget < cost) { showToast("Không đủ ngân sách!", "error"); return; }
    if(myFacilities.pendingUpgrade) { showToast("Đang có công trình khác thi công!", "warning"); return; }
    showLoading("ĐANG KÝ HỢP ĐỒNG...");
    try {
        myBudget -= cost; 
        myFacilities.pendingUpgrade = { id: facId, remaining: time };
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget, facilities: myFacilities }, { merge: true });
        updateHeaderDisplay(); renderFacilities(); showToast("Bắt đầu thi công nâng cấp Cơ sở hạ tầng!", "success");
    } catch(e) { showToast("Lỗi nâng cấp: " + e.message, "error"); } finally { hideLoading(); }
};

window.assignToFacility = async (playerId, type) => {
    const maxSlots = type === 'medical' ? myFacilities.medical : myFacilities.training; const currentSlots = type === 'medical' ? myFacilities.medicalSlots : myFacilities.trainingSlots;
    if (currentSlots.length >= maxSlots) { showToast(`Trung tâm đã hết chỗ!`, "error"); return; }
    if (startingXI.includes(playerId)) { showToast(`Hãy rút khỏi đội hình chính trước!`, "warning"); return; }
    currentSlots.push(playerId);
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { facilities: myFacilities }, { merge: true });
        document.getElementById('player-detail-modal').classList.add('hidden');
        renderFacilities(); renderSquadList(); showToast(`Đã đưa vào Trung tâm!`, "success");
    } catch(e) { showToast("Lỗi lưu cơ sở!"); }
};

window.removeFromFacility = async (playerId, type) => {
    if (type === 'medical') myFacilities.medicalSlots = myFacilities.medicalSlots.filter(id => id !== playerId); else myFacilities.trainingSlots = myFacilities.trainingSlots.filter(id => id !== playerId);
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { facilities: myFacilities }, { merge: true });
        document.getElementById('player-detail-modal').classList.add('hidden');
        renderFacilities(); renderSquadList(); showToast(`Đã rút ra khỏi Trung tâm.`, "success");
    } catch(e) { showToast("Lỗi rút cầu thủ!"); }
};

window.claimScoutedPlayer = async () => {
    if(globalPlayersList.length >= 25) { showToast("Đội hình đã đầy!", "error"); return; }
    showLoading("ĐANG KÝ HỢP ĐỒNG...");
    try {
        let p = myFacilities.scoutedPlayer; const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players'));
        await setDoc(newPlayerRef, p); p.id = newPlayerRef.id; globalPlayersList.push(p); globalPlayersMap[p.id] = p;
        myFacilities.scoutedPlayer = null; myFacilities.scoutingCooldown = 6 - myFacilities.scouting;
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { facilities: myFacilities }, { merge: true });
        renderFacilities(); renderSquadList(); showToast(`Chiêu mộ thành công ${p.name}!`, "success");
    } catch(e) { showToast("Lỗi nhận cầu thủ!"); } finally { hideLoading(); }
};

const processFacilitiesAndStamina = async () => {
    let newLogs = [];
    
    if (myFacilities.pendingUpgrade) {
        myFacilities.pendingUpgrade.remaining--;
        if (myFacilities.pendingUpgrade.remaining <= 0) {
            let facId = myFacilities.pendingUpgrade.id; myFacilities[facId]++;
            newLogs.push({ isRead: false, type: 'good', icon: '🏗️', title: 'Hoàn công', content: `Đã hoàn tất nâng cấp công trình!`, round: leagueState.currentRound, date: new Date().toISOString() });
            myFacilities.pendingUpgrade = null;
        }
    }

    let injuryLogs = [];
    globalPlayersList.forEach(p => {
        if (startingXI.includes(p.id)) {
            p.stamina = Math.max(0, p.stamina - (Math.floor(Math.random() * 11) + 15));
            if(p.stamina < 30 && Math.random() < 0.4) {
                p.injury = 3; injuryLogs.push(p.name);
                let idx = startingXI.indexOf(p.id); if(idx !== -1) startingXI[idx] = null;
            }
        } else {
            p.stamina = Math.min(100, p.stamina + (Math.floor(Math.random() * 11) + 25));
            if(p.injury > 0) p.injury = Math.max(0, p.injury - 1);
        }
    });
    if (injuryLogs.length > 0) {
        newLogs.push({ isRead: false, type: 'bad', icon: '🚑', title: 'Báo cáo Y tế', content: `Các cầu thủ: ${injuryLogs.join(', ')} đã bị chấn thương do quá tải!`, round: leagueState.currentRound, date: new Date().toISOString() });
    }

    let healedLogs = [];
    if(myFacilities.medicalSlots.length > 0) {
        let remainingSlots = [];
        myFacilities.medicalSlots.forEach(id => { let p = globalPlayersMap[id]; if (p) { p.stamina = 100; p.injury = 0; healedLogs.push(p.name); } });
        myFacilities.medicalSlots = remainingSlots;
        newLogs.push({ isRead: false, type: 'good', icon: '🏥', title: 'Xuất viện', content: `${healedLogs.join(', ')} đã bình phục hoàn toàn!`, round: leagueState.currentRound, date: new Date().toISOString() });
    }

    let trainedLogs = [];
    if(myFacilities.trainingSlots.length > 0) {
        myFacilities.trainingSlots.forEach(id => {
            let p = globalPlayersMap[id];
            if (p && p.injury === 0) {
                let statsKeys = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']; let rStat = statsKeys[Math.floor(Math.random()*statsKeys.length)];
                if(p.stats[rStat] < 99) { p.stats[rStat]++; p.ovr = recalculateOVR(p.pos, p.stats); p.value = p.ovr * 100000; trainedLogs.push(p.name); }
            }
        });
        if(trainedLogs.length > 0) {
            newLogs.push({ isRead: false, type: 'good', icon: '🏋️', title: 'Báo cáo Huấn luyện', content: `${trainedLogs.join(', ')} vừa tăng +1 chỉ số tổng (OVR).`, round: leagueState.currentRound, date: new Date().toISOString() });
        }
    }

    if(!myFacilities.scoutedPlayer) {
        myFacilities.scoutingCooldown--;
        if(myFacilities.scoutingCooldown <= 0) {
            if(globalPlayersList.length >= 25) {
                let lowestPlayer = [...globalPlayersList].sort((a,b) => a.ovr - b.ovr)[0];
                if (lowestPlayer) {
                    let statsKeys = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']; let rStat = statsKeys[Math.floor(Math.random()*statsKeys.length)];
                    lowestPlayer.stats[rStat] += 2; lowestPlayer.ovr = recalculateOVR(lowestPlayer.pos, lowestPlayer.stats); lowestPlayer.value = lowestPlayer.ovr * 100000;
                    newLogs.push({ isRead: false, type: 'good', icon: '🎁', title: 'Quà từ Tuyển trạch', content: `Đội hình đã đầy, Tuyển trạch viên tặng sách huấn luyện giúp ${lowestPlayer.name} tăng chỉ số!`, round: leagueState.currentRound, date: new Date().toISOString() });
                }
                myFacilities.scoutingCooldown = 6 - myFacilities.scouting;
            } else {
                const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)]; const name = generatePlayerName();
                const ovr = 60 + (myFacilities.scouting * 4) + Math.floor(Math.random() * 5); const val = ovr * 50000; let stats = { PAC: ovr+1, SHO: ovr, PAS: ovr+2, DRI: ovr, DEF: ovr, PHY: ovr };
                myFacilities.scoutedPlayer = { name: name, pos: pos, ovr: recalculateOVR(pos, stats), stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }, stamina: 100, injury: 0, value: val, isListed: false, itemsUsed: 0 };
                newLogs.push({ isRead: false, type: 'good', icon: '🕵️', title: 'Tài năng mới', content: `Đã phát hiện tài năng trẻ OVR ${myFacilities.scoutedPlayer.ovr}. Kiểm tra tại Trung tâm!`, round: leagueState.currentRound, date: new Date().toISOString() });
            }
        }
    }

    const batch = writeBatch(db);
    globalPlayersList.forEach(p => { batch.update(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { stamina: p.stamina, injury: p.injury || 0, stats: p.stats, ovr: p.ovr, value: p.value }); });
    await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { facilities: myFacilities }, { merge: true }); await batch.commit();

    if (newLogs.length > 0) { 
        leagueState.news = leagueState.news.concat(newLogs);
        updateHeaderDisplay(); // Kích hoạt chấm đỏ
    }
    renderSquadList(); renderPitch(); renderFacilities();
};

// ================= MODULE 7: LEAGUE & MATCH =================
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
            let currentNames = leagueState.standings.map(t => t.name);
            let availableReserves = VN_CLUBS_POOL.filter(name => !currentNames.includes(name));
            availableReserves.sort(() => Math.random() - 0.5);
            leagueState.promotedBots = [ { name: availableReserves[0] }, { name: availableReserves[1] } ]; 
            setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        }
        let relegateBoard = `<div class="flex-1"><h4 class="font-bold text-red-400 mb-2 border-b border-slate-700 pb-1">🔄 Lên / Xuống Hạng</h4><div class="text-red-400">🔻 Rớt hạng: ${relegatedBots.map(b=>b.name).join(', ')}</div><div class="text-green-400 mt-1">🔺 Thăng hạng: ${leagueState.promotedBots.map(b=>b.name).join(', ')}</div></div>`;
        summaryBoard.innerHTML = goldBoard + relegateBoard;
        
        const friendlyBtn = document.getElementById('play-friendly-btn'); const playedFriendly = leagueState.friendlyMatchesPlayed || 0;
        if (playedFriendly >= 5) { friendlyBtn.disabled = true; friendlyBtn.classList.add('opacity-50', 'cursor-not-allowed'); friendlyBtn.textContent = `⚽ Hết lượt Giao Hữu`; } else { friendlyBtn.disabled = false; friendlyBtn.classList.remove('opacity-50', 'cursor-not-allowed'); friendlyBtn.textContent = `⚽ Đá Giao Hữu (${playedFriendly}/5)`; }
    } else {
        document.getElementById('match-setup').classList.remove('hidden'); document.getElementById('season-end-panel').classList.add('hidden'); document.getElementById('league-current-round').textContent = leagueState.currentRound; document.getElementById('league-home-name').textContent = myClubName;
        const opponentId = leagueState.schedule[leagueState.currentRound - 1]; const opponent = leagueState.standings.find(t => t.id === opponentId); 
        
        if(opponent) {
            document.getElementById('league-away-name').textContent = opponent.name;
            document.getElementById('setup-home-ovr').textContent = teamPower.OVR;
            document.getElementById('setup-home-att').textContent = teamPower.ATT;
            document.getElementById('setup-home-mid').textContent = teamPower.MID;
            document.getElementById('setup-home-def').textContent = teamPower.DEF;

            const botOvr = opponent.ovr;
            const awayATT = botOvr + ((leagueState.currentRound + 1) % 5 - 2);
            const awayMID = botOvr + ((leagueState.currentRound + 2) % 5 - 2);
            const awayDEF = botOvr + ((leagueState.currentRound + 3) % 5 - 2);
            
            document.getElementById('setup-away-ovr').textContent = botOvr;
            document.getElementById('setup-away-att').textContent = awayATT;
            document.getElementById('setup-away-mid').textContent = awayMID;
            document.getElementById('setup-away-def').textContent = awayDEF;
        }
    }
    const tbody = document.getElementById('league-table-body'); tbody.innerHTML = '';
    leagueState.standings.forEach((team, index) => {
        const rank = index + 1; const gd = team.gf - team.ga; let rowClass = "hover:bg-slate-700/30 transition-colors "; if (team.isUser) rowClass += "bg-green-900/
