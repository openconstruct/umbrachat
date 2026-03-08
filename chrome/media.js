// media.js

let localScreenShareStream;
let localVideoCallStream;
let localAudioStream;

let peerVideoElements = {}; // { peerId: { wrapper, video, stream, nicknameP } }
let peerAudios = {}; // { peerId: { audio_element: HTMLAudioElement, stream: MediaStream } }


let localVideoPreviewElement = null;
let localVideoFlipped = false;


let pttEnabled = false;
let pttKey = 'Space';
let pttKeyDisplay = 'Space';
let isPttKeyDown = false;


let roomApiDep, logStatusDep, showNotificationDep;
let localGeneratedPeerIdDep;
let getPeerNicknamesDep, getLocalNicknameDep, updateUserListDep;

let startShareBtn, stopShareBtn, remoteVideosContainer;
let localScreenSharePreviewContainer, localScreenSharePreviewVideo;

let startVideoCallBtn, stopVideoCallBtn, remoteVideoChatContainer;
let toggleLocalVideoPreviewCheckbox;

let startAudioCallBtn, stopAudioCallBtn, audioChatStatus;

let localGlobalVolume = 1;
let individualVolumes = {}; // { peerId: volumeValue (0-1) }

let peerScreenShareStreams = {}; // { peerId: MediaStream }

// Helper function for the delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function selectMediaDomElements() {
    startShareBtn = document.getElementById('startShareBtn');
    stopShareBtn = document.getElementById('stopShareBtn');
    remoteVideosContainer = document.getElementById('remoteVideosContainer');
    localScreenSharePreviewContainer = document.getElementById('localScreenSharePreviewContainer');
    localScreenSharePreviewVideo = document.getElementById('localScreenSharePreviewVideo');

    startVideoCallBtn = document.getElementById('startVideoCallBtn');
    stopVideoCallBtn = document.getElementById('stopVideoCallBtn');
    remoteVideoChatContainer = document.getElementById('remoteVideoChatContainer');
    toggleLocalVideoPreviewCheckbox = document.getElementById('toggleLocalVideoPreviewCheckbox');

    startAudioCallBtn = document.getElementById('startAudioCallBtn');
    stopAudioCallBtn = document.getElementById('stopAudioCallBtn');
    audioChatStatus = document.getElementById('audioChatStatus');
}

export function initMediaFeatures(dependencies) {
    selectMediaDomElements();

    roomApiDep = dependencies.roomApi;
    logStatusDep = dependencies.logStatus;
    showNotificationDep = dependencies.showNotification;
    localGeneratedPeerIdDep = dependencies.localGeneratedPeerId;
    getPeerNicknamesDep = dependencies.getPeerNicknames;
    getLocalNicknameDep = dependencies.getLocalNickname;
    updateUserListDep = dependencies.updateUserList;

    if (typeof dependencies.initialVideoFlip === 'boolean') {
        localVideoFlipped = dependencies.initialVideoFlip;
    }
    if (typeof dependencies.initialPttEnabled === 'boolean') {
        pttEnabled = dependencies.initialPttEnabled;
    }
    if (dependencies.initialPttKey) {
        pttKey = dependencies.initialPttKey;
    }
    if (dependencies.initialPttKeyDisplay) {
        pttKeyDisplay = dependencies.initialPttKeyDisplay;
    }
    if (typeof dependencies.initialGlobalVolume === 'number') {
        localGlobalVolume = dependencies.initialGlobalVolume;
    }

    if (pttEnabled) {
        window.addEventListener('keydown', handlePttKeyDown);
        window.addEventListener('keyup', handlePttKeyUp);
    }
    updateAudioChatStatusUI();

    if(startShareBtn) startShareBtn.addEventListener('click', startScreenSharing);
    if(stopShareBtn) stopShareBtn.addEventListener('click', () => stopLocalScreenShare(true));

    if(startVideoCallBtn) startVideoCallBtn.addEventListener('click', startLocalVideoCall);
    if(stopVideoCallBtn) stopVideoCallBtn.addEventListener('click', () => stopLocalVideoCall(true));

    if (toggleLocalVideoPreviewCheckbox) {
        toggleLocalVideoPreviewCheckbox.addEventListener('change', () => {
            if (localVideoCallStream) {
                if (toggleLocalVideoPreviewCheckbox.checked) {
                    addLocalVideoToGrid();
                } else {
                    removeLocalVideoFromGrid();
                }
            }
        });
    }

    if(startAudioCallBtn) startAudioCallBtn.addEventListener('click', startLocalAudioCall);
    if(stopAudioCallBtn) stopAudioCallBtn.addEventListener('click', () => stopLocalAudioCall(true));

    checkMediaCapabilities();

    return {
        enableMediaButtons,
        resetMediaUIAndState,
        updatePeerNicknameInUI,
        setLocalVideoFlip,
        updatePttSettings,
        setGlobalVolume,
        setIndividualVolume,
        getIndividualVolume,
    };
}

function checkMediaCapabilities() {
    const noDisplayMedia = !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia;
    const noGetUserMedia = !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia;

    if(startShareBtn) {
        startShareBtn.disabled = noDisplayMedia;
        if (noDisplayMedia) startShareBtn.title = "Screen sharing not supported";
        else startShareBtn.title = "Start sharing your screen";
    }
    if(stopShareBtn) stopShareBtn.disabled = true;

    if(startVideoCallBtn) {
        startVideoCallBtn.disabled = noGetUserMedia;
        if (noGetUserMedia) startVideoCallBtn.title = "Video/Audio not supported";
        else startVideoCallBtn.title = "Start Video Call";
    }
    if(stopVideoCallBtn) stopVideoCallBtn.disabled = true;

    if(startAudioCallBtn) {
        startAudioCallBtn.disabled = noGetUserMedia;
        if (noGetUserMedia) startAudioCallBtn.title = "Audio not supported";
        else startAudioCallBtn.title = "Start Audio Call";
    }
    if(stopAudioCallBtn) stopAudioCallBtn.disabled = true;
}


export function enableMediaButtons() {
    checkMediaCapabilities();
    if(startShareBtn && startShareBtn.title !== "Screen sharing not supported") startShareBtn.disabled = false;
    if(stopShareBtn) stopShareBtn.disabled = true;

    if(startVideoCallBtn && startVideoCallBtn.title !== "Video/Audio not supported") startVideoCallBtn.disabled = false;
    if(stopVideoCallBtn) stopVideoCallBtn.disabled = true;

    if(startAudioCallBtn && startAudioCallBtn.title !== "Audio not supported") {
        startAudioCallBtn.disabled = false;
    }
    if(stopAudioCallBtn) stopAudioCallBtn.disabled = true;

    updateAudioChatStatusUI();
}


async function startScreenSharing() {
    if (!roomApiDep) { logStatusDep("Not in a room.", true); return; }
    try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
            logStatusDep("Screen sharing not supported by your browser.", true);
            return;
        }
        if (localScreenShareStream) await stopLocalScreenShare(true);

        localScreenShareStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }
        });

        if (localScreenSharePreviewVideo && localScreenSharePreviewContainer) {
            localScreenSharePreviewVideo.srcObject = localScreenShareStream;
            localScreenSharePreviewVideo.muted = true;
            localScreenSharePreviewContainer.classList.remove('hidden');
        }

        await roomApiDep.addStream(localScreenShareStream, null, { streamType: 'screenshare' });
        if(startShareBtn) startShareBtn.disabled = true;
        if(stopShareBtn) stopShareBtn.disabled = false;
        showNotificationDep('screenShareSection');

        localScreenShareStream.getVideoTracks().forEach(track => {
            track.onended = () => stopLocalScreenShare(true);
        });
        localScreenShareStream.getAudioTracks().forEach(track => {
            track.onended = () => {
                if (!localScreenShareStream || !localScreenShareStream.active) {
                    stopLocalScreenShare(true);
                }
            };
        });
    } catch (err) {
        console.error("Error starting screen share:", err);
        logStatusDep(`Error starting share: ${err.name === 'NotAllowedError' ? 'Permission denied.' : err.message}`, true);
        if (localScreenShareStream) {
            localScreenShareStream.getTracks().forEach(track => track.stop());
            localScreenShareStream = null;
        }
        if (localScreenSharePreviewVideo && localScreenSharePreviewContainer) {
            localScreenSharePreviewVideo.srcObject = null;
            localScreenSharePreviewContainer.classList.add('hidden');
        }
        if (roomApiDep && startShareBtn && stopShareBtn) { startShareBtn.disabled = (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) ? false : true; stopShareBtn.disabled = true; }
    }
}

async function stopLocalScreenShare(updateButtons = true) {
    logStatusDep("Stopping screen share...");
    if (localScreenShareStream) {
        if (roomApiDep?.removeStream) {
            try { await roomApiDep.removeStream(localScreenShareStream, null, { streamType: 'screenshare' }); }
            catch (e) { console.error("Exception calling roomApi.removeStream for screen share:", e); }
        }
        localScreenShareStream.getTracks().forEach(track => { track.onended = null; track.stop(); });
        localScreenShareStream = null;
    }

    if (localScreenSharePreviewVideo && localScreenSharePreviewContainer) {
        localScreenSharePreviewVideo.srcObject = null;
        localScreenSharePreviewContainer.classList.add('hidden');
    }

    if (updateButtons && roomApiDep && startShareBtn && stopShareBtn) {
        startShareBtn.disabled = (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) ? false : true;
        stopShareBtn.disabled = true;
    }
}

function displayRemoteScreenShareStream(stream, peerId) {
    const streamPeerNickname = getPeerNicknamesDep()[peerId] || `Peer ${peerId.substring(0, 6)}`;
    logStatusDep(`Receiving Screen Share from ${streamPeerNickname}.`);

    if (!(stream instanceof MediaStream)) {
        console.error("displayRemoteScreenShareStream called with non-MediaStream object:", stream);
        logStatusDep(`Error: Received invalid screen share stream data from ${streamPeerNickname}.`);
        return;
    }
    peerScreenShareStreams[peerId] = stream;

    let videoContainer = document.getElementById(`container-screenshare-${peerId}`);
    let remoteVideo = document.getElementById(`video-screenshare-${peerId}`);

    const cleanupScreenShareUI = () => {
        const currentVideoContainer = document.getElementById(`container-screenshare-${peerId}`);
        const currentRemoteVideo = document.getElementById(`video-screenshare-${peerId}`);

        if (currentRemoteVideo) {
            currentRemoteVideo.srcObject = null;
        }
        if (currentVideoContainer && currentVideoContainer.parentNode) {
            currentVideoContainer.remove();
        }
        delete peerScreenShareStreams[peerId];
        if (!document.getElementById(`container-screenshare-${peerId}`)) {
             logStatusDep(`Screen share from ${streamPeerNickname} has ended.`);
        }
    };

    if (!videoContainer) {
        videoContainer = document.createElement('div');
        videoContainer.id = `container-screenshare-${peerId}`;
        videoContainer.classList.add('remoteVideoContainer');

        const peerInfo = document.createElement('p');
        peerInfo.textContent = `Screen from: ${streamPeerNickname}`;
        videoContainer.appendChild(peerInfo);

        remoteVideo = document.createElement('video');
        remoteVideo.id = `video-screenshare-${peerId}`;
        remoteVideo.autoplay = true;
        remoteVideo.playsinline = true;
        videoContainer.appendChild(remoteVideo);

        const maximizeBtn = document.createElement('button');
        maximizeBtn.textContent = 'Maximize';
        videoContainer.appendChild(maximizeBtn);
        if(remoteVideosContainer) remoteVideosContainer.appendChild(videoContainer);
        else console.error("remoteVideosContainer not found for screen share.")
    }

    if (remoteVideo && remoteVideo.srcObject !== stream) {
        remoteVideo.srcObject = stream;
    }
    applyVolumeToPeer(peerId);

    stream.oninactive = cleanupScreenShareUI;
    stream.getTracks().forEach(track => {
        track.onended = () => { if (!stream.active) { cleanupScreenShareUI(); }};
    });
    showNotificationDep('screenShareSection');
}

export function setLocalVideoFlip(shouldFlip, forceApply = false) {
    if (localVideoFlipped === shouldFlip && !forceApply) return;
    localVideoFlipped = shouldFlip;
    if (localVideoPreviewElement && localVideoPreviewElement.parentNode) {
        const videoEl = localVideoPreviewElement.querySelector('video');
        if (videoEl) { videoEl.style.transform = localVideoFlipped ? 'scaleX(-1)' : 'none'; }
    }
}

function addLocalVideoToGrid() {
    if (!localVideoCallStream || !remoteVideoChatContainer || localVideoPreviewElement) return;
    const wrapper = document.createElement('div');
    wrapper.classList.add('remote-video-wrapper', 'local-preview-in-grid');
    wrapper.id = `vc-wrapper-${localGeneratedPeerIdDep}`;
    const nicknameP = document.createElement('p');
    let localUserNickname = "You";
    try { if (typeof getLocalNicknameDep === 'function' && getLocalNicknameDep()) { localUserNickname = getLocalNicknameDep(); }} catch(e) { console.warn("Could not get local nickname for preview:", e)}
    nicknameP.textContent = localUserNickname + " (Preview)";
    const videoEl = document.createElement('video');
    videoEl.autoplay = true; videoEl.playsinline = true; videoEl.muted = true;
    videoEl.srcObject = localVideoCallStream;
    videoEl.style.transform = localVideoFlipped ? 'scaleX(-1)' : 'none';
    wrapper.appendChild(nicknameP); wrapper.appendChild(videoEl);
    if (remoteVideoChatContainer.firstChild) { remoteVideoChatContainer.insertBefore(wrapper, remoteVideoChatContainer.firstChild);
    } else { remoteVideoChatContainer.appendChild(wrapper); }
    localVideoPreviewElement = wrapper;
}

function removeLocalVideoFromGrid() {
    if (localVideoPreviewElement && localVideoPreviewElement.parentNode) { localVideoPreviewElement.remove(); }
    localVideoPreviewElement = null;
}

async function startLocalVideoCall() {
    if (!roomApiDep) { logStatusDep("Not in a room to start video call.", true); return; }
    try {
        if (!navigator.mediaDevices?.getUserMedia) { logStatusDep("Video call not supported by your browser.", true); return; }
        if (localVideoCallStream) await stopLocalVideoCall(true);
        localVideoCallStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (toggleLocalVideoPreviewCheckbox && toggleLocalVideoPreviewCheckbox.checked) { addLocalVideoToGrid(); }
        await roomApiDep.addStream(localVideoCallStream, null, { streamType: 'videochat' });
        if(startVideoCallBtn) startVideoCallBtn.disabled = true;
        if(stopVideoCallBtn) stopVideoCallBtn.disabled = false;
        logStatusDep("Video call started.");
        showNotificationDep('videoChatSection');
        localVideoCallStream.getTracks().forEach(track => { track.onended = () => { stopLocalVideoCall(true); }; });
    } catch (err) {
        console.error("Error starting video call:", err);
        logStatusDep(`Error starting video call: ${err.name === 'NotAllowedError' ? 'Permission denied.' : err.message}`, true);
        if (localVideoCallStream) { localVideoCallStream.getTracks().forEach(track => track.stop()); localVideoCallStream = null; }
        removeLocalVideoFromGrid();
        if (roomApiDep && startVideoCallBtn && stopVideoCallBtn) { startVideoCallBtn.disabled = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? false : true; stopVideoCallBtn.disabled = true; }
    }
}

async function stopLocalVideoCall(updateButtons = true) {
    logStatusDep("Stopping video call...");
    removeLocalVideoFromGrid();
    if (localVideoCallStream) {
        if (roomApiDep?.removeStream) { try { await roomApiDep.removeStream(localVideoCallStream, null, { streamType: 'videochat' }); } catch (e) { console.error("Exception calling roomApi.removeStream for video call:", e); } }
        localVideoCallStream.getTracks().forEach(track => { track.onended = null; track.stop(); });
        localVideoCallStream = null;
    }
    if (updateButtons && roomApiDep && startVideoCallBtn && stopVideoCallBtn) { startVideoCallBtn.disabled = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? false : true; stopVideoCallBtn.disabled = true; }
}

function handleIncomingVideoChatStream(stream, peerId) {
    if (peerId === localGeneratedPeerIdDep) return;
    const streamPeerNickname = getPeerNicknamesDep()[peerId] || `User ${peerId.substring(0, 6)}`;
    logStatusDep(`Receiving Video Chat stream from ${streamPeerNickname}.`);

    let peerElement = peerVideoElements[peerId];

    const cleanupVideoChatUI = () => {
        const currentPeerElement = peerVideoElements[peerId];
        if (currentPeerElement) {
            if (currentPeerElement.video) { currentPeerElement.video.srcObject = null; }
            if (currentPeerElement.wrapper && currentPeerElement.wrapper.parentNode) { currentPeerElement.wrapper.remove(); }
            delete peerVideoElements[peerId];
        }
        if (!peerVideoElements[peerId]) { logStatusDep(`Video chat from ${streamPeerNickname} has ended.`); }
    };

    if (!peerElement) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('remote-video-wrapper');
        wrapper.id = `vc-wrapper-${peerId}`;
        const nicknameP = document.createElement('p');
        nicknameP.textContent = streamPeerNickname;
        const videoEl = document.createElement('video');
        videoEl.autoplay = true; videoEl.playsinline = true;
        wrapper.appendChild(nicknameP); wrapper.appendChild(videoEl);
        if(remoteVideoChatContainer) remoteVideoChatContainer.appendChild(wrapper);
        else console.error("remoteVideoChatContainer not found for video chat.")
        peerElement = { wrapper, video: videoEl, stream, nicknameP };
        peerVideoElements[peerId] = peerElement;
    }

    if (peerElement.video.srcObject !== stream) {
        peerElement.video.srcObject = stream;
        peerElement.stream = stream;
    }
    if (peerElement.nicknameP.textContent !== streamPeerNickname) {
        peerElement.nicknameP.textContent = streamPeerNickname;
    }
    applyVolumeToPeer(peerId);

    stream.oninactive = cleanupVideoChatUI;
    stream.getTracks().forEach(track => {
        track.onended = () => { if (!stream.active) { cleanupVideoChatUI(); }};
    });
    showNotificationDep('videoChatSection');
}


async function startLocalAudioCall() {
    if (!roomApiDep) { 
        logStatusDep("Not in a room to start audio call.", true); 
        return; 
    }
    try {

        await delay(50);

        if (!navigator.mediaDevices?.getUserMedia) { 
            logStatusDep("Audio call not supported by your browser.", true); 
            return; 
        }
        if (localAudioStream) {
            await stopLocalAudioCall(true);
        }

        localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        if (pttEnabled && localAudioStream) {
            localAudioStream.getAudioTracks().forEach(track => track.enabled = isPttKeyDown);
        } else if (localAudioStream) {
            localAudioStream.getAudioTracks().forEach(track => track.enabled = true);
        }
        
        await roomApiDep.addStream(localAudioStream, null, { streamType: 'audiochat' });

        if(startAudioCallBtn) startAudioCallBtn.disabled = true;
        if(stopAudioCallBtn) stopAudioCallBtn.disabled = false;

        logStatusDep("Audio call started.");
        showNotificationDep('audioChatSection');
        updateAudioChatStatusUI();

        localAudioStream.getTracks().forEach(track => {
            track.onended = () => {
                stopLocalAudioCall(true);
            };
        });
    } catch (err) {
        console.error("Error starting audio call:", err);
        logStatusDep(`Error starting audio call: ${err.name === 'NotAllowedError' ? 'Permission denied.' : err.message}`, true);
        
        if (localAudioStream) {
            localAudioStream.getTracks().forEach(track => track.stop());
            localAudioStream = null;
        }
        if (roomApiDep && startAudioCallBtn && stopAudioCallBtn) {
            startAudioCallBtn.disabled = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? false : true;
            stopAudioCallBtn.disabled = true;
        }
        updateAudioChatStatusUI();
    }
}

async function stopLocalAudioCall(updateButtons = true) {
    logStatusDep("Stopping audio call...");
    if (localAudioStream) {
        if (roomApiDep?.removeStream) { 
            try { await roomApiDep.removeStream(localAudioStream, null, { streamType: 'audiochat' }); } 
            catch(e) { console.error("Exception calling roomApi.removeStream for audio call:", e); }
        }
        localAudioStream.getTracks().forEach(track => { track.onended = null; track.stop(); });
        localAudioStream = null;
    }
    if (updateButtons && roomApiDep && startAudioCallBtn && stopAudioCallBtn) {
        startAudioCallBtn.disabled = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? false : true;
        stopAudioCallBtn.disabled = true;
    }
    updateAudioChatStatusUI();
}

function handleIncomingAudioChatStream(stream, peerId) {
    if (peerId === localGeneratedPeerIdDep) return;
    const streamPeerNickname = getPeerNicknamesDep()[peerId] || `User ${peerId.substring(0, 6)}`;
    logStatusDep(`Receiving Audio Chat stream from ${streamPeerNickname}.`);

    const cleanupAudioUI = () => {
        const audioData = peerAudios[peerId];
        if (audioData && audioData.audio_element) {
            audioData.audio_element.pause();
            audioData.audio_element.srcObject = null;
            if (audioData.audio_element.parentNode) { audioData.audio_element.remove(); }
        }
        delete peerAudios[peerId];
        if (!peerAudios[peerId]) { logStatusDep(`Audio chat from ${streamPeerNickname} has ended.`); }
    };

    if (peerAudios[peerId]) { cleanupAudioUI(); }

    let audioEl = document.createElement('audio');
    document.body.appendChild(audioEl);
    peerAudios[peerId] = { audio_element: audioEl, stream: stream };

    audioEl.srcObject = stream;
    audioEl.autoplay = true;
    applyVolumeToPeer(peerId);
    audioEl.play().catch(e => console.warn(`Audio play failed for ${streamPeerNickname}:`, e));
    audioEl.addEventListener('error', (e) => { console.error(`Error with audio element for ${streamPeerNickname}:`, e); });

    stream.oninactive = cleanupAudioUI;
    stream.getTracks().forEach(track => {
        track.onended = () => { if (!stream.active) { cleanupAudioUI(); }};
    });
    showNotificationDep('audioChatSection');
}


export function handleMediaPeerStream(stream, peerId, metadata) {
    if (metadata && metadata.streamType) {
        const streamType = metadata.streamType;
        if (streamType === 'videochat') {
            handleIncomingVideoChatStream(stream, peerId);
        } else if (streamType === 'audiochat') {
            handleIncomingAudioChatStream(stream, peerId);
        } else if (streamType === 'screenshare') {
            displayRemoteScreenShareStream(stream, peerId);
        } else {
            console.warn(`Received stream from ${peerId} with unknown type: '${streamType}'.`);
        }
    } else {
        console.warn(`Received stream from ${peerId} with missing 'streamType' metadata. Metadata:`, metadata);
    }
}

export async function stopAllLocalMedia(updateButtons = true) {
    await stopLocalScreenShare(updateButtons);
    await stopLocalVideoCall(updateButtons);
    await stopLocalAudioCall(updateButtons);
}

export function setupMediaForNewPeer(joinedPeerId) {
    if (localScreenShareStream) roomApiDep.addStream(localScreenShareStream, joinedPeerId, { streamType: 'screenshare' });
    if (localVideoCallStream) roomApiDep.addStream(localVideoCallStream, joinedPeerId, { streamType: 'videochat' });
    if (localAudioStream) roomApiDep.addStream(localAudioStream, joinedPeerId, { streamType: 'audiochat' });
}

export function cleanupMediaForPeer(leftPeerId) {
    const screenShareVideoContainer = document.getElementById(`container-screenshare-${leftPeerId}`);
    if (screenShareVideoContainer) {
        const videoEl = screenShareVideoContainer.querySelector('video');
        if (videoEl) videoEl.srcObject = null;
        screenShareVideoContainer.remove();
    }
    delete peerScreenShareStreams[leftPeerId];

    if (peerVideoElements[leftPeerId]) {
        if (peerVideoElements[leftPeerId].video) peerVideoElements[leftPeerId].video.srcObject = null;
        if (peerVideoElements[leftPeerId].wrapper) peerVideoElements[leftPeerId].wrapper.remove();
        delete peerVideoElements[leftPeerId];
    }

    if (peerAudios[leftPeerId] && peerAudios[leftPeerId].audio_element) {
        peerAudios[leftPeerId].audio_element.pause();
        peerAudios[leftPeerId].audio_element.srcObject = null;
        if (peerAudios[leftPeerId].audio_element.parentNode) { peerAudios[leftPeerId].audio_element.remove(); }
    }
    delete peerAudios[leftPeerId];
    delete individualVolumes[leftPeerId];

    if (updateUserListDep) { updateUserListDep(); }
}

export function resetMediaUIAndState() {
    if (localScreenShareStream) { localScreenShareStream.getTracks().forEach(t => t.stop()); localScreenShareStream = null; }
    if (localVideoCallStream) { localVideoCallStream.getTracks().forEach(t => t.stop()); localVideoCallStream = null; }
    if (localAudioStream) { localAudioStream.getTracks().forEach(t => t.stop()); localAudioStream = null; }
    isPttKeyDown = false;

    if(remoteVideosContainer) remoteVideosContainer.innerHTML = '';
    if(localScreenSharePreviewVideo) localScreenSharePreviewVideo.srcObject = null;
    if(localScreenSharePreviewContainer) localScreenSharePreviewContainer.classList.add('hidden');
    removeLocalVideoFromGrid();
    if(remoteVideoChatContainer) remoteVideoChatContainer.innerHTML = '';

    peerVideoElements = {};
    Object.values(peerAudios).forEach(audioData => {
        if (audioData && audioData.audio_element) {
            audioData.audio_element.pause(); audioData.audio_element.srcObject = null; if(audioData.audio_element.parentNode) audioData.audio_element.remove();
        }
    });
    peerAudios = {};
    peerScreenShareStreams = {};
    individualVolumes = {};

    updateAudioChatStatusUI();
    enableMediaButtons();
}

export function updatePeerNicknameInUI(peerId, newNickname) {
    if (peerVideoElements[peerId] && peerVideoElements[peerId].nicknameP) {
        peerVideoElements[peerId].nicknameP.textContent = newNickname;
    }
    const screenShareContainer = document.getElementById(`container-screenshare-${peerId}`);
    if (screenShareContainer) {
        const pElement = screenShareContainer.querySelector('p');
        if (pElement) pElement.textContent = `Screen from: ${newNickname}`;
    }
}
function updateAudioChatStatusUI() {
    if(audioChatStatus) {
        const isActive = !!localAudioStream;
        audioChatStatus.classList.toggle('hidden', !isActive);
        audioChatStatus.textContent = isActive ? `Audio call active ${pttEnabled ? '(Push-to-Talk enabled)' : ''}` : 'Audio call inactive.';
    }
}
export function updatePttSettings(enabled, key, display) {
    const oldPttEnabled = pttEnabled;
    pttEnabled = enabled;
    pttKey = key;
    pttKeyDisplay = display;

    if (pttEnabled && !oldPttEnabled) {
        window.addEventListener('keydown', handlePttKeyDown);
        window.addEventListener('keyup', handlePttKeyUp);
        if (localAudioStream) {
            localAudioStream.getAudioTracks().forEach(track => track.enabled = isPttKeyDown);
        }
    } else if (!pttEnabled && oldPttEnabled) {
        window.removeEventListener('keydown', handlePttKeyDown);
        window.removeEventListener('keyup', handlePttKeyUp);
        isPttKeyDown = false; 
        if (localAudioStream) {
            localAudioStream.getAudioTracks().forEach(track => track.enabled = true);
        }
    }
    updateAudioChatStatusUI();
}
function handlePttKeyDown(event) {
    if (!pttEnabled || event.repeat || event.code !== pttKey) return;
    if (!isPttKeyDown) {
        isPttKeyDown = true;
        if (localAudioStream) {
            localAudioStream.getAudioTracks().forEach(track => track.enabled = true);
            logStatusDep("PTT active: Mic on");
        }
    }
}
function handlePttKeyUp(event) {
    if (!pttEnabled || event.code !== pttKey) return;
    if (isPttKeyDown) {
        isPttKeyDown = false;
        if (localAudioStream) {
            localAudioStream.getAudioTracks().forEach(track => track.enabled = false);
            logStatusDep("PTT inactive: Mic off");
        }
    }
}

function applyVolumeToPeer(peerId) {
    const individualVol = getIndividualVolume(peerId);
    const targetVolume = localGlobalVolume * individualVol;

    if (peerAudios[peerId] && peerAudios[peerId].audio_element) {
        peerAudios[peerId].audio_element.volume = targetVolume;
    }
    if (peerVideoElements[peerId] && peerVideoElements[peerId].video) {
        peerVideoElements[peerId].video.volume = targetVolume;
    }
    const screenShareVideo = document.getElementById(`video-screenshare-${peerId}`);
    if (screenShareVideo && peerScreenShareStreams[peerId] && peerScreenShareStreams[peerId].getAudioTracks().length > 0) {
        screenShareVideo.volume = targetVolume;
    }
}

export function setGlobalVolume(volume, applyToElements = true) {
    localGlobalVolume = Math.max(0, Math.min(1, volume));
    if (applyToElements) {
        const connectedPeers = getPeerNicknamesDep ? Object.keys(getPeerNicknamesDep()) : [];
        const allRelevantPeerIds = new Set([...connectedPeers, localGeneratedPeerIdDep]);

        allRelevantPeerIds.forEach(peerId => {
            if (peerAudios[peerId] || peerVideoElements[peerId] || peerScreenShareStreams[peerId]) {
                applyVolumeToPeer(peerId);
            }
        });
    }
}

export function setIndividualVolume(peerId, volume) {
    individualVolumes[peerId] = Math.max(0, Math.min(1, volume));
    applyVolumeToPeer(peerId);
}

export function getIndividualVolume(peerId) {
    return individualVolumes[peerId] !== undefined ? individualVolumes[peerId] : 1;
}
