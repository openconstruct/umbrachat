// main.js

import { joinRoom, selfId as localGeneratedPeerId, getRelaySockets } from './trystero-nostr.min.js';
import {
    initShareFeatures,
    resetShareModuleStates,
    handleShareModulePeerLeave
} from './share.js';
import { initMediaFeatures, handleMediaPeerStream, stopAllLocalMedia, setupMediaForNewPeer, cleanupMediaForPeer } from './media.js';

const APP_ID = 'UmbraChat-0.1.5-jun21';
const NOSTR_RELAY_URLS = [
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://relay.primal.net',
    'wss://nostr.mom',
    'wss://relay.fountain.fm',
    'wss://relay.mostro.network'
];
// Cloudflare Worker endpoint that proxies Metered TURN credentials.
const METERED_TURN_CREDENTIALS_ENDPOINT = 'https://restless-haze-808e.jerry-1de.workers.dev';
const MAX_TURN_SERVER_CONFIGS = 2;

const wordList = [
    "able", "acid", "army", "away", "baby", "back", "ball", "band", "bank", "base",
    "bath", "bean", "bear", "beat", "bell", "bird", "blow", "blue", "boat", "body",
    "bone", "book", "boss", "busy", "cake", "call", "calm", "camp", "card", "care",
    "case", "cash", "chat", "city", "club", "coal", "coat", "code", "cold", "cook",
    "cool", "cope", "copy", "core", "cost", "crew", "crop", "dark", "data", "date",
    "deal", "deep", "deer", "desk", "disc", "disk", "door", "dose", "down", "draw",
    "dream", "drug", "drum", "duck", "duke", "dust", "duty", "earn", "east", "easy",
    "edge", "face", "fact", "fail", "fair", "fall", "farm", "fast", "fate", "fear",
    "feed", "feel", "file", "fill", "film", "find", "fine", "fire", "firm", "fish",
    "five", "flag", "flat", "flow", "food", "foot", "ford", "form", "fort", "four"
];

const setupSection = document.getElementById('setupSection');
const inRoomInterface = document.getElementById('inRoomInterface');
const nicknameInput = document.getElementById('nicknameInput');
const roomIdInput = document.getElementById('roomIdInput');
const roomPasswordInput = document.getElementById('roomPasswordInput');
const createPartyBtn = document.getElementById('createPartyBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const createRoomFields = document.getElementById('createRoomFields');
const joinRoomFields = document.getElementById('joinRoomFields');
const confirmCreateBtn = document.getElementById('confirmCreateBtn');
const cancelCreateBtn = document.getElementById('cancelCreateBtn');
const confirmJoinBtn = document.getElementById('confirmJoinBtn');
const cancelJoinBtn = document.getElementById('cancelJoinBtn');
const joinPasswordInput = document.getElementById('joinPasswordInput');
const currentRoomCodeSpan = document.getElementById('currentRoomCodeSpan');
const copyRoomCodeBtn = document.getElementById('copyRoomCodeBtn');
const currentNicknameSpan = document.getElementById('currentNicknameSpan');

const sidebarButtons = document.querySelectorAll('.sidebar-button');
const contentSections = document.querySelectorAll('.content-section');
const userCountSpan = document.getElementById('userCountSpan');
const userListUl = document.getElementById('userList');
const settingsSection = document.getElementById('settingsSection');
const settingsNicknameInput = document.getElementById('settingsNicknameInput');
const settingsVideoFlipCheckbox = document.getElementById('settingsVideoFlipCheckbox');
const settingsPttEnabledCheckbox = document.getElementById('settingsPttEnabledCheckbox');
const pttHotkeySettingsContainer = document.getElementById('pttHotkeySettingsContainer');
const settingsPttKeyBtn = document.getElementById('settingsPttKeyBtn');
const pttKeyInstructions = document.getElementById('pttKeyInstructions');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');

const settingsGlobalVolumeSlider = document.getElementById('settingsGlobalVolumeSlider');
const globalVolumeValue = document.getElementById('globalVolumeValue');

let isCapturingPttKey = false;
let roomApi;
let localNickname = '';
let currentRoomId = '';
let currentActiveSection = 'chatSection';
let peerNicknames = {};
let isHost = false;
let cachedTurnConfig = null;

let umbraChatSettings = {
    videoFlip: false,
    pttEnabled: false,
    pttKey: 'Space',
    pttKeyDisplay: 'Space',
    globalVolume: 1,
};

// Trystero action variables
let sendChatMessage, onChatMessage, sendNickname, onNickname, sendPrivateMessage, onPrivateMessage;
let sendFileMeta, onFileMeta, sendFileChunk, onFileChunk;
let sendChatHistory, onChatHistory;
let sendCreateChannel, onCreateChannel;
let sendInitialChannels, onInitialChannels;

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

async function loadSettings() {
    const savedSettings = localStorage.getItem('umbraChatAppSettings');
    if (savedSettings) {
        try {
            const parsedSettings = JSON.parse(savedSettings);
            umbraChatSettings.videoFlip = typeof parsedSettings.videoFlip === 'boolean' ? parsedSettings.videoFlip : false;
            umbraChatSettings.pttEnabled = typeof parsedSettings.pttEnabled === 'boolean' ? parsedSettings.pttEnabled : false;
            umbraChatSettings.pttKey = typeof parsedSettings.pttKey === 'string' ? parsedSettings.pttKey : 'Space';
            umbraChatSettings.pttKeyDisplay = typeof parsedSettings.pttKeyDisplay === 'string' ? parsedSettings.pttKeyDisplay : 'Space';
            umbraChatSettings.globalVolume = typeof parsedSettings.globalVolume === 'number' && !isNaN(parsedSettings.globalVolume) ? parsedSettings.globalVolume : 1;
        } catch (e) {
            console.error("Error parsing saved settings.", e);
        }
    }
    
    populateSettingsSection();
    document.documentElement.setAttribute('data-theme', 'dark');
    saveSettings();

    if (window.mediaModuleRef && window.mediaModuleRef.setLocalVideoFlip) {
        window.mediaModuleRef.setLocalVideoFlip(umbraChatSettings.videoFlip);
    }
    if (window.mediaModuleRef && window.mediaModuleRef.updatePttSettings) {
        window.mediaModuleRef.updatePttSettings(umbraChatSettings.pttEnabled, umbraChatSettings.pttKey, umbraChatSettings.pttKeyDisplay);
    }
    if (window.mediaModuleRef && window.mediaModuleRef.setGlobalVolume) {
        window.mediaModuleRef.setGlobalVolume(umbraChatSettings.globalVolume, false);
    }
}

function saveSettings() {
    localStorage.setItem('umbraChatAppSettings', JSON.stringify(umbraChatSettings));
}

function populateSettingsSection() {
    if (!settingsNicknameInput || !settingsVideoFlipCheckbox || !settingsPttEnabledCheckbox || !settingsPttKeyBtn || !pttHotkeySettingsContainer ||
        !settingsGlobalVolumeSlider || !globalVolumeValue) return;
    settingsNicknameInput.value = localNickname;
    settingsVideoFlipCheckbox.checked = umbraChatSettings.videoFlip;
    settingsPttEnabledCheckbox.checked = umbraChatSettings.pttEnabled;
    settingsPttKeyBtn.textContent = umbraChatSettings.pttKeyDisplay;
    pttHotkeySettingsContainer.classList.toggle('hidden', !settingsPttEnabledCheckbox.checked);

    settingsGlobalVolumeSlider.value = umbraChatSettings.globalVolume;
    globalVolumeValue.textContent = `${Math.round(umbraChatSettings.globalVolume * 100)}%`;
}

function handlePttKeyCapture(event) {
    if (!isCapturingPttKey) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') {/* NOOP */} else {
        umbraChatSettings.pttKey = event.code;
        umbraChatSettings.pttKeyDisplay = (event.code === 'Space') ? 'Space' : (event.key.length === 1 ? event.key.toUpperCase() : event.key);
        if (settingsPttKeyBtn) settingsPttKeyBtn.textContent = umbraChatSettings.pttKeyDisplay;
    }
    isCapturingPttKey = false;
    if (pttKeyInstructions) pttKeyInstructions.classList.add('hidden');
    if (settingsPttKeyBtn) settingsPttKeyBtn.classList.remove('hidden');
    document.removeEventListener('keydown', handlePttKeyCapture, true);
}

if (settingsPttEnabledCheckbox) {
    settingsPttEnabledCheckbox.addEventListener('change', () => {
        if (pttHotkeySettingsContainer) pttHotkeySettingsContainer.classList.toggle('hidden', !settingsPttEnabledCheckbox.checked);
    });
}
if (settingsPttKeyBtn) {
    settingsPttKeyBtn.addEventListener('click', () => {
        if (isCapturingPttKey) return;
        isCapturingPttKey = true;
        settingsPttKeyBtn.classList.add('hidden');
        if(pttKeyInstructions) pttKeyInstructions.classList.remove('hidden');
        document.addEventListener('keydown', handlePttKeyCapture, true);
    });
}
if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', async () => {
        const newNickname = settingsNicknameInput.value.trim();
        if (newNickname && newNickname !== localNickname) {
            localNickname = newNickname;
            localStorage.setItem('viewPartyNickname', localNickname);
            if(currentNicknameSpan) currentNicknameSpan.textContent = escapeHtml(localNickname);
            updateUserList();
            if (roomApi && sendNickname) {
                await sendNickname({ nickname: localNickname, initialJoin: false, isHost: isHost });
            }
             if (window.mediaModuleRef && window.mediaModuleRef.updatePeerNicknameInUI) {
                window.mediaModuleRef.updatePeerNicknameInUI(localGeneratedPeerId, localNickname);
            }
        }
        umbraChatSettings.videoFlip = settingsVideoFlipCheckbox.checked;
        umbraChatSettings.pttEnabled = settingsPttEnabledCheckbox.checked;
        const newGlobalVolume = parseFloat(settingsGlobalVolumeSlider.value);
        if (umbraChatSettings.globalVolume !== newGlobalVolume) {
            umbraChatSettings.globalVolume = newGlobalVolume;
        }
        saveSettings();
        if (window.mediaModuleRef) {
            if (window.mediaModuleRef.setLocalVideoFlip) window.mediaModuleRef.setLocalVideoFlip(umbraChatSettings.videoFlip);
            if (window.mediaModuleRef.updatePttSettings) window.mediaModuleRef.updatePttSettings(umbraChatSettings.pttEnabled, umbraChatSettings.pttKey, umbraChatSettings.pttKeyDisplay);
            if (window.mediaModuleRef.setGlobalVolume) window.mediaModuleRef.setGlobalVolume(umbraChatSettings.globalVolume, true);
        }
        logStatus("Settings saved.");
    });
}
if (settingsGlobalVolumeSlider && globalVolumeValue) {
    settingsGlobalVolumeSlider.addEventListener('input', () => {
        const volume = parseFloat(settingsGlobalVolumeSlider.value);
        globalVolumeValue.textContent = `${Math.round(volume * 100)}%`;
        if (window.mediaModuleRef && window.mediaModuleRef.setGlobalVolume) {
            window.mediaModuleRef.setGlobalVolume(volume, true);
        }
    });
}

sidebarButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetSectionId = button.getAttribute('data-section');
        const targetSectionElement = document.getElementById(targetSectionId);
        if (currentActiveSection === targetSectionId && targetSectionElement && !targetSectionElement.classList.contains('hidden')) return;
        sidebarButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        currentActiveSection = targetSectionId;
        contentSections.forEach(section => section.classList.toggle('hidden', section.id !== targetSectionId));
        clearNotification(targetSectionId);
        if (targetSectionId === 'videoChatSection' && window.mediaModuleRef && window.mediaModuleRef.setLocalVideoFlip) window.mediaModuleRef.setLocalVideoFlip(umbraChatSettings.videoFlip, true);
        if (targetSectionId === 'settingsSection') {
            populateSettingsSection();
            if (isCapturingPttKey) {
                isCapturingPttKey = false;
                if (pttKeyInstructions) pttKeyInstructions.classList.add('hidden');
                if (settingsPttKeyBtn) settingsPttKeyBtn.classList.remove('hidden');
                document.removeEventListener('keydown', handlePttKeyCapture, true);
            }
        }
    });
});
function showNotification(sectionId) {
    const targetSectionElement = document.getElementById(sectionId);
    if (targetSectionElement && (currentActiveSection !== sectionId || targetSectionElement.classList.contains('hidden'))) {
        const dot = document.querySelector(`.notification-dot[data-notification-for="${sectionId}"]`);
        if (dot) dot.classList.remove('hidden');
    }
}
function clearNotification(sectionId) {
    const dot = document.querySelector(`.notification-dot[data-notification-for="${sectionId}"]`);
    if (dot) dot.classList.add('hidden');
}
function logStatus(message, isError = false) {
    console.log(message);
    if (isError) console.error("UmbraChat Error:", message);
    if (window.shareModuleRef && window.shareModuleRef.displaySystemMessage) {
        window.shareModuleRef.displaySystemMessage(isError ? `Error: ${message}` : message);
    }
}
function hasWebCryptoSupport() {
    return !!(globalThis.crypto && globalThis.crypto.subtle);
}
async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (!copied) {
        throw new Error('Clipboard copy fallback failed.');
    }
}
async function fetchTurnConfigForJoin() {
    if (!METERED_TURN_CREDENTIALS_ENDPOINT) return [];
    if (cachedTurnConfig) return cachedTurnConfig;

    try {
        const response = await fetch(METERED_TURN_CREDENTIALS_ENDPOINT);
        if (!response.ok) {
            throw new Error(`TURN credentials endpoint returned status ${response.status}`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload)) {
            throw new Error("TURN credentials endpoint returned an invalid payload.");
        }

        const normalized = payload
            .map(server => {
                if (!server || !server.urls) return null;
                const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
                const normalizedUrls = urls
                    .filter(url => typeof url === 'string' && url.trim().length > 0)
                    .slice(0, 2);
                if (normalizedUrls.length === 0) return null;

                const normalizedServer = { urls: normalizedUrls };
                if (typeof server.username === 'string') normalizedServer.username = server.username;
                if (typeof server.credential === 'string') normalizedServer.credential = server.credential;
                if (typeof server.credentialType === 'string') normalizedServer.credentialType = server.credentialType;
                return normalizedServer;
            })
            .filter(Boolean)
            .slice(0, MAX_TURN_SERVER_CONFIGS);

        cachedTurnConfig = normalized;
        return normalized;
    } catch (error) {
        console.error("Could not fetch TURN credentials:", error);
        return [];
    }
}
function reportRelaySocketHealth() {
    try {
        const sockets = getRelaySockets();
        const states = Object.values(sockets || {}).map(socket => socket?.readyState);
        const total = states.length;
        if (total === 0) {
            logStatus("Relay diagnostics: no Nostr relay sockets are active yet.", true);
            return;
        }

        const open = states.filter(state => state === WebSocket.OPEN).length;
        const connecting = states.filter(state => state === WebSocket.CONNECTING).length;
        const other = total - open - connecting;
        logStatus(`Relay diagnostics: ${open}/${total} open, ${connecting} connecting, ${other} closed.`);
    } catch (error) {
        console.warn("Unable to read relay socket diagnostics:", error);
    }
}
function generateMemorableRoomCode() {
    const selectedWords = [];
    for (let i = 0; i < 4; i++) selectedWords.push(wordList[Math.floor(Math.random() * wordList.length)]);
    return selectedWords.join('-');
}
function updateUserList() {
    if (!userListUl) return;
    const fragment = document.createDocumentFragment();
    let count = 0;
    const selfLi = document.createElement('li');
    const selfBadge = document.createElement('span');
    selfBadge.className = 'status-badge';
    selfLi.appendChild(selfBadge);
    selfLi.appendChild(document.createTextNode(` ${escapeHtml(localNickname)} (You)${isHost ? ' (Host)' : ''}`));
    fragment.appendChild(selfLi);
    count++;
    for (const peerId in peerNicknames) {
        const nickname = peerNicknames[peerId];
        const li = document.createElement('li');
        li.classList.add('peer-name-container');
        li.dataset.peerId = peerId;
        const nameAndPmContainer = document.createElement('div');
        nameAndPmContainer.className = 'peer-info-clickable';
        const peerBadge = document.createElement('span');
        peerBadge.className = 'status-badge';
        nameAndPmContainer.appendChild(peerBadge);
        nameAndPmContainer.appendChild(document.createTextNode(` ${escapeHtml(nickname)}`));
        nameAndPmContainer.title = `Click to private message ${escapeHtml(nickname)}`;
        nameAndPmContainer.addEventListener('click', () => {
            if (window.shareModuleRef && window.shareModuleRef.primePrivateMessage) window.shareModuleRef.primePrivateMessage(nickname);
        });
        li.appendChild(nameAndPmContainer);
        const volumeControlContainer = document.createElement('div');
        volumeControlContainer.className = 'peer-volume-control';
        const volumeIcon = document.createElement('span');
        volumeIcon.textContent = '🔊';
        volumeIcon.className = 'volume-icon';
        volumeControlContainer.appendChild(volumeIcon);
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.01';
        let currentIndividualVolume = 1;
        if (window.mediaModuleRef && window.mediaModuleRef.getIndividualVolume) currentIndividualVolume = window.mediaModuleRef.getIndividualVolume(peerId);
        slider.value = currentIndividualVolume.toString();
        slider.className = 'peer-volume-slider';
        slider.title = `Volume for ${escapeHtml(nickname)}`;
        slider.addEventListener('input', (e) => {
            if (window.mediaModuleRef && window.mediaModuleRef.setIndividualVolume) window.mediaModuleRef.setIndividualVolume(peerId, parseFloat(e.target.value));
        });
        volumeControlContainer.appendChild(slider);
        li.appendChild(volumeControlContainer);
        fragment.appendChild(li);
        count++;
    }
    userListUl.innerHTML = '';
    userListUl.appendChild(fragment);
    if (userCountSpan) userCountSpan.textContent = count;
}
function findPeerIdByNickname(nickname) {
    for (const id in peerNicknames) if (peerNicknames[id].toLowerCase() === nickname.toLowerCase()) return id;
    return null;
}
async function joinRoomAndSetup() {
    localNickname = nicknameInput.value.trim();
    if (!localNickname) { logStatus("Please enter a nickname.", true); return; }
    localStorage.setItem('viewPartyNickname', localNickname);
    populateSettingsSection();
    const roomPasswordProvided = isHost ? roomPasswordInput.value : joinPasswordInput.value;
    if (!roomPasswordProvided) {
        logStatus("Room password is required.", true);
        if(createPartyBtn) createPartyBtn.disabled = false; if(joinRoomBtn) joinRoomBtn.disabled = false;
        return;
    }
    let roomIdToJoin = roomIdInput.value.trim();
    if (isHost) {
        if (!roomIdToJoin) roomIdToJoin = generateMemorableRoomCode();
        if(roomIdInput) roomIdInput.value = roomIdToJoin;
    } else if (!roomIdToJoin) {
        logStatus("Room Code is required to join a room.", true);
        if(createPartyBtn) createPartyBtn.disabled = false; if(joinRoomBtn) joinRoomBtn.disabled = false;
        return;
    }
    const sanitizedRoomId = roomIdToJoin.toLowerCase().replace(/[\s,]+/g, '-');
    if (roomIdToJoin !== sanitizedRoomId) {
        logStatus(`Using sanitized Room Code: ${sanitizedRoomId}`);
        if(roomIdInput) roomIdInput.value = sanitizedRoomId;
    }
    if (!hasWebCryptoSupport()) {
        logStatus("WebCrypto is unavailable in this browser context. Open UmbraChat over HTTPS or as an extension page.", true);
        return;
    }
    currentRoomId = sanitizedRoomId;
    logStatus(`Connecting to room: ${currentRoomId}...`);
    [createPartyBtn, joinRoomBtn, nicknameInput, roomIdInput, roomPasswordInput, joinPasswordInput, confirmCreateBtn, confirmJoinBtn].forEach(el => el && (el.disabled = true));
    try {
        const turnConfig = await fetchTurnConfigForJoin();
        const config = {
            appId: APP_ID,
            password: roomPasswordProvided,
            relayUrls: NOSTR_RELAY_URLS
        };
        if (turnConfig.length > 0) {
            config.turnConfig = turnConfig;
            logStatus(`TURN configured with ${turnConfig.length} server profile(s).`);
        } else if (METERED_TURN_CREDENTIALS_ENDPOINT) {
            logStatus("TURN credentials endpoint did not return usable servers; running STUN-only.", true);
        } else {
            logStatus("TURN not configured. Add your Metered endpoint to METERED_TURN_CREDENTIALS_ENDPOINT.", true);
        }
        const onJoinError = ({ error, peerId }) => {
            const peerLabel = peerId ? peerId.substring(0, 6) : 'unknown peer';
            logStatus(`Join error with ${peerLabel}: ${error}`, true);
        };
        roomApi = await joinRoom(config, currentRoomId, onJoinError);
        setTimeout(reportRelaySocketHealth, 2000);
        logStatus("Setting up room features...");
        [sendChatMessage, onChatMessage] = roomApi.makeAction('chatMsg');
        [sendNickname, onNickname] = roomApi.makeAction('nick');
        [sendPrivateMessage, onPrivateMessage] = roomApi.makeAction('privMsg');
        [sendFileMeta, onFileMeta] = roomApi.makeAction('fileMeta');
        [sendFileChunk, onFileChunk] = roomApi.makeAction('fileChunk', true);
        [sendChatHistory, onChatHistory] = roomApi.makeAction('chatHist');
        [sendCreateChannel, onCreateChannel] = roomApi.makeAction('createChan');
        [sendInitialChannels, onInitialChannels] = roomApi.makeAction('initChans');
        const shareModuleDeps = {
            sendChatMessage, sendPrivateMessage, sendFileMeta, sendFileChunk,
            sendChatHistory, sendCreateChannel, sendInitialChannels,
            logStatus, showNotification, localGeneratedPeerId,
            getPeerNicknames: () => peerNicknames, getIsHost: () => isHost, getLocalNickname: () => localNickname,
            findPeerIdByNicknameFnc: findPeerIdByNickname, currentRoomId: currentRoomId,
        };
        window.shareModuleRef = initShareFeatures(shareModuleDeps);
        const mediaModuleDeps = {
            roomApi, logStatus, showNotification, localGeneratedPeerId,
            getPeerNicknames: () => peerNicknames, getLocalNickname: () => localNickname,
            initialVideoFlip: umbraChatSettings.videoFlip, initialPttEnabled: umbraChatSettings.pttEnabled,
            initialPttKey: umbraChatSettings.pttKey, initialPttKeyDisplay: umbraChatSettings.pttKeyDisplay,
            initialGlobalVolume: umbraChatSettings.globalVolume, updateUserList: updateUserList,
        };
        window.mediaModuleRef = initMediaFeatures(mediaModuleDeps);
        onChatMessage((data, peerId) => window.shareModuleRef.handleChatMessage(data, peerId));
        onPrivateMessage((data, peerId) => window.shareModuleRef.handlePrivateMessage(data, peerId));
        onFileMeta((data, peerId) => window.shareModuleRef.handleFileMeta(data, peerId));
        onFileChunk((data, peerId, chunkMeta) => window.shareModuleRef.handleFileChunk(data, peerId, chunkMeta));
        onChatHistory((data, peerId) => window.shareModuleRef.handleChatHistory(data, peerId));
        onCreateChannel((data, peerId) => window.shareModuleRef.handleCreateChannel(data, peerId));
        onInitialChannels((data, peerId) => window.shareModuleRef.handleInitialChannels(data, peerId));
        onNickname(async (nicknameData, peerId) => {
            const { nickname, initialJoin, isHost: peerIsHost } = nicknameData;
            const oldNickname = peerNicknames[peerId];
            peerNicknames[peerId] = nickname;
            if (initialJoin && peerId !== localGeneratedPeerId) {
                if (!oldNickname || oldNickname !== nickname) logStatus(`${escapeHtml(nickname)}${peerIsHost ? ' (Host)' : ''} has joined.`);
                if (sendNickname) await sendNickname({ nickname: localNickname, initialJoin: false, isHost: isHost }, peerId);
            } else if (oldNickname && oldNickname !== nickname) {
                 logStatus(`${escapeHtml(oldNickname)} is now known as ${escapeHtml(nickname)}.`);
            }
            updateUserList();
            if (window.mediaModuleRef && window.mediaModuleRef.updatePeerNicknameInUI) window.mediaModuleRef.updatePeerNicknameInUI(peerId, nickname);
        });
        roomApi.onPeerJoin(async (joinedPeerId) => {
            logStatus(`Peer ${joinedPeerId.substring(0,6)}... joining, preparing to sync...`);
            if (sendNickname) await sendNickname({ nickname: localNickname, initialJoin: true, isHost: isHost }, joinedPeerId);
            if (window.mediaModuleRef && typeof setupMediaForNewPeer === 'function') setupMediaForNewPeer(joinedPeerId);
            if (isHost && window.shareModuleRef && window.shareModuleRef.sendFullStateToPeer) window.shareModuleRef.sendFullStateToPeer(joinedPeerId);
            updateUserList();
        });
        roomApi.onPeerLeave(leftPeerId => {
            const departedUser = peerNicknames[leftPeerId] || `Peer ${leftPeerId.substring(0, 6)}`;
            logStatus(`${escapeHtml(departedUser)} has left.`);
            delete peerNicknames[leftPeerId];
            if(typeof handleShareModulePeerLeave === 'function') handleShareModulePeerLeave(leftPeerId);
            if (window.mediaModuleRef && typeof cleanupMediaForPeer === 'function') cleanupMediaForPeer(leftPeerId);
            updateUserList();
        });
        roomApi.onPeerStream((stream, peerId, metadata) => {
            if (window.mediaModuleRef && typeof handleMediaPeerStream === 'function') handleMediaPeerStream(stream, peerId, metadata);
        });
        logStatus("Finalizing room setup...");
        if(setupSection) setupSection.classList.add('hidden');
        if(inRoomInterface) inRoomInterface.classList.remove('hidden');
        if(currentRoomCodeSpan) currentRoomCodeSpan.textContent = currentRoomId; 
        if(currentNicknameSpan) currentNicknameSpan.textContent = escapeHtml(localNickname); 
        if (window.mediaModuleRef && window.mediaModuleRef.enableMediaButtons) window.mediaModuleRef.enableMediaButtons();
        if (sendNickname) await sendNickname({ nickname: localNickname, initialJoin: true, isHost: isHost }, Object.keys(roomApi.getPeers()).filter(p => p !== localGeneratedPeerId));
        updateUserList();
        logStatus(`You joined room: ${currentRoomId} as ${escapeHtml(localNickname)}${isHost ? ' (Host)' : ''}.`);
        if (window.mediaModuleRef) {
            if (window.mediaModuleRef.setLocalVideoFlip) window.mediaModuleRef.setLocalVideoFlip(umbraChatSettings.videoFlip, true);
            if (window.mediaModuleRef.updatePttSettings) window.mediaModuleRef.updatePttSettings(umbraChatSettings.pttEnabled, umbraChatSettings.pttKey, umbraChatSettings.pttKeyDisplay);
            if (window.mediaModuleRef.setGlobalVolume) window.mediaModuleRef.setGlobalVolume(umbraChatSettings.globalVolume, true);
        }
    } catch (error) {
        console.error("Error during room join or Trystero setup:", error);
        logStatus(`Error: ${error.message}. Could be incorrect password or network issue. Please try again.`, true); 
        resetToSetupState();
    }
}
async function leaveRoomAndCleanup() {
    logStatus("Leaving room...");
    if (window.mediaModuleRef && typeof stopAllLocalMedia === 'function') await stopAllLocalMedia(false);
    if (roomApi) {
        try { await roomApi.leave(); logStatus("Left room successfully."); }
        catch (e) { console.warn("Error leaving room:", e); }
    }
    roomApi = null;
    sendChatMessage=onChatMessage=sendNickname=onNickname=sendPrivateMessage=onPrivateMessage=sendFileMeta=onFileMeta=sendFileChunk=onFileChunk=sendChatHistory=onChatHistory=sendCreateChannel=onCreateChannel=sendInitialChannels=onInitialChannels=null;
    resetToSetupState();
}
function resetToSetupState() {
    if(inRoomInterface) inRoomInterface.classList.add('hidden');
    if(setupSection) setupSection.classList.remove('hidden');
    [createPartyBtn,joinRoomBtn,nicknameInput,roomIdInput,roomPasswordInput,joinPasswordInput,confirmCreateBtn,confirmJoinBtn].forEach(el=>el&&(el.disabled=false));
    if(createRoomFields)createRoomFields.classList.add('hidden');
    if(joinRoomFields)joinRoomFields.classList.add('hidden');
    if(roomIdInput)roomIdInput.value='';if(roomPasswordInput)roomPasswordInput.value='';if(joinPasswordInput)joinPasswordInput.value='';
    if(window.mediaModuleRef&&window.mediaModuleRef.resetMediaUIAndState)window.mediaModuleRef.resetMediaUIAndState();
    if(window.shareModuleRef&&typeof resetShareModuleStates==='function'){resetShareModuleStates();if(window.shareModuleRef.hideEmojiPicker)window.shareModuleRef.hideEmojiPicker();}
    if(userListUl)userListUl.innerHTML='';if(userCountSpan)userCountSpan.textContent='0';
    sidebarButtons.forEach(btn=>{btn.classList.remove('active');clearNotification(btn.dataset.section);});
    if(settingsSection)settingsSection.classList.add('hidden');
    contentSections.forEach(section=>section.classList.add('hidden'));
    const defaultSectionButton=document.querySelector('.sidebar-button[data-section="chatSection"]');
    const defaultSection=document.getElementById('chatSection');
    if(defaultSectionButton)defaultSectionButton.classList.add('active');
    if(defaultSection)defaultSection.classList.remove('hidden');
    currentActiveSection='chatSection';
    peerNicknames={};isHost=false;currentRoomId='';
}
if(createPartyBtn)createPartyBtn.addEventListener('click',()=>{if(joinRoomFields)joinRoomFields.classList.add('hidden');if(createRoomFields)createRoomFields.classList.remove('hidden');if(roomPasswordInput)roomPasswordInput.focus();});
if(joinRoomBtn)joinRoomBtn.addEventListener('click',()=>{if(createRoomFields)createRoomFields.classList.add('hidden');if(joinRoomFields)joinRoomFields.classList.remove('hidden');if(roomIdInput)roomIdInput.focus();});
if(confirmCreateBtn)confirmCreateBtn.addEventListener('click',()=>{isHost=true;joinRoomAndSetup();});
if(confirmJoinBtn)confirmJoinBtn.addEventListener('click',()=>{isHost=false;joinRoomAndSetup();});
if(cancelCreateBtn)cancelCreateBtn.addEventListener('click',()=>{if(createRoomFields)createRoomFields.classList.add('hidden');if(roomPasswordInput)roomPasswordInput.value='';});
if(cancelJoinBtn)cancelJoinBtn.addEventListener('click',()=>{if(joinRoomFields)joinRoomFields.classList.add('hidden');if(roomIdInput)roomIdInput.value='';if(joinPasswordInput)joinPasswordInput.value='';});
if(copyRoomCodeBtn)copyRoomCodeBtn.addEventListener('click',async()=>{if(currentRoomId){try{await copyTextToClipboard(currentRoomId);copyRoomCodeBtn.textContent='✅';copyRoomCodeBtn.title='Copied!';setTimeout(()=>{copyRoomCodeBtn.textContent='📋';copyRoomCodeBtn.title='Copy Room Code';},1500);}catch(err){logStatus('Failed to copy room code.',true);console.error('Failed to copy room code:',err);}}});

async function initializeApp() {
    localNickname = localStorage.getItem('viewPartyNickname') || '';
    if (nicknameInput) {
        nicknameInput.value = localNickname;
        nicknameInput.addEventListener('input', () => {
            localStorage.setItem('viewPartyNickname', nicknameInput.value.trim());
        });
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) console.warn("Screen sharing not supported by your browser.");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) console.warn("Video/Audio capture not supported by your browser.");
    await loadSettings();
    resetToSetupState();
    console.log('UmbraChat: Enter username and choose an action: Create or Join a room.');
    if (setupSection && !setupSection.classList.contains('hidden')) {
        const existingMessage = setupSection.querySelector('p.initial-setup-message');
        if (existingMessage) existingMessage.remove();
        const initialSetupMessage = document.createElement('p');
        initialSetupMessage.className = 'initial-setup-message';
        initialSetupMessage.textContent = 'Enter username and choose an action: Create or Join a room.';
        initialSetupMessage.style.textAlign = 'center';
        initialSetupMessage.style.marginTop = 'var(--space-md)';
        initialSetupMessage.style.color = 'var(--text-secondary, #666)';
        setupSection.appendChild(initialSetupMessage);
    }
}
initializeApp();
