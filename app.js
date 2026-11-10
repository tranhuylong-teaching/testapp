import { auth, db, appId, VN_CLUBS_POOL, RICH_CLUBS, getPrizeMoney, recalculateOVR, generatePlayerName, POSITIONS } from './firebase-config.js';
import { showLoading, hideLoading, showToast } from './ui-helpers.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// GLOBAL STATE
let currentUserId = null; let myClubName = "My Club"; let myBudget = 0; let myFame = 30;
let myFacilities = { medical: 1, scouting: 1, training: 1, finance: 1, scoutingCooldown: 5, scoutedPlayer: null, medicalSlots: [], trainingSlots: [], pendingUpgrade: null };
let globalPlayersList = []; let globalPlayersMap = {}; let currentFormation = '4-4-2'; let startingXI = new Array(11).fill(null); 
let teamPower = { OVR: 0, ATT: 0, MID: 0, DEF: 0 };
let leagueState = { currentRound: 1, standings: [], schedule: [], friendlyMatchesPlayed: 0, promotedBots: [], pendingBuys: [], pendingSells: [], rankHistory: [] };
let newsInbox = []; let hasUnreadNews = false; let currentMarketList = []; let currentlyViewingPlayerId = null; let currentSlotToFill = null; let currentItemToApply = null;
let activeSubView = null; let activeOpponent = null;
let myClubLogo = "🛡️"; 
let myStadiumName = "Sân Nhà"; 
let myQuest = null;

const TABS = ['club', 'squad', 'league', 'news', 'settings'];
const POS_COLORS = { 'GK': 'bg-yellow-600', 'DEF': 'bg-blue-600', 'MID': 'bg-green-600', 'FWD': 'bg-red-600' };
const POS_ORDER = { 'GK': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };
window.showToast = showToast; window.showLoading = showLoading; window.hideLoading = hideLoading;

const STORE_ITEMS = [
    { id: 'item_speed', name: 'Giày Khinh Công', icon: '👟', desc: '+3 Tốc độ', price: 500000, type: 'stat', stat: 'PAC', amount: 3 },
    { id: 'item_shoot', name: 'Bia Đỡ Đạn', icon: '🎯', desc: '+3 Dứt điểm', price: 600000, type: 'stat', stat: 'SHO', amount: 3 },
    { id: 'item_pass', name: 'Băng Đội', icon: '🧠', desc: '+3 Chuyền', price: 400000, type: 'stat', stat: 'PAS', amount: 3 },
    { id: 'item_def', name: 'Tạ Chân', icon: '🛡️', desc: '+3 PN, +2 Thể lực', price: 500000, type: 'stat_multi', stats: {DEF: 3, PHY: 2} },
    { id: 'item_gacha', name: 'Lò Đào Tạo', icon: '⭐', desc: 'Tuyển 1 tài năng', price: 1000000, type: 'gacha' }
];

function toggleNavLock(isLocked) { document.querySelectorAll('aside nav, nav.fixed').forEach(n => isLocked ? n.classList.add('pointer-events-none', 'opacity-50') : n.classList.remove('pointer-events-none', 'opacity-50')); }
function getRarityClass(ovr) {
    if (ovr >= 90) return { 
        text: 'text-fuchsia-100 drop-shadow-[0_0_5px_rgba(232,121,249,0.8)]', 
        bg: 'bg-fuchsia-900', 
        border: 'border-fuchsia-400 shadow-[0_0_15px_rgba(232,121,249,0.5)]',
        cardBg: 'bg-gradient-to-br from-fuchsia-900 via-purple-900 to-slate-950'
    };
    if (ovr >= 80) return { 
        text: 'text-yellow-100 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]', 
        bg: 'bg-yellow-900/50', 
        border: 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]',
        cardBg: 'bg-gradient-to-br from-yellow-800 via-amber-900 to-slate-950'
    };
    if (ovr >= 65) return { 
        text: 'text-slate-100', 
        bg: 'bg-slate-700', 
        border: 'border-slate-400',
        cardBg: 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950'
    };
    return { 
        text: 'text-orange-100', 
        bg: 'bg-orange-950', 
        border: 'border-orange-700',
        cardBg: 'bg-gradient-to-br from-orange-900 via-red-950 to-slate-950'
    };
}

function updateHeaderDisplay() {
    if(document.getElementById('budget-display')) document.getElementById('budget-display').textContent = `€${(myBudget/1000000).toFixed(2)}M`;
    if(document.getElementById('fame-display')) document.getElementById('fame-display').textContent = `🌟 ${myFame}`;
    if(document.getElementById('header-club-name')) document.getElementById('header-club-name').textContent = myClubName;
    
    // Hiển thị dạng hình ảnh nếu là URL, hiển thị Text nếu là Emoji
    const logoEl = document.getElementById('header-club-logo');
    if(logoEl) {
        if(myClubLogo.startsWith('http')) logoEl.innerHTML = `<img src="${myClubLogo}" class="w-6 h-6 object-contain rounded-full bg-white/10" />`;
        else logoEl.textContent = myClubLogo;
    }
}

// Khai báo biến toàn cục để lưu instance của biểu đồ
let rankChartInstance = null;

function renderClubDashboard() {
    // 1. Cập nhật thống kê nhanh
    let userTeam = leagueState.standings.find(t => t.isUser);
    if (!userTeam) return;

    if(document.getElementById('dash-budget')) document.getElementById('dash-budget').textContent = `€${(myBudget/1000000).toFixed(2)}M`;
    if(document.getElementById('dash-fame')) document.getElementById('dash-fame').textContent = myFame;
    if(document.getElementById('dash-record')) document.getElementById('dash-record').textContent = `${userTeam.won}T - ${userTeam.drawn}H - ${userTeam.lost}B`;
    if(document.getElementById('dash-points')) document.getElementById('dash-points').textContent = userTeam.points;

    // 2. Lọc và hiển thị Sự kiện Tài trợ / Tài chính từ Hộp thư tin tức
    const sponsorContainer = document.getElementById('sponsor-events-list');
    if(sponsorContainer) {
        // Lọc các tin có chứa từ khoá tài chính hoặc tài trợ
        const sponsorContainer = document.getElementById('sponsor-events-list');
        if(sponsorContainer) {
            let questHtml = '';
            if(myQuest) {
                let percent = Math.min(100, (myQuest.progress / myQuest.target) * 100);
                questHtml = `
                <div class="bg-indigo-900/40 border border-indigo-500/50 p-3 rounded-lg mb-3 shadow-lg">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-indigo-300 font-bold text-[10px] md:text-xs uppercase">🎯 Hợp đồng ngắn hạn</span>
                        <span class="text-yellow-400 font-bold text-xs">Thưởng: €${myQuest.reward.toLocaleString()}</span>
                    </div>
                    <div class="text-white text-sm mb-2">${myQuest.desc} (<span class="text-green-400 font-bold">${myQuest.progress}/${myQuest.target}</span>)</div>
                    <div class="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-700">
                        <div class="bg-gradient-to-r from-indigo-600 to-purple-500 h-full transition-all duration-500" style="width: ${percent}%"></div>
                    </div>
                </div>`;
            }
        
            let sponsorNews = newsInbox.filter(n => n.title.toLowerCase().includes('tài trợ') || n.title.toLowerCase().includes('tài chính') || n.title.toLowerCase().includes('phạt') || (n.isGood && n.title.includes('Bán')));
            
            let newsHtml = sponsorNews.length === 0 
                ? '<div class="text-center text-slate-500 italic mt-4 text-sm">Chưa có hoạt động dòng tiền nổi bật.</div>' 
                : sponsorNews.slice(0, 4).map(n => `
                    <div class="bg-slate-900/50 p-2.5 md:p-3 rounded-lg border-l-4 ${n.isGood ? 'border-green-500' : 'border-red-500'} mb-2">
                        <div class="font-bold ${n.isGood ? 'text-green-400' : 'text-red-400'} text-xs md:text-sm mb-0.5">${n.title}</div>
                        <div class="text-[10px] md:text-xs text-slate-300 leading-relaxed line-clamp-2">${n.message}</div>
                    </div>
                `).join('');
        
            sponsorContainer.innerHTML = questHtml + newsHtml;
        }
    }

    // 3. Render Biểu đồ thứ hạng bằng Chart.js
    const chartCtx = document.getElementById('rankChart');
    if(!chartCtx) return;
    
    // Hủy biểu đồ cũ nếu đã vẽ trước đó để tránh lỗi vẽ đè (memory leak)
    if (rankChartInstance) { rankChartInstance.destroy(); }

    // Tạo mảng Labels cho trục X (Ví dụ: Vòng 1, Vòng 2...)
    let labels = [];
    let rankData = leagueState.rankHistory || [];
    
    // Nếu chưa đá vòng nào, hiển thị mặc định
    if(rankData.length === 0) {
        labels = ['Vòng 1'];
        let currentRank = leagueState.standings.findIndex(t => t.isUser) + 1;
        rankData = [currentRank];
    } else {
        labels = Array.from({length: rankData.length}, (_, i) => `Vòng ${i+1}`);
    }

    rankChartInstance = new Chart(chartCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Thứ hạng',
                data: rankData,
                borderColor: '#10b981', // green-500
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                borderWidth: 3,
                fill: true,
                tension: 0.3, // Làm cong đường line
                pointBackgroundColor: '#10b981',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    reverse: true, // Xếp hạng 1 nằm trên cùng
                    min: 1, 
                    max: 32, 
                    ticks: { stepSize: 5, color: '#94a3b8' },
                    grid: { color: 'rgba(51, 65, 85, 0.5)' }
                },
                x: { 
                    ticks: { color: '#94a3b8', maxTicksLimit: 10 },
                    grid: { color: 'rgba(51, 65, 85, 0.5)' }
                }
            },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) { return 'Hạng: ' + context.parsed.y; }
                    }
                }
            }
        }
    });
}

function switchView(v) {
    window.closeSubView(false);
    TABS.forEach(id => { 
        const vEl = document.getElementById(`view-${id}`); if(vEl) vEl.classList.add('hidden'); 
        const nEl = document.getElementById(`nav-${id}`); if(nEl) nEl.className = "block px-4 py-3 hover:bg-slate-800 text-slate-300 rounded-lg border border-transparent";
        const mEl = document.getElementById(`nav-${id}-mob`); if(mEl) mEl.className = "flex flex-col items-center text-slate-400 hover:text-white transition-colors";
    });
    const viewV = document.getElementById(`view-${v}`); if(viewV) viewV.classList.remove('hidden'); 
    const aNav = document.getElementById(`nav-${v}`); if(aNav) aNav.className = "block px-4 py-3 bg-green-900/40 text-green-400 font-medium rounded-lg border border-green-900/50";
    const aMob = document.getElementById(`nav-${v}-mob`); if(aMob) aMob.className = "flex flex-col items-center text-green-400 transition-colors";

    if(v === 'club') renderClubDashboard();
    if(v === 'squad' && document.getElementById('squad-count')) document.getElementById('squad-count').textContent = globalPlayersList.length;
    if(v === 'league') renderLeagueView(); 
    if(v === 'news') { renderNewsView(); hasUnreadNews = false; checkUnreadNews(); }
    if(v === 'settings' && document.getElementById('setting-club-name')) {
        document.getElementById('setting-club-name').value = myClubName;
        document.getElementById('setting-club-logo').value = myClubLogo;
        document.getElementById('setting-stadium-name').value = myStadiumName;
    }
}

window.openSubView = function(subViewId) {
    TABS.forEach(id => { const el = document.getElementById(`view-${id}`); if(el) el.classList.add('hidden'); });
    const subEl = document.getElementById(`subview-${subViewId}`); if(subEl) subEl.classList.remove('hidden'); activeSubView = subViewId;
    if(subViewId === 'facilities') window.renderFacilities(); 
    if(subViewId === 'squad-list') renderSquadList(); 
    if(subViewId === 'tactics') renderPitch();
    if(subViewId === 'market') {
        const tabTransfer = document.getElementById('tab-transfer-market');
        if(tabTransfer) tabTransfer.click(); 
        renderTransferMarket(); // Nạp dữ liệu chợ ngay khi mở Sub-view
    }
    if(subViewId === 'stadium') window.renderStadium();
};

window.closeSubView = function(returnToParent = true) {
    if(!activeSubView) return;
    const subEl = document.getElementById(`subview-${activeSubView}`); if(subEl) subEl.classList.add('hidden');
    if(returnToParent) {
        if(['facilities', 'stadium', 'trophy'].includes(activeSubView)) switchView('club');
        else if(['squad-list', 'tactics', 'market'].includes(activeSubView)) switchView('squad');
    }
    activeSubView = null;
};

TABS.forEach(v => { 
    document.getElementById(`nav-${v}`)?.addEventListener('click', (e) => { e.preventDefault(); switchView(v); });
    document.getElementById(`nav-${v}-mob`)?.addEventListener('click', (e) => { e.preventDefault(); switchView(v); });
});

window.saveSettings = async function() {
    const newName = document.getElementById('setting-club-name').value.trim(); 
    const newLogo = document.getElementById('setting-club-logo').value.trim() || "🛡️";
    const newStadium = document.getElementById('setting-stadium-name').value.trim() || "Sân Nhà";
    
    if(!newName) { showToast("Tên không được bỏ trống!", "error"); return; }
    
    showLoading("ĐANG LƯU...");
    try {
        myClubName = newName; myClubLogo = newLogo; myStadiumName = newStadium;
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { 
            clubName: newName, 
            logo: newLogo,
            stadiumName: newStadium 
        }, { merge: true });
        
        let userTeam = leagueState.standings.find(t => t.isUser); 
        if(userTeam) { 
            userTeam.name = newName; 
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState); 
        }
        
        updateHeaderDisplay(); 
        if(activeSubView === 'stadium') window.renderStadium(); // Render lại tên SVĐ
        showToast("Cập nhật thông tin thành công!", "success");
    } catch(e) { showToast("Lỗi lưu cài đặt!"); } finally { hideLoading(); }
};

window.resetGameData = async function() {
    const cf = prompt("Xác nhận XÓA TOÀN BỘ dữ liệu? (Gõ 'YES')"); if(cf !== 'YES') return;
    showLoading("ĐANG XÓA..."); try { await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { clubName: "", budget: 0 }); location.reload(); } catch(e) { hideLoading(); }
};

function checkUnreadNews() {
    const bPc = document.getElementById('news-badge-pc'); const bMob = document.getElementById('news-badge-mob');
    if(!bPc || !bMob) return;
    if(hasUnreadNews) { bPc.classList.remove('hidden'); bMob.classList.remove('hidden'); } else { bPc.classList.add('hidden'); bMob.classList.add('hidden'); }
}

window.pushNews = function(title, message, isGood) {
    newsInbox.unshift({ id: Date.now()+Math.random(), title: title, message: message, isGood: isGood, time: `Vòng ${leagueState.currentRound}` });
    if(newsInbox.length > 30) newsInbox.pop(); hasUnreadNews = true; checkUnreadNews();
};

function renderNewsView() {
    const c = document.getElementById('news-container'); if(!c) return; c.innerHTML = '';
    if(newsInbox.length === 0) { c.innerHTML = '<div class="text-center text-slate-500 text-sm mt-10 italic">Chưa có tin.</div>'; return; }
    newsInbox.forEach(n => {
        const icon = n.isGood === true ? '✅' : (n.isGood === false ? '❌' : '📰'); const borderColor = n.isGood === true ? 'border-green-500/50' : (n.isGood === false ? 'border-red-500/50' : 'border-blue-500/50');
        c.innerHTML += `<div class="bg-slate-800 p-4 rounded-xl border ${borderColor} shadow flex gap-3"><div class="text-2xl">${icon}</div><div><div class="flex justify-between items-center mb-1"><h4 class="font-bold text-white text-sm">${n.title}</h4><span class="text-[10px] text-slate-400">${n.time}</span></div><p class="text-xs text-slate-300 leading-relaxed">${n.message}</p></div></div>`;
    });
}
document.getElementById('clear-news-btn')?.addEventListener('click', () => { newsInbox = []; renderNewsView(); hasUnreadNews = false; checkUnreadNews(); });

let isLogin = true; 
document.getElementById('toggle-mode-btn')?.addEventListener('click', (e) => { e.preventDefault(); isLogin = !isLogin; document.getElementById('auth-submit-btn').textContent = isLogin ? "Đăng Nhập" : "Đăng Ký"; document.getElementById('auth-toggle-text').textContent = isLogin ? "Chưa có tài khoản?" : "Đã có tài khoản?"; });
document.getElementById('auth-form')?.addEventListener('submit', async (e) => { 
    e.preventDefault(); document.getElementById('auth-submit-btn').disabled = true; document.getElementById('auth-error').classList.add('hidden'); showLoading(isLogin ? "ĐANG XÁC THỰC..." : "ĐANG TẠO TÀI KHOẢN...");
    try { if(isLogin) await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); else await createUserWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); } 
    catch(err) { document.getElementById('auth-error').textContent = err.message; document.getElementById('auth-error').classList.remove('hidden'); document.getElementById('auth-submit-btn').disabled = false; } finally { hideLoading(); }
});
document.getElementById('logout-btn')?.addEventListener('click', () => { showLoading("ĐANG ĐĂNG XUẤT..."); signOut(auth).then(() => { location.reload(); }); });

onAuthStateChanged(auth, (user) => {
    if (user) { document.getElementById('auth-container').classList.add('hidden'); document.getElementById('dashboard-section').classList.remove('hidden'); currentUserId = user.uid; if(document.getElementById('user-email-display')) document.getElementById('user-email-display').textContent = user.email; loadGameData(user.uid); } 
    else { document.getElementById('dashboard-section').classList.add('hidden'); document.getElementById('auth-container').classList.remove('hidden'); document.getElementById('quick-play-btn').classList.add('hidden'); }
});

async function loadGameData(uid) {
    showLoading("ĐANG TẢI DỮ LIỆU...");
    try {
        const profileSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'profile', 'info'));
        if (profileSnap.exists()) {
            const profileData = profileSnap.data(); 
            if(!profileData.clubName) { document.getElementById('init-club-modal').classList.remove('hidden'); hideLoading(); return; }
            myClubName = profileData.clubName; 
            myClubLogo = profileData.logo || "🛡️";
            myStadiumName = profileData.stadiumName || "Sân Nhà";
            myQuest = profileData.quest || null;
            myBudget = profileData.budget || 10000000; 
            myFame = profileData.fame || 30;
            myFacilities = profileData.facilities || { medical: 1, scouting: 1, training: 1, finance: 1, scoutingCooldown: 5, scoutedPlayer: null, medicalSlots: [], trainingSlots: [], pendingUpgrade: null };
            if(!myFacilities.medicalSlots) myFacilities.medicalSlots = []; if(!myFacilities.trainingSlots) myFacilities.trainingSlots = [];
            if(!myQuest) window.generateNewQuest();
            newsInbox = profileData.news || []; updateHeaderDisplay();
            
            const pSnap = await getDocs(collection(db, 'artifacts', appId, 'users', uid, 'players')); globalPlayersList = []; globalPlayersMap = {};
            pSnap.forEach(doc => { 
                const d = doc.data(); d.id = doc.id; d.itemsUsed = d.itemsUsed || 0; 
                if (!d.stats || isNaN(d.ovr)) { const fallback = Math.floor(Math.random()*20)+50; d.stats = { PAC:fallback, SHO:fallback, PAS:fallback, DRI:fallback, DEF:fallback, PHY:fallback }; d.ovr = recalculateOVR(d.pos, d.stats); setDoc(doc.ref, { stats: d.stats, ovr: d.ovr }, { merge: true }); }
                if(!d.bonusStats) d.bonusStats = { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }; if (d.stamina === undefined || isNaN(d.stamina)) d.stamina = 100; if(d.injury === undefined) d.injury = 0;
                globalPlayersList.push(d); globalPlayersMap[d.id] = d; 
            });
            const tacSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'profile', 'tactics'));
            if(tacSnap.exists()) { const tData = tacSnap.data(); currentFormation = tData.formation || '4-4-2'; if(document.getElementById('formation-select')) document.getElementById('formation-select').value = currentFormation; startingXI = tData.startingXI || new Array(11).fill(null); } 
            else if(globalPlayersList.length >= 11) {
                startingXI = new Array(11).fill(null); const layout = currentFormation.split('-').map(Number); layout.reverse(); layout.push(1);
                let expPos = []; layout.forEach((count, idx) => { for(let i=0; i<count; i++) expPos.push(['FWD', 'MID', 'DEF', 'GK'][idx]); });
                let usedIds = new Set(); expPos.forEach((reqPos, index) => { let best = globalPlayersList.filter(p => p.pos === reqPos && !usedIds.has(p.id)).sort((a,b)=>b.ovr - a.ovr)[0]; if(best) { startingXI[index] = best.id; usedIds.add(best.id); } });
                startingXI.forEach((val, index) => { if(!val) { let best = globalPlayersList.filter(p => !usedIds.has(p.id)).sort((a,b)=>b.ovr - a.ovr)[0]; if(best) { startingXI[index] = best.id; usedIds.add(best.id); } } });
            }
            calcTeamPower();
            const leagueSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'league', 'state'));
            if (leagueSnap.exists()) { leagueState = leagueSnap.data(); if (!leagueState.promotedBots) leagueState.promotedBots = []; if (!leagueState.pendingBuys) leagueState.pendingBuys = []; if (!leagueState.pendingSells) leagueState.pendingSells = []; if (!leagueState.rankHistory) leagueState.rankHistory = []; } else { await initLeagueData(uid, myClubName); }
            switchView('club'); if (leagueState.currentRound <= 31 && document.getElementById('quick-play-btn')) document.getElementById('quick-play-btn').classList.remove('hidden');
        } else { if(document.getElementById('init-club-modal')) document.getElementById('init-club-modal').classList.remove('hidden'); }
    } catch(e) { showToast("Lỗi tải dữ liệu. F5 lại trang."); } finally { hideLoading(); }
}

document.getElementById('create-club-btn')?.addEventListener('click', async () => {
    const clubName = document.getElementById('club-name-input').value.trim(); if(!clubName) { showToast("Vui lòng nhập tên CLB!"); return; }
    document.getElementById('create-club-btn').disabled = true; showLoading("ĐANG TẠO ĐỘI HÌNH...");
    try {
        const batch = writeBatch(db); const userRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'); batch.set(userRef, { clubName: clubName, budget: 10000000, fame: 30, facilities: myFacilities, news: [] });
        const INITIAL_POS = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'FWD']; const superstarIndex = Math.floor(Math.random() * 16);
        INITIAL_POS.forEach((pos, i) => {
            const isStar = (i === superstarIndex); const ovr = isStar ? Math.floor(Math.random()*21)+75 : Math.floor(Math.random()*16)+30; let stats = { PAC: ovr, SHO: ovr, PAS: ovr, DRI: ovr, DEF: ovr, PHY: ovr };
            const playerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players'));
            batch.set(playerRef, { name: generatePlayerName(isStar), pos: pos, ovr: recalculateOVR(pos, stats), stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }, stamina: 100, injury: 0, value: ovr * 100000, isListed: false, itemsUsed: 0 });
        });
        await batch.commit(); await initLeagueData(currentUserId, clubName); document.getElementById('init-club-modal').classList.add('hidden'); showToast("Thành công!", "success"); await loadGameData(currentUserId);
    } catch(e) { showToast("Lỗi tạo CLB!"); } finally { hideLoading(); }
});

async function initLeagueData(uid, overrideName = null) {
    let bots = []; let availableClubs = [...VN_CLUBS_POOL].filter(c => c !== overrideName); availableClubs.sort(() => Math.random() - 0.5);
    for (let i = 0; i < 31; i++) { bots.push({ id: `bot_${Date.now()}_${i}`, name: availableClubs[i], isUser: false, ovr: Math.floor(Math.random()*20)+60, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }); }
    leagueState = { currentRound: 1, standings: [...bots, { id: 'user', name: overrideName || myClubName, isUser: true, ovr: 0, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }], schedule: bots.map(b => b.id).sort(() => Math.random() - 0.5), friendlyMatchesPlayed: 0, promotedBots: [], pendingBuys: [], pendingSells: [], rankHistory: [] };
    await setDoc(doc(db, 'artifacts', appId, 'users', uid, 'league', 'state'), leagueState);
}

function renderSquadList() {
    const tbody = document.getElementById('squad-list-body'); if(!tbody) return; tbody.innerHTML = '';
    [...globalPlayersList].sort((a, b) => (POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr)).forEach(p => {
        let statusHtml = p.isListed ? '<span class="text-[10px] md:text-xs bg-red-900 text-red-300 px-1 md:px-2 py-1 rounded inline-block whitespace-nowrap w-14 text-center">Chờ bán</span>' : (myFacilities.medicalSlots.includes(p.id) ? '<span class="text-[10px] md:text-xs bg-yellow-900 text-yellow-300 px-1 md:px-2 py-1 rounded inline-block whitespace-nowrap w-14 text-center">🏥 Y tế</span>' : (myFacilities.trainingSlots.includes(p.id) ? '<span class="text-[10px] md:text-xs bg-blue-900 text-blue-300 px-1 md:px-2 py-1 rounded inline-block whitespace-nowrap w-14 text-center">🏋️ Tập</span>' : (startingXI.includes(p.id) ? '<span class="text-[10px] md:text-xs bg-green-900 text-green-300 px-1 md:px-2 py-1 rounded inline-block whitespace-nowrap w-14 text-center">⚽ Sân</span>' : '<span class="text-[10px] md:text-xs bg-slate-700 text-slate-300 px-1 md:px-2 py-1 rounded inline-block whitespace-nowrap w-14 text-center">🪑 Dự bị</span>')));
        const stColor = p.injury > 0 ? 'text-red-500 font-bold' : (p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400')); 
        const stBg = p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500'); 
        const rarity = getRarityClass(p.ovr);
        
        // Trong app.js -> renderSquadList()
        // SỬA w-full THÀNH min-w-[150px]
        tbody.innerHTML += `<tr class="hover:bg-slate-700/50 transition-colors cursor-pointer" onclick="window.openPlayerDetail('${p.id}')">
            <td class="p-3 text-center whitespace-nowrap"><span class="${POS_COLORS[p.pos]} text-white text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-1 rounded w-10 md:w-12 inline-block text-center">${p.pos}</span></td>
            <td class="p-3 font-medium text-white min-w-[150px]"><div class="whitespace-nowrap truncate max-w-[120px] md:max-w-[200px]">${p.name}</div></td>
            <td class="p-3 text-center whitespace-nowrap"><div class="flex flex-col items-center gap-1 text-[9px] md:text-[10px] ${stColor}"><span>${p.injury>0?'🚑 Chấn thương':`⚡ ${p.stamina}%`}</span>${p.injury > 0 ? '' : `<div class="w-12 bg-slate-700 h-1 rounded-full overflow-hidden hidden sm:block"><div class="${stBg} h-full" style="width: ${p.stamina}%"></div></div>`}</div></td>
            <td class="p-3 text-center font-bold whitespace-nowrap ${rarity.text}">${p.ovr}</td>
            <td class="p-3 text-center whitespace-nowrap">${statusHtml}</td>
            <td class="p-3 text-right text-yellow-400 whitespace-nowrap">€${(p.value || p.ovr*100000).toLocaleString()}</td>
        </tr>`;
    });
}

// Khai báo biến toàn cục lưu chart để tránh lỗi vẽ đè
let playerChartInstance = null;

window.openPlayerDetail = function(playerId) {
    const p = globalPlayersMap[playerId]; if(!p) return; 
    currentlyViewingPlayerId = playerId; 
    const rarity = getRarityClass(p.ovr);
    
    // 1. Áp dụng nền Gradient và Viền cho toàn bộ Thẻ
    const cardContainer = document.getElementById('player-card-container');
    cardContainer.className = `w-full max-w-[340px] rounded-3xl border-2 ${rarity.border} ${rarity.cardBg} shadow-[0_15px_50px_rgba(0,0,0,0.6)] relative overflow-hidden flex flex-col max-h-[90vh] transition-all duration-300 transform scale-100`;

    // 2. Avatar to và nổi khối
    const av = document.getElementById('detail-avatar-container');
    if (av) {
        av.innerHTML = `<img src="https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(p.name.replace(/⭐/g, '').trim())}&backgroundColor=transparent" class="w-[120%] h-[120%] object-cover object-top drop-shadow-xl" loading="lazy" />`;
        av.className = `w-28 h-28 bg-transparent border-b-4 ${rarity.border.split(' ')[0]} rounded-b-3xl flex items-end justify-center overflow-hidden drop-shadow-2xl z-10 relative`;
    }

    // 3. Đổ dữ liệu Text
    document.getElementById('detail-bg-pos').textContent = p.pos;
    document.getElementById('detail-name').textContent = p.name;
    document.getElementById('detail-name').className = `text-xl md:text-2xl font-bold tracking-wider uppercase drop-shadow-md mb-1 border-b border-white/20 pb-2 inline-block px-4 ${rarity.text}`;
    document.getElementById('detail-pos').textContent = p.pos;
    document.getElementById('detail-ovr').textContent = p.ovr;
    document.getElementById('detail-ovr').className = `text-6xl font-black drop-shadow-lg ${rarity.text} leading-none`;
    document.getElementById('detail-items-used').textContent = p.itemsUsed || 0;
    document.getElementById('detail-value').textContent = `€${(p.value || p.ovr*100000).toLocaleString()}`;

    // 4. Vẽ Radar Chart (Biểu đồ lục giác)
    const ctx = document.getElementById('playerRadarChart');
    if(playerChartInstance) playerChartInstance.destroy();
    
    // Trật tự chỉ số: PAC (Tốc độ), SHO (Sút), PAS (Chuyền), DEF (Thủ), PHY (Thể chất), DRI (Rê bóng)
    const pStats = [ p.stats.PAC, p.stats.SHO, p.stats.PAS, p.stats.DEF, p.stats.PHY, p.stats.DRI ];
    
    // Lấy màu chủ đạo dựa trên độ hiếm
    let chartColor = '#f97316'; // orange
    if (p.ovr >= 90) chartColor = '#d946ef'; // fuchsia
    else if (p.ovr >= 80) chartColor = '#facc15'; // yellow
    else if (p.ovr >= 65) chartColor = '#cbd5e1'; // slate

    playerChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['PAC', 'SHO', 'PAS', 'DEF', 'PHY', 'DRI'],
            datasets: [{
                data: pStats,
                backgroundColor: chartColor + '50', // Thêm opacity hex
                borderColor: chartColor,
                pointBackgroundColor: '#fff',
                pointBorderColor: chartColor,
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: chartColor,
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(255, 255, 255, 0.2)' },
                    grid: { color: 'rgba(255, 255, 255, 0.2)' },
                    pointLabels: { color: 'rgba(255, 255, 255, 0.9)', font: { size: 10, weight: 'bold', family: "'Inter', sans-serif" } },
                    ticks: { display: false, min: 0, max: 100 }
                }
            },
            plugins: { legend: { display: false }, tooltip: { enabled: true } }
        }
    });

    // 5. Thanh Thể lực & Nút bấm
    let stDiv = document.getElementById('detail-stamina-bar');
    if(p.injury > 0) {
        stDiv.innerHTML = `<div class="text-xs font-bold text-red-400 bg-red-950/80 p-2 rounded-xl text-center border border-red-500/50 mb-3 drop-shadow-md">🚑 Chấn thương (${p.injury} vòng)</div>`;
    } else {
        stDiv.innerHTML = `
            <div class="flex justify-between text-[10px] text-white/70 mb-1 uppercase tracking-widest font-bold">
                <span>Thể lực</span><span class="${p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400')}">${p.stamina}%</span>
            </div>
            <div class="w-full bg-black/60 h-2.5 rounded-full overflow-hidden border border-white/10 mb-3">
                <div class="${p.stamina >= 80 ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : (p.stamina >= 50 ? 'bg-yellow-500' : 'bg-red-500')} h-full transition-all duration-500" style="width: ${p.stamina}%"></div>
            </div>`;
    }

    const sCont = document.getElementById('sell-player-container'); 
    let fBtn = '';
    if (myFacilities.medicalSlots.includes(p.id)) fBtn = `<button onclick="window.removeFromFacility('${p.id}', 'medical')" class="col-span-2 py-2.5 bg-gradient-to-r from-yellow-700 to-yellow-600 hover:from-yellow-600 text-white rounded-xl font-bold shadow-lg transition text-xs uppercase tracking-wider">Thoát Y tế</button>`; 
    else if (myFacilities.trainingSlots.includes(p.id)) fBtn = `<button onclick="window.removeFromFacility('${p.id}', 'training')" class="col-span-2 py-2.5 bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 text-white rounded-xl font-bold shadow-lg transition text-xs uppercase tracking-wider">Thoát Huấn luyện</button>`; 
    else { 
        if (p.injury > 0 || p.stamina < 100) fBtn += `<button onclick="window.assignToFacility('${p.id}', 'medical')" class="py-2.5 bg-green-900/60 hover:bg-green-700 text-green-300 border border-green-500/50 rounded-xl font-bold transition text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1"><span class="text-lg leading-none">🏥</span>Y Tế</button>`; 
        if (p.injury === 0) fBtn += `<button onclick="window.assignToFacility('${p.id}', 'training')" class="py-2.5 bg-blue-900/60 hover:bg-blue-700 text-blue-300 border border-blue-500/50 rounded-xl font-bold transition text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1"><span class="text-lg leading-none">🏋️</span>Tập Luyện</button>`; 
    }
    
    if (p.isListed) {
        sCont.innerHTML = fBtn + `<button disabled class="col-span-2 py-2.5 bg-slate-800 text-slate-500 rounded-xl font-bold cursor-not-allowed mt-1 text-xs uppercase tracking-wider shadow-inner">Đang Chờ Bán</button>`; 
    } else { 
        sCont.innerHTML = fBtn + `
            <div class="col-span-2 grid grid-cols-2 gap-2 mt-1">
                <button onclick="window.listPlayerForSale()" class="py-2.5 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 text-white rounded-xl font-bold shadow-lg transition text-[10px] uppercase tracking-wider">Lên TTCN</button>
                <button onclick="window.terminateContract()" class="py-2.5 bg-black/40 border border-red-500/30 text-red-400 hover:bg-red-900/80 rounded-xl font-bold transition text-[10px] uppercase tracking-wider">Thanh lý</button>
            </div>`; 
    }

    // 6. Kích hoạt hiệu ứng Fade In
    const modal = document.getElementById('player-detail-modal');
    modal.classList.remove('hidden');
    void modal.offsetWidth; // Bắt buộc Browser vẽ lại trước khi đổi opacity
    modal.classList.remove('opacity-0');
    modal.classList.add('opacity-100');
};

// Cập nhật sự kiện nút Đóng với hiệu ứng Fade Out
document.getElementById('close-detail-modal')?.addEventListener('click', function() { 
    const modal = document.getElementById('player-detail-modal');
    const cardContainer = document.getElementById('player-card-container');
    
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');
    cardContainer.classList.remove('scale-100');
    cardContainer.classList.add('scale-95');
    
    setTimeout(function() {
        modal.classList.add('hidden');
    }, 300); // 300ms khớp với duration-300 ở class HTML
});

function calcTeamPower() {
    let totalOVR = 0, count = 0, uAtt = 0, uAttC = 0, uMid = 0, uMidC = 0, uDef = 0, uDefC = 0;
    startingXI.forEach(id => { 
        if(id && globalPlayersMap[id]) { 
            let p = globalPlayersMap[id]; let penalty = p.stamina < 60 ? Math.floor((60 - p.stamina) / 2) : 0; let effOvr = Math.max(1, p.ovr - penalty); 
            totalOVR += effOvr; count++; 
            if(p.pos === 'FWD') { uAtt += effOvr; uAttC++; } else if(p.pos === 'MID') { uMid += effOvr; uMidC++; } else { uDef += effOvr; uDefC++; } 
        } 
    });
    teamPower.OVR = count > 0 ? Math.round(totalOVR/count) : 0; teamPower.ATT = uAttC > 0 ? Math.round(uAtt/uAttC) : 0; teamPower.MID = uMidC > 0 ? Math.round(uMid/uMidC) : 0; teamPower.DEF = uDefC > 0 ? Math.round(uDef/uDefC) : 0;
    const ovrEl = document.getElementById('team-ovr'); if(ovrEl) ovrEl.textContent = teamPower.OVR;
    if(document.getElementById('stat-att')) document.getElementById('stat-att').textContent = teamPower.ATT; if(document.getElementById('stat-mid')) document.getElementById('stat-mid').textContent = teamPower.MID; if(document.getElementById('stat-def')) document.getElementById('stat-def').textContent = teamPower.DEF;
    if(leagueState && leagueState.standings) { let userTeam = leagueState.standings.find(t => t.isUser); if(userTeam) userTeam.ovr = teamPower.OVR; }
}

function renderPitch() {
    const container = document.getElementById('pitch-container'); if(!container) return; container.innerHTML = ''; const layout = currentFormation.split('-').map(Number); layout.reverse(); layout.push(1); let slotIndex = 0;
    layout.forEach((rowCount, rowIndex) => {
        const expectedPos = ['FWD', 'MID', 'DEF', 'GK'][rowIndex]; const rowDiv = document.createElement('div'); rowDiv.className = "flex justify-center items-center w-full gap-1 sm:gap-6";
        for(let i=0; i<rowCount; i++) {
            const p = startingXI[slotIndex] ? globalPlayersMap[startingXI[slotIndex]] : null; const cIndex = slotIndex; let pHtml = "";
            if (p) {
                const penalty = p.stamina < 60 ? Math.floor((60 - p.stamina) / 2) : 0; let effOvr = Math.max(1, p.ovr - penalty); if(p.injury > 0) effOvr = '🚑'; const rarity = getRarityClass(effOvr);
                pHtml = `<div class="w-8 h-8 sm:w-10 sm:h-10 border-2 ${(p.pos !== expectedPos) ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : rarity.border} ${rarity.bg} rounded-full flex items-center justify-center font-bold text-xs sm:text-sm z-10 relative overflow-hidden">${effOvr}${penalty > 0 && p.injury == 0 ? `<div class="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 bg-red-600 text-white text-[8px] sm:text-[9px] font-bold px-1 rounded-full shadow z-20">-${penalty}</div>` : ''}</div><div class="mt-1 w-12 sm:w-16 flex flex-col items-center"><div class="bg-black/80 px-1 py-0.5 rounded text-[8px] sm:text-[10px] text-white truncate max-w-full z-10">${p.name}</div>${p.injury > 0 ? '' : `<div class="w-full bg-slate-800 h-1 sm:h-1.5 mt-0.5 rounded border border-slate-700 overflow-hidden z-10"><div class="${p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500')} h-full" style="width: ${p.stamina}%"></div></div>`}</div>`;
            } else { pHtml = `<div class="w-8 h-8 sm:w-10 sm:h-10 bg-white/10 hover:bg-white/20 border-2 border-dashed border-white/40 rounded-full flex items-center justify-center text-white/50 text-[10px] sm:text-xs font-bold z-10 transition">${expectedPos}</div>`; }
            rowDiv.innerHTML += `<div class="relative flex flex-col items-center w-14 sm:w-16 cursor-pointer hover:scale-110 transition-transform" onclick="window.openBenchSelect(${cIndex}, '${expectedPos}')">${pHtml}</div>`; slotIndex++;
        }
        container.appendChild(rowDiv);
    });
    calcTeamPower();
}

document.getElementById('formation-select')?.addEventListener('change', (e) => { 
    currentFormation = e.target.value; const layout = currentFormation.split('-').map(Number); layout.reverse(); layout.push(1); let expPos = []; layout.forEach((count, idx) => { for(let i=0; i<count; i++) expPos.push(['FWD', 'MID', 'DEF', 'GK'][idx]); });
    let newXI = new Array(11).fill(null); let avail = startingXI.filter(id => id !== null).map(id => globalPlayersMap[id]);
    expPos.forEach((reqPos, index) => { let matchIdx = avail.findIndex(p => p && p.pos === reqPos); if (matchIdx !== -1) { newXI[index] = avail[matchIdx].id; avail.splice(matchIdx, 1); } });
    newXI.forEach((val, index) => { if (!val && avail.length > 0) { newXI[index] = avail[0].id; avail.splice(0, 1); } });
    startingXI = newXI; renderPitch(); 
});

window.openBenchSelect = (slotIndex, expectedPos) => {
    currentSlotToFill = slotIndex; const container = document.getElementById('bench-list-container'); container.innerHTML = ''; 
    [...globalPlayersList].sort((a, b) => { if (a.pos === expectedPos && b.pos !== expectedPos) return -1; if (a.pos !== expectedPos && b.pos === expectedPos) return 1; return b.ovr - a.ovr; }).forEach(p => {
        if (startingXI.includes(p.id) && startingXI[slotIndex] !== p.id) return;
        const isCurrent = startingXI[slotIndex] === p.id; const rarity = getRarityClass(p.ovr);
        container.innerHTML += `<div onclick="${p.injury > 0 ? `window.showToast('Cầu thủ đang chấn thương!')` : `window.assignPlayerToSlot('${p.id}')`}" class="flex justify-between items-center p-2 md:p-3 hover:bg-slate-700/50 border-b border-slate-700/50 cursor-pointer rounded ${isCurrent ? 'bg-green-900/30' : (p.injury > 0 ? 'opacity-50' : '')}"><div class="flex items-center gap-2 md:gap-3"><span class="${POS_COLORS[p.pos]} text-white text-[9px] md:text-[10px] font-bold px-1 md:px-2 py-0.5 rounded w-8 md:w-10 text-center">${p.pos}</span><div class="flex flex-col"><span class="text-white text-xs md:text-sm ${isCurrent ? 'font-bold' : ''}">${p.name}</span><span class="text-[9px] md:text-[10px] ${p.injury > 0 ? 'text-red-500 font-bold' : (p.stamina >= 80 ? 'text-green-400' : 'text-yellow-400')}">${p.injury > 0 ? '🚑 Chấn thương' : `⚡ ${p.stamina}%`}</span></div></div><span class="font-bold text-sm md:text-base ${rarity.text}">${p.ovr}</span></div>`;
    });
    document.getElementById('select-player-modal').classList.remove('hidden');
};
window.closeBenchSelect = () => { document.getElementById('select-player-modal').classList.add('hidden'); };
window.assignPlayerToSlot = (id) => { if(currentSlotToFill !== null) { startingXI[currentSlotToFill] = id; renderPitch(); window.closeBenchSelect(); } };
window.removePlayerFromSlot = () => { if(currentSlotToFill !== null) { startingXI[currentSlotToFill] = null; renderPitch(); window.closeBenchSelect(); } };

document.getElementById('save-tactics-btn')?.addEventListener('click', async () => { 
    showLoading("ĐANG LƯU..."); try { await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'tactics'), { formation: currentFormation, startingXI: startingXI }); showToast("Đã lưu chiến thuật!"); } catch(e) { showToast("Lỗi!"); } finally { hideLoading(); }
});

// ================= THỊ TRƯỜNG & VẬT PHẨM =================
document.getElementById('tab-transfer-market')?.addEventListener('click', function() { 
    document.getElementById('transfer-market-section').classList.remove('hidden'); 
    document.getElementById('store-section').classList.add('hidden'); 
    document.getElementById('tab-transfer-market').className = "px-3 py-1.5 font-bold text-green-400 border-b-2 border-green-400 whitespace-nowrap"; 
    document.getElementById('tab-store').className = "px-3 py-1.5 font-medium text-slate-400 hover:text-white transition whitespace-nowrap"; 
    renderTransferMarket(); // Fix lỗi trống data: Gọi hàm render khi bấm tab
});
document.getElementById('tab-store')?.addEventListener('click', () => { document.getElementById('transfer-market-section').classList.add('hidden'); document.getElementById('store-section').classList.remove('hidden'); document.getElementById('tab-transfer-market').className = "px-3 py-1.5 font-medium text-slate-400 hover:text-white transition whitespace-nowrap"; document.getElementById('tab-store').className = "px-3 py-1.5 font-bold text-green-400 border-b-2 border-green-400 whitespace-nowrap"; window.renderStore(); });

function generateMarketPlayers() {
    currentMarketList = []; for(let i=0; i<8; i++) { 
        const isStar = Math.random() > 0.8; const pos = POSITIONS[Math.floor(Math.random()*POSITIONS.length)]; 
        const ovr = isStar ? Math.floor(Math.random()*15)+80 : Math.floor(Math.random()*20)+50; const val = ovr * (isStar ? 150000 : 80000); let stats = { PAC: ovr, SHO: ovr, PAS: ovr, DRI: ovr, DEF: ovr, PHY: ovr };
        currentMarketList.push({ id: 'market_' + Date.now() + i, name: generatePlayerName(isStar), pos: pos, ovr: ovr, value: val, stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }, stamina: 100, injury: 0, isListed: false, itemsUsed: 0 });
    }
    currentMarketList.sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr);
}

function renderTransferMarket() {
    if(currentMarketList.length === 0) generateMarketPlayers();
    const tbody = document.getElementById('market-list-body'); if(!tbody) return; tbody.innerHTML = '';
    currentMarketList.forEach(p => {
        let isPending = leagueState.pendingBuys?.find(b => b.marketId === p.id); const rarity = getRarityClass(p.ovr);
        // Trong app.js -> renderTransferMarket()
        // SỬA w-full THÀNH min-w-[150px]
        tbody.innerHTML += `<tr class="hover:bg-slate-700/50 transition-colors">
            <td class="p-3 text-center whitespace-nowrap"><span class="${POS_COLORS[p.pos]} text-white text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-1 rounded w-10 md:w-12 inline-block text-center">${p.pos}</span></td>
            <td class="p-3 font-medium text-white min-w-[150px]"><div class="whitespace-nowrap">${p.name} ${p.ovr >= 85 ? '<span class="text-[9px] text-yellow-400 ml-1">(Fame > 60)</span>' : ''}</div></td>
            <td class="p-3 text-center font-bold whitespace-nowrap ${rarity.text}">${p.ovr}</td>
            <td class="p-3 text-right text-yellow-400 whitespace-nowrap">€${p.value.toLocaleString()}</td>
            <td class="p-3 text-center whitespace-nowrap">${isPending ? `<button disabled class="bg-slate-700 text-slate-400 text-[10px] md:text-xs px-2 md:px-3 py-1.5 rounded font-bold cursor-not-allowed">Chờ</button>` : `<button onclick="window.makeBuyOffer('${p.id}')" class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] md:text-xs px-2 md:px-3 py-1.5 rounded font-bold shadow transition">Mua</button>`}</td>
        </tr>`;
    });
}

document.getElementById('refresh-market-btn')?.addEventListener('click', async () => { 
    if(myBudget < 10000) { showToast("Không đủ €10,000!", "error"); return; }
    if(confirm("Chi €10,000 tìm lứa cầu thủ mới?")) { showLoading("ĐANG TÌM..."); try { myBudget -= 10000; updateHeaderDisplay(); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true }); generateMarketPlayers(); renderTransferMarket(); showToast("Đã làm mới TTCN!", "success"); } catch (e) { showToast("Lỗi!"); } finally { hideLoading(); } }
});

window.makeBuyOffer = async (marketId) => {
    const p = currentMarketList.find(x => x.id === marketId); if(!p) return;
    if (p.ovr >= 85 && myFame < 60) { showToast(`Cần Fame > 60 để đàm phán!`, "error"); return; }
    if (globalPlayersList.length + (leagueState.pendingBuys?.length || 0) >= 25) { showToast("Đội hình đã đầy!"); return; }
    const oStr = prompt(`Đề nghị mua ${p.name} (Gốc: €${p.value.toLocaleString()}):`, p.value); if (oStr === null) return; 
    const bidAmount = parseInt(oStr.replace(/,/g, '')); if (isNaN(bidAmount) || bidAmount <= 0) { showToast("Giá không hợp lệ!"); return; }
    if (myBudget < bidAmount) { showToast("Không đủ ngân sách!"); return; }
    showLoading("ĐANG GỬI FAX...");
    try {
        myBudget -= bidAmount; updateHeaderDisplay(); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
        if(!leagueState.pendingBuys) leagueState.pendingBuys = []; leagueState.pendingBuys.push({ marketId: p.id, playerInfo: p, bidAmount: bidAmount }); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        renderTransferMarket(); showToast(`Đã gửi Fax mua ${p.name}!`, "success");
    } catch (e) { showToast("Lỗi!"); } finally { hideLoading(); }
};

window.listPlayerForSale = async () => {
    if(!currentlyViewingPlayerId) return; const p = globalPlayersMap[currentlyViewingPlayerId]; if(p.isListed) return;
    const aStr = prompt(`Giá bán cho ${p.name} (Gốc: €${(p.value).toLocaleString()}):`, p.value); if (aStr === null) return; 
    const askAmount = parseInt(aStr.replace(/,/g, '')); if (isNaN(askAmount) || askAmount <= 0) { showToast("Giá sai!"); return; }
    showLoading("ĐANG RAO BÁN...");
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { isListed: true }, { merge: true }); p.isListed = true;
        if(!leagueState.pendingSells) leagueState.pendingSells = []; leagueState.pendingSells.push({ playerId: p.id, playerName: p.name, askAmount: askAmount, baseValue: p.value }); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        document.getElementById('player-detail-modal').classList.add('hidden'); if(activeSubView === 'squad-list') renderSquadList(); showToast(`Đã rao bán ${p.name}!`, "success");
    } catch(e) { showToast("Lỗi!"); } finally { hideLoading(); }
};

window.terminateContract = async () => {
    if(!currentlyViewingPlayerId) return; const p = globalPlayersMap[currentlyViewingPlayerId];
    const penaltyFee = Math.floor(p.value * (0.10 + (Math.random() * 0.05)));
    if (myBudget < penaltyFee) { showToast(`Cần €${penaltyFee.toLocaleString()} đền bù hợp đồng!`, "error"); return; }
    if(confirm(`ĐUỔI ${p.name}? Phạt: -€${penaltyFee.toLocaleString()}`)) {
        showLoading("ĐANG ĐỀN BÙ...");
        try {
            document.getElementById('player-detail-modal').classList.add('hidden'); myBudget -= penaltyFee; updateHeaderDisplay();
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true }); await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id));
            globalPlayersList = globalPlayersList.filter(x => x.id !== p.id); delete globalPlayersMap[p.id]; startingXI = startingXI.map(id => id === p.id ? null : id);
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'tactics'), { formation: currentFormation, startingXI: startingXI });
            if (leagueState.pendingSells) { leagueState.pendingSells = leagueState.pendingSells.filter(x => x.playerId !== p.id); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState); }
            if(activeSubView === 'squad-list') renderSquadList(); renderPitch(); showToast(`Đã thanh lý ${p.name}.`, "warning");
        } catch(e) { showToast("Lỗi!"); } finally { hideLoading(); }
    }
};

window.renderStore = function() {
    const container = document.getElementById('store-items-container'); if(!container) return; container.innerHTML = '';
    STORE_ITEMS.forEach(item => { container.innerHTML += `<div class="bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-lg flex flex-col justify-between hover:border-indigo-500/50 transition-colors"><div><div class="text-4xl mb-3">${item.icon}</div><h3 class="text-xl font-bold text-white mb-1">${item.name}</h3><p class="text-slate-400 text-sm mb-4">${item.desc}</p></div><div><div class="text-yellow-400 font-bold mb-3 text-lg">€${item.price.toLocaleString()}</div><button onclick="window.buyItem('${item.id}')" class="w-full py-2 ${item.type === 'gacha' ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-indigo-600 hover:bg-indigo-500'} text-white font-bold rounded-lg transition shadow-lg">${item.type === 'gacha' ? 'Mở Gói Ngay' : 'Mua & Sử dụng'}</button></div></div>`; });
};

window.buyItem = async (itemId) => {
    const item = STORE_ITEMS.find(x => x.id === itemId); if (!item) return;
    if (myBudget < item.price) { showToast("Không đủ ngân sách!", "error"); return; }
    if (item.type === 'gacha') {
        if(globalPlayersList.length + (leagueState.pendingBuys?.length || 0) >= 25) { showToast("Đội hình đã đầy!"); return; }
        if (confirm(`Chi €${item.price.toLocaleString()} tìm tài năng trẻ?`)) { 
            showLoading("ĐANG TÌM KIẾM..."); try {
                myBudget -= item.price; updateHeaderDisplay(); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
                const ovr = Math.floor(Math.random() * 16) + 60; let stats = { PAC: ovr+2, SHO: ovr-2, PAS: ovr+1, DRI: ovr, DEF: ovr, PHY: ovr }; 
                const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players')); const playerData = { name: generatePlayerName(false), pos: POSITIONS[Math.floor(Math.random() * POSITIONS.length)], ovr: recalculateOVR(POSITIONS[0], stats), stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }, stamina: 100, injury: 0, value: ovr * 70000, isListed: false, itemsUsed: 0 };
                await setDoc(newPlayerRef, playerData); playerData.id = newPlayerRef.id; globalPlayersList.push(playerData); globalPlayersMap[playerData.id] = playerData;
                showToast(`Đã chiêu mộ ${playerData.name}!`, 'success');
            } catch (e) { showToast("Lỗi!"); } finally { hideLoading(); }
        }
    } else {
        currentItemToApply = item; document.getElementById('apply-item-name').textContent = item.name; const c = document.getElementById('apply-item-list-container'); c.innerHTML = '';
        [...globalPlayersList].sort((a,b) => b.ovr - a.ovr).forEach(p => { const canUse = (p.itemsUsed || 0) < 5; c.innerHTML += `<div class="flex justify-between items-center p-3 hover:bg-slate-700/50 border-b border-slate-700/50 rounded ${canUse ? 'cursor-pointer' : 'opacity-50 grayscale'}" ${canUse ? `onclick="window.applyItemToPlayer('${p.id}')"` : ''}><div><div class="text-white font-medium">${p.name}</div><div class="text-xs text-indigo-300">Đã dùng: ${(p.itemsUsed || 0)}/5</div></div><div class="text-right"><div class="text-green-400 font-bold">OVR ${p.ovr}</div>${!canUse ? `<div class="text-red-400 text-xs">Đạt giới hạn</div>` : ''}</div></div>`; });
        document.getElementById('apply-item-modal').classList.remove('hidden');
    }
};
window.closeApplyItemModal = () => { document.getElementById('apply-item-modal').classList.add('hidden'); currentItemToApply = null; };

window.applyItemToPlayer = async (playerId) => {
    const p = globalPlayersMap[playerId]; const item = currentItemToApply; if (!p || !item) return;
    if (myBudget < item.price) { showToast("Không đủ tiền!", "error"); return; }
    if (confirm(`Dùng [${item.name}] cho ${p.name}?`)) {
        showLoading("ĐANG ÁP DỤNG...");
        try {
            window.closeApplyItemModal(); myBudget -= item.price; updateHeaderDisplay(); await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
            if (!p.bonusStats) p.bonusStats = { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 };
            if (item.type === 'stat') { p.stats[item.stat] += item.amount; p.bonusStats[item.stat] = (p.bonusStats[item.stat] || 0) + item.amount; if(p.stats[item.stat] > 99) { p.bonusStats[item.stat] -= (p.stats[item.stat] - 99); p.stats[item.stat] = 99; } } 
            else if (item.type === 'stat_multi') { for (const [k, v] of Object.entries(item.stats)) { p.stats[k] += v; p.bonusStats[k] = (p.bonusStats[k] || 0) + v; if(p.stats[k] > 99) { p.bonusStats[k] -= (p.stats[k] - 99); p.stats[k] = 99; } } }
            p.ovr = recalculateOVR(p.pos, p.stats); p.value = p.ovr * 100000; p.itemsUsed = (p.itemsUsed || 0) + 1;
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { stats: p.stats, bonusStats: p.bonusStats, ovr: p.ovr, value: p.value, itemsUsed: p.itemsUsed }, { merge: true });
            renderPitch(); showToast(`OVR của ${p.name} tăng thành ${p.ovr}!`, 'success');
        } catch(e) { showToast("Lỗi!"); } finally { hideLoading(); }
    }
};

window.renderFacilities = function() {
    const container = document.getElementById('facilities-container'); if(!container) return; container.innerHTML = '';
    
    let medSlotsHtml = `<div class="mt-4 text-[11px] md:text-sm border-t border-slate-700 pt-3"><div class="text-slate-400 mb-2 font-bold">Nằm viện (${myFacilities.medicalSlots.length}/${myFacilities.medical}):</div>`;
    if (myFacilities.medicalSlots.length === 0) medSlotsHtml += `<div class="text-slate-500 italic bg-slate-900 p-2 rounded border border-dashed border-slate-700 text-center">Trống</div>`;
    else { myFacilities.medicalSlots.forEach(id => { const p = globalPlayersMap[id]; if(p) medSlotsHtml += `<div class="flex justify-between items-center text-white bg-slate-900 p-2 rounded mb-1 border border-slate-700"><span>🚑 ${p.name}</span><button onclick="window.removeFromFacility('${id}', 'medical')" class="text-red-400 hover:text-red-300 font-bold text-[10px] md:text-xs bg-red-900/30 px-2 py-1 rounded">Rút ra</button></div>`; }); }
    medSlotsHtml += `</div>`;

    let trainSlotsHtml = `<div class="mt-4 text-[11px] md:text-sm border-t border-slate-700 pt-3"><div class="text-slate-400 mb-2 font-bold">Tập luyện (${myFacilities.trainingSlots.length}/${myFacilities.training}):</div>`;
    if (myFacilities.trainingSlots.length === 0) trainSlotsHtml += `<div class="text-slate-500 italic bg-slate-900 p-2 rounded border border-dashed border-slate-700 text-center">Trống</div>`;
    else { myFacilities.trainingSlots.forEach(id => { const p = globalPlayersMap[id]; if(p) trainSlotsHtml += `<div class="flex justify-between items-center text-white bg-slate-900 p-2 rounded mb-1 border border-slate-700"><span>🏋️ ${p.name}</span><button onclick="window.removeFromFacility('${id}', 'training')" class="text-blue-400 hover:text-blue-300 font-bold text-[10px] md:text-xs bg-blue-900/30 px-2 py-1 rounded">Rút ra</button></div>`; }); }
    trainSlotsHtml += `</div>`;

    const facs = [
        { id: 'medical', name: '🏥 Y tế', desc: `Chữa chấn thương & hồi 100% thể lực.`, level: myFacilities.medical, slotsHtml: medSlotsHtml },
        { id: 'training', name: '🏋️ Huấn luyện', desc: `Tăng +1 chỉ số ngẫu nhiên sau mỗi trận.`, level: myFacilities.training, slotsHtml: trainSlotsHtml },
        { id: 'scouting', name: '🕵️ Tuyển trạch', desc: `Tìm tài năng trẻ (hoặc Sách tập luyện).`, level: myFacilities.scouting, slotsHtml: '' },
        { id: 'finance', name: '🏦 Tài chính', desc: `Tăng ${myFacilities.finance * 5}% tổng doanh thu.`, level: myFacilities.finance, slotsHtml: '' }
    ];

    facs.forEach(f => {
        const isMax = f.level >= 5; const cost = f.level * 3000000; const upgradeTime = Math.pow(2, f.level - 1); 
        let actionHtml = '';
        if (myFacilities.pendingUpgrade && myFacilities.pendingUpgrade.id === f.id) actionHtml = `<button disabled class="w-full py-2 bg-yellow-700 text-yellow-200 font-bold text-sm rounded-lg cursor-not-allowed">Đang thi công (${myFacilities.pendingUpgrade.remaining} trận)</button>`;
        else if (myFacilities.pendingUpgrade) actionHtml = `<button disabled class="w-full py-2 bg-slate-700 text-slate-400 font-bold text-sm rounded-lg cursor-not-allowed">Chờ công trình khác</button>`;
        else if (isMax) actionHtml = `<button disabled class="w-full py-2 bg-slate-700 text-slate-400 font-bold text-sm rounded-lg cursor-not-allowed">Đã max (Lv.5)</button>`;
        else actionHtml = `<button onclick="window.upgradeFacility('${f.id}', ${cost}, ${upgradeTime})" class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-lg shadow-lg transition">Nâng cấp: €${(cost/1000000).toFixed(1)}M (${upgradeTime} trận)</button>`;
        
        if(f.id === 'scouting') {
            if(myFacilities.scoutedPlayer) { actionHtml = `<div class="bg-green-900/50 border border-green-500 p-2 rounded-lg text-center mb-2"><div class="text-green-400 font-bold text-xs">Phát hiện Tài năng!</div><div class="text-white text-xs">${myFacilities.scoutedPlayer.name} (OVR ${myFacilities.scoutedPlayer.ovr})</div><button onclick="window.claimScoutedPlayer()" class="mt-1 w-full py-1 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded">Ký Hợp Đồng</button></div>` + actionHtml; } 
            else { actionHtml = `<div class="text-[10px] md:text-xs text-slate-400 text-center mb-3 border-t border-slate-700 pt-3">Báo cáo sau: <span class="font-bold text-yellow-400">${myFacilities.scoutingCooldown}</span> trận</div>` + actionHtml; }
        }
        container.innerHTML += `<div class="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg flex flex-col justify-between hover:border-blue-500/50 transition-colors"><div class="mb-4"><div class="flex justify-between items-center mb-2"><h3 class="text-lg font-bold text-white">${f.name}</h3><span class="bg-blue-900 text-blue-300 text-[10px] font-bold px-2 py-1 rounded">Lv. ${f.level}</span></div><p class="text-slate-400 text-xs md:text-sm">${f.desc}</p>${f.slotsHtml}</div><div>${actionHtml}</div></div>`;
    });
};

window.upgradeFacility = async (facId, cost, time) => {
    if(myBudget < cost) { showToast("Không đủ ngân sách!", "error"); return; }
    if(myFacilities.pendingUpgrade) { showToast("Đang thi công công trình khác!", "warning"); return; }
    showLoading("ĐANG KÝ HỢP ĐỒNG...");
    try {
        myBudget -= cost; myFacilities.pendingUpgrade = { id: facId, remaining: time };
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget, facilities: myFacilities }, { merge: true });
        updateHeaderDisplay(); window.renderFacilities(); showToast("Bắt đầu thi công!", "success");
    } catch(e) { showToast("Lỗi!"); } finally { hideLoading(); }
};

window.assignToFacility = async (playerId, type) => {
    const maxSlots = type === 'medical' ? myFacilities.medical : myFacilities.training; const currentSlots = type === 'medical' ? myFacilities.medicalSlots : myFacilities.trainingSlots;
    if (currentSlots.length >= maxSlots) { showToast(`Trung tâm đã hết chỗ!`, "error"); return; }
    if (startingXI.includes(playerId)) { showToast(`Rút khỏi sân chính trước!`, "warning"); return; }
    currentSlots.push(playerId);
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { facilities: myFacilities }, { merge: true });
        document.getElementById('player-detail-modal').classList.add('hidden');
        window.renderFacilities(); renderSquadList(); showToast(`Đã đưa vào Trung tâm!`, "success");
    } catch(e) { showToast("Lỗi!"); }
};

window.removeFromFacility = async (playerId, type) => {
    if (type === 'medical') myFacilities.medicalSlots = myFacilities.medicalSlots.filter(id => id !== playerId); else myFacilities.trainingSlots = myFacilities.trainingSlots.filter(id => id !== playerId);
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { facilities: myFacilities }, { merge: true });
        document.getElementById('player-detail-modal').classList.add('hidden');
        window.renderFacilities(); renderSquadList(); showToast(`Đã rút ra!`, "success");
    } catch(e) { showToast("Lỗi!"); }
};

window.claimScoutedPlayer = async () => {
    if(globalPlayersList.length >= 25) { showToast("Đội hình đã đầy!", "error"); return; }
    showLoading("ĐANG KÝ HỢP ĐỒNG...");
    try {
        let p = myFacilities.scoutedPlayer; const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players'));
        await setDoc(newPlayerRef, p); p.id = newPlayerRef.id; globalPlayersList.push(p); globalPlayersMap[p.id] = p;
        myFacilities.scoutedPlayer = null; myFacilities.scoutingCooldown = 6 - myFacilities.scouting;
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { facilities: myFacilities }, { merge: true });
        window.renderFacilities(); showToast(`Đã ký ${p.name}!`, "success");
    } catch(e) { showToast("Lỗi!"); } finally { hideLoading(); }
};

async function processFacilitiesAndStamina() {
    if (myFacilities.pendingUpgrade) {
        myFacilities.pendingUpgrade.remaining--;
        if (myFacilities.pendingUpgrade.remaining <= 0) {
            let facId = myFacilities.pendingUpgrade.id; myFacilities[facId]++;
            let facName = facId === 'medical' ? 'Y tế' : (facId === 'training' ? 'Huấn luyện' : (facId === 'scouting' ? 'Tuyển trạch' : (facId === 'stadium' ? 'Sân vận động' : 'Tài chính')));
            window.pushNews('Khánh Thành Công Trình', `Hạng mục ${facName} đã hoàn tất thi công nâng cấp lên Cấp ${myFacilities[facId]}!`, true);
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
    if(injuryLogs.length > 0) window.pushNews('Bão Chấn Thương', `Các cầu thủ: ${injuryLogs.join(', ')} đã kiệt sức và chấn thương. Yêu cầu đưa vào Trung tâm Y tế gấp!`, false);

    let healedLogs = [];
    if(myFacilities.medicalSlots.length > 0) {
        let remainingSlots = [];
        myFacilities.medicalSlots.forEach(id => { let p = globalPlayersMap[id]; if (p) { p.stamina = 100; p.injury = 0; healedLogs.push(p.name); } });
        myFacilities.medicalSlots = remainingSlots;
        window.pushNews('Báo cáo Y Tế', `${healedLogs.join(', ')} đã bình phục hoàn toàn và xuất viện!`, true);
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
        if(trainedLogs.length > 0) window.pushNews('Báo cáo Huấn Luyện', `${trainedLogs.join(', ')} đã có sự tiến bộ rõ rệt và tăng +1 OVR sau các buổi tập luyện!`, true);
    }

    if(!myFacilities.scoutedPlayer) {
        myFacilities.scoutingCooldown--;
        if(myFacilities.scoutingCooldown <= 0) {
            if(globalPlayersList.length >= 25) {
                let lowestPlayer = [...globalPlayersList].sort((a,b) => a.ovr - b.ovr)[0];
                if (lowestPlayer) {
                    let statsKeys = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']; let rStat = statsKeys[Math.floor(Math.random()*statsKeys.length)];
                    lowestPlayer.stats[rStat] += 2; lowestPlayer.ovr = recalculateOVR(lowestPlayer.pos, lowestPlayer.stats); lowestPlayer.value = lowestPlayer.ovr * 100000;
                    window.pushNews('Tuyển trạch ngoại lệ', `Đội hình đã đầy! Bù lại Tuyển trạch viên tặng 1 Giáo án đặc biệt, giúp ${lowestPlayer.name} tăng chỉ số!`, true);
                }
                myFacilities.scoutingCooldown = 6 - myFacilities.scouting;
            } else {
                const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)]; const name = generatePlayerName(false);
                const ovr = 60 + (myFacilities.scouting * 4) + Math.floor(Math.random() * 5); const val = ovr * 50000; let stats = { PAC: ovr+1, SHO: ovr, PAS: ovr+2, DRI: ovr, DEF: ovr, PHY: ovr };
                myFacilities.scoutedPlayer = { name: name, pos: pos, ovr: recalculateOVR(pos, stats), stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 }, stamina: 100, injury: 0, value: val, isListed: false, itemsUsed: 0 };
                window.pushNews('Phát hiện Tài Năng Mới', `Tuyển trạch viên vừa gửi về hồ sơ của ${name} (OVR ${myFacilities.scoutedPlayer.ovr}). Hãy vào Trung tâm Tuyển trạch để ký hợp đồng!`, true);
            }
        }
    }
}

async function processTransferMarket() {
    let budgetRefunded = 0; let budgetEarned = 0;
    if (leagueState.pendingBuys && leagueState.pendingBuys.length > 0) {
        for (let b of leagueState.pendingBuys) {
            let p = b.playerInfo; let bidRatio = b.bidAmount / p.value; let fameFactor = myFame / 100; let successChance = (bidRatio * 0.5) + (fameFactor * 0.5); let hijackRng = Math.random();
            if (hijackRng <= successChance) {
                const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players')); p.isListed = false; p.itemsUsed = 0; p.stamina = 100; p.injury = 0; await setDoc(newPlayerRef, p);
                p.id = newPlayerRef.id; globalPlayersList.push(p); globalPlayersMap[p.id] = p; 
                window.pushNews(`Thương vụ ${p.name} Hoàn Tất`, `Câu lạc bộ đã chiêu mộ thành công ${p.name} với mức giá €${b.bidAmount.toLocaleString()}.`, true);
            } else {
                let randomClub = RICH_CLUBS[Math.floor(Math.random()*RICH_CLUBS.length)]; budgetRefunded += b.bidAmount; 
                window.pushNews(`Mua ${p.name} Đổ Vỡ`, `Rất tiếc! Thương vụ đổ vỡ do **${randomClub}** nẫng tay trên. Hoàn €${b.bidAmount.toLocaleString()} về quỹ.`, false);
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
                window.pushNews(`Bán ${s.playerName} Thành Công`, `${randomBot} đã mua ${s.playerName} với giá €${botOffer.toLocaleString()}. Tiền đã chuyển vào ngân sách.`, true);
            } else { remainingSells.push(s); window.pushNews(`Ế ẩm: ${s.playerName}`, `Chưa có đối tác trả giá hợp lý cho ${s.playerName}. Cầu thủ vẫn đang nằm trên danh sách chờ bán.`, null); }
        }
        leagueState.pendingSells = remainingSells;
    }
    
    generateMarketPlayers();
    myBudget = myBudget + budgetRefunded + budgetEarned; updateHeaderDisplay(); 
}

function sortStandings() { leagueState.standings.sort((a, b) => { if (b.points !== a.points) return b.points - a.points; const gdA = a.gf - a.ga; const gdB = b.gf - b.ga; if (gdB !== gdA) return gdB - gdA; return b.gf - a.gf; }); }

function renderLeagueView() {
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
            document.getElementById('setup-away-ovr').textContent = botOvr;
            document.getElementById('setup-away-att').textContent = botOvr + ((leagueState.currentRound + 1) % 5 - 2);
            document.getElementById('setup-away-mid').textContent = botOvr + ((leagueState.currentRound + 2) % 5 - 2);
            document.getElementById('setup-away-def').textContent = botOvr + ((leagueState.currentRound + 3) % 5 - 2);
        }
    }
    const tbody = document.getElementById('league-table-body'); tbody.innerHTML = '';
    leagueState.standings.forEach((team, index) => {
        const rank = index + 1; const gd = team.gf - team.ga; let rowClass = "hover:bg-slate-700/30 transition-colors "; if (team.isUser) rowClass += "bg-green-900/30 font-bold "; 
        if (rank <= 2) rowClass += "rank-gold"; else if (rank === 11 || rank === 12) rowClass += "rank-silver"; else if (rank === 21 || rank === 22) rowClass += "rank-bronze"; else if (rank >= 31) rowClass += "rank-relegate";
        tbody.innerHTML += `<tr class="${rowClass}"><td class="p-2 sm:p-3 text-center font-mono text-slate-400">${rank}</td><td class="p-2 sm:p-3 ${team.isUser ? 'text-green-400' : 'text-white'} truncate max-w-[100px] w-full">${team.name}</td><td class="p-2 sm:p-3 text-center text-slate-400">${team.played}</td><td class="p-2 sm:p-3 text-center text-slate-300">${team.won}</td><td class="p-2 sm:p-3 text-center text-slate-300">${team.drawn}</td><td class="p-2 sm:p-3 text-center text-slate-300">${team.lost}</td><td class="p-2 sm:p-3 text-center ${gd > 0 ? 'text-green-400' : gd < 0 ? 'text-red-400' : 'text-slate-400'}">${gd > 0 ? '+'+gd : gd}</td><td class="p-2 sm:p-3 text-center font-bold text-white text-sm md:text-base">${team.points}</td></tr>`;
    });
}

const startMatchEngine = (opponent, isFriendly) => {
    if(startingXI.includes(null) || teamPower.OVR === 0) { showToast("Xếp đủ 11 cầu thủ vào Sân!"); return; }
    let lowStaminaCount = startingXI.filter(id => globalPlayersMap[id] && globalPlayersMap[id].stamina < 30).length; if (lowStaminaCount >= 3) showToast("Cảnh báo: Đội có nhiều người kiệt sức. Dễ chấn thương!", "warning");
    
    toggleNavLock(true); document.getElementById('quick-play-btn').classList.add('hidden'); 
    document.getElementById('match-setup').classList.add('hidden'); document.getElementById('season-end-panel').classList.add('hidden'); document.getElementById('league-table-container').classList.add('hidden'); document.getElementById('match-live').classList.remove('hidden'); document.getElementById('finish-match-btn').classList.add('hidden');
    let minute = 0; let homeScore = 0; let awayScore = 0;
    const logContainer = document.getElementById('match-logs-container'); logContainer.innerHTML = `<div class="text-slate-400 text-center text-xs md:text-sm py-2">Trọng tài thổi còi bắt đầu trận đấu ${isFriendly ? "Giao Hữu" : ""}!</div>`;
    document.getElementById('live-home-name').textContent = myClubName; document.getElementById('live-away-name').textContent = opponent.name; document.getElementById('score-home').textContent = "0"; document.getElementById('score-away').textContent = "0"; document.getElementById('match-minute').textContent = "0";
    const homeOVR = teamPower.OVR; const awayOVR = opponent.ovr;

    const matchTimer = setInterval(() => {
        minute += Math.floor(Math.random() * 4) + 2; if(minute >= 90) minute = 90; document.getElementById('match-minute').textContent = minute;
        const rng = Math.random() * 100; const homeGoalChance = (homeOVR / (homeOVR + awayOVR)) * 14; const awayGoalChance = (awayOVR / (awayOVR + homeOVR)) * 14;
        if (rng < homeGoalChance) { homeScore++; document.getElementById('score-home').textContent = homeScore; logContainer.innerHTML += `<div class="text-green-400 font-bold bg-green-900/20 p-2 rounded border border-green-900/50">⚽ Phút ${minute}': VÀO! Bàn thắng cho ${myClubName.toUpperCase()}!</div>`; } 
        else if (rng > 100 - awayGoalChance) { awayScore++; document.getElementById('score-away').textContent = awayScore; logContainer.innerHTML += `<div class="text-red-400 font-bold bg-red-900/20 p-2 rounded border border-red-900/50">⚽ Phút ${minute}': BÀN THẮNG CHO ${opponent.name.toUpperCase()}!</div>`; } 
        else if (rng > 40 && rng < 50) { logContainer.innerHTML += `<div class="text-slate-400 italic px-2">⏱ Phút ${minute}': Thế trận giằng co...</div>`; } 
        else if (rng > 70 && rng < 75) { logContainer.innerHTML += `<div class="text-yellow-400 px-2">Phút ${minute}': 🧤 Thủ môn cản phá xuất thần!</div>`; }
        logContainer.scrollTop = logContainer.scrollHeight; 

        if (minute >= 90) {
            clearInterval(matchTimer); logContainer.innerHTML += '<div class="text-yellow-400 font-bold text-center mt-3 text-lg uppercase">Hết giờ! Trận kết thúc!</div>';
            let matchFee = isFriendly ? 0 : -50000; 
            let perfBonus = (homeScore > awayScore) ? (isFriendly ? 50000 : 300000) : (homeScore === awayScore ? (isFriendly ? 20000 : 100000) : 0);
            let cleanSheet = (awayScore === 0) ? (isFriendly ? 20000 : 150000) : 0; 
            let bigWin = (homeScore - awayScore >= 3) ? (isFriendly ? 20000 : 200000) : 0; 
            let sponsorMoney = isFriendly ? 100000 : 0; 
            if(!myFacilities.stadium) myFacilities.stadium = 1;
            let currentStadium = STADIUM_STATS[myFacilities.stadium - 1];
            let ticketRevenue = currentStadium.capacity * currentStadium.ticketPrice;
            if (isFriendly) ticketRevenue = Math.floor(ticketRevenue * 0.3);
            let income = perfBonus + cleanSheet + bigWin + sponsorMoney + ticketRevenue;
            let financeBonus = Math.floor(income * (myFacilities.finance * 0.05));
            let totalEarnings = matchFee + income + financeBonus;
            
            logContainer.innerHTML += `<div class="mt-3 mb-2 bg-slate-800 border border-yellow-500/50 p-3 rounded-xl text-xs sm:text-sm shadow-lg">
                <div class="font-bold text-yellow-400 mb-2 border-b border-slate-700 pb-1 text-center">📊 TÀI CHÍNH TRẬN ĐẤU</div>
                <div class="flex justify-between text-slate-300 py-1">
                    <span>Phí tổ chức:</span><span class="text-red-400">${matchFee < 0 ? '- €50,000' : 'Miễn phí'}</span>
                </div>
                ${sponsorMoney ? `<div class="flex justify-between text-slate-300 py-1"><span>Tài trợ giao hữu:</span><span class="text-green-400">+ €${sponsorMoney.toLocaleString()}</span></div>` : ''}
                ${ticketRevenue ? `<div class="flex justify-between text-slate-300 py-1"><span>Doanh thu Bán vé:</span><span class="text-green-400">+ €${ticketRevenue.toLocaleString()}</span></div>` : ''}
                ${perfBonus ? `<div class="flex justify-between text-slate-300 py-1"><span>Thưởng thành tích:</span><span class="text-green-400">+ €${perfBonus.toLocaleString()}</span></div>` : ''}
                ${cleanSheet ? `<div class="flex justify-between text-slate-300 py-1"><span>Sạch lưới:</span><span class="text-green-400">+ €${cleanSheet.toLocaleString()}</span></div>` : ''}
                ${bigWin ? `<div class="flex justify-between text-slate-300 py-1"><span>Thắng đậm:</span><span class="text-green-400">+ €${bigWin.toLocaleString()}</span></div>` : ''}
                <div class="flex justify-between font-bold mt-2 pt-2 border-t border-slate-700 text-sm">
                    <span>Tổng nhận (+€${financeBonus.toLocaleString()} Từ TT Tài chính):</span><span class="${totalEarnings > 0 ? 'text-green-400' : 'text-red-400'}">${totalEarnings > 0 ? '+' : ''} €${totalEarnings.toLocaleString()}</span>
                </div>
            </div>`;
            logContainer.scrollTop = logContainer.scrollHeight;
            setTimeout(() => { const liveMatchView = document.getElementById('match-live'); liveMatchView.scrollTop = liveMatchView.scrollHeight; }, 300);

            const finishBtn = document.getElementById('finish-match-btn'); finishBtn.classList.remove('hidden');
            finishBtn.onclick = async () => { 
                finishBtn.textContent = "Đang xử lý ngầm..."; finishBtn.disabled = true; 
                await processTransferMarket(); await processFacilitiesAndStamina(); 
                finishBtn.textContent = "Lưu thành tích vòng đấu"; finishBtn.disabled = false; 
                finishBtn.onclick = () => { if(isFriendly) finishFriendlyMatch(totalEarnings); else finishLeagueRound(homeScore, awayScore, totalEarnings); }; 
            };
        }
    }, 300); 
};

document.getElementById('start-league-match-btn')?.addEventListener('click', () => { const opponentId = leagueState.schedule[leagueState.currentRound - 1]; activeOpponent = leagueState.standings.find(t => t.id === opponentId); startMatchEngine(activeOpponent, false); });
document.getElementById('play-friendly-btn')?.addEventListener('click', () => { if ((leagueState.friendlyMatchesPlayed || 0) >= 5) { showToast("Hết lượt đá giao hữu mùa này!"); return; } activeOpponent = leagueState.standings[Math.floor(Math.random() * leagueState.standings.length)]; while (activeOpponent.isUser) { activeOpponent = leagueState.standings[Math.floor(Math.random() * leagueState.standings.length)]; } startMatchEngine(activeOpponent, true); });

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
            myFame = Math.max(0, Math.min(100, myFame + fameDiff)); currentTotalEarnings += seasonPrize; endSeasonMessage = `MÙA GIẢI ĐÃ KẾT THÚC! Xếp thứ ${finalRank}, nhận €${seasonPrize.toLocaleString()}!`; leagueState.promotedBots = [];
        }
        myBudget += currentTotalEarnings; updateHeaderDisplay();

        if(myQuest) {
            if(myQuest.type === 'goals') myQuest.progress += userScore;
            if(myQuest.type === 'cleansheet' && botScore === 0) myQuest.progress += 1;
            if(myQuest.type === 'win' && userScore > botScore) myQuest.progress += 1;
            if(myQuest.type === 'score_first' && userScore > 0) myQuest.progress += 1; // Tạm dùng logic ghi bàn là tính mở tỷ số cho đơn giản
        
            if(myQuest.progress >= myQuest.target) {
                myBudget += myQuest.reward;
                window.pushNews('Hoàn thành Hợp đồng Tài trợ', `Đội bóng đã hoàn thành mục tiêu: ${myQuest.desc}. Nhận khoản thưởng nóng €${myQuest.reward.toLocaleString()}!`, true);
                window.generateNewQuest();
            } else {
                // Lưu tiến độ nếu chưa xong
                setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { quest: myQuest }, { merge: true });
            }
        }
        
        if (Math.random() < 0.15) {
            if (Math.random() > 0.5) { myBudget += 200000; window.pushNews('Nhà tài trợ vui vẻ', 'Lối đá đẹp mắt, nhà tài trợ thưởng nóng €200,000!', true); } 
            else { myBudget -= 100000; window.pushNews('Án Phạt Nguội', 'LĐBĐ Việt Nam phạt CLB €100,000 do CĐV ném đồ xuống sân.', false); }
        }

        const batch = writeBatch(db);
        batch.set(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget, fame: myFame, facilities: myFacilities, news: newsInbox }, { merge: true });
        batch.set(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        batch.set(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'tactics'), { formation: currentFormation, startingXI: startingXI });
        await batch.commit();

        if(endSeasonMessage) showToast(endSeasonMessage, "success"); else showToast("Đã lưu kết quả vòng đấu!", "success");
        document.getElementById('match-live').classList.add('hidden'); document.getElementById('league-table-container').classList.remove('hidden'); renderLeagueView();
        
        toggleNavLock(false); if (leagueState.currentRound <= 31 && document.getElementById('quick-play-btn')) document.getElementById('quick-play-btn').classList.remove('hidden');

    } catch (e) { showToast("Lỗi lưu kết quả!"); } finally { hideLoading(); }
};

const finishFriendlyMatch = async (totalEarnings) => {
    showLoading("ĐANG LƯU...");
    try {
        myBudget += totalEarnings; updateHeaderDisplay(); leagueState.friendlyMatchesPlayed = (leagueState.friendlyMatchesPlayed || 0) + 1;
        const batch = writeBatch(db); 
        batch.set(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget, facilities: myFacilities, news: newsInbox }, { merge: true }); 
        batch.set(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState); 
        batch.set(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'tactics'), { formation: currentFormation, startingXI: startingXI }); 
        await batch.commit();
        document.getElementById('match-live').classList.add('hidden'); document.getElementById('season-end-panel').classList.remove('hidden'); document.getElementById('league-table-container').classList.remove('hidden'); showToast("Hoàn tất trận giao hữu!", "success"); renderLeagueView(); 
        
        toggleNavLock(false); if (leagueState.currentRound <= 31 && document.getElementById('quick-play-btn')) document.getElementById('quick-play-btn').classList.remove('hidden');
    } catch (e) { showToast("Lỗi!"); } finally { hideLoading(); }
};

document.getElementById('start-new-season-btn')?.addEventListener('click', async () => {
    showLoading("THIẾT LẬP MÙA GIẢI MỚI...");
    try {
        let botStandings = leagueState.standings.filter(t => !t.isUser); let relegatedBotIds = botStandings.slice(-2).map(b => b.id); leagueState.standings = leagueState.standings.filter(t => !relegatedBotIds.includes(t.id));
        if (leagueState.promotedBots && leagueState.promotedBots.length === 2) { leagueState.promotedBots.forEach(b => { const ovr = Math.floor(Math.random() * 20) + 60; leagueState.standings.push({ id: `bot_${Date.now()}_${Math.random()}`, name: b.name, isUser: false, ovr: ovr, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }); }); }
        leagueState.promotedBots = []; leagueState.currentRound = 1; leagueState.friendlyMatchesPlayed = 0; leagueState.rankHistory = [];
        leagueState.standings.forEach(t => { t.played = 0; t.won = 0; t.drawn = 0; t.lost = 0; t.gf = 0; t.ga = 0; t.points = 0; });
        leagueState.schedule = leagueState.standings.filter(t => !t.isUser).map(b => b.id).sort(() => Math.random() - 0.5);
        
        const batch = writeBatch(db); globalPlayersList.forEach(p => { p.stamina = 100; p.injury = 0; batch.update(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { stamina: 100, injury: 0 }); }); await batch.commit();
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        renderSquadList(); renderPitch(); renderLeagueView(); showToast("Mùa giải mới! Thể lực đã hồi phục 100%.", "success");
        if(document.getElementById('quick-play-btn')) document.getElementById('quick-play-btn').classList.remove('hidden');
    } catch(e) { showToast("Lỗi!"); } finally { hideLoading(); }
});

document.getElementById('quick-play-btn')?.addEventListener('click', () => {
    if (leagueState.currentRound > 31) { showToast("Mùa giải đã kết thúc! Vui lòng bắt đầu mùa mới.", "warning"); switchView('league'); return; }
    switchView('league'); document.getElementById('dashboard-section').scrollIntoView({ behavior: "smooth" });
});

// ================= MODULE SÂN VẬN ĐỘNG =================
// Thông số các cấp độ của Sân
const STADIUM_STATS = [
    { level: 1, name: 'Sân Tập Khu Phố', capacity: 2000, ticketPrice: 15, img: '🥅', upgradeCost: 0, upgradeTime: 0 },
    { level: 2, name: 'Sân Vận Động Địa Phương', capacity: 10000, ticketPrice: 20, img: '🏟️', upgradeCost: 5000000, upgradeTime: 2 },
    { level: 3, name: 'Sân Vận Động Tỉnh', capacity: 25000, ticketPrice: 25, img: '🏟️', upgradeCost: 15000000, upgradeTime: 4 },
    { level: 4, name: 'Sân Vận Động Quốc Gia', capacity: 50000, ticketPrice: 35, img: '🏟️', upgradeCost: 35000000, upgradeTime: 7 },
    { level: 5, name: 'Thánh Địa Châu Á', capacity: 90000, ticketPrice: 50, img: '🏛️', upgradeCost: 80000000, upgradeTime: 10 }
];

window.renderStadium = function() {
    const container = document.getElementById('stadium-container');
    if(!container) return;
    
    // Khởi tạo cấp 1 nếu tài khoản cũ chưa có data
    if(!myFacilities.stadium) myFacilities.stadium = 1;
    
    const currentLvl = myFacilities.stadium;
    const currentStat = STADIUM_STATS[currentLvl - 1];
    const nextStat = currentLvl < 5 ? STADIUM_STATS[currentLvl] : null;
    
    let actionHtml = '';
    if (myFacilities.pendingUpgrade && myFacilities.pendingUpgrade.id === 'stadium') {
        actionHtml = `<button disabled class="w-full py-3 bg-yellow-700 text-yellow-200 font-bold text-sm rounded-xl cursor-not-allowed shadow-lg">Đang thi công (${myFacilities.pendingUpgrade.remaining} trận)</button>`;
    } else if (myFacilities.pendingUpgrade) {
        actionHtml = `<button disabled class="w-full py-3 bg-slate-700 text-slate-400 font-bold text-sm rounded-xl cursor-not-allowed">Chờ công trình Y tế/Huấn luyện thi công xong</button>`;
    } else if (!nextStat) {
        actionHtml = `<button disabled class="w-full py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white font-bold text-sm rounded-xl cursor-not-allowed shadow-lg">Đã đạt chuẩn cao nhất (Max Lv.5)</button>`;
    } else {
        actionHtml = `<button onclick="window.upgradeFacility('stadium', ${nextStat.upgradeCost}, ${nextStat.upgradeTime}); window.renderStadium();" class="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold text-sm rounded-xl shadow-lg transition">Nâng cấp Khán đài: €${(nextStat.upgradeCost/1000000).toFixed(1)}M (${nextStat.upgradeTime} trận)</button>`;
    }

    container.innerHTML = `
        <!-- Bảng Thông số hiện tại -->
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col items-center text-center relative overflow-hidden">
            <div class="absolute -top-10 -right-10 text-9xl opacity-5 pointer-events-none">🏟️</div>
            <div class="text-6xl md:text-7xl mb-4 drop-shadow-[0_0_15px_rgba(249,115,22,0.4)] z-10">${currentStat.img}</div>
            <h3 class="text-2xl font-bold text-orange-400 mb-1 z-10">${currentStat.name}</h3>
            <span class="bg-orange-900/50 text-orange-300 text-[10px] uppercase font-bold px-3 py-1 rounded-full border border-orange-500/50 mb-6 z-10">Cấp độ ${currentLvl}</span>
            
            <div class="w-full bg-slate-900/80 rounded-xl p-4 border border-slate-700 space-y-3 z-10">
                <div class="flex justify-between items-center border-b border-slate-700/50 pb-2">
                    <span class="text-slate-400 text-sm">Sức chứa tối đa:</span>
                    <span class="font-bold text-white">${currentStat.capacity.toLocaleString()} ghế</span>
                </div>
                <div class="flex justify-between items-center border-b border-slate-700/50 pb-2">
                    <span class="text-slate-400 text-sm">Giá vé trung bình:</span>
                    <span class="font-bold text-green-400">€${currentStat.ticketPrice}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-slate-400 text-sm">Doanh thu dự kiến:</span>
                    <span class="font-bold text-yellow-400">€${(currentStat.capacity * currentStat.ticketPrice).toLocaleString()}/trận</span>
                </div>
            </div>
        </div>

        <!-- Bảng Kế hoạch nâng cấp -->
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
                <h3 class="text-lg md:text-xl font-bold text-white mb-4 border-b border-slate-700 pb-2 flex items-center gap-2">🚧 Dự án Mở rộng</h3>
                ${nextStat ? `
                    <p class="text-sm text-slate-400 mb-6 leading-relaxed">Đầu tư nâng cấp mặt cỏ và xây thêm khán đài để đón lượng lớn người hâm mộ. SVĐ càng lớn, nguồn thu tài chính càng ổn định.</p>
                    <div class="space-y-4 mb-6 text-sm bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                        <div class="flex justify-between items-center text-slate-300">
                            <span>Mở rộng thêm:</span>
                            <span class="font-bold text-green-400">⬆ ${(nextStat.capacity - currentStat.capacity).toLocaleString()} ghế</span>
                        </div>
                        <div class="flex justify-between items-center text-slate-300">
                            <span>Tăng doanh thu:</span>
                            <span class="font-bold text-green-400">⬆ €${((nextStat.capacity * nextStat.ticketPrice) - (currentStat.capacity * currentStat.ticketPrice)).toLocaleString()}</span>
                        </div>
                        <div class="flex justify-between items-center text-slate-300">
                            <span>Thời gian thi công:</span>
                            <span class="font-bold text-yellow-400">⏳ ${nextStat.upgradeTime} trận</span>
                        </div>
                    </div>
                ` : `
                    <div class="flex flex-col items-center justify-center h-48 text-center bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
                        <div class="text-5xl mb-3 text-yellow-400 animate-pulse">👑</div>
                        <p class="text-slate-300 font-bold mb-1">Sân vận động đạt chuẩn FIFA cao nhất.</p>
                        <p class="text-slate-500 text-sm">Không thể mở rộng quy mô thêm nữa.</p>
                    </div>
                `}
            </div>
            <div>${actionHtml}</div>
        </div>
    `;
};

window.generateNewQuest = function() {
    const quests = [
        { type: 'goals', target: 5, progress: 0, reward: 500000, desc: 'Ghi tổng cộng 5 bàn thắng' },
        { type: 'cleansheet', target: 3, progress: 0, reward: 800000, desc: 'Giữ sạch lưới 3 trận' },
        { type: 'win', target: 3, progress: 0, reward: 1000000, desc: 'Giành 3 chiến thắng' },
        { type: 'score_first', target: 4, progress: 0, reward: 600000, desc: 'Ghi bàn mở tỷ số trong 4 trận' }
    ];
    myQuest = quests[Math.floor(Math.random() * quests.length)];
    // Lưu vào Firebase
    setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { quest: myQuest }, { merge: true });
};
