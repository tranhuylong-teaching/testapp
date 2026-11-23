import { auth, db, appId, VN_CLUBS_POOL, recalculateOVR, generatePlayerName } from './firebase-config.js';
import { showLoading, hideLoading, showToast } from './ui-helpers.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { gameState, TABS, toggleNavLock, playHaptic, updateHeaderDisplay, calcTeamPower, checkUnreadNews, pushNews } from './state.js';
import { renderSquadList, openPlayerDetail, closeDetailModal, openFuseModal, closeFuseModal, executeFuse, renderPitch, openBenchSelect, closeBenchSelect, assignPlayerToSlot, removePlayerFromSlot, initSquadTacticsListeners } from './squad-tactics.js';
import { renderTransferMarket, makeBuyOffer, listPlayerForSale, terminateContract, renderStore, buyItem, flipGachaCard, closeGachaModal, closeApplyItemModal, applyItemToPlayer, initMarketStoreListeners } from './market-store.js';
import { renderFacilities, upgradeFacility, assignToFacility, removeFromFacility, claimScoutedPlayer, renderStadium, openStaffMarket, closeStaffMarket, renderStaffList, hireStaff, fireStaff } from './facilities-staff.js';
import { renderLeagueView, startMatchEngine, initMatchEngineListeners } from './match-engine.js';
import { syncToLeaderboard, renderPvpView, quickMatchPvp, challengePvpOpponent } from './pvp.js';

let rankChartInstance = null;
let isLogin = true;

// Gắn các hàm lên window để phục vụ các sự kiện onclick trong HTML
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.playHaptic = playHaptic;
window.toggleNavLock = toggleNavLock;
window.pushNews = pushNews;

window.switchView = switchView;
window.openSubView = openSubView;
window.closeSubView = closeSubView;
window.saveSettings = saveSettings;
window.resetGameData = resetGameData;
window.generateNewQuest = generateNewQuest;

window.renderSquadList = renderSquadList;
window.openPlayerDetail = openPlayerDetail;
window.closeDetailModal = closeDetailModal;
window.openFuseModal = openFuseModal;
window.closeFuseModal = closeFuseModal;
window.executeFuse = executeFuse;
window.renderPitch = renderPitch;
window.openBenchSelect = openBenchSelect;
window.closeBenchSelect = closeBenchSelect;
window.assignPlayerToSlot = assignPlayerToSlot;
window.removePlayerFromSlot = removePlayerFromSlot;

window.makeBuyOffer = makeBuyOffer;
window.listPlayerForSale = listPlayerForSale;
window.terminateContract = terminateContract;
window.renderStore = renderStore;
window.buyItem = buyItem;
window.flipGachaCard = flipGachaCard;
window.closeGachaModal = closeGachaModal;
window.closeApplyItemModal = closeApplyItemModal;
window.applyItemToPlayer = applyItemToPlayer;

window.renderFacilities = renderFacilities;
window.upgradeFacility = upgradeFacility;
window.assignToFacility = assignToFacility;
window.removeFromFacility = removeFromFacility;
window.claimScoutedPlayer = claimScoutedPlayer;
window.renderStadium = renderStadium;
window.openStaffMarket = openStaffMarket;
window.closeStaffMarket = closeStaffMarket;
window.renderStaffList = renderStaffList;
window.hireStaff = hireStaff;
window.fireStaff = fireStaff;

window.startMatchEngine = startMatchEngine;
window.renderPvpView = renderPvpView;
window.quickMatchPvp = quickMatchPvp;
window.challengePvpOpponent = challengePvpOpponent;

export function renderClubDashboard() {
    let userTeam = gameState.leagueState.standings.find(function(t) { return t.isUser; });
    if (!userTeam) return;

    if (document.getElementById('dash-budget')) document.getElementById('dash-budget').textContent = `€${(gameState.myBudget / 1000000).toFixed(2)}M`;
    if (document.getElementById('dash-fame')) document.getElementById('dash-fame').textContent = gameState.myFame;
    if (document.getElementById('dash-record')) document.getElementById('dash-record').textContent = `${userTeam.won}T - ${userTeam.drawn}H - ${userTeam.lost}B`;
    if (document.getElementById('dash-points')) document.getElementById('dash-points').textContent = userTeam.points;

    const sponsorContainer = document.getElementById('sponsor-events-list');
    if (sponsorContainer) {
        let questHtml = '';
        if (gameState.myQuest) {
            let percent = Math.min(100, (gameState.myQuest.progress / gameState.myQuest.target) * 100);
            questHtml = `
            <div class="bg-indigo-900/40 border border-indigo-500/50 p-3 rounded-lg mb-3 shadow-lg">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-indigo-300 font-bold text-[10px] md:text-xs uppercase">🎯 Hợp đồng ngắn hạn</span>
                    <span class="text-yellow-400 font-bold text-xs">Thưởng: €${gameState.myQuest.reward.toLocaleString()}</span>
                </div>
                <div class="text-white text-sm mb-2">${gameState.myQuest.desc} (<span class="text-green-400 font-bold">${gameState.myQuest.progress}/${gameState.myQuest.target}</span>)</div>
                <div class="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-700">
                    <div class="bg-gradient-to-r from-indigo-600 to-purple-500 h-full transition-all duration-500" style="width: ${percent}%"></div>
                </div>
            </div>`;
        }

        let sponsorNews = gameState.newsInbox.filter(function(n) {
            return n.title.toLowerCase().includes('tài trợ') ||
                n.title.toLowerCase().includes('tài chính') ||
                n.title.toLowerCase().includes('phạt') ||
                (n.isGood && n.title.includes('Bán'));
        });

        let newsHtml = sponsorNews.length === 0
            ? '<div class="text-center text-slate-500 italic mt-4 text-sm">Chưa có hoạt động dòng tiền nổi bật.</div>'
            : sponsorNews.slice(0, 4).map(function(n) {
                return `
                <div class="bg-slate-900/50 p-2.5 md:p-3 rounded-lg border-l-4 ${n.isGood ? 'border-green-500' : 'border-red-500'} mb-2">
                    <div class="font-bold ${n.isGood ? 'text-green-400' : 'text-red-400'} text-xs md:text-sm mb-0.5">${n.title}</div>
                    <div class="text-[10px] md:text-xs text-slate-300 leading-relaxed line-clamp-2">${n.message}</div>
                </div>`;
            }).join('');

        sponsorContainer.innerHTML = questHtml + newsHtml;
    }

    const chartCtx = document.getElementById('rankChart');
    if (!chartCtx) return;
    if (rankChartInstance) rankChartInstance.destroy();

    let labels = [];
    let rankData = gameState.leagueState.rankHistory || [];
    if (rankData.length === 0) {
        labels = ['Vòng 1'];
        let currentRank = gameState.leagueState.standings.findIndex(function(t) { return t.isUser; }) + 1;
        rankData = [currentRank];
    } else {
        labels = Array.from({ length: rankData.length }, function(_, i) { return `Vòng ${i + 1}`; });
    }

    rankChartInstance = new Chart(chartCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Thứ hạng',
                data: rankData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
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
                    reverse: true,
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

export function switchView(v) {
    closeSubView(false);
    TABS.forEach(function(id) {
        const vEl = document.getElementById(`view-${id}`);
        if (vEl) {
            vEl.classList.add('hidden');
            vEl.classList.remove('animate-fade-in-scale');
        }
        const nEl = document.getElementById(`nav-${id}`);
        if (nEl) nEl.className = "block px-4 py-3 hover:bg-slate-800 text-slate-300 rounded-lg border border-transparent";
        const mEl = document.getElementById(`nav-${id}-mob`);
        if (mEl) mEl.className = "flex flex-col items-center text-slate-400 hover:text-white transition-colors";
    });

    const viewV = document.getElementById(`view-${v}`);
    if (viewV) {
        viewV.classList.remove('hidden');
        void viewV.offsetWidth;
        viewV.classList.add('animate-fade-in-scale');
    }

    const aNav = document.getElementById(`nav-${v}`);
    if (aNav) aNav.className = "block px-4 py-3 bg-green-900/40 text-green-400 font-medium rounded-lg border border-green-900/50";
    const aMob = document.getElementById(`nav-${v}-mob`);
    if (aMob) aMob.className = "flex flex-col items-center text-green-400 transition-colors";

    if (v === 'club') renderClubDashboard();
    if (v === 'squad' && document.getElementById('squad-count')) {
        document.getElementById('squad-count').textContent = gameState.globalPlayersList.length;
    }
    if (v === 'pvp') renderPvpView();
    if (v === 'league') renderLeagueView();
    if (v === 'news') {
        renderNewsView();
        gameState.hasUnreadNews = false;
        checkUnreadNews();
    }
    if (v === 'settings' && document.getElementById('setting-club-name')) {
        document.getElementById('setting-club-name').value = gameState.myClubName;
        document.getElementById('setting-club-logo').value = gameState.myClubLogo;
        document.getElementById('setting-stadium-name').value = gameState.myStadiumName;
    }
}

export function openSubView(subViewId) {
    TABS.forEach(function(id) {
        const el = document.getElementById(`view-${id}`);
        if (el) el.classList.add('hidden');
    });

    const subEl = document.getElementById(`subview-${subViewId}`);
    if (subEl) {
        subEl.classList.remove('hidden', 'animate-fade-in-scale');
        void subEl.offsetWidth;
        subEl.classList.add('animate-fade-in-scale');
    }

    gameState.activeSubView = subViewId;

    if (subViewId === 'facilities') renderFacilities();
    if (subViewId === 'stadium') renderStadium();
    if (subViewId === 'squad-list') renderSquadList();
    if (subViewId === 'tactics') renderPitch();
    if (subViewId === 'market') {
        const tabTransfer = document.getElementById('tab-transfer-market');
        if (tabTransfer) tabTransfer.click();
        renderTransferMarket();
    }
}

export function closeSubView(returnToParent) {
    const shouldReturn = returnToParent === undefined ? true : returnToParent;
    if (!gameState.activeSubView) return;
    const prevSubView = gameState.activeSubView;
    const subEl = document.getElementById(`subview-${prevSubView}`);
    if (subEl) subEl.classList.add('hidden');

    gameState.activeSubView = null;

    if (shouldReturn) {
        if (['facilities', 'stadium', 'trophy'].includes(prevSubView)) switchView('club');
        else if (['squad-list', 'tactics', 'market'].includes(prevSubView)) switchView('squad');
    }
}

export async function saveSettings() {
    const newName = document.getElementById('setting-club-name').value.trim();
    const newLogo = document.getElementById('setting-club-logo').value.trim() || "🛡️";
    const newStadium = document.getElementById('setting-stadium-name').value.trim() || "Sân Nhà";

    if (!newName) { showToast("Tên không được bỏ trống!", "error"); return; }

    showLoading("ĐANG LƯU...");
    try {
        gameState.myClubName = newName;
        gameState.myClubLogo = newLogo;
        gameState.myStadiumName = newStadium;
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), {
            clubName: newName,
            logo: newLogo,
            stadiumName: newStadium
        }, { merge: true });

        let userTeam = gameState.leagueState.standings.find(function(t) { return t.isUser; });
        if (userTeam) {
            userTeam.name = newName;
            await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'league', 'state'), gameState.leagueState);
        }

        updateHeaderDisplay();
        syncToLeaderboard();
        if (gameState.activeSubView === 'stadium') renderStadium();
        showToast("Cập nhật thông tin thành công!", "success");
    } catch (e) {
        showToast("Lỗi lưu cài đặt!");
    } finally {
        hideLoading();
    }
}

export async function resetGameData() {
    const cf = prompt("Xác nhận XÓA TOÀN BỘ dữ liệu? (Gõ 'YES')");
    if (cf !== 'YES') return;
    showLoading("ĐANG XÓA...");
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { clubName: "", budget: 0 });
        location.reload();
    } catch (e) {
        hideLoading();
    }
}

export function renderNewsView() {
    const c = document.getElementById('news-container');
    if (!c) return;
    c.innerHTML = '';
    if (gameState.newsInbox.length === 0) {
        c.innerHTML = '<div class="text-center text-slate-500 text-sm mt-10 italic">Chưa có tin.</div>';
        return;
    }
    gameState.newsInbox.forEach(function(n) {
        const icon = n.isGood === true ? '✅' : (n.isGood === false ? '❌' : '📰');
        const borderColor = n.isGood === true ? 'border-green-500/50' : (n.isGood === false ? 'border-red-500/50' : 'border-blue-500/50');
        c.innerHTML += `<div class="bg-slate-800 p-4 rounded-xl border ${borderColor} shadow flex gap-3"><div class="text-2xl">${icon}</div><div><div class="flex justify-between items-center mb-1"><h4 class="font-bold text-white text-sm">${n.title}</h4><span class="text-[10px] text-slate-400">${n.time}</span></div><p class="text-xs text-slate-300 leading-relaxed">${n.message}</p></div></div>`;
    });
}

export function generateNewQuest() {
    const quests = [
        { type: 'goals', target: 5, progress: 0, reward: 500000, desc: 'Ghi tổng cộng 5 bàn thắng' },
        { type: 'cleansheet', target: 3, progress: 0, reward: 800000, desc: 'Giữ sạch lưới 3 trận' },
        { type: 'win', target: 3, progress: 0, reward: 1000000, desc: 'Giành 3 chiến thắng' },
        { type: 'score_first', target: 4, progress: 0, reward: 600000, desc: 'Ghi bàn mở tỷ số trong 4 trận' }
    ];
    gameState.myQuest = quests[Math.floor(Math.random() * quests.length)];
    setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { quest: gameState.myQuest }, { merge: true });
}

async function initLeagueData(uid, overrideName) {
    let bots = [];
    let availableClubs = [...VN_CLUBS_POOL].filter(function(c) { return c !== overrideName; });
    availableClubs.sort(function() { return Math.random() - 0.5; });
    for (let i = 0; i < 31; i++) {
        bots.push({
            id: `bot_${Date.now()}_${i}`, name: availableClubs[i], isUser: false,
            ovr: Math.floor(Math.random() * 20) + 60, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0
        });
    }
    gameState.leagueState = {
        currentRound: 1,
        standings: [...bots, {
            id: 'user', name: overrideName || gameState.myClubName, isUser: true,
            ovr: 0, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0
        }],
        schedule: bots.map(function(b) { return b.id; }).sort(function() { return Math.random() - 0.5; }),
        friendlyMatchesPlayed: 0,
        promotedBots: [],
        pendingBuys: [],
        pendingSells: [],
        rankHistory: []
    };
    await setDoc(doc(db, 'artifacts', appId, 'users', uid, 'league', 'state'), gameState.leagueState);
}

async function loadGameData(uid) {
    showLoading("ĐANG TẢI DỮ LIỆU...");
    try {
        const profileSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'profile', 'info'));
        if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            if (!profileData.clubName) {
                document.getElementById('init-club-modal').classList.remove('hidden');
                hideLoading();
                return;
            }
            gameState.myClubName = profileData.clubName;
            gameState.myClubLogo = profileData.logo || "🛡️";
            gameState.myStadiumName = profileData.stadiumName || "Sân Nhà";
            gameState.myQuest = profileData.quest || null;
            gameState.myBudget = profileData.budget || 10000000;
            gameState.myFame = profileData.fame || 30;
            gameState.myFacilities = profileData.facilities || {
                medical: 1, scouting: 1, training: 1, finance: 1, scoutingCooldown: 5,
                scoutedPlayer: null, medicalSlots: [], trainingSlots: [], pendingUpgrade: null
            };
            gameState.myStaff = profileData.staff || { coach: null, physio: null };
            gameState.myPvp = profileData.pvp || { points: 1000, wins: 0, losses: 0, draws: 0, dailyPlays: 0, lastPlayDate: '' };

            if (!gameState.myFacilities.medicalSlots) gameState.myFacilities.medicalSlots = [];
            if (!gameState.myFacilities.trainingSlots) gameState.myFacilities.trainingSlots = [];
            if (!gameState.myQuest) generateNewQuest();
            gameState.newsInbox = profileData.news || [];
            updateHeaderDisplay();

            const pSnap = await getDocs(collection(db, 'artifacts', appId, 'users', uid, 'players'));
            gameState.globalPlayersList = [];
            gameState.globalPlayersMap = {};
            pSnap.forEach(function(dDoc) {
                const d = dDoc.data();
                d.id = dDoc.id;
                d.itemsUsed = d.itemsUsed || 0;
                if (d.age === undefined) d.age = Math.floor(Math.random() * 10) + 20;
                if (!d.stats || isNaN(d.ovr)) {
                    const fallback = Math.floor(Math.random() * 20) + 50;
                    d.stats = { PAC: fallback, SHO: fallback, PAS: fallback, DRI: fallback, DEF: fallback, PHY: fallback };
                    d.ovr = recalculateOVR(d.pos, d.stats);
                    setDoc(dDoc.ref, { stats: d.stats, ovr: d.ovr }, { merge: true });
                }
                if (!d.bonusStats) d.bonusStats = { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 };
                if (d.stamina === undefined || isNaN(d.stamina)) d.stamina = 100;
                if (d.injury === undefined) d.injury = 0;
                gameState.globalPlayersList.push(d);
                gameState.globalPlayersMap[d.id] = d;
            });

            const tacSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'profile', 'tactics'));
            if (tacSnap.exists()) {
                const tData = tacSnap.data();
                gameState.currentFormation = tData.formation || '4-4-2';
                if (document.getElementById('formation-select')) document.getElementById('formation-select').value = gameState.currentFormation;
                gameState.startingXI = tData.startingXI || new Array(11).fill(null);
            } else if (gameState.globalPlayersList.length >= 11) {
                gameState.startingXI = new Array(11).fill(null);
                const layout = gameState.currentFormation.split('-').map(Number);
                layout.reverse();
                layout.push(1);
                let expPos = [];
                layout.forEach(function(count, idx) {
                    for (let i = 0; i < count; i++) expPos.push(['FWD', 'MID', 'DEF', 'GK'][idx]);
                });
                let usedIds = new Set();
                expPos.forEach(function(reqPos, index) {
                    let best = gameState.globalPlayersList.filter(function(p) {
                        return p.pos === reqPos && !usedIds.has(p.id);
                    }).sort(function(a, b) { return b.ovr - a.ovr; })[0];
                    if (best) {
                        gameState.startingXI[index] = best.id;
                        usedIds.add(best.id);
                    }
                });
                gameState.startingXI.forEach(function(val, index) {
                    if (!val) {
                        let best = gameState.globalPlayersList.filter(function(p) {
                            return !usedIds.has(p.id);
                        }).sort(function(a, b) { return b.ovr - a.ovr; })[0];
                        if (best) {
                            gameState.startingXI[index] = best.id;
                            usedIds.add(best.id);
                        }
                    }
                });
            }

            calcTeamPower();
            syncToLeaderboard();

            const leagueSnap = await getDoc(doc(db, 'artifacts', appId, 'users', uid, 'league', 'state'));
            if (leagueSnap.exists()) {
                gameState.leagueState = leagueSnap.data();
                if (!gameState.leagueState.promotedBots) gameState.leagueState.promotedBots = [];
                if (!gameState.leagueState.pendingBuys) gameState.leagueState.pendingBuys = [];
                if (!gameState.leagueState.pendingSells) gameState.leagueState.pendingSells = [];
                if (!gameState.leagueState.rankHistory) gameState.leagueState.rankHistory = [];
            } else {
                await initLeagueData(uid, gameState.myClubName);
            }

            switchView('club');
            if (gameState.leagueState.currentRound <= 31 && document.getElementById('quick-play-btn')) {
                document.getElementById('quick-play-btn').classList.remove('hidden');
            }
        } else {
            if (document.getElementById('init-club-modal')) document.getElementById('init-club-modal').classList.remove('hidden');
        }
    } catch (e) {
        showToast("Lỗi tải dữ liệu. F5 lại trang.");
    } finally {
        hideLoading();
    }
}

function initCoreListeners() {
    TABS.forEach(function(v) {
        document.getElementById(`nav-${v}`)?.addEventListener('click', function(e) {
            e.preventDefault();
            switchView(v);
        });
        document.getElementById(`nav-${v}-mob`)?.addEventListener('click', function(e) {
            e.preventDefault();
            switchView(v);
        });
    });

    document.getElementById('nav-settings-header')?.addEventListener('click', function(e) {
        e.preventDefault();
        switchView('settings');
    });

    document.getElementById('clear-news-btn')?.addEventListener('click', function() {
        gameState.newsInbox = [];
        renderNewsView();
        gameState.hasUnreadNews = false;
        checkUnreadNews();
    });

    document.getElementById('toggle-mode-btn')?.addEventListener('click', function(e) {
        e.preventDefault();
        isLogin = !isLogin;
        document.getElementById('auth-submit-btn').textContent = isLogin ? "Đăng Nhập" : "Đăng Ký";
        document.getElementById('auth-toggle-text').textContent = isLogin ? "Chưa có tài khoản?" : "Đã có tài khoản?";
    });

    document.getElementById('auth-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        document.getElementById('auth-submit-btn').disabled = true;
        document.getElementById('auth-error').classList.add('hidden');
        showLoading(isLogin ? "ĐANG XÁC THỰC..." : "ĐANG TẠO TÀI KHOẢN...");
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value);
            } else {
                await createUserWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value);
            }
        } catch (err) {
            document.getElementById('auth-error').textContent = err.message;
            document.getElementById('auth-error').classList.remove('hidden');
            document.getElementById('auth-submit-btn').disabled = false;
        } finally {
            hideLoading();
        }
    });

    document.getElementById('logout-btn')?.addEventListener('click', function() {
        showLoading("ĐANG ĐĂNG XUẤT...");
        signOut(auth).then(function() { location.reload(); });
    });

    document.getElementById('create-club-btn')?.addEventListener('click', async function() {
        const clubName = document.getElementById('club-name-input').value.trim();
        if (!clubName) { showToast("Vui lòng nhập tên CLB!"); return; }
        document.getElementById('create-club-btn').disabled = true;
        showLoading("ĐANG TẠO ĐỘI HÌNH...");
        try {
            const batch = writeBatch(db);
            const userRef = doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info');
            batch.set(userRef, {
                clubName: clubName, budget: 10000000, fame: 30,
                facilities: gameState.myFacilities, news: [], staff: gameState.myStaff
            });
            const INITIAL_POS = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'FWD'];
            const superstarIndex = Math.floor(Math.random() * 16);
            INITIAL_POS.forEach(function(pos, i) {
                const isStar = (i === superstarIndex);
                const ovr = isStar ? Math.floor(Math.random() * 21) + 75 : Math.floor(Math.random() * 16) + 30;
                let stats = { PAC: ovr, SHO: ovr, PAS: ovr, DRI: ovr, DEF: ovr, PHY: ovr };
                const playerRef = doc(collection(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players'));
                const age = isStar ? 26 : Math.floor(Math.random() * 8) + 18;
                batch.set(playerRef, {
                    name: generatePlayerName(isStar), pos: pos, ovr: recalculateOVR(pos, stats), stats: stats,
                    bonusStats: { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 },
                    stamina: 100, injury: 0, age: age, value: ovr * 100000, isListed: false, itemsUsed: 0
                });
            });
            await batch.commit();
            await initLeagueData(gameState.currentUserId, clubName);
            document.getElementById('init-club-modal').classList.add('hidden');
            showToast("Thành công!", "success");
            await loadGameData(gameState.currentUserId);
        } catch (e) {
            showToast("Lỗi tạo CLB!");
        } finally {
            hideLoading();
        }
    });
}

// Khởi chạy toàn bộ Listener của các module
initCoreListeners();
initSquadTacticsListeners();
initMarketStoreListeners();
initMatchEngineListeners();

onAuthStateChanged(auth, function(user) {
    if (user) {
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('dashboard-section').classList.remove('hidden');
        gameState.currentUserId = user.uid;
        if (document.getElementById('user-email-display')) {
            document.getElementById('user-email-display').textContent = user.email;
        }
        loadGameData(user.uid);
    } else {
        document.getElementById('dashboard-section').classList.add('hidden');
        document.getElementById('auth-container').classList.remove('hidden');
        document.getElementById('quick-play-btn').classList.add('hidden');
    }
});
