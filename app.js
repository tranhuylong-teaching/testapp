import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ================= MODULE 1: CONFIG & GLOBAL STATE =================
const firebaseConfig = { 
    apiKey: "AIzaSyCB5E_ENZDTJEp5oKJCgnpz2QYkNSSg1y0", 
    authDomain: "ai-apps-thlong.firebaseapp.com", 
    projectId: "ai-apps-thlong", 
    storageBucket: "ai-apps-thlong.firebasestorage.app", 
    messagingSenderId: "315097410913", 
    appId: "1:315097410913:web:db96ee02cd463c079ea920" 
};
const app = initializeApp(firebaseConfig); 
const auth = getAuth(app); 
const db = getFirestore(app); 
const appId = 'web-football-manager';

// Global State Variables
let currentUserId = null; 
let myClubName = "My Club"; 
let myBudget = 0;
let globalPlayersList = []; 
let globalPlayersMap = {};
let currentFormation = '4-4-2'; 
let startingXI = new Array(11).fill(null);
let teamPower = { OVR: 0 };
let leagueState = { currentRound: 1, standings: [], schedule: [], friendlyMatchesPlayed: 0, promotedBots: [] };

let currentMarketList = [];
let pendingOffers = [];
let currentlyViewingPlayerId = null;
let currentSlotToFill = null;
let currentItemToApply = null;

const BOT_CITY_NAMES = ["Hà Nội", "Sài Gòn", "Đà Nẵng", "Hải Phòng", "Cần Thơ", "Bình Dương", "Thanh Hóa", "Nghệ An", "Nam Định", "Quảng Ninh", "Bình Định", "Gia Lai", "Vũng Tàu", "Đồng Nai", "Khánh Hòa", "Huế", "Long An", "Đồng Tháp", "An Giang", "Kiên Giang", "Tây Ninh", "Bình Thuận", "Lâm Đồng", "Đắk Lắk", "Phú Thọ", "Bắc Ninh", "Hải Dương", "Vĩnh Phúc", "Ninh Bình", "Thái Bình", "Hà Tĩnh"];
const RESERVE_BOT_NAMES = ["Bạc Liêu", "Sóc Trăng", "Cà Mau", "Trà Vinh", "Vĩnh Long", "Hậu Giang", "Bình Phước", "Tuyên Quang", "Yên Bái", "Lào Cai", "Sơn La", "Điện Biên", "Hà Giang", "Cao Bằng", "Bắc Kạn"];
const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const FOREIGN_NAMES = ["Ronaldo", "Messi", "Haaland", "Mbappe", "De Bruyne", "Salah", "Van Dijk", "Alisson", "Pedri", "Bellingham", "Saka", "Odegaard"];

const STORE_ITEMS = [
    { id: 'item_speed', name: 'Giày Khinh Công', icon: '👟', desc: '+3 Tốc độ (PAC)', price: 500000, type: 'stat', stat: 'PAC', amount: 3 },
    { id: 'item_shoot', name: 'Bia Đỡ Đạn', icon: '🎯', desc: '+3 Dứt điểm (SHO)', price: 600000, type: 'stat', stat: 'SHO', amount: 3 },
    { id: 'item_pass', name: 'Băng Đội Trưởng', icon: '🧠', desc: '+3 Chuyền bóng (PAS)', price: 400000, type: 'stat', stat: 'PAS', amount: 3 },
    { id: 'item_def', name: 'Tạ Chân', icon: '🛡️', desc: '+3 Phòng ngự, +2 Thể chất', price: 500000, type: 'stat_multi', stats: {DEF: 3, PHY: 2} },
    { id: 'item_gacha', name: 'Gói Trẻ Vô Danh', icon: '⭐', desc: 'Mở 1 cầu thủ trẻ ngẫu nhiên (OVR 60-75)', price: 1000000, type: 'gacha' }
];

// UI Utilities
window.showToast = (message, type = 'error') => {
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-lg shadow-lg text-white text-sm animate-log transition-all duration-300 pointer-events-auto z-[999] ${type === 'error' ? 'bg-red-600' : 'bg-green-600'}`;
    toast.textContent = message;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
};

const updateBudgetDisplay = () => {
    document.getElementById('budget-display').textContent = `€${myBudget.toLocaleString()}`;
};

const getPrizeMoney = (rank) => {
    if(rank === 1) return 5000000;
    if(rank === 2) return 3000000;
    if(rank >= 3 && rank <= 10) return 1000000;
    if(rank === 11 || rank === 12) return 2000000; 
    if(rank >= 13 && rank <= 20) return 500000;
    if(rank === 21 || rank === 22) return 1000000; 
    if(rank >= 23 && rank <= 30) return 200000;
    return 0; 
};

const recalculateOVR = (pos, stats) => {
    let ovr = 0;
    if(pos === 'FWD') ovr = stats.SHO*0.4 + stats.PAC*0.25 + stats.DRI*0.2 + stats.PHY*0.1 + stats.PAS*0.05;
    else if(pos === 'MID') ovr = stats.PAS*0.35 + stats.DRI*0.25 + stats.PAC*0.1 + stats.SHO*0.1 + stats.DEF*0.1 + stats.PHY*0.1;
    else if(pos === 'DEF' || pos === 'GK') ovr = stats.DEF*0.45 + stats.PHY*0.3 + stats.PAC*0.15 + stats.PAS*0.1;
    return Math.round(ovr);
};

// ================= MODULE 2: NAVIGATION & VIEWS =================
const switchView = (v) => {
    ['view-overview', 'view-squad', 'view-tactics', 'view-league', 'view-transfer', 'view-store'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['nav-overview', 'nav-squad', 'nav-tactics', 'nav-league', 'nav-transfer', 'nav-store'].forEach(id => { document.getElementById(id).className = "block px-4 py-3 hover:bg-slate-800 text-slate-300 rounded-lg border border-transparent"; });
    
    document.getElementById(`view-${v}`).classList.remove('hidden');
    document.getElementById(`nav-${v}`).className = "block px-4 py-3 bg-green-900/40 text-green-400 font-medium rounded-lg border border-green-900/50";
    
    if(v === 'league') renderLeagueView();
    if(v === 'transfer') renderTransferMarket();
    if(v === 'store') renderStore();
};
['overview', 'squad', 'tactics', 'league', 'transfer', 'store'].forEach(v => document.getElementById(`nav-${v}`).addEventListener('click', () => switchView(v)));

// ================= MODULE 3: AUTHENTICATION =================
let isLogin = true; 
document.getElementById('toggle-mode-btn').addEventListener('click', (e) => { 
    e.preventDefault(); isLogin = !isLogin; 
    document.getElementById('auth-submit-btn').textContent = isLogin ? "Đăng Nhập" : "Đăng Ký"; 
    document.getElementById('auth-toggle-text').textContent = isLogin ? "Chưa có tài khoản?" : "Đã có tài khoản?";
});

document.getElementById('auth-form').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const btn = document.getElementById('auth-submit-btn'); btn.disabled = true; btn.textContent = "Đang xử lý...";
    const errDiv = document.getElementById('auth-error'); errDiv.classList.add('hidden');
    try { 
        if(isLogin) await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); 
        else await createUserWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); 
    } catch(err) { 
        errDiv.textContent = err.message; errDiv.classList.remove('hidden'); btn.disabled = false; btn.textContent = isLogin ? "Đăng Nhập" : "Đăng Ký";
    } 
});
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('auth-container').classList.add('hidden'); 
        document.getElementById('dashboard-section').classList.remove('hidden'); 
        currentUserId = user.uid;
        document.getElementById('user-email-display').textContent = user.email;
        loadGameData(user.uid);
    } else { 
        document.getElementById('dashboard-section').classList.add('hidden'); 
        document.getElementById('auth-container').classList.remove('hidden'); 
    }
});

// ================= MODULE 4: DB & CLUB INIT =================
const loadGameData = async (uid) => {
    try {
        const profileSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'profile', 'info'));
        if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            myClubName = profileData.clubName; 
            myBudget = profileData.budget || 10000000;
            
            document.getElementById('welcome-title').textContent = `HLV của ${myClubName}!`;
            updateBudgetDisplay();
            
            const pSnap = await getDocs(collection(db, 'artifacts', appId, 'users', uid, 'players'));
            globalPlayersList = []; globalPlayersMap = {};
            pSnap.forEach(doc => { 
                const d = doc.data(); 
                d.id = doc.id; 
                d.itemsUsed = d.itemsUsed || 0; 
                
                if (!d.stats || isNaN(d.ovr)) {
                    const fallback = Math.floor(Math.random() * 20) + 50;
                    d.stats = { PAC:fallback, SHO:fallback, PAS:fallback, DRI:fallback, DEF:fallback, PHY:fallback };
                    d.ovr = recalculateOVR(d.pos, d.stats);
                    setDoc(doc.ref, { stats: d.stats, ovr: d.ovr }, { merge: true });
                }
                if(!d.bonusStats) d.bonusStats = { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 };
                if (d.stamina === undefined || isNaN(d.stamina)) d.stamina = 100; // Khởi tạo thể lực nếu chưa có
                
                globalPlayersList.push(d); 
                globalPlayersMap[d.id] = d; 
            });
            
            renderSquadList(); 
            
            const tacSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'profile', 'tactics'));
            if(tacSnap.exists()) {
                const tData = tacSnap.data();
                currentFormation = tData.formation || '4-4-2';
                document.getElementById('formation-select').value = currentFormation;
                startingXI = tData.startingXI || new Array(11).fill(null);
            } else if(globalPlayersList.length >= 11) {
                startingXI = new Array(11).fill(null);
                const layout = currentFormation.split('-').map(Number); layout.reverse(); layout.push(1);
                const posNames = ['FWD', 'MID', 'DEF', 'GK'];
                let expectedPositions = [];
                layout.forEach((count, idx) => { for(let i=0; i<count; i++) expectedPositions.push(posNames[idx]); });
                
                let usedIds = new Set();
                expectedPositions.forEach((reqPos, index) => {
                    let best = globalPlayersList.filter(p => p.pos === reqPos && !usedIds.has(p.id)).sort((a,b)=>b.ovr - a.ovr)[0];
                    if(best) { startingXI[index] = best.id; usedIds.add(best.id); }
                });
                startingXI.forEach((val, index) => {
                    if(!val) {
                        let best = globalPlayersList.filter(p => !usedIds.has(p.id)).sort((a,b)=>b.ovr - a.ovr)[0];
                        if(best) { startingXI[index] = best.id; usedIds.add(best.id); }
                    }
                });
            }
            renderPitch();
            
            const leagueSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'league', 'state'));
            if (leagueSnap.exists()) {
                leagueState = leagueSnap.data();
                if (!leagueState.promotedBots) leagueState.promotedBots = [];
            } else {
                await initLeagueData(uid, myClubName);
            }
            
            switchView('overview');
        } else { 
            document.getElementById('init-club-modal').classList.remove('hidden'); 
        }
    } catch(e) { window.showToast("Lỗi tải dữ liệu: " + e.message); }
};

document.getElementById('create-club-btn').addEventListener('click', async () => {
    const clubName = document.getElementById('club-name-input').value.trim();
    if(!clubName) { window.showToast("Vui lòng nhập tên Câu lạc bộ!"); return; }
    
    const btn = document.getElementById('create-club-btn'); 
    btn.textContent = "Đang tạo..."; btn.disabled = true;

    try {
        const batch = writeBatch(db);
        const userRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info');
        batch.set(userRef, { clubName: clubName, budget: 10000000 });

        const VIETNAMESE_NAMES = ["Quang Hải", "Tiến Linh", "Văn Hậu", "Hoàng Đức", "Tuấn Anh", "Công Phượng", "Ngọc Hải", "Văn Lâm", "Tiến Dũng", "Duy Mạnh", "Thành Chung", "Văn Thanh", "Hồng Duy", "Văn Toàn", "Tuấn Hải", "Hùng Dũng"];
        const INITIAL_POS = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'FWD'];
        const superstarIndex = Math.floor(Math.random() * 16);
        
        INITIAL_POS.forEach((pos, i) => {
            const isStar = (i === superstarIndex);
            const baseMin = isStar ? 75 : 30; 
            const baseMax = isStar ? 95 : 45;
            const rnd = () => Math.floor(Math.random() * (baseMax - baseMin + 1)) + baseMin;
            
            let stats = { PAC: rnd(), SHO: rnd(), PAS: rnd(), DRI: rnd(), DEF: rnd(), PHY: rnd() };
            let ovr = recalculateOVR(pos, stats);
            
            const playerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players'));
            batch.set(playerRef, { 
                name: VIETNAMESE_NAMES[i % VIETNAMESE_NAMES.length] + (isStar ? " ⭐" : ""), 
                pos: pos, ovr: ovr, stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 },
                stamina: 100, value: ovr * 100000, isListed: false, itemsUsed: 0
            });
        });
        await batch.commit();
        
        await initLeagueData(currentUserId, clubName);
        document.getElementById('init-club-modal').classList.add('hidden');
        window.showToast("Khởi tạo Câu lạc bộ thành công!", "success");
        await loadGameData(currentUserId);
    } catch(e) { 
        window.showToast("Lỗi khi tạo CLB: " + e.message); 
        btn.textContent = "Nhận Đội Hình"; btn.disabled = false; 
    }
});

const initLeagueData = async (uid, overrideName = null) => {
    let bots = [];
    for (let i = 0; i < 31; i++) {
        const ovr = Math.floor(Math.random() * 20) + 60;
        bots.push({ 
            id: `bot_${Date.now()}_${i}`, name: `${BOT_CITY_NAMES[i]} FC`, isUser: false, ovr: ovr, 
            played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 
        });
    }
    let initialStandings = [...bots, { 
        id: 'user', name: overrideName || myClubName, isUser: true, ovr: 0, 
        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 
    }];
    let userSchedule = bots.map(b => b.id).sort(() => Math.random() - 0.5);
    
    leagueState = { currentRound: 1, standings: initialStandings, schedule: userSchedule, friendlyMatchesPlayed: 0, promotedBots: [] };
    await setDoc(doc(db, 'artifacts', appId, 'users', uid, 'league', 'state'), leagueState);
};

// ================= MODULE 5: SQUAD & TACTICS =================
const renderSquadList = () => {
    const tbody = document.getElementById('squad-list-body'); tbody.innerHTML = '';
    const order = { 'GK': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };
    globalPlayersList.sort((a, b) => order[a.pos] - order[b.pos] || b.ovr - a.ovr);
    
    const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    
    globalPlayersList.forEach(p => {
        const statusHtml = p.isListed ? '<span class="text-xs bg-red-900 text-red-300 px-2 py-1 rounded">Rao Bán</span>' : '<span class="text-xs bg-green-900 text-green-300 px-2 py-1 rounded">Tại CLB</span>';
        const stColor = p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400');
        const stBg = p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500');

        tbody.innerHTML += `
            <tr class="hover:bg-slate-700/50 transition-colors cursor-pointer" onclick="window.openPlayerDetail('${p.id}')">
                <td class="p-4 pl-6"><span class="${posColors[p.pos]} text-white text-xs font-bold px-2 py-1 rounded w-12 inline-block text-center">${p.pos}</span></td>
                <td class="p-4 font-medium text-white">
                    <div class="mb-1">${p.name}</div>
                    <div class="flex items-center gap-2 text-[10px] ${stColor}">
                        <span>⚡ ${p.stamina}%</span>
                        <div class="w-16 bg-slate-700 h-1.5 rounded-full overflow-hidden"><div class="${stBg} h-full" style="width: ${p.stamina}%"></div></div>
                    </div>
                </td>
                <td class="p-4 text-center font-bold text-green-400">${p.ovr}</td>
                <td class="p-4 text-center">${statusHtml}</td>
                <td class="p-4 text-right pr-6 text-yellow-400">€${(p.value || p.ovr*100000).toLocaleString()}</td>
            </tr>`;
    });
};

window.openPlayerDetail = (playerId) => {
    const p = globalPlayersMap[playerId]; if(!p) return;
    currentlyViewingPlayerId = playerId;
    
    const st = p.stats || { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 };
    const bSt = p.bonusStats || { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 };
    const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    
    document.getElementById('detail-name').textContent = p.name;
    document.getElementById('detail-pos').textContent = p.pos;
    document.getElementById('detail-pos').className = `${posColors[p.pos]} text-white text-xs font-bold px-2 py-1 rounded`;
    document.getElementById('detail-bg-pos').textContent = p.pos;
    document.getElementById('detail-ovr').textContent = p.ovr;
    document.getElementById('detail-items-used').textContent = p.itemsUsed || 0;
    
    ['pac','sho','pas','dri','def','phy'].forEach(s => {
        const upperS = s.toUpperCase();
        const total = st[upperS] || 0;
        const bonus = bSt[upperS] || 0;
        const base = total - bonus;
        const displayEl = document.getElementById(`detail-${s}`);
        if (bonus > 0) { displayEl.innerHTML = `${base} <span class="text-green-400 font-bold ml-1">+${bonus}</span>`; } 
        else { displayEl.textContent = total; }
    });
    
    document.getElementById('detail-value').textContent = `€${(p.value || p.ovr*100000).toLocaleString()}`;
    
    // Tiêm thanh Thể lực vào Modal
    let staminaDiv = document.getElementById('detail-stamina-bar');
    if (!staminaDiv) {
        staminaDiv = document.createElement('div');
        staminaDiv.id = 'detail-stamina-bar';
        staminaDiv.className = 'mt-3 mb-2 flex flex-col items-center justify-center';
        const pModal = document.getElementById('sell-player-container').parentElement;
        pModal.insertBefore(staminaDiv, document.getElementById('sell-player-container'));
    }
    const stColor = p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400');
    const stBg = p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500');
    staminaDiv.innerHTML = `
        <div class="text-sm text-slate-300 mb-1">Thể lực hiện tại: <span class="font-bold ${stColor}">${p.stamina}%</span></div>
        <div class="w-3/4 bg-slate-700 h-2 rounded-full overflow-hidden mb-2"><div class="${stBg} h-full transition-all" style="width: ${p.stamina}%"></div></div>
    `;

    const sellContainer = document.getElementById('sell-player-container');
    if (p.isListed) { sellContainer.innerHTML = `<button onclick="window.toggleTransferListing()" class="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold transition">Hủy Rao Bán</button>`; } 
    else { sellContainer.innerHTML = `<button onclick="window.toggleTransferListing()" class="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold shadow-lg transition">Đưa lên TTCN</button>`; }
    
    document.getElementById('player-detail-modal').classList.remove('hidden');
};
document.getElementById('close-detail-modal').addEventListener('click', () => { document.getElementById('player-detail-modal').classList.add('hidden'); });

const calcTeamPower = () => {
    let totalOVR = 0, count = 0;
    startingXI.forEach(id => { 
        if(id && globalPlayersMap[id]) { 
            let p = globalPlayersMap[id];
            let penalty = p.stamina < 60 ? Math.floor((60 - p.stamina) / 2) : 0; // Trừ OVR nếu thể lực cạn
            let effOvr = Math.max(1, p.ovr - penalty);
            totalOVR += effOvr; 
            count++; 
        } 
    });
    teamPower.OVR = count > 0 ? Math.round(totalOVR/count) : 0;
    document.getElementById('team-ovr').textContent = teamPower.OVR;
    
    if(leagueState && leagueState.standings) {
        let userTeam = leagueState.standings.find(t => t.isUser);
        if(userTeam) userTeam.ovr = teamPower.OVR;
    }
};

const renderPitch = () => {
    const container = document.getElementById('pitch-container'); container.innerHTML = '';
    const layout = currentFormation.split('-').map(Number); layout.reverse(); layout.push(1); 
    const posNames = ['FWD', 'MID', 'DEF', 'GK'];
    let slotIndex = 0;
    
    layout.forEach((rowCount, rowIndex) => {
        const expectedPos = posNames[rowIndex];
        const rowDiv = document.createElement('div'); rowDiv.className = "flex justify-center items-center w-full gap-2 sm:gap-6";
        for(let i=0; i<rowCount; i++) {
            const p = startingXI[slotIndex] ? globalPlayersMap[startingXI[slotIndex]] : null;
            const currentIndex = slotIndex;
            let pHtml = "";

            if (p) {
                const isOutOfPos = p.pos !== expectedPos;
                const borderClass = isOutOfPos ? 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'border-green-500';
                const penalty = p.stamina < 60 ? Math.floor((60 - p.stamina) / 2) : 0;
                const effOvr = Math.max(1, p.ovr - penalty);
                const stBg = p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500');

                pHtml = `
                    <div class="w-10 h-10 bg-slate-800 border-2 ${borderClass} rounded-full flex items-center justify-center font-bold text-sm z-10 shadow-lg relative">
                        ${effOvr}
                        ${penalty > 0 ? `<div class="absolute -top-2 -right-2 bg-red-600 text-white text-[9px] font-bold px-1 rounded-full shadow">-${penalty}</div>` : ''}
                    </div>
                    <div class="mt-1 w-14 flex flex-col items-center">
                        <div class="bg-black/80 px-1.5 py-0.5 rounded text-[10px] text-white truncate max-w-full z-10">${p.name}</div>
                        <div class="w-full bg-slate-800 h-1.5 mt-0.5 rounded border border-slate-700 overflow-hidden z-10"><div class="${stBg} h-full" style="width: ${p.stamina}%"></div></div>
                    </div>`;
            } else {
                pHtml = `<div class="w-10 h-10 bg-white/10 hover:bg-white/20 border-2 border-dashed border-white/40 rounded-full flex items-center justify-center text-white/50 text-xs font-bold z-10 transition">${expectedPos}</div>`;
            }

            rowDiv.innerHTML += `
            <div class="relative flex flex-col items-center w-16 cursor-pointer hover:scale-110 transition-transform" onclick="window.openBenchSelect(${currentIndex}, '${expectedPos}')">
                ${pHtml}
            </div>`;
            slotIndex++;
        }
        container.appendChild(rowDiv);
    });
    calcTeamPower();
};

document.getElementById('formation-select').addEventListener('change', (e) => { 
    currentFormation = e.target.value; 
    const layout = currentFormation.split('-').map(Number); layout.reverse(); layout.push(1);
    const posNames = ['FWD', 'MID', 'DEF', 'GK'];
    let expectedPositions = [];
    layout.forEach((count, idx) => { for(let i=0; i<count; i++) expectedPositions.push(posNames[idx]); });
    
    let newXI = new Array(11).fill(null);
    let availablePlayers = startingXI.filter(id => id !== null).map(id => globalPlayersMap[id]);
    
    expectedPositions.forEach((reqPos, index) => {
        let matchIdx = availablePlayers.findIndex(p => p && p.pos === reqPos);
        if (matchIdx !== -1) { newXI[index] = availablePlayers[matchIdx].id; availablePlayers.splice(matchIdx, 1); }
    });
    newXI.forEach((val, index) => {
        if (!val && availablePlayers.length > 0) { newXI[index] = availablePlayers[0].id; availablePlayers.splice(0, 1); }
    });
    
    startingXI = newXI; renderPitch(); 
});

window.openBenchSelect = (slotIndex, expectedPos) => {
    currentSlotToFill = slotIndex;
    const container = document.getElementById('bench-list-container'); container.innerHTML = '';
    const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    
    let benchList = [...globalPlayersList].sort((a, b) => {
        if (a.pos === expectedPos && b.pos !== expectedPos) return -1;
        if (a.pos !== expectedPos && b.pos === expectedPos) return 1;
        return b.ovr - a.ovr;
    });

    benchList.forEach(p => {
        const isPlaying = startingXI.includes(p.id);
        if (isPlaying && startingXI[slotIndex] !== p.id) return;
        const isCurrent = startingXI[slotIndex] === p.id;
        const stColor = p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400');
        
        container.innerHTML += `
            <div onclick="window.assignPlayerToSlot('${p.id}')" class="flex justify-between items-center p-3 hover:bg-slate-700/50 border-b border-slate-700/50 cursor-pointer rounded ${isCurrent ? 'bg-green-900/30' : ''}">
                <div class="flex items-center gap-3">
                    <span class="${posColors[p.pos]} text-white text-[10px] font-bold px-2 py-0.5 rounded w-10 text-center">${p.pos}</span>
                    <div class="flex flex-col">
                        <span class="text-white text-sm ${isCurrent ? 'font-bold' : ''}">${p.name}</span>
                        <span class="text-[10px] ${stColor}">⚡ ${p.stamina}%</span>
                    </div>
                </div>
                <span class="text-green-400 font-bold">${p.ovr}</span>
            </div>
        `;
    });
    document.getElementById('select-player-modal').classList.remove('hidden');
};
window.closeBenchSelect = () => { document.getElementById('select-player-modal').classList.add('hidden'); };

window.assignPlayerToSlot = (playerId) => { if(currentSlotToFill !== null) { startingXI[currentSlotToFill] = playerId; renderPitch(); window.closeBenchSelect(); } };
window.removePlayerFromSlot = () => { if(currentSlotToFill !== null) { startingXI[currentSlotToFill] = null; renderPitch(); window.closeBenchSelect(); } };

document.getElementById('save-tactics-btn').addEventListener('click', async () => { 
    const btn = document.getElementById('save-tactics-btn'); const oldText = btn.textContent;
    btn.textContent = "Đang lưu..."; btn.disabled = true;
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'tactics'), { formation: currentFormation, startingXI: startingXI });
        window.showToast("Đã lưu chiến thuật vào CSDL!", "success"); 
    } catch(e) { window.showToast("Lỗi khi lưu chiến thuật: " + e.message); }
    btn.textContent = oldText; btn.disabled = false;
});

// ================= MODULE 6: TRANSFER MARKET =================
document.getElementById('tab-transfer-market').addEventListener('click', () => {
    document.getElementById('transfer-market-section').classList.remove('hidden');
    document.getElementById('transfer-offers-section').classList.add('hidden');
    document.getElementById('tab-transfer-market').className = "px-4 py-2 font-bold text-green-400 border-b-2 border-green-400";
    document.getElementById('tab-transfer-offers').className = "px-4 py-2 font-medium text-slate-400 hover:text-white transition";
});

document.getElementById('tab-transfer-offers').addEventListener('click', () => {
    document.getElementById('transfer-market-section').classList.add('hidden');
    document.getElementById('transfer-offers-section').classList.remove('hidden');
    document.getElementById('tab-transfer-market').className = "px-4 py-2 font-medium text-slate-400 hover:text-white transition";
    document.getElementById('tab-transfer-offers').className = "px-4 py-2 font-bold text-green-400 border-b-2 border-green-400";
    renderOffers();
});

const generateMarketPlayers = () => {
    currentMarketList = [];
    for(let i=0; i<8; i++) {
        const isStar = Math.random() > 0.8;
        const pos = POSITIONS[Math.floor(Math.random()*POSITIONS.length)];
        const name = FOREIGN_NAMES[Math.floor(Math.random()*FOREIGN_NAMES.length)] + " " + Math.floor(Math.random()*99);
        const ovr = isStar ? Math.floor(Math.random()*15)+80 : Math.floor(Math.random()*20)+50;
        const val = ovr * (isStar ? 150000 : 80000);
        let stats = { PAC: ovr, SHO: ovr, PAS: ovr, DRI: ovr, DEF: ovr, PHY: ovr };
        
        currentMarketList.push({ 
            id: 'market_' + Date.now() + i, name: name + (isStar?"⭐":""), pos: pos, ovr: ovr, 
            value: val, stats: stats, bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 },
            stamina: 100, isListed: false, itemsUsed: 0 
        });
    }
};

const renderTransferMarket = () => {
    if(currentMarketList.length === 0) generateMarketPlayers();
    const tbody = document.getElementById('market-list-body'); tbody.innerHTML = '';
    const posColors = { GK: 'bg-yellow-600', DEF: 'bg-blue-600', MID: 'bg-green-600', FWD: 'bg-red-600' };
    
    currentMarketList.forEach(p => {
        tbody.innerHTML += `
            <tr class="hover:bg-slate-700/50 border-b border-slate-700/30 transition-colors">
                <td class="p-4 pl-6"><span class="${posColors[p.pos]} text-white text-xs font-bold px-2 py-1 rounded w-12 inline-block text-center">${p.pos}</span></td>
                <td class="p-4 font-medium text-white">${p.name}</td>
                <td class="p-4 text-center font-bold text-green-400">${p.ovr}</td>
                <td class="p-4 text-right pr-6 text-yellow-400">€${p.value.toLocaleString()}</td>
                <td class="p-4"><button onclick="window.buyPlayer('${p.id}')" class="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded font-bold shadow transition">Mua</button></td>
            </tr>`;
    });
};
document.getElementById('refresh-market-btn').addEventListener('click', () => { generateMarketPlayers(); renderTransferMarket(); });

window.buyPlayer = async (marketId) => {
    const p = currentMarketList.find(x => x.id === marketId); if(!p) return;
    if(myBudget < p.value) { window.showToast("Không đủ ngân sách để mua cầu thủ này!"); return; }
    if(globalPlayersList.length >= 25) { window.showToast("Đội hình đã đầy (Tối đa 25 người)!"); return; }
    if(!confirm(`Xác nhận mua ${p.name} với giá €${p.value.toLocaleString()}?`)) return;

    try {
        myBudget -= p.value; updateBudgetDisplay();
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });

        const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players'));
        const playerData = { name: p.name, pos: p.pos, ovr: p.ovr, stats: p.stats, bonusStats: p.bonusStats, stamina: 100, value: p.value, isListed: false, itemsUsed: 0 };
        await setDoc(newPlayerRef, playerData);

        playerData.id = newPlayerRef.id; globalPlayersList.push(playerData); globalPlayersMap[playerData.id] = playerData;
        currentMarketList = currentMarketList.filter(x => x.id !== marketId);
        
        renderTransferMarket(); renderSquadList();
        window.showToast(`Đã ký hợp đồng thành công với ${p.name}!`, 'success');
    } catch(e) { window.showToast("Lỗi khi mua cầu thủ!"); }
};

window.toggleTransferListing = async () => {
    if(!currentlyViewingPlayerId) return;
    const p = globalPlayersMap[currentlyViewingPlayerId];
    const isListing = !p.isListed;
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { isListed: isListing }, { merge: true });
        p.isListed = isListing;
        window.openPlayerDetail(p.id); renderSquadList();
        window.showToast(isListing ? "Đã đưa lên Thị trường chuyển nhượng!" : "Đã gỡ khỏi Thị trường chuyển nhượng!", "success");
    } catch(e) { window.showToast("Lỗi cập nhật trạng thái!"); }
};

const generateAIOffers = () => {
    pendingOffers = [];
    const listedPlayers = globalPlayersList.filter(p => p.isListed);
    listedPlayers.forEach(p => {
        if(Math.random() < 0.7) {
            const offerValue = Math.floor(p.value * (0.8 + (Math.random() * 0.4)));
            pendingOffers.push({ id: 'offer_' + Date.now() + Math.random(), playerId: p.id, playerName: p.name, botName: BOT_CITY_NAMES[Math.floor(Math.random()*BOT_CITY_NAMES.length)] + " FC", amount: offerValue });
        }
    });
};

const renderOffers = () => {
    const container = document.getElementById('offers-list-container'); container.innerHTML = '';
    if(pendingOffers.length === 0) {
        container.innerHTML = '<div class="text-slate-400 text-center py-8 border border-dashed border-slate-700 rounded-xl">Chưa có lời đề nghị nào. Hãy rao bán cầu thủ và thi đấu thêm 1 vòng để thu hút CLB khác.</div>';
        return;
    }
    pendingOffers.forEach(o => {
        container.innerHTML += `
            <div class="bg-slate-900 border border-slate-700 p-4 rounded-xl flex justify-between items-center shadow-lg">
                <div><div class="font-bold text-white mb-1">Đề nghị mua: <span class="text-green-400">${o.playerName}</span></div><div class="text-sm text-slate-400">Từ đối tác: ${o.botName}</div></div>
                <div class="text-right">
                    <div class="text-xl font-bold text-yellow-400 mb-2">€${o.amount.toLocaleString()}</div>
                    <div class="flex gap-2 justify-end">
                        <button onclick="window.acceptOffer('${o.id}')" class="bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-1.5 rounded font-bold shadow">Chấp nhận</button>
                        <button onclick="window.rejectOffer('${o.id}')" class="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1.5 rounded font-bold shadow">Từ chối</button>
                    </div>
                </div>
            </div>`;
    });
};

window.acceptOffer = async (offerId) => {
    const offer = pendingOffers.find(x => x.id === offerId); if(!offer) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', offer.playerId));
        
        myBudget += offer.amount; updateBudgetDisplay();
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
        
        globalPlayersList = globalPlayersList.filter(p => p.id !== offer.playerId); delete globalPlayersMap[offer.playerId];
        startingXI = startingXI.map(id => id === offer.playerId ? null : id);
        pendingOffers = pendingOffers.filter(x => x.id !== offerId);
        
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'tactics'), { formation: currentFormation, startingXI: startingXI });
        
        renderOffers(); renderSquadList(); renderPitch();
        window.showToast(`Đã bán ${offer.playerName} thành công!`, 'success');
    } catch(e) { window.showToast("Lỗi khi bán cầu thủ!"); }
};
window.rejectOffer = (offerId) => { pendingOffers = pendingOffers.filter(x => x.id !== offerId); renderOffers(); };


// ================= MODULE 7: LEAGUE & MATCH LOGIC =================

// HÀM MỚI: Xử lý tiêu hao và hồi phục thể lực sau trận đấu
const updateSquadStamina = async () => {
    const batch = writeBatch(db);
    globalPlayersList.forEach(p => {
        if (startingXI.includes(p.id)) {
            // Đá chính: Giảm 15-25%
            p.stamina = Math.max(0, p.stamina - (Math.floor(Math.random() * 11) + 15));
        } else {
            // Dự bị: Hồi phục 25-35%
            p.stamina = Math.min(100, p.stamina + (Math.floor(Math.random() * 11) + 25));
        }
        const pRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id);
        batch.update(pRef, { stamina: p.stamina });
    });
    await batch.commit();
    renderSquadList();
    renderPitch();
};

const sortStandings = () => {
    leagueState.standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.gf - a.ga; const gdB = b.gf - b.ga;
        if (gdB !== gdA) return gdB - gdA;
        return b.gf - a.gf;
    });
};

const renderLeagueView = () => {
    sortStandings();

    if (leagueState.currentRound > 31) {
        document.getElementById('match-setup').classList.add('hidden');
        document.getElementById('season-end-panel').classList.remove('hidden');
        
        let userRank = leagueState.standings.findIndex(t => t.isUser) + 1;
        let prize = getPrizeMoney(userRank);
        document.getElementById('final-rank').textContent = userRank;
        document.getElementById('final-prize').textContent = `€${prize.toLocaleString()}`;

        const summaryBoard = document.getElementById('season-summary-board');
        let goldTeam = leagueState.standings[0];
        let silverTeam = leagueState.standings[10];
        let bronzeTeam = leagueState.standings[20];

        let goldBoard = `<div class="flex-1"><h4 class="font-bold text-yellow-400 mb-2 border-b border-slate-700 pb-1">🏆 Các Nhà Vô Địch</h4>`;
        goldBoard += `<div class="text-yellow-400">🥇 Cúp Vàng: <span class="font-bold">${goldTeam?.name || 'N/A'}</span> (Hạng 1)</div>`;
        goldBoard += `<div class="text-slate-300">🥈 Đĩa Bạc: <span class="font-bold">${silverTeam?.name || 'N/A'}</span> (Hạng 11)</div>`;
        goldBoard += `<div class="text-orange-400">🥉 Khiên Đồng: <span class="font-bold">${bronzeTeam?.name || 'N/A'}</span> (Hạng 21)</div></div>`;

        let botStandings = leagueState.standings.filter(t => !t.isUser);
        let relegatedBots = botStandings.slice(-2);
        
        if(!leagueState.promotedBots || leagueState.promotedBots.length === 0) {
            let currentNames = leagueState.standings.map(t => t.name.replace(' FC', ''));
            let availableReserves = RESERVE_BOT_NAMES.filter(name => !currentNames.includes(name));
            availableReserves.sort(() => Math.random() - 0.5);
            leagueState.promotedBots = [ { name: availableReserves[0] + " FC" }, { name: availableReserves[1] + " FC" } ];
            setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        }

        let relegateBoard = `<div class="flex-1"><h4 class="font-bold text-red-400 mb-2 border-b border-slate-700 pb-1">🔄 Lên / Xuống Hạng</h4>`;
        relegateBoard += `<div class="text-red-400">🔻 Rớt hạng: ${relegatedBots.map(b=>b.name).join(', ')}</div>`;
        relegateBoard += `<div class="text-green-400 mt-1">🔺 Thăng hạng: ${leagueState.promotedBots.map(b=>b.name).join(', ')}</div></div>`;

        summaryBoard.innerHTML = goldBoard + relegateBoard;

        const friendlyBtn = document.getElementById('play-friendly-btn');
        const playedFriendly = leagueState.friendlyMatchesPlayed || 0;
        
        if (playedFriendly >= 5) {
            friendlyBtn.disabled = true;
            friendlyBtn.classList.add('opacity-50', 'cursor-not-allowed');
            friendlyBtn.textContent = `⚽ Hết lượt Giao Hữu (5/5)`;
        } else {
            friendlyBtn.disabled = false;
            friendlyBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            friendlyBtn.textContent = `⚽ Đá Giao Hữu (+Tài Trợ) (${playedFriendly}/5)`;
        }

    } else {
        document.getElementById('match-setup').classList.remove('hidden');
        document.getElementById('season-end-panel').classList.add('hidden');
        
        document.getElementById('league-current-round').textContent = leagueState.currentRound;
        document.getElementById('league-home-name').textContent = myClubName;
        
        const opponentId = leagueState.schedule[leagueState.currentRound - 1];
        const opponent = leagueState.standings.find(t => t.id === opponentId);
        if(opponent) document.getElementById('league-away-name').textContent = opponent.name;
    }

    const tbody = document.getElementById('league-table-body'); tbody.innerHTML = '';
    leagueState.standings.forEach((team, index) => {
        const rank = index + 1; const gd = team.gf - team.ga;
        let rowClass = "hover:bg-slate-700/30 transition-colors ";
        if (team.isUser) rowClass += "bg-green-900/30 font-bold "; 
        
        if (rank <= 2) rowClass += "rank-gold";
        else if (rank === 11 || rank === 12) rowClass += "rank-silver";
        else if (rank === 21 || rank === 22) rowClass += "rank-bronze";
        else if (rank >= 31) rowClass += "rank-relegate";
        
        tbody.innerHTML += `
            <tr class="${rowClass}">
                <td class="p-3 pl-6 font-mono text-slate-400">${rank}</td>
                <td class="p-3 ${team.isUser ? 'text-green-400' : 'text-white'}">${team.name}</td>
                <td class="p-3 text-center text-slate-400">${team.played}</td>
                <td class="p-3 text-center text-slate-300">${team.won}</td>
                <td class="p-3 text-center text-slate-300">${team.drawn}</td>
                <td class="p-3 text-center text-slate-300">${team.lost}</td>
                <td class="p-3 text-center ${gd > 0 ? 'text-green-400' : gd < 0 ? 'text-red-400' : 'text-slate-400'}">${gd > 0 ? '+'+gd : gd}</td>
                <td class="p-3 text-center font-bold text-white text-base">${team.points}</td>
            </tr>`;
    });
};

let activeOpponent = null;

const startMatchEngine = (opponent, isFriendly) => {
    if(startingXI.includes(null) || teamPower.OVR === 0) { window.showToast("Vui lòng xếp đủ 11 cầu thủ vào Sân (Tab Chiến Thuật)!"); return; }
    
    // Check nếu thể lực đội quá thấp
    let lowStaminaCount = startingXI.filter(id => globalPlayersMap[id] && globalPlayersMap[id].stamina < 30).length;
    if (lowStaminaCount >= 3) {
        window.showToast("Cảnh báo: Bạn có nhiều cầu thủ đang cạn kiệt thể lực (dưới 30%). Hãy cân nhắc thay người!", "error");
    }
    
    document.getElementById('match-setup').classList.add('hidden');
    document.getElementById('season-end-panel').classList.add('hidden');
    document.getElementById('league-table-container').classList.add('hidden');
    document.getElementById('match-live').classList.remove('hidden');
    document.getElementById('finish-match-btn').classList.add('hidden');

    let minute = 0; let homeScore = 0; let awayScore = 0;
    
    const logContainer = document.getElementById('match-logs-container');
    logContainer.innerHTML = `<div class="text-slate-400 text-center text-sm py-2">Trọng tài thổi còi bắt đầu trận đấu ${isFriendly ? "Giao Hữu" : ""}!</div>`;

    document.getElementById('live-home-name').textContent = myClubName;
    document.getElementById('live-away-name').textContent = opponent.name;
    document.getElementById('score-home').textContent = "0";
    document.getElementById('score-away').textContent = "0";
    document.getElementById('match-minute').textContent = "0";

    const homeOVR = teamPower.OVR;
    const awayOVR = opponent.ovr;

    const matchTimer = setInterval(() => {
        minute += Math.floor(Math.random() * 4) + 2; 
        if(minute >= 90) minute = 90;
        document.getElementById('match-minute').textContent = minute;

        const rng = Math.random() * 100;
        const homeGoalChance = (homeOVR / (homeOVR + awayOVR)) * 14; 
        const awayGoalChance = (awayOVR / (awayOVR + homeOVR)) * 14;

        if (rng < homeGoalChance) {
            homeScore++;
            document.getElementById('score-home').textContent = homeScore;
            logContainer.innerHTML += `<div class="text-green-400 font-bold bg-green-900/20 p-2 rounded border border-green-900/50">⚽ Phút ${minute}': VÀOOOO! Một pha dứt điểm quá đẳng cấp của ${myClubName.toUpperCase()}!</div>`;
        } else if (rng > 100 - awayGoalChance) {
            awayScore++;
            document.getElementById('score-away').textContent = awayScore;
            logContainer.innerHTML += `<div class="text-red-400 font-bold bg-red-900/20 p-2 rounded border border-red-900/50">⚽ Phút ${minute}': BÀN THẮNG CHO ${opponent.name.toUpperCase()}! Hàng thủ chủ nhà mắc sai lầm!</div>`;
        } else if (rng > 40 && rng < 50) {
            logContainer.innerHTML += `<div class="text-slate-400 italic px-2">⏱ Phút ${minute}': Thế trận đang giằng co quyết liệt ở khu vực giữa sân...</div>`;
        } else if (rng > 70 && rng < 75) {
            logContainer.innerHTML += `<div class="text-yellow-400 px-2">Phút ${minute}': 🧤 Nguy hiểm! Thủ môn cản phá xuất thần một cú sút xa!</div>`;
        }
        logContainer.scrollTop = logContainer.scrollHeight; 

        if (minute >= 90) {
            clearInterval(matchTimer);
            logContainer.innerHTML += '<div class="text-yellow-400 font-bold text-center mt-4 text-xl uppercase">Hết giờ! Trận đấu kết thúc!</div>';
            
            let matchFee = isFriendly ? 0 : -50000;
            let perfBonus = (homeScore > awayScore) ? (isFriendly ? 50000 : 300000) : (homeScore === awayScore ? (isFriendly ? 20000 : 100000) : 0);
            let cleanSheet = (awayScore === 0) ? (isFriendly ? 20000 : 150000) : 0;
            let bigWin = (homeScore - awayScore >= 3) ? (isFriendly ? 20000 : 200000) : 0;
            let sponsorMoney = isFriendly ? 100000 : 0;
            
            let totalEarnings = matchFee + perfBonus + cleanSheet + bigWin + sponsorMoney;

            logContainer.innerHTML += `
                <div class="mt-4 mb-2 bg-slate-800 border border-yellow-500/50 p-4 rounded-xl text-sm animate-log shadow-lg">
                    <div class="font-bold text-yellow-400 mb-3 border-b border-slate-700 pb-2 text-center">📊 TỔNG KẾT TÀI CHÍNH TRẬN ĐẤU</div>
                    <div class="flex justify-between text-slate-300 py-1"><span>Phí tổ chức trận:</span><span class="text-red-400">${matchFee < 0 ? '- €50,000' : 'Miễn phí'}</span></div>
                    ${sponsorMoney ? `<div class="flex justify-between text-slate-300 py-1"><span>Tiền tài trợ giao hữu:</span><span class="text-green-400">+ €${sponsorMoney.toLocaleString()}</span></div>` : ''}
                    ${perfBonus ? `<div class="flex justify-between text-slate-300 py-1"><span>Thưởng thành tích:</span><span class="text-green-400">+ €${perfBonus.toLocaleString()}</span></div>` : ''}
                    ${cleanSheet ? `<div class="flex justify-between text-slate-300 py-1"><span>Thưởng sạch lưới:</span><span class="text-green-400">+ €${cleanSheet.toLocaleString()}</span></div>` : ''}
                    ${bigWin ? `<div class="flex justify-between text-slate-300 py-1"><span>Thưởng thắng đậm (>= 3 bàn):</span><span class="text-green-400">+ €${bigWin.toLocaleString()}</span></div>` : ''}
                    <div class="flex justify-between font-bold mt-3 pt-3 border-t border-slate-700 text-lg"><span>Tổng nhận:</span><span class="${totalEarnings > 0 ? 'text-green-400' : 'text-red-400'}">${totalEarnings > 0 ? '+' : ''} €${totalEarnings.toLocaleString()}</span></div>
                </div>
            `;
            logContainer.scrollTop = logContainer.scrollHeight;

            const finishBtn = document.getElementById('finish-match-btn');
            finishBtn.classList.remove('hidden');
            finishBtn.onclick = () => {
                if(isFriendly) finishFriendlyMatch(totalEarnings);
                else finishLeagueRound(homeScore, awayScore, totalEarnings);
            };
        }
    }, 300); 
};

document.getElementById('start-league-match-btn').addEventListener('click', () => {
    const opponentId = leagueState.schedule[leagueState.currentRound - 1];
    activeOpponent = leagueState.standings.find(t => t.id === opponentId);
    startMatchEngine(activeOpponent, false);
});

document.getElementById('play-friendly-btn').addEventListener('click', () => {
    if ((leagueState.friendlyMatchesPlayed || 0) >= 5) {
        window.showToast("Bạn đã hết lượt đá giao hữu trong kỳ nghỉ này! Hãy bắt đầu mùa giải mới.");
        return;
    }
    
    activeOpponent = leagueState.standings[Math.floor(Math.random() * leagueState.standings.length)];
    while (activeOpponent.isUser) { activeOpponent = leagueState.standings[Math.floor(Math.random() * leagueState.standings.length)]; }
    startMatchEngine(activeOpponent, true);
});

const finishLeagueRound = async (userScore, botScore, totalEarnings) => {
    const btn = document.getElementById('finish-match-btn');
    btn.textContent = "Đang lưu kết quả..."; btn.disabled = true;

    try {
        let currentTotalEarnings = totalEarnings;
        
        let userTeam = leagueState.standings.find(t => t.isUser);
        let botTeam = leagueState.standings.find(t => t.id === activeOpponent.id);

        userTeam.played++; botTeam.played++;
        userTeam.gf += userScore; botTeam.gf += botScore;
        userTeam.ga += botScore; botTeam.ga += userScore;

        if (userScore > botScore) { userTeam.won++; botTeam.lost++; userTeam.points += 3; }
        else if (userScore < botScore) { botTeam.won++; userTeam.lost++; botTeam.points += 3; }
        else { userTeam.drawn++; botTeam.drawn++; userTeam.points += 1; botTeam.points += 1; }

        let playedIds = [userTeam.id, botTeam.id];
        let remainingBots = leagueState.standings.filter(t => !playedIds.includes(t.id));
        remainingBots.sort(() => Math.random() - 0.5); 
        
        for(let i=0; i < remainingBots.length; i+=2) {
            if (i+1 >= remainingBots.length) break;
            let t1 = remainingBots[i]; let t2 = remainingBots[i+1];
            let diff = t1.ovr - t2.ovr;
            let t1Score = 0, t2Score = 0; let matchRng = Math.random();
            
            if (diff > 5) { t1Score = Math.floor(Math.random() * 3) + 1; t2Score = Math.floor(Math.random() * 2); }
            else if (diff < -5) { t2Score = Math.floor(Math.random() * 3) + 1; t1Score = Math.floor(Math.random() * 2); }
            else {
                if(matchRng < 0.4) { t1Score = Math.floor(Math.random() * 2) + 1; t2Score = 0; }
                else if(matchRng < 0.8) { t2Score = Math.floor(Math.random() * 2) + 1; t1Score = 0; }
                else { t1Score = Math.floor(Math.random() * 2); t2Score = t1Score; }
            }

            t1.played++; t2.played++; t1.gf += t1Score; t2.gf += t2Score; t1.ga += t2Score; t2.ga += t1Score;
            if(t1Score > t2Score) { t1.won++; t2.lost++; t1.points += 3; }
            else if(t1Score < t2Score) { t2.won++; t1.lost++; t2.points += 3; }
            else { t1.drawn++; t2.drawn++; t1.points += 1; t2.points += 1; }
        }

        leagueState.currentRound++;
        
        let endSeasonMessage = "";
        if (leagueState.currentRound === 32) {
            sortStandings();
            let finalRank = leagueState.standings.findIndex(t => t.isUser) + 1;
            let seasonPrize = getPrizeMoney(finalRank);
            currentTotalEarnings += seasonPrize; 
            endSeasonMessage = `MÙA GIẢI ĐÃ KẾT THÚC! Bạn đứng thứ ${finalRank} và nhận được €${seasonPrize.toLocaleString()} tiền thưởng!`;
            leagueState.promotedBots = [];
        }

        myBudget += currentTotalEarnings;
        updateBudgetDisplay();
        
        await updateSquadStamina(); // Trừ/Hồi phục thể lực toàn đội
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        
        generateAIOffers();

        if(endSeasonMessage) window.showToast(endSeasonMessage, "success");
        else window.showToast("Đã lưu kết quả trận đấu. Các cầu thủ đá chính bị sụt giảm thể lực!", "success");
        
        btn.textContent = "Kết thúc & Lưu kết quả"; btn.disabled = false;
        document.getElementById('match-live').classList.add('hidden');
        document.getElementById('league-table-container').classList.remove('hidden');
        renderLeagueView();
        
    } catch (e) {
        window.showToast("Lỗi lưu kết quả: " + e.message);
        btn.textContent = "Kết thúc & Lưu kết quả"; btn.disabled = false;
    }
};

const finishFriendlyMatch = async (totalEarnings) => {
    const btn = document.getElementById('finish-match-btn');
    btn.textContent = "Đang lưu..."; btn.disabled = true;
    try {
        myBudget += totalEarnings; updateBudgetDisplay();
        leagueState.friendlyMatchesPlayed = (leagueState.friendlyMatchesPlayed || 0) + 1;

        await updateSquadStamina(); // Trừ/Hồi phục thể lực toàn đội
        const batch = writeBatch(db);
        batch.set(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });
        batch.set(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        await batch.commit();
        
        btn.textContent = "Kết thúc & Lưu kết quả"; btn.disabled = false;
        document.getElementById('match-live').classList.add('hidden');
        document.getElementById('season-end-panel').classList.remove('hidden');
        document.getElementById('league-table-container').classList.remove('hidden');
        window.showToast("Hoàn tất trận giao hữu! Thể lực cầu thủ đã thay đổi.", "success");
        renderLeagueView(); 
        
    } catch (e) {
         window.showToast("Lỗi: " + e.message);
         btn.textContent = "Kết thúc & Lưu kết quả"; btn.disabled = false;
    }
};

document.getElementById('start-new-season-btn').addEventListener('click', async () => {
    const btn = document.getElementById('start-new-season-btn'); const oldText = btn.textContent;
    btn.textContent = "Đang thiết lập..."; btn.disabled = true;
    
    try {
        let botStandings = leagueState.standings.filter(t => !t.isUser);
        let relegatedBotIds = botStandings.slice(-2).map(b => b.id);
        
        leagueState.standings = leagueState.standings.filter(t => !relegatedBotIds.includes(t.id));
        
        if (leagueState.promotedBots && leagueState.promotedBots.length === 2) {
            leagueState.promotedBots.forEach(b => {
                const ovr = Math.floor(Math.random() * 20) + 60;
                leagueState.standings.push({
                    id: `bot_${Date.now()}_${Math.random()}`, name: b.name, isUser: false, ovr: ovr, 
                    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 
                });
            });
        }
        leagueState.promotedBots = [];
        leagueState.currentRound = 1;
        leagueState.friendlyMatchesPlayed = 0; 
        
        leagueState.standings.forEach(t => {
            t.played = 0; t.won = 0; t.drawn = 0; t.lost = 0; t.gf = 0; t.ga = 0; t.points = 0;
        });
        
        leagueState.schedule = leagueState.standings.filter(t => !t.isUser).map(b => b.id).sort(() => Math.random() - 0.5);
        
        // Nghỉ hết mùa giải: Hồi phục 100% thể lực cho toàn đội
        const batch = writeBatch(db);
        globalPlayersList.forEach(p => {
            p.stamina = 100;
            batch.update(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { stamina: 100 });
        });
        await batch.commit();

        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'league', 'state'), leagueState);
        
        renderSquadList();
        renderPitch();
        renderLeagueView();
        window.showToast("🎉 Mùa giải mới! Các cầu thủ đã hồi phục 100% thể lực sau kỳ nghỉ.", "success");
    } catch(e) { window.showToast("Lỗi: " + e.message); }
    
    btn.textContent = oldText; btn.disabled = false;
});

// ================= MODULE 8: STORE (CỬA HÀNG VẬT PHẨM) =================
const renderStore = () => {
    const container = document.getElementById('store-items-container');
    container.innerHTML = '';
    STORE_ITEMS.forEach(item => {
        container.innerHTML += `
            <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-lg flex flex-col justify-between hover:border-indigo-500/50 transition-colors">
                <div>
                    <div class="text-4xl mb-3">${item.icon}</div>
                    <h3 class="text-xl font-bold text-white mb-1">${item.name}</h3>
                    <p class="text-slate-400 text-sm mb-4">${item.desc}</p>
                </div>
                <div>
                    <div class="text-yellow-400 font-bold mb-3 text-lg">€${item.price.toLocaleString()}</div>
                    <button onclick="window.buyItem('${item.id}')" class="w-full py-2 ${item.type === 'gacha' ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-indigo-600 hover:bg-indigo-500'} text-white font-bold rounded-lg transition shadow-lg">
                        ${item.type === 'gacha' ? 'Mở Gói Ngay' : 'Mua & Sử dụng'}
                    </button>
                </div>
            </div>
        `;
    });
};

window.buyItem = async (itemId) => {
    const item = STORE_ITEMS.find(x => x.id === itemId); if (!item) return;

    if (myBudget < item.price) { window.showToast("Bạn không đủ tiền để mua vật phẩm này!", "error"); return; }

    if (item.type === 'gacha') {
        if(globalPlayersList.length >= 25) { window.showToast("Đội hình đã đầy (Tối đa 25 người)!"); return; }
        if (confirm(`Xác nhận chi €${item.price.toLocaleString()} để mở gói cầu thủ ngẫu nhiên?`)) { await rollGacha(item.price); }
    } else {
        currentItemToApply = item; document.getElementById('apply-item-name').textContent = item.name;
        const container = document.getElementById('apply-item-list-container'); container.innerHTML = '';
        
        let sortedPlayers = [...globalPlayersList].sort((a,b) => b.ovr - a.ovr);
        sortedPlayers.forEach(p => {
            const usedCount = p.itemsUsed || 0;
            const canUse = usedCount < 5;
            
            container.innerHTML += `
                <div class="flex justify-between items-center p-3 hover:bg-slate-700/50 border-b border-slate-700/50 rounded ${canUse ? 'cursor-pointer' : 'opacity-50 grayscale'}" ${canUse ? `onclick="window.applyItemToPlayer('${p.id}')"` : ''}>
                    <div>
                        <div class="text-white font-medium">${p.name}</div>
                        <div class="text-xs text-indigo-300">Đã dùng: ${usedCount}/5</div>
                    </div>
                    <div class="text-right">
                        <div class="text-green-400 font-bold">OVR ${p.ovr}</div>
                        ${!canUse ? `<div class="text-red-400 text-xs">Đã đạt giới hạn</div>` : ''}
                    </div>
                </div>
            `;
        });
        document.getElementById('apply-item-modal').classList.remove('hidden');
    }
};

window.closeApplyItemModal = () => { document.getElementById('apply-item-modal').classList.add('hidden'); currentItemToApply = null; };

window.applyItemToPlayer = async (playerId) => {
    const p = globalPlayersMap[playerId]; const item = currentItemToApply;
    if (!p || !item) return;
    if (myBudget < item.price) { window.showToast("Bạn không đủ tiền!", "error"); return; }

    if (confirm(`Sử dụng [${item.name}] cho ${p.name} với giá €${item.price.toLocaleString()}?`)) {
        try {
            window.closeApplyItemModal();
            
            myBudget -= item.price; updateBudgetDisplay();
            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });

            if (!p.bonusStats) p.bonusStats = { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 };

            if (item.type === 'stat') {
                p.stats[item.stat] += item.amount; p.bonusStats[item.stat] = (p.bonusStats[item.stat] || 0) + item.amount;
                if(p.stats[item.stat] > 99) { const excess = p.stats[item.stat] - 99; p.stats[item.stat] = 99; p.bonusStats[item.stat] -= excess; }
            } else if (item.type === 'stat_multi') {
                for (const [key, value] of Object.entries(item.stats)) {
                    p.stats[key] += value; p.bonusStats[key] = (p.bonusStats[key] || 0) + value;
                    if(p.stats[key] > 99) { const excess = p.stats[key] - 99; p.stats[key] = 99; p.bonusStats[key] -= excess; }
                }
            }

            p.ovr = recalculateOVR(p.pos, p.stats); p.value = p.ovr * 100000; p.itemsUsed = (p.itemsUsed || 0) + 1;

            await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'players', p.id), { 
                stats: p.stats, bonusStats: p.bonusStats, ovr: p.ovr, value: p.value, itemsUsed: p.itemsUsed 
            }, { merge: true });

            renderSquadList(); renderPitch();
            window.showToast(`Đã sử dụng vật phẩm thành công! Chỉ số OVR mới của ${p.name} là ${p.ovr}.`, 'success');
        } catch(e) { window.showToast("Lỗi khi dùng vật phẩm: " + e.message); }
    }
};

const rollGacha = async (price) => {
    try {
        myBudget -= price; updateBudgetDisplay();
        await setDoc(doc(db, 'artifacts', appId, 'users', currentUserId, 'profile', 'info'), { budget: myBudget }, { merge: true });

        const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
        const name = "Young " + FOREIGN_NAMES[Math.floor(Math.random() * FOREIGN_NAMES.length)];
        const ovr = Math.floor(Math.random() * 16) + 60; const val = ovr * 70000; 
        let stats = { PAC: ovr+2, SHO: ovr-2, PAS: ovr+1, DRI: ovr, DEF: ovr, PHY: ovr }; 
        
        const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', currentUserId, 'players'));
        const playerData = { 
            name: name, pos: pos, ovr: recalculateOVR(pos, stats), stats: stats, 
            bonusStats: { PAC:0, SHO:0, PAS:0, DRI:0, DEF:0, PHY:0 },
            stamina: 100, value: val, isListed: false, itemsUsed: 0 
        };
        await setDoc(newPlayerRef, playerData);

        playerData.id = newPlayerRef.id; globalPlayersList.push(playerData); globalPlayersMap[playerData.id] = playerData;
        
        renderSquadList();
        window.showToast(`Tuyệt vời! Bạn vừa mở ra cầu thủ trẻ ${name} (OVR ${playerData.ovr}) từ Gói Vô Danh!`, 'success');
    } catch (e) { window.showToast("Lỗi khi mở gói cầu thủ: " + e.message); }
};
