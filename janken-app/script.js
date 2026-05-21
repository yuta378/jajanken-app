const rockButton = document.getElementById('rock');
const scissorsButton = document.getElementById('scissors');
const paperButton = document.getElementById('paper');
const createRoomButton = document.getElementById('createRoomBtn');
const joinRoomButton = document.getElementById('joinRoomBtn');
const leaveRoomButton = document.getElementById('leaveRoomBtn');
const matchmakingButton = document.getElementById('matchmakingBtn');
const cancelMatchButton = document.getElementById('cancelMatchBtn');
const matchStatus = document.getElementById('matchStatus');
const playerNameInput = document.getElementById('playerNameInput');
const registerButton = document.getElementById('registerBtn');
const loginUserSelect = document.getElementById('loginUserSelect');
const loginButton = document.getElementById('loginBtn');
const profileStatus = document.getElementById('profileStatus');
const pointStatus = document.getElementById('pointStatus');
const roomIdInput = document.getElementById('roomIdInput');
const roomStatus = document.getElementById('roomStatus');
const playerLabel = document.getElementById('playerLabel');
const opponentLabel = document.getElementById('opponentLabel');
const resultText = document.getElementById('result');
const playerHand = document.getElementById('playerHand');
const computerHand = document.getElementById('computerHand');
const playerShape = document.getElementById('playerShape');
const computerShape = document.getElementById('computerShape');
const playerChoiceText = document.getElementById('playerChoiceText');
const computerChoiceText = document.getElementById('computerChoiceText');

const choiceButtons = [rockButton, scissorsButton, paperButton];
const handMap = {
    グー: '✊',
    チョキ: '✌️',
    パー: '🖐️'
};

const firebaseConfig = {
    apiKey: "AIzaSyDML1MLn0LqT3wXVMjG6nHKIup_gQqMMg6J0",
    authDomain: "janken-online-d9aaf.firebaseapp.com",
    databaseURL: "https://janken-online-d9aaf-default-rtdb.firebaseio.com",
    projectId: "janken-online-d9aaf",
    storageBucket: "janken-online-d9aaf.appspot.com",
    messagingSenderId: "249055217822",
    appId: "1:249055217822:web:5c8c3bb6f2b4daa46e538f"
};

const needsFirebaseSetup = Object.values(firebaseConfig).some((value) => value.startsWith('YOUR_'));

let currentPlayerId = getOrCreatePlayerId();
let currentPlayerName = getSavedPlayerName();
let db = null;
let roomRef = null;
let currentRoomId = '';
let role = '';
let roundLockKey = '';
let isMatchedGame = false;
let matchmakingActive = false;
let inviteListener = null;
let waitingListener = null;
let claimInProgress = false;
let profileRef = null;
let profileValueListener = null;
let usersRef = null;
let usersListListener = null;

rockButton.addEventListener('click', () => playJanken('グー'));
scissorsButton.addEventListener('click', () => playJanken('チョキ'));
paperButton.addEventListener('click', () => playJanken('パー'));
createRoomButton.addEventListener('click', createRoom);
joinRoomButton.addEventListener('click', joinRoom);
leaveRoomButton.addEventListener('click', leaveRoom);
matchmakingButton.addEventListener('click', startMatchmaking);
cancelMatchButton.addEventListener('click', cancelMatchmaking);
registerButton.addEventListener('click', registerPlayerName);
loginButton.addEventListener('click', loginSelectedUser);

boot();

function boot() {
    setButtonsDisabled(true);

    if (needsFirebaseSetup) {
        roomStatus.textContent = 'Firebase 設定が未入力です。script.js の firebaseConfig を設定してください。';
        resultText.textContent = 'Firebase 設定後にオンライン対戦できます。';
        createRoomButton.disabled = true;
        joinRoomButton.disabled = true;
        matchmakingButton.disabled = true;
        registerButton.disabled = true;
        return;
    }

    firebase.initializeApp(firebaseConfig);
    db = firebase.database();

    if (currentPlayerName) {
        playerNameInput.value = currentPlayerName;
        syncCurrentProfile();
    } else {
        profileStatus.textContent = 'ユーザー名を登録してください。';
        createRoomButton.disabled = true;
        joinRoomButton.disabled = true;
        matchmakingButton.disabled = true;
    }

    attachUsersListListener();
    attachCurrentProfileListener();
}

function playJanken(playerChoice) {
    if (!isRegistered()) {
        profileStatus.textContent = '先にユーザー名を登録してください。';
        return;
    }

    if (!roomRef || !role) {
        return;
    }

    roomRef.once('value').then((snapshot) => {
        const room = snapshot.val();
        if (!room) {
            return;
        }

        const me = room[role];
        const opponentRole = role === 'host' ? 'guest' : 'host';
        const opponent = room[opponentRole];

        if (!opponent || !opponent.id) {
            setResult('対戦相手の参加を待っています...', 'draw');
            return;
        }

        if (me && me.choice) {
            setResult('このラウンドではすでに手を出しています。', 'draw');
            return;
        }

        roomRef.child(`${role}/choice`).set(playerChoice);
        setButtonsDisabled(true);
        setResult('相手の手を待っています...', 'draw');
    }).catch((error) => {
        setResult(`手の送信に失敗しました: ${formatDbError(error)}`, 'lose');
    });
}

function createRoom() {
    if (!db) {
        return;
    }

    if (!isRegistered()) {
        profileStatus.textContent = '先にユーザー名を登録してください。';
        return;
    }

    leaveRoom();

    const newRoomId = generateRoomId();
    const newRef = db.ref(`rooms/${newRoomId}`);
    const payload = {
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        host: { id: currentPlayerId, name: currentPlayerName, choice: null },
        guest: { id: null, choice: null }
    };

    newRef.set(payload).then(() => {
        attachRoom(newRef, newRoomId, 'host');
        newRef.onDisconnect().remove();
        roomIdInput.value = newRoomId;
        roomStatus.textContent = `ルーム作成: ${newRoomId} (相手の参加待ち)`;
        resultText.textContent = '相手が参加したら手を選べます。';
    }).catch((error) => {
        roomStatus.textContent = `ルーム作成に失敗しました: ${formatDbError(error)}`;
    });
}

function joinRoom() {
    if (!db) {
        return;
    }

    if (!isRegistered()) {
        profileStatus.textContent = '先にユーザー名を登録してください。';
        return;
    }

    const joinId = roomIdInput.value.trim().toUpperCase();
    if (!joinId) {
        roomStatus.textContent = 'ルームIDを入力してください。';
        return;
    }

    leaveRoom();

    const targetRef = db.ref(`rooms/${joinId}`);
    targetRef.once('value').then((snapshot) => {
        const room = snapshot.val();
        if (!room) {
            roomStatus.textContent = 'ルームが見つかりません。';
            return;
        }

        if (room.guest && room.guest.id && room.guest.id !== currentPlayerId) {
            roomStatus.textContent = 'このルームは満員です。';
            return;
        }

        targetRef.child('guest').set({ id: currentPlayerId, name: currentPlayerName, choice: null }).then(() => {
            attachRoom(targetRef, joinId, 'guest');
            targetRef.child('guest').onDisconnect().remove();
            roomStatus.textContent = `ルーム参加: ${joinId}`;
            resultText.textContent = '手を選んで対戦開始！';
        });
    }).catch((error) => {
        roomStatus.textContent = `ルーム参加に失敗しました: ${formatDbError(error)}`;
    });
}

function leaveRoom() {
    cleanupMatchmaking();

    if (!roomRef || !role) {
        return;
    }

    roomRef.off('value', onRoomChange);

    if (role === 'host') {
        roomRef.remove();
    } else {
        roomRef.child('guest').remove();
    }

    roomRef = null;
    currentRoomId = '';
    role = '';
    roundLockKey = '';
    isMatchedGame = false;
    leaveRoomButton.disabled = true;
    setButtonsDisabled(true);
    resetArena();
    playerLabel.textContent = 'あなた';
    opponentLabel.textContent = '対戦相手';
    roomStatus.textContent = 'ルームを作成または参加してください。';
    resultText.textContent = 'ルームを作成/参加してバトル開始！';
}

function attachRoom(targetRef, roomId, nextRole) {
    roomRef = targetRef;
    currentRoomId = roomId;
    role = nextRole;
    roundLockKey = '';
    leaveRoomButton.disabled = false;
    roomRef.on('value', onRoomChange);
}

function onRoomChange(snapshot) {
    const room = snapshot.val();
    if (!room) {
        roomRef = null;
        currentRoomId = '';
        role = '';
        leaveRoomButton.disabled = true;
        setButtonsDisabled(true);
        roomStatus.textContent = 'ルームが終了しました。';
        resultText.textContent = '新しいルームを作成または参加してください。';
        resetArena();
        return;
    }

    const me = room[role];
    const opponentRole = role === 'host' ? 'guest' : 'host';
    const opponent = room[opponentRole];
    const opponentReady = Boolean(opponent && opponent.id);
    const myChoice = me ? me.choice : null;
    const opponentChoice = opponent ? opponent.choice : null;

    playerLabel.textContent = role === 'host' ? 'あなた (ホスト)' : 'あなた (ゲスト)';
    opponentLabel.textContent = opponentReady ? '対戦相手' : '対戦相手 (待機中)';
    roomStatus.textContent = isMatchedGame ? 'マッチング対戦中' : `ルーム: ${currentRoomId}`;

    updateArenaChoices(myChoice, opponentChoice, false);

    if (!opponentReady) {
        setButtonsDisabled(true);
        setResult('対戦相手の参加を待っています...', 'draw');
        return;
    }

    if (myChoice && !opponentChoice) {
        setButtonsDisabled(true);
        setResult('相手の手を待っています...', 'draw');
        return;
    }

    if (!myChoice && opponentChoice) {
        setButtonsDisabled(false);
        setResult('相手が手を出しました。あなたの番です。', 'draw');
        return;
    }

    if (!myChoice && !opponentChoice) {
        setButtonsDisabled(false);
        setResult('手を選んでください！', 'draw');
        return;
    }

    const newRoundKey = `${room.host.choice}-${room.guest.choice}`;
    if (roundLockKey === newRoundKey) {
        return;
    }
    roundLockKey = newRoundKey;

    setButtonsDisabled(true);
    startCountdown(me.choice, opponent.choice, room);
}

function resetArena() {
    playerShape.textContent = '?';
    computerShape.textContent = '?';
    playerChoiceText.textContent = '?';
    computerChoiceText.textContent = '?';
    playerHand.classList.remove('reveal', 'shaking');
    computerHand.classList.remove('reveal', 'shaking');
}

function updateArenaChoices(myChoice, opponentChoice, revealed) {
    playerHand.classList.remove('shaking');
    computerHand.classList.remove('shaking');

    if (revealed) {
        playerHand.classList.add('reveal');
        computerHand.classList.add('reveal');
        playerShape.textContent = myChoice ? handMap[myChoice] : '?';
        computerShape.textContent = opponentChoice ? handMap[opponentChoice] : '?';
        playerChoiceText.textContent = myChoice ? `${handMap[myChoice]} ${myChoice}` : '?';
        computerChoiceText.textContent = opponentChoice ? `${handMap[opponentChoice]} ${opponentChoice}` : '?';
    } else {
        playerHand.classList.remove('reveal');
        computerHand.classList.remove('reveal');
        playerShape.textContent = myChoice ? '✅' : '?';
        computerShape.textContent = '?';
        playerChoiceText.textContent = myChoice ? '選択済み' : '?';
        computerChoiceText.textContent = opponentChoice ? '選択済み' : '?';
    }
}

function startCountdown(myChoice, opponentChoice, room) {
    playerHand.classList.add('shaking');
    computerHand.classList.add('shaking');
    resultText.className = 'counting';
    resultText.textContent = 'じゃん...';

    setTimeout(() => {
        resultText.textContent = '...けん...';
    }, 420);

    setTimeout(() => {
        resultText.textContent = '...ぽん！';
    }, 840);

    setTimeout(() => {
        playerHand.classList.remove('shaking');
        computerHand.classList.remove('shaking');
        updateArenaChoices(myChoice, opponentChoice, true);

        const resultClass = judge(myChoice, opponentChoice);
        if (resultClass === 'win') {
            setResult('あなたの勝ちです！', 'win');
        } else if (resultClass === 'lose') {
            setResult('あなたの負けです！', 'lose');
        } else {
            setResult('あいこです！', 'draw');
        }

        if (role === 'host') {
            applyRoundPoints(room);
            setTimeout(() => {
                if (!roomRef) {
                    return;
                }
                roomRef.once('value').then((latestSnapshot) => {
                    const latest = latestSnapshot.val();
                    if (!latest || !latest.host || !latest.guest) {
                        return;
                    }
                    if (latest.host.choice && latest.guest.choice) {
                        roomRef.update({
                            'host/choice': null,
                            'guest/choice': null
                        });
                    }
                });
            }, 2200);
        }
    }, 1260);
}

function judge(myChoice, opponentChoice) {
    if (myChoice === opponentChoice) {
        return 'draw';
    }

    if (
        (myChoice === 'グー' && opponentChoice === 'チョキ') ||
        (myChoice === 'チョキ' && opponentChoice === 'パー') ||
        (myChoice === 'パー' && opponentChoice === 'グー')
    ) {
        return 'win';
    }

    return 'lose';
}

function setButtonsDisabled(isDisabled) {
    choiceButtons.forEach((button) => {
        button.disabled = isDisabled;
    });
}

function setResult(message, resultClass) {
    resultText.className = `${resultClass} flash`;
    resultText.textContent = message;
}

function generateRoomId() {
    return String(Math.floor(Math.random() * 9) + 1);
}

function getOrCreatePlayerId() {
    const key = 'jankenPlayerId';
    const existing = localStorage.getItem(key);
    if (existing) {
        return existing;
    }

    let nextId = '';
    if (window.crypto && crypto.randomUUID) {
        nextId = crypto.randomUUID();
    } else {
        nextId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    localStorage.setItem(key, nextId);
    return nextId;
}

function formatDbError(error) {
    if (!error) {
        return '不明なエラー';
    }

    if (error.code === 'PERMISSION_DENIED' || error.code === 'permission_denied') {
        return '権限エラー (Realtime Database ルールを確認してください)';
    }

    return error.message || error.code || '不明なエラー';
}

// ── マッチング機能 ──────────────────────────────────

function startMatchmaking() {
    if (!db || matchmakingActive) {
        return;
    }

    if (!isRegistered()) {
        profileStatus.textContent = '先にユーザー名を登録してください。';
        return;
    }

    leaveRoom();

    matchmakingActive = true;
    matchmakingButton.disabled = true;
    cancelMatchButton.disabled = false;
    createRoomButton.disabled = true;
    joinRoomButton.disabled = true;
    matchStatus.className = 'room-status waiting';
    matchStatus.textContent = '対戦相手を探しています...';
    resultText.textContent = '対戦相手を探しています...';

    addToWaitingQueue();
}

function addToWaitingQueue() {
    if (!db || !matchmakingActive) {
        return;
    }

    const waitRef = db.ref(`matchmaking/waiting/${currentPlayerId}`);
    waitRef.set({
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        name: currentPlayerName
    });
    waitRef.onDisconnect().remove();

    const inviteRef = db.ref(`matchmaking/invitations/${currentPlayerId}`);
    inviteListener = (snapshot) => {
        const invite = snapshot.val();
        if (!invite || !invite.roomId) {
            return;
        }

        inviteRef.off('value', inviteListener);
        inviteRef.remove();
        waitRef.remove();
        inviteListener = null;

        if (!matchmakingActive) {
            return;
        }

        const matchedRoomRef = db.ref(`rooms/${invite.roomId}`);
        isMatchedGame = true;
        endMatchmaking();
        matchStatus.textContent = 'マッチング完了！対戦開始！';
        attachRoom(matchedRoomRef, invite.roomId, 'guest');
    };
    inviteRef.on('value', inviteListener);

    const waitingRef = db.ref('matchmaking/waiting');
    waitingListener = (snapshot) => {
        tryClaimRandomOpponent(snapshot.val());
    };
    waitingRef.on('value', waitingListener);
}

function cancelMatchmaking() {
    if (!matchmakingActive) {
        return;
    }
    cleanupMatchmaking();
    matchStatus.textContent = 'マッチングをキャンセルしました。';
}

function cleanupMatchmaking() {
    if (!matchmakingActive) {
        return;
    }
    if (db) {
        db.ref(`matchmaking/waiting/${currentPlayerId}`).remove();
        const inviteRef = db.ref(`matchmaking/invitations/${currentPlayerId}`);
        if (inviteListener) {
            inviteRef.off('value', inviteListener);
            inviteRef.remove();
            inviteListener = null;
        }

        if (waitingListener) {
            db.ref('matchmaking/waiting').off('value', waitingListener);
            waitingListener = null;
        }
    }
    endMatchmaking();
}

function endMatchmaking() {
    if (db && inviteListener) {
        db.ref(`matchmaking/invitations/${currentPlayerId}`).off('value', inviteListener);
        inviteListener = null;
    }

    if (db && waitingListener) {
        db.ref('matchmaking/waiting').off('value', waitingListener);
        waitingListener = null;
    }

    matchmakingActive = false;
    claimInProgress = false;
    cancelMatchButton.disabled = true;
    matchStatus.className = 'room-status';
    updateActionAvailability();
}

function tryClaimRandomOpponent(waiting) {
    if (!matchmakingActive || !waiting || claimInProgress) {
        return;
    }

    const opponentIds = Object.keys(waiting).filter((id) => id !== currentPlayerId);
    if (opponentIds.length === 0) {
        return;
    }

    claimInProgress = true;
    const randomIndex = Math.floor(Math.random() * opponentIds.length);
    const opponentId = opponentIds[randomIndex];
    const opponentName = waiting[opponentId] && waiting[opponentId].name ? waiting[opponentId].name : '対戦相手';

    const opponentWaitRef = db.ref(`matchmaking/waiting/${opponentId}`);
    opponentWaitRef.transaction((current) => {
        if (current === null) {
            return undefined;
        }
        return null;
    }, (error, committed) => {
        if (!matchmakingActive) {
            claimInProgress = false;
            return;
        }

        if (error || !committed) {
            claimInProgress = false;
            return;
        }

        const newRoomId = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const newRoomRef = db.ref(`rooms/${newRoomId}`);
        newRoomRef.set({
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            host: { id: currentPlayerId, name: currentPlayerName, choice: null },
            guest: { id: opponentId, name: opponentName, choice: null }
        }).then(() => {
            db.ref(`matchmaking/invitations/${opponentId}`).set({ roomId: newRoomId });
            db.ref(`matchmaking/waiting/${currentPlayerId}`).remove();
            newRoomRef.onDisconnect().remove();

            isMatchedGame = true;
            endMatchmaking();
            matchStatus.textContent = 'マッチング完了！対戦開始！';
            attachRoom(newRoomRef, newRoomId, 'host');
        }).catch(() => {
            claimInProgress = false;
            matchStatus.textContent = 'マッチング用ルーム作成に失敗しました。再試行してください。';
        });
    });
}

function registerPlayerName() {
    if (!db) {
        return;
    }

    const nextName = playerNameInput.value.trim();
    if (!nextName) {
        profileStatus.textContent = 'ユーザー名を入力してください。';
        return;
    }

    if (nextName.length > 16) {
        profileStatus.textContent = 'ユーザー名は16文字以内で入力してください。';
        return;
    }

    currentPlayerName = nextName;
    localStorage.setItem('jankenPlayerName', nextName);

    syncCurrentProfile().then(() => {
        profileStatus.textContent = `ユーザー登録完了: ${nextName}`;
        updateActionAvailability();
    }).catch((error) => {
        profileStatus.textContent = `登録に失敗しました: ${formatDbError(error)}`;
    });
}

function syncCurrentProfile() {
    if (!db || !currentPlayerName) {
        return Promise.resolve();
    }

    const currentProfileRef = db.ref(`players/${currentPlayerId}`);
    return currentProfileRef.transaction((current) => ({
        displayName: currentPlayerName,
        points: current && typeof current.points === 'number' ? current.points : 0,
        wins: current && typeof current.wins === 'number' ? current.wins : 0,
        draws: current && typeof current.draws === 'number' ? current.draws : 0,
        losses: current && typeof current.losses === 'number' ? current.losses : 0,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    }));
}

function attachCurrentProfileListener() {
    if (!db) {
        return;
    }

    if (profileRef && profileValueListener) {
        profileRef.off('value', profileValueListener);
    }

    profileRef = db.ref(`players/${currentPlayerId}`);
    profileValueListener = (snapshot) => {
        const profile = snapshot.val();
        const points = profile && typeof profile.points === 'number' ? profile.points : 0;
        pointStatus.textContent = `現在ポイント: ${points}`;

        if (profile && profile.displayName) {
            currentPlayerName = profile.displayName;
            playerNameInput.value = profile.displayName;
            if (!profileStatus.textContent.startsWith('登録に失敗')) {
                profileStatus.textContent = `ログイン中: ${profile.displayName}`;
            }
            updateActionAvailability();
        }
    };
    profileRef.on('value', profileValueListener);
}

function updateActionAvailability() {
    const canPlay = isRegistered();
    createRoomButton.disabled = !canPlay || matchmakingActive;
    joinRoomButton.disabled = !canPlay || matchmakingActive;
    matchmakingButton.disabled = !canPlay || matchmakingActive;
}

function isRegistered() {
    return Boolean(currentPlayerName && currentPlayerName.trim());
}

function getSavedPlayerName() {
    return localStorage.getItem('jankenPlayerName') || '';
}

function attachUsersListListener() {
    if (!db || usersListListener) {
        return;
    }

    usersRef = db.ref('players');
    usersListListener = (snapshot) => {
        const players = snapshot.val() || {};
        renderUserSelect(players);
    };
    usersRef.on('value', usersListListener);
}

function renderUserSelect(players) {
    const entries = Object.entries(players)
        .map(([id, value]) => ({
            id,
            name: value && value.displayName ? value.displayName : 'プレイヤー',
            points: value && typeof value.points === 'number' ? value.points : 0
        }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'ja'));

    loginUserSelect.innerHTML = '';

    if (entries.length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '登録済みユーザーがいません';
        loginUserSelect.appendChild(emptyOption);
        loginButton.disabled = true;
        return;
    }

    entries.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = `${entry.name} (Pt ${entry.points})`;
        if (entry.id === currentPlayerId) {
            option.selected = true;
        }
        loginUserSelect.appendChild(option);
    });

    loginButton.disabled = false;
}

function loginSelectedUser() {
    if (!db) {
        return;
    }

    const selectedId = loginUserSelect.value;
    if (!selectedId) {
        profileStatus.textContent = 'ログインするユーザーを選択してください。';
        return;
    }

    if (selectedId === currentPlayerId) {
        profileStatus.textContent = `すでに ${currentPlayerName || 'このユーザー'} でログイン中です。`;
        return;
    }

    leaveRoom();

    db.ref(`players/${selectedId}`).once('value').then((snapshot) => {
        const profile = snapshot.val();
        if (!profile || !profile.displayName) {
            profileStatus.textContent = '選択したユーザーが見つかりません。';
            return;
        }

        currentPlayerId = selectedId;
        currentPlayerName = profile.displayName;
        localStorage.setItem('jankenPlayerId', currentPlayerId);
        localStorage.setItem('jankenPlayerName', currentPlayerName);

        playerNameInput.value = currentPlayerName;
        profileStatus.textContent = `ログインしました: ${currentPlayerName}`;

        attachCurrentProfileListener();
        updateActionAvailability();
    }).catch((error) => {
        profileStatus.textContent = `ログインに失敗しました: ${formatDbError(error)}`;
    });
}

function applyRoundPoints(room) {
    if (!db || !room || !room.host || !room.guest) {
        return;
    }

    const hostChoice = room.host.choice;
    const guestChoice = room.guest.choice;
    if (!hostChoice || !guestChoice || !room.host.id || !room.guest.id) {
        return;
    }

    const hostResult = judge(hostChoice, guestChoice);
    if (hostResult === 'draw') {
        addPoints(room.host.id, 1, 'draw');
        addPoints(room.guest.id, 1, 'draw');
        return;
    }

    if (hostResult === 'win') {
        addPoints(room.host.id, 3, 'win');
        addPoints(room.guest.id, 0, 'lose');
        return;
    }

    addPoints(room.host.id, 0, 'lose');
    addPoints(room.guest.id, 3, 'win');
}

function addPoints(playerId, deltaPoints, resultType) {
    db.ref(`players/${playerId}`).transaction((current) => {
        const currentSafe = current || {};
        const nextPoints = (typeof currentSafe.points === 'number' ? currentSafe.points : 0) + deltaPoints;
        const nextWins = (typeof currentSafe.wins === 'number' ? currentSafe.wins : 0) + (resultType === 'win' ? 1 : 0);
        const nextDraws = (typeof currentSafe.draws === 'number' ? currentSafe.draws : 0) + (resultType === 'draw' ? 1 : 0);
        const nextLosses = (typeof currentSafe.losses === 'number' ? currentSafe.losses : 0) + (resultType === 'lose' ? 1 : 0);

        return {
            displayName: currentSafe.displayName || 'プレイヤー',
            points: nextPoints,
            wins: nextWins,
            draws: nextDraws,
            losses: nextLosses,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
    });
}
