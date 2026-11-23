import { recalculateOVR } from './firebase-config.js';

export const gameState = {
    currentUserId: null,
    myClubName: "My Club",
    myClubLogo: "🛡️",
    myStadiumName: "Sân Nhà",
    myBudget: 0,
    myFame: 30,
    myQuest: null,
    myFacilities: {
        medical: 1,
        scouting: 1,
        training: 1,
        finance: 1,
        scoutingCooldown: 5,
        scoutedPlayer: null,
        medicalSlots: [],
        trainingSlots: [],
        pendingUpgrade: null
    },
    myStaff: { coach: null, physio: null },
    myPvp: { points: 1000, wins: 0, losses: 0, draws: 0, dailyPlays: 0, lastPlayDate: '' },
    serverLeaderboard: [],
    globalPlayersList: [],
    globalPlayersMap: {},
    currentFormation: '4-4-2',
    startingXI: new Array(11).fill(null),
    teamPower: { OVR: 0, ATT: 0, MID: 0, DEF: 0 },
    leagueState: {
        currentRound: 1,
        standings: [],
        schedule: [],
        friendlyMatchesPlayed: 0,
        promotedBots: [],
        pendingBuys: [],
        pendingSells: [],
        rankHistory: []
    },
    newsInbox: [],
    hasUnreadNews: false,
    currentMarketList: [],
    currentlyViewingPlayerId: null,
    currentSlotToFill: null,
    currentItemToApply: null,
    activeSubView: null,
    activeOpponent: null
};

export const TABS = ['club', 'squad', 'pvp', 'league', 'news', 'settings'];
export const POS_COLORS = { 'GK': 'bg-yellow-600', 'DEF': 'bg-blue-600', 'MID': 'bg-green-600', 'FWD': 'bg-red-600' };
export const POS_ORDER = { 'GK': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };

export const STORE_ITEMS = [
    { id: 'item_speed', name: 'Giày Khinh Công', icon: '👟', desc: '+3 Tốc độ', price: 500000, type: 'stat', stat: 'PAC', amount: 3 },
    { id: 'item_shoot', name: 'Bia Đỡ Đạn', icon: '🎯', desc: '+3 Dứt điểm', price: 600000, type: 'stat', stat: 'SHO', amount: 3 },
    { id: 'item_pass', name: 'Băng Đội', icon: '🧠', desc: '+3 Chuyền', price: 400000, type: 'stat', stat: 'PAS', amount: 3 },
    { id: 'item_def', name: 'Tạ Chân', icon: '🛡️', desc: '+3 PN, +2 Thể lực', price: 500000, type: 'stat_multi', stats: { DEF: 3, PHY: 2 } },
    { id: 'item_gacha', name: 'Lò Đào Tạo', icon: '⭐', desc: 'Tuyển 1 tài năng', price: 1000000, type: 'gacha' }
];

export const PLAYER_TRAITS = [
    { id: 'speedster', name: 'Máy Chạy', icon: '⚡', desc: 'Bứt tốc kinh hoàng, dễ tạo đột biến', pos: ['FWD', 'MID', 'DEF'] },
    { id: 'sniper', name: 'Đại Bác', icon: '🚀', desc: 'Sút xa sấm sét từ ngoài vòng cấm', pos: ['FWD', 'MID'] },
    { id: 'playmaker', name: 'Nhạc Trưởng', icon: '🎩', desc: 'Kiến tạo chọc khe ảo diệu', pos: ['MID'] },
    { id: 'wall', name: 'Hòn Đá Tảng', icon: '🧱', desc: 'Phòng ngự thép, đánh chặn xuất sắc', pos: ['DEF', 'MID'] },
    { id: 'spider', name: 'Người Nhện', icon: '🕸️', desc: 'Phản xạ cứu thua xuất thần', pos: ['GK'] },
    { id: 'fox', name: 'Cáo Vòng Cấm', icon: '🦊', desc: 'Đánh hơi bàn thắng, chớp thời cơ nhạy bén', pos: ['FWD'] }
];

export const STAFF_TIERS = {
    physio: [
        { id: 'p_c', name: 'Thực tập sinh Y tế', grade: 'C', autoSlots: 1, salary: 5000, desc: 'Tự đưa 1 người vào Y tế.', icon: '🩹' },
        { id: 'p_b', name: 'Bác sĩ Thể thao', grade: 'B', autoSlots: 2, salary: 15000, desc: 'Tự đưa 2 người vào Y tế.', icon: '🩺' },
        { id: 'p_a', name: 'Chuyên gia Phục hồi', grade: 'A', autoSlots: 3, salary: 35000, desc: 'Tự đưa 3 người vào Y tế. Giảm 50% tỷ lệ chấn thương.', icon: '⚕️' },
        { id: 'p_s', name: 'Bàn Tay Vàng', grade: 'S', autoSlots: 99, salary: 80000, desc: 'Lấp đầy Y tế. Toàn đội MIỄN NHIỄM chấn thương.', icon: '👼' }
    ],
    coach: [
        { id: 'c_c', name: 'HLV Phong trào', grade: 'C', autoSlots: 1, salary: 5000, desc: 'Tự đưa 1 tài năng trẻ đi Tập luyện.', icon: '📣' },
        { id: 'c_b', name: 'HLV Chiến thuật', grade: 'B', autoSlots: 2, salary: 15000, desc: 'Tự đưa 2 tài năng trẻ đi Tập luyện.', icon: '📋' },
        { id: 'c_a', name: 'Chuyên gia Đào tạo', grade: 'A', autoSlots: 3, salary: 35000, desc: 'Tự đưa 3 tài năng trẻ đi Tập luyện.', icon: '🎓' },
        { id: 'c_s', name: 'Bộ Não Thiên Tài', grade: 'S', autoSlots: 99, salary: 80000, desc: 'Lấp đầy Tập luyện. Tỷ lệ +2 OVR khi tập.', icon: '🧠' }
    ]
};

export const STADIUM_STATS = [
    { level: 1, name: 'Sân Tập Khu Phố', capacity: 2000, ticketPrice: 15, img: '🥅', upgradeCost: 0, upgradeTime: 0 },
    { level: 2, name: 'Sân Vận Động Địa Phương', capacity: 10000, ticketPrice: 20, img: '🏟️', upgradeCost: 5000000, upgradeTime: 2 },
    { level: 3, name: 'Sân Vận Động Tỉnh', capacity: 25000, ticketPrice: 25, img: '🏟️', upgradeCost: 15000000, upgradeTime: 4 },
    { level: 4, name: 'Sân Vận Động Quốc Gia', capacity: 50000, ticketPrice: 35, img: '🏟️', upgradeCost: 35000000, upgradeTime: 7 },
    { level: 5, name: 'Thánh Địa Châu Á', capacity: 90000, ticketPrice: 50, img: '🏛️', upgradeCost: 80000000, upgradeTime: 10 }
];

export const PVP_BOTS = [
    { uid: 'pvp_bot_1', clubName: 'Sài Gòn Legends', logo: '🐉', ovr: 95, pvpPoints: 2250, isBot: true },
    { uid: 'pvp_bot_2', clubName: 'Thăng Long United', logo: '🔥', ovr: 91, pvpPoints: 1920, isBot: true },
    { uid: 'pvp_bot_3', clubName: 'Mekong Warriors', logo: '🐊', ovr: 87, pvpPoints: 1680, isBot: true },
    { uid: 'pvp_bot_4', clubName: 'Đà Nẵng Storm', logo: '⚡', ovr: 83, pvpPoints: 1510, isBot: true },
    { uid: 'pvp_bot_5', clubName: 'Hải Phòng Anchors', logo: '⚓', ovr: 79, pvpPoints: 1380, isBot: true },
    { uid: 'pvp_bot_6', clubName: 'Cần Thơ FC', logo: '🌾', ovr: 75, pvpPoints: 1240, isBot: true },
    { uid: 'pvp_bot_7', clubName: 'Mỹ Tho Phoenix', logo: '🦅', ovr: 72, pvpPoints: 1120, isBot: true },
    { uid: 'pvp_bot_8', clubName: 'Vũng Tàu Waves', logo: '🌊', ovr: 68, pvpPoints: 1030, isBot: true },
    { uid: 'pvp_bot_9', clubName: 'Tây Nguyên Eagles', logo: '⛰️', ovr: 64, pvpPoints: 960, isBot: true },
    { uid: 'pvp_bot_10', clubName: 'Phú Quốc Sharks', logo: '🦈', ovr: 60, pvpPoints: 890, isBot: true }
];

export function assignRandomTrait(pos, ovr) {
    const chance = ovr >= 85 ? 0.8 : (ovr >= 70 ? 0.3 : 0);
    if (Math.random() > chance) return null;
    const validTraits = PLAYER_TRAITS.filter(function(t) { return t.pos.includes(pos); });
    if (validTraits.length === 0) return null;
    return validTraits[Math.random() * validTraits.length | 0];
}

export function getRarityClass(ovr) {
    if (ovr >= 90) {
        return {
            text: 'text-fuchsia-100 drop-shadow-[0_0_5px_rgba(232,121,249,0.8)]',
            bg: 'bg-fuchsia-900',
            border: 'border-fuchsia-400 shadow-[0_0_15px_rgba(232,121,249,0.5)]',
            cardBg: 'bg-gradient-to-br from-fuchsia-900 via-purple-900 to-slate-950'
        };
    }
    if (ovr >= 80) {
        return {
            text: 'text-yellow-100 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]',
            bg: 'bg-yellow-900/50',
            border: 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]',
            cardBg: 'bg-gradient-to-br from-yellow-800 via-amber-900 to-slate-950'
        };
    }
    if (ovr >= 65) {
        return {
            text: 'text-slate-100',
            bg: 'bg-slate-700',
            border: 'border-slate-400',
            cardBg: 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950'
        };
    }
    return {
        text: 'text-orange-100',
        bg: 'bg-orange-950',
        border: 'border-orange-700',
        cardBg: 'bg-gradient-to-br from-orange-900 via-red-950 to-slate-950'
    };
}

export function toggleNavLock(isLocked) {
    document.querySelectorAll('aside nav, nav.fixed').forEach(function(n) {
        if (isLocked) {
            n.classList.add('pointer-events-none', 'opacity-50');
        } else {
            n.classList.remove('pointer-events-none', 'opacity-50');
        }
    });
}

export function playHaptic(type) {
    const hapticType = type || 'light';
    if (!navigator.vibrate) return;
    if (hapticType === 'light') navigator.vibrate(50);
    if (hapticType === 'heavy') navigator.vibrate([100, 50, 100]);
}

export function updateHeaderDisplay() {
    if (document.getElementById('budget-display')) {
        document.getElementById('budget-display').textContent = `€${(gameState.myBudget / 1000000).toFixed(2)}M`;
    }
    if (document.getElementById('fame-display')) {
        document.getElementById('fame-display').textContent = `🌟 ${gameState.myFame}`;
    }
    if (document.getElementById('header-club-name')) {
        document.getElementById('header-club-name').textContent = gameState.myClubName;
    }
    const logoEl = document.getElementById('header-club-logo');
    if (logoEl) {
        if (gameState.myClubLogo.startsWith('http')) {
            logoEl.innerHTML = `<img src="${gameState.myClubLogo}" class="w-6 h-6 object-contain rounded-full bg-white/10" />`;
        } else {
            logoEl.textContent = gameState.myClubLogo;
        }
    }
}

export function calcTeamPower() {
    let totalOVR = 0, count = 0, uAtt = 0, uAttC = 0, uMid = 0, uMidC = 0, uDef = 0, uDefC = 0;
    gameState.startingXI.forEach(function(id) {
        if (id && gameState.globalPlayersMap[id]) {
            let p = gameState.globalPlayersMap[id];
            let penalty = p.stamina < 60 ? Math.floor((60 - p.stamina) / 2) : 0;
            let effOvr = Math.max(1, p.ovr - penalty);
            totalOVR += effOvr;
            count++;
            if (p.pos === 'FWD') { uAtt += effOvr; uAttC++; }
            else if (p.pos === 'MID') { uMid += effOvr; uMidC++; }
            else { uDef += effOvr; uDefC++; }
        }
    });
    gameState.teamPower.OVR = count > 0 ? Math.round(totalOVR / count) : 0;
    gameState.teamPower.ATT = uAttC > 0 ? Math.round(uAtt / uAttC) : 0;
    gameState.teamPower.MID = uMidC > 0 ? Math.round(uMid / uMidC) : 0;
    gameState.teamPower.DEF = uDefC > 0 ? Math.round(uDef / uDefC) : 0;

    const ovrEl = document.getElementById('team-ovr');
    if (ovrEl) ovrEl.textContent = gameState.teamPower.OVR;
    if (document.getElementById('stat-att')) document.getElementById('stat-att').textContent = gameState.teamPower.ATT;
    if (document.getElementById('stat-mid')) document.getElementById('stat-mid').textContent = gameState.teamPower.MID;
    if (document.getElementById('stat-def')) document.getElementById('stat-def').textContent = gameState.teamPower.DEF;

    if (gameState.leagueState && gameState.leagueState.standings) {
        let userTeam = gameState.leagueState.standings.find(function(t) { return t.isUser; });
        if (userTeam) userTeam.ovr = gameState.teamPower.OVR;
    }
}

export function checkUnreadNews() {
    const bPc = document.getElementById('news-badge-pc');
    const bMob = document.getElementById('news-badge-mob');
    if (!bPc || !bMob) return;
    if (gameState.hasUnreadNews) {
        bPc.classList.remove('hidden');
        bMob.classList.remove('hidden');
    } else {
        bPc.classList.add('hidden');
        bMob.classList.add('hidden');
    }
}

export function pushNews(title, message, isGood) {
    gameState.newsInbox.unshift({
        id: Date.now() + Math.random(),
        title: title,
        message: message,
        isGood: isGood,
        time: `Vòng ${gameState.leagueState.currentRound}`
    });
    if (gameState.newsInbox.length > 30) gameState.newsInbox.pop();
    gameState.hasUnreadNews = true;
    checkUnreadNews();
}
