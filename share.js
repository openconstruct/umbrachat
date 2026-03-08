let chatHistory = [];
let incomingFileBuffers = new Map();
let channels = [];
let currentActiveChannelId = null;
let currentReplyParentId = null; // NEW: To track which message we are replying to
const MAX_THREAD_DEPTH = 4; // NEW: Max reply depth



let sendChatMessageDep, sendPrivateMessageDep, sendFileMetaDep, sendFileChunkDep;
let sendChatHistoryDep;
let sendCreateChannelDep, onCreateChannelDep;
let sendInitialChannelsDep, onInitialChannelsDep;


let logStatusDep, showNotificationDep;
let localGeneratedPeerIdDep;
let getPeerNicknamesDep, getIsHostDep, getLocalNicknameDep, findPeerIdByNicknameDepFnc;
let currentRoomIdDep;

let chatArea, messageInput, sendMessageBtn, emojiIcon, emojiPickerPopup, triggerFileInput, chatFileInput;
let channelListDiv, newChannelNameInput, addChannelBtn;
let replyingToBanner, replyingToText, cancelReplyBtn; // NEW: For reply UI

const IMAGE_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/svg+xml'
];
const MIN_PREVIEW_DIM = 140;
const MAX_PREVIEW_DIM = 240;

async function generateImagePreview(file) {
    return new Promise((resolve) => {
        if (!IMAGE_MIME_TYPES.includes(file.type)) {
            resolve(null);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                let newWidth, newHeight;
                const originalWidth = img.width;
                const originalHeight = img.height;
                const aspectRatio = originalWidth / originalHeight;

                if (originalWidth >= originalHeight) {
                    newWidth = Math.min(MAX_PREVIEW_DIM, Math.max(MIN_PREVIEW_DIM, originalWidth));
                    newHeight = newWidth / aspectRatio;

                    if (newHeight < MIN_PREVIEW_DIM && originalHeight >= MIN_PREVIEW_DIM) {
                        newHeight = MIN_PREVIEW_DIM;
                        newWidth = newHeight * aspectRatio;
                    } else if (newHeight > MAX_PREVIEW_DIM) {
                        newHeight = MAX_PREVIEW_DIM;
                        newWidth = newHeight * aspectRatio;
                    }
                } else {
                    newHeight = Math.min(MAX_PREVIEW_DIM, Math.max(MIN_PREVIEW_DIM, originalHeight));
                    newWidth = newHeight * aspectRatio;

                    if (newWidth < MIN_PREVIEW_DIM && originalWidth >= MIN_PREVIEW_DIM) {
                        newWidth = MIN_PREVIEW_DIM;
                        newHeight = newWidth / aspectRatio;
                    } else if (newWidth > MAX_PREVIEW_DIM) {
                        newWidth = MAX_PREVIEW_DIM;
                        newHeight = newWidth / aspectRatio;
                    }
                }

                if (newWidth > MAX_PREVIEW_DIM) {
                    newWidth = MAX_PREVIEW_DIM;
                    newHeight = newWidth / aspectRatio;
                }
                if (newHeight > MAX_PREVIEW_DIM) {
                    newHeight = MAX_PREVIEW_DIM;
                    newWidth = newHeight * aspectRatio;
                }
                                
                newWidth = Math.max(1, Math.round(Math.min(MAX_PREVIEW_DIM, newWidth)));
                newHeight = Math.max(1, Math.round(Math.min(MAX_PREVIEW_DIM, newHeight)));


                canvas.width = newWidth;
                canvas.height = newHeight;
                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                let previewDataURL;
                if (file.type === 'image/gif') {
                    previewDataURL = canvas.toDataURL('image/png');
                } else if (file.type === 'image/png' || file.type === 'image/svg+xml') {
                     previewDataURL = canvas.toDataURL('image/png');
                } else {
                     previewDataURL = canvas.toDataURL('image/jpeg', 0.90);
                }
                resolve(previewDataURL);
            };
            img.onerror = () => {
                console.warn("Failed to load image for preview generation:", file.name);
                resolve(null);
            };
            img.src = e.target.result;
        };
        reader.onerror = () => {
            console.warn("Failed to read file for preview generation:", file.name);
            resolve(null);
        };
        reader.readAsDataURL(file);
    });
}


function selectChatDomElements() {
    chatArea = document.getElementById('chatArea');
    messageInput = document.getElementById('messageInput');
    sendMessageBtn = document.getElementById('sendMessageBtn');
    emojiIcon = document.querySelector('.emoji-icon');
    emojiPickerPopup = document.getElementById('emojiPickerPopup');
    triggerFileInput = document.getElementById('triggerFileInput');
    chatFileInput = document.getElementById('chatFileInput');

    channelListDiv = document.getElementById('channelList');
    newChannelNameInput = document.getElementById('newChannelNameInput');
    addChannelBtn = document.getElementById('addChannelBtn');

    // NEW: Select reply UI elements
    replyingToBanner = document.getElementById('replyingToBanner');
    replyingToText = document.getElementById('replyingToText');
    cancelReplyBtn = document.getElementById('cancelReplyBtn');
}


function debounce(func, delay) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

export function initShareFeatures(dependencies) {
    selectChatDomElements();


    logStatusDep = dependencies.logStatus;
    showNotificationDep = dependencies.showNotification;
    localGeneratedPeerIdDep = dependencies.localGeneratedPeerId;
    getPeerNicknamesDep = dependencies.getPeerNicknames;
    getIsHostDep = dependencies.getIsHost;
    getLocalNicknameDep = dependencies.getLocalNickname;
    findPeerIdByNicknameDepFnc = dependencies.findPeerIdByNicknameFnc;
    currentRoomIdDep = dependencies.currentRoomId;

    
    sendChatMessageDep = dependencies.sendChatMessage;
    sendPrivateMessageDep = dependencies.sendPrivateMessage;
    sendFileMetaDep = dependencies.sendFileMeta;
    sendFileChunkDep = dependencies.sendFileChunk;
    sendChatHistoryDep = dependencies.sendChatHistory;
    sendCreateChannelDep = dependencies.sendCreateChannel;
    sendInitialChannelsDep = dependencies.sendInitialChannels;
    
    initChat();
    
    if (getIsHostDep && getIsHostDep()) {
        const generalChannelExists = channels.some(ch => ch.name === "#general");
        if (!generalChannelExists) {
            _createAndBroadcastChannel("#general", channels.length === 0); 
        }
    } else {
        if (channels.length > 0 && !currentActiveChannelId) {
            setActiveChannel(channels[0].id, false);
        }
    }


    renderChannelList();
    displayChatForCurrentChannel();

    return { 
      
        handleChatMessage, handlePrivateMessage, handleFileMeta, handleFileChunk,
        handleChatHistory, 
        handleCreateChannel, handleInitialChannels,

        sendFullStateToPeer,
        displaySystemMessage,
        updateChatMessageInputPlaceholder,
        primePrivateMessage,
        hideEmojiPicker,
        initializeEmojiPicker,
        handleShareModulePeerLeave 
    };
}

export function handleShareModulePeerLeave(peerId) {
    const keysToDelete = [];
    for (const [key, value] of incomingFileBuffers.entries()) {
        if (key.startsWith(`${peerId}_`)) {
            const peerNickname = (getPeerNicknamesDep && getPeerNicknamesDep()[peerId]) ? getPeerNicknamesDep()[peerId] : peerId.substring(0,6);
            if(logStatusDep) logStatusDep(`File transfer for ${value.meta.name} from departing peer ${peerNickname} cancelled.`);
            
            const safeSenderNickname = peerNickname.replace(/\W/g, '');
            const safeFileName = value.meta.name.replace(/\W/g, '');
            const progressId = `file-progress-${safeSenderNickname}-${safeFileName}`;
            const progressElem = document.getElementById(progressId);
            if (progressElem) progressElem.textContent = ` (Cancelled)`;
            keysToDelete.push(key);
        }
    }
    keysToDelete.forEach(key => incomingFileBuffers.delete(key));

  
}


function initChat() {
    if (!sendMessageBtn || !messageInput || !triggerFileInput || !chatFileInput || !emojiIcon || !emojiPickerPopup) return;
    if (!addChannelBtn || !newChannelNameInput || !channelListDiv) return; 

    sendMessageBtn.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSendMessage(); });

    triggerFileInput.addEventListener('click', () => chatFileInput.click());
    chatFileInput.addEventListener('change', handleChatFileSelected);
    
    // NEW: Add listener for the cancel reply button
    if (cancelReplyBtn) {
        cancelReplyBtn.addEventListener('click', cancelReply);
    }

    emojiIcon.addEventListener('click', (event) => {
        event.stopPropagation();
        const isHidden = emojiPickerPopup.classList.toggle('hidden');
        if (!isHidden && emojiPickerPopup.children.length === 0) {
            populateEmojiPicker();
        }
        messageInput.focus();
    });
    document.addEventListener('click', (event) => {
        if (emojiPickerPopup && !emojiPickerPopup.classList.contains('hidden') && !emojiPickerPopup.contains(event.target) && event.target !== emojiIcon) {
            emojiPickerPopup.classList.add('hidden');
        }
    });
    if (emojiPickerPopup) {
        emojiPickerPopup.addEventListener('mouseleave', () => {
            emojiPickerPopup.classList.add('hidden');
        });
    }
    addChannelBtn.addEventListener('click', handleAddChannelUI);
}

// NEW: Function to start a reply to a specific message
function startReplyToMessage(msgId) {
    const parentMessage = chatHistory.find(m => m.msgId === msgId);
    if (!parentMessage) return;

    currentReplyParentId = msgId;

    let contentPreview = parentMessage.message || `File: ${parentMessage.fileMeta.name}`;
    if (contentPreview.length > 50) {
        contentPreview = contentPreview.substring(0, 47) + '...';
    }
    
    if (replyingToText) replyingToText.textContent = `Replying to ${parentMessage.senderNickname}: "${contentPreview}"`;
    if (replyingToBanner) replyingToBanner.classList.remove('hidden');
    if (messageInput) messageInput.focus();
}

// NEW: Function to cancel the current reply
function cancelReply() {
    currentReplyParentId = null;
    if (replyingToBanner) replyingToBanner.classList.add('hidden');
    if (replyingToText) replyingToText.textContent = '';
}

export function initializeEmojiPicker() {
    if(emojiPickerPopup && emojiPickerPopup.children.length === 0) populateEmojiPicker();
}

function populateEmojiPicker() {
    if (!emojiPickerPopup) return;
    emojiPickerPopup.innerHTML = '';
    const emojis = ['😊', '😂', '❤️', '👍', '🙏', '🎉', '🔥', '👋', '✅', '🤔', '😢', '😮', '😭', '😍', '💯', '🌟', '✨', '🎁', '🎈', '🎂', '🍕', '🚀', '💡', '🤷', '🤦'];
    emojis.forEach(emoji => {
        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = emoji;
        emojiSpan.setAttribute('role', 'button');
        emojiSpan.title = `Insert ${emoji}`;
        emojiSpan.addEventListener('click', () => {
            insertEmojiIntoInput(emoji);
            emojiPickerPopup.classList.add('hidden');
        });
        emojiPickerPopup.appendChild(emojiSpan);
    });
}

function insertEmojiIntoInput(emoji) {
    if (!messageInput) return;
    const cursorPos = messageInput.selectionStart;
    const textBefore = messageInput.value.substring(0, cursorPos);
    const textAfter = messageInput.value.substring(cursorPos);
    messageInput.value = textBefore + emoji + textAfter;
    messageInput.focus();
    const newCursorPos = cursorPos + emoji.length;
    messageInput.setSelectionRange(newCursorPos, newCursorPos);
}

export function hideEmojiPicker() {
    if(emojiPickerPopup) emojiPickerPopup.classList.add('hidden');
}

function _createAndBroadcastChannel(channelName, isDefault = false) {
    if (!channelName || !channelName.trim()) return null;

    let userProvidedName = channelName.trim();
    if (userProvidedName.startsWith('#')) {
        userProvidedName = userProvidedName.substring(1);
    }

    if (userProvidedName.length > 16) {
        if(logStatusDep && !isDefault) logStatusDep(`Channel name "${userProvidedName}" is too long. Maximum 16 characters.`, true);
        return null;
    }
    
    let saneChannelName = channelName.trim();
    if (!saneChannelName.startsWith('#')) {
        saneChannelName = '#' + saneChannelName;
    }
    saneChannelName = saneChannelName.replace(/\s+/g, '-').toLowerCase(); 

    if (channels.find(ch => ch.name === saneChannelName)) {
        if(logStatusDep && !isDefault) {
            const wasIntentionalCreation = newChannelNameInput && newChannelNameInput.value.trim().toLowerCase().includes(userProvidedName.toLowerCase());
            if (wasIntentionalCreation) {
                 logStatusDep(`Channel "${saneChannelName}" already exists.`, true);
            }
        }
        return channels.find(ch => ch.name === saneChannelName);
    }

    const newChannel = { id: `ch-${Date.now()}-${Math.random().toString(36).substring(2,5)}`, name: saneChannelName };
    channels.push(newChannel);
    
    if (sendCreateChannelDep) {
        sendCreateChannelDep(newChannel); 
    }
    if (isDefault || channels.length === 1) { 
        setActiveChannel(newChannel.id, false);
    }
    renderChannelList();
    return newChannel;
}


function handleAddChannelUI() {
    if (!newChannelNameInput) return;
    const channelName = newChannelNameInput.value;
    const createdChannel = _createAndBroadcastChannel(channelName);
    if (createdChannel) {
        newChannelNameInput.value = '';
        if(logStatusDep && !channels.find(ch => ch.id === createdChannel.id && ch.name === createdChannel.name && channels.indexOf(ch) < channels.length -1 )) {
            logStatusDep(`Channel "${createdChannel.name}" created.`);
        }
    }
}

function renderChannelList() {
    if (!channelListDiv) return;
    channelListDiv.innerHTML = '';
    channels.forEach(channel => {
        const channelItem = document.createElement('div');
        channelItem.classList.add('channel-list-item');
        channelItem.textContent = channel.name;
        channelItem.dataset.channelId = channel.id;
        if (channel.id === currentActiveChannelId) {
            channelItem.classList.add('active');
        }
        channelItem.addEventListener('click', () => setActiveChannel(channel.id));

        const notifDot = document.createElement('span');
        notifDot.classList.add('channel-notification-dot', 'hidden'); 
        channelItem.appendChild(notifDot);

        channelListDiv.appendChild(channelItem);
    });
}

function setActiveChannel(channelId, clearNotifications = true) {
    if (currentActiveChannelId === channelId && !clearNotifications) {
        renderChannelList(); 
        return;
    }
    currentActiveChannelId = channelId;
    cancelReply(); // NEW: Cancel reply when switching channels
    renderChannelList(); 
    displayChatForCurrentChannel();

    if (clearNotifications && channelListDiv) { 
        const channelDot = channelListDiv.querySelector(`.channel-list-item[data-channel-id="${channelId}"] .channel-notification-dot`);
        if (channelDot) {
            channelDot.classList.add('hidden');
        }
    }
    if(messageInput) { 
        const activeChannel = channels.find(c=>c.id === channelId);
        messageInput.placeholder = `Message ${activeChannel?.name || (currentRoomIdDep || '')}`;
    }
}

// MODIFIED: This function is now the entry point for rendering the entire chat, including threads.
function displayChatForCurrentChannel() {
    if (!chatArea) return;
    chatArea.innerHTML = '';

    const messagesForChannel = chatHistory.filter(msg => 
        (msg.channelId === currentActiveChannelId) || // Messages in the channel
        (msg.isSystem && !msg.pmInfo) // System messages that aren't PM confirmations
    );

    const messagesById = new Map(messagesForChannel.map(msg => [msg.msgId, msg]));
    const childrenByParentId = new Map();

    messagesForChannel.forEach(msg => {
        if (msg.parentId && messagesById.has(msg.parentId)) {
            const parentId = msg.parentId;
            if (!childrenByParentId.has(parentId)) {
                childrenByParentId.set(parentId, []);
            }
            childrenByParentId.get(parentId).push(msg);
        }
    });

    const topLevelMessages = messagesForChannel.filter(msg => !msg.parentId || !messagesById.has(msg.parentId));
    
    topLevelMessages.forEach(msg => {
        renderMessageAndThread(msg, 0, messagesById, childrenByParentId, chatArea);
    });

    chatArea.scrollTop = chatArea.scrollHeight;
}

// NEW: Recursive function to render a message and its replies.
function renderMessageAndThread(msgObject, depth, messagesById, childrenByParentId, container) {
    // Render the message itself
    const threadContainer = document.createElement('div');
    threadContainer.classList.add('message-thread-container');
    displayMessage(msgObject, msgObject.senderPeerId === localGeneratedPeerIdDep, msgObject.isSystem, threadContainer, depth);
    container.appendChild(threadContainer);
    
    // Render its replies
    const children = childrenByParentId.get(msgObject.msgId);
    if (children && children.length > 0) {
        const repliesContainer = document.createElement('div');
        repliesContainer.classList.add('thread-replies-container');
        threadContainer.appendChild(repliesContainer);

        children.forEach(reply => {
            renderMessageAndThread(reply, depth + 1, messagesById, childrenByParentId, repliesContainer);
        });
    }
}


// MODIFIED: displayMessage is now more of a pure renderer.
// It takes a container to append to and knows the thread depth.
function displayMessage(msgObject, isSelf = false, isSystem = false, container, depth = 0) {
    if (!container) return;
    const { msgId, senderNickname, message, pmInfo, fileMeta, timestamp } = msgObject;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    const displayTimestamp = timestamp ? new Date(timestamp) : new Date();
    const hours = String(displayTimestamp.getHours()).padStart(2, '0');
    const minutes = String(displayTimestamp.getMinutes()).padStart(2, '0');
    const timestampStr = `${hours}:${minutes}`;
    const timestampSpan = document.createElement('span');
    timestampSpan.classList.add('timestamp');
    timestampSpan.textContent = timestampStr;

    if (isSystem) {
        messageDiv.classList.add('system-message');
        messageDiv.appendChild(document.createTextNode(message + " "));
    } else if (pmInfo) {
        // PMs are not threaded, so they are always top-level.
        messageDiv.classList.add('pm');
        messageDiv.classList.add(isSelf ? 'self' : 'other');
        const pmContextSpan = document.createElement('span');
        pmContextSpan.classList.add('pm-info');
        pmContextSpan.textContent = pmInfo.type === 'sent' ? `To ${pmInfo.recipient}:` : `From ${pmInfo.sender}:`;
        messageDiv.appendChild(pmContextSpan);
        messageDiv.appendChild(document.createTextNode(message + " "));
    } else if (fileMeta) {
        messageDiv.classList.add(isSelf ? 'self' : 'other');
        messageDiv.classList.add('file-message');
        
        const senderSpan = document.createElement('span'); senderSpan.classList.add('sender');
        senderSpan.textContent = isSelf ? 'You' : senderNickname;
        messageDiv.appendChild(senderSpan);

        const fileInfoContainer = document.createElement('div');
        fileInfoContainer.classList.add('file-info-container');

        const previewLink = document.createElement('a'); 
        previewLink.classList.add('chat-file-preview-link');
        previewLink.title = `Click to download ${fileMeta.name}`; 
        if (fileMeta.blobUrl) {
            previewLink.href = fileMeta.blobUrl;
            previewLink.download = fileMeta.name;
        } else {
            previewLink.href = "#"; 
            previewLink.onclick = (e) => e.preventDefault(); 
        }

        if (fileMeta.previewDataURL) {
            const previewImg = document.createElement('img');
            previewImg.src = fileMeta.previewDataURL;
            previewImg.alt = `Preview of ${fileMeta.name}`;
            previewImg.classList.add('chat-file-preview');
            previewLink.appendChild(previewImg); 
            fileInfoContainer.appendChild(previewLink);
        }

        const fileTextInfoSpan = document.createElement('span');
        fileTextInfoSpan.classList.add('file-text-info');
        const fileNameStrong = document.createElement('strong');
        fileNameStrong.textContent = fileMeta.name;
        const fileSizeSpan = document.createTextNode(` (${(fileMeta.size / 1024).toFixed(2)} KB) `);
        
        fileTextInfoSpan.appendChild(document.createTextNode("Shared: "));
        fileTextInfoSpan.appendChild(fileNameStrong);
        fileTextInfoSpan.appendChild(fileSizeSpan);
        
        if (!fileMeta.previewDataURL && fileMeta.blobUrl) { 
            const downloadLink = document.createElement('a');
            downloadLink.href = fileMeta.blobUrl;
            downloadLink.download = fileMeta.name;
            downloadLink.textContent = 'Download';
            fileTextInfoSpan.appendChild(downloadLink);
        } else if (fileMeta.receiving || (!fileMeta.blobUrl && !isSelf)) {
            const progressSpan = document.createElement('span');
            const safeSName = (isSelf ? (getLocalNicknameDep ? getLocalNicknameDep() : 'You') : senderNickname).replace(/\W/g, '');
            const safeFName = fileMeta.name.replace(/\W/g, '');
            progressSpan.id = `file-progress-${safeSName}-${safeFName}`;
            
            let initialProgressText = "";
            if (isSelf && fileMeta.receiving) initialProgressText = ` (Sending 0%)`;
            else if (!isSelf && !fileMeta.blobUrl) initialProgressText = ` (Receiving 0%)`;
            
            progressSpan.textContent = initialProgressText;
            if(initialProgressText) fileTextInfoSpan.appendChild(progressSpan);
        } else if (isSelf && !fileMeta.receiving && fileMeta.blobUrl && !fileMeta.previewDataURL) { 
             const sentSpan = document.createElement('span');
             sentSpan.textContent = " (Sent)";
             fileTextInfoSpan.appendChild(sentSpan);
        }

        fileInfoContainer.appendChild(fileTextInfoSpan);
        messageDiv.appendChild(fileInfoContainer);

    } else { 
        messageDiv.classList.add(isSelf ? 'self' : 'other');
        const senderSpan = document.createElement('span'); senderSpan.classList.add('sender');
        senderSpan.textContent = isSelf ? 'You' : senderNickname;
        messageDiv.appendChild(senderSpan);
        messageDiv.appendChild(document.createTextNode(message + " "));
    }

    messageDiv.appendChild(timestampSpan);

    // NEW: Add Reply button if not a system message and depth is not too great
    if (!isSystem && !pmInfo && depth < MAX_THREAD_DEPTH) {
        const replyBtn = document.createElement('button');
        replyBtn.textContent = '↪';
        replyBtn.title = 'Reply to this message';
        replyBtn.classList.add('reply-btn');
        replyBtn.onclick = () => startReplyToMessage(msgId);
        messageDiv.appendChild(replyBtn);
    }
    
    container.appendChild(messageDiv);
}


// MODIFIED: Add a message to history and re-render the chat
function addMessageToHistoryAndDisplay(msgData, isSelf = false, isSystem = false) {
    let channelIdForMsg = msgData.channelId;
    
    if (isSelf && !isSystem && !msgData.pmInfo && !msgData.fileMeta) {
        channelIdForMsg = currentActiveChannelId;
    }

    const fullMsgObject = {
        ...msgData,
        msgId: msgData.msgId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, // Ensure msgId
        channelId: (msgData.isSystem || msgData.pmInfo) ? null : channelIdForMsg, 
        timestamp: msgData.timestamp || Date.now(),
        senderPeerId: isSelf ? localGeneratedPeerIdDep : msgData.senderPeerId,
        isSystem: isSystem
    };
    
    if (!chatHistory.some(m => m.msgId === fullMsgObject.msgId)) {
        chatHistory.push(fullMsgObject);
    }
    
    if (fullMsgObject.pmInfo) { // PMs are not threaded and displayed in a flat list in a separate view/context
        displaySystemMessage(`Private message with ${fullMsgObject.pmInfo.recipient || fullMsgObject.pmInfo.sender} not displayed in channel.`);
    } else if (fullMsgObject.channelId === currentActiveChannelId) {
        displayChatForCurrentChannel();
    }
}

// MODIFIED: Handle sending a reply
function handleSendMessage() {
    const messageText = messageInput.value.trim();
    if (!messageText || !sendChatMessageDep) return;
    const timestamp = Date.now();
    const localCurrentNickname = getLocalNicknameDep ? getLocalNicknameDep() : 'You';
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    if (messageText.toLowerCase().startsWith('/pm ')) {
         const parts = messageText.substring(4).split(' ');
        const targetNickname = parts.shift();
        const pmContent = parts.join(' ').trim();
        if (!targetNickname || !pmContent) {
            displaySystemMessage("Usage: /pm <nickname> <message>"); return;
        }
        if (targetNickname.toLowerCase() === localCurrentNickname.toLowerCase()) {
            displaySystemMessage("You can't PM yourself."); return;
        }
        const targetPeerId = findPeerIdByNicknameDepFnc ? findPeerIdByNicknameDepFnc(targetNickname) : null;
        if (targetPeerId && sendPrivateMessageDep) {
            // PMs are not part of the channel/thread system
            sendPrivateMessageDep({ content: pmContent, timestamp }, targetPeerId);
            displaySystemMessage(`Sent PM to ${targetNickname}: ${pmContent}`);
        } else {
            displaySystemMessage(`User "${targetNickname}" not found or PM failed.`);
        }
    } else { 
        if (!currentActiveChannelId) {
            displaySystemMessage("Please select a channel to send a message.");
            return;
        }
        const msgData = { 
            message: messageText, 
            timestamp, 
            msgId,
            channelId: currentActiveChannelId,
            parentId: currentReplyParentId // Add parentId if it exists
        };
        sendChatMessageDep(msgData);
        addMessageToHistoryAndDisplay({ senderNickname: localCurrentNickname, ...msgData }, true);
    }
    messageInput.value = '';
    cancelReply(); // Reset reply state after sending
    if (emojiPickerPopup && !emojiPickerPopup.classList.contains('hidden')) emojiPickerPopup.classList.add('hidden');
}

async function handleChatFileSelected(event) {
    const file = event.target.files[0];
    if (!file || !sendFileMetaDep || !sendFileChunkDep) return;
    const localCurrentNickname = getLocalNicknameDep ? getLocalNicknameDep() : 'You';

    if(logStatusDep) logStatusDep(`Preparing to send file: ${file.name}`);
    
    const previewDataURL = await generateImagePreview(file);
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const fileMeta = { 
        name: file.name, 
        type: file.type, 
        size: file.size, 
        id: Date.now().toString(), // Legacy file id for chunking
        previewDataURL: previewDataURL 
    };
 
    const msgData = {
        senderNickname: localCurrentNickname,
        fileMeta: { ...fileMeta, receiving: true, blobUrl: URL.createObjectURL(file) },
        timestamp: Date.now(),
        msgId: msgId,
        channelId: currentActiveChannelId,
        parentId: currentReplyParentId
    };

    addMessageToHistoryAndDisplay(msgData, true);
    
    // Send all relevant metadata for threading and identification
    sendFileMetaDep({
        ...fileMeta,
        msgId: msgId,
        channelId: currentActiveChannelId,
        parentId: currentReplyParentId
    });

    cancelReply(); // Reset reply state after sending

    const CHUNK_SIZE = 16 * 1024;
    let offset = 0;
    const reader = new FileReader();

    reader.onload = (e) => {
        const chunkData = e.target.result;
        const isFinal = (offset + chunkData.byteLength) >= file.size;
        sendFileChunkDep(chunkData, null, { fileName: fileMeta.name, fileId: fileMeta.id, final: isFinal });
        
        const safeLocalNickname = localCurrentNickname.replace(/\W/g, '');
        const safeFileName = fileMeta.name.replace(/\W/g, '');
        const progressId = `file-progress-${safeLocalNickname}-${safeFileName}`;

        const progressElem = document.getElementById(progressId);
        if (progressElem) {
            progressElem.textContent = ` (Sending ${Math.min(100, Math.round(((offset + chunkData.byteLength) / file.size) * 100))}%)`;
        }

        if (!isFinal) {
            offset += chunkData.byteLength;
            readNextChunk();
        } else {
            if(logStatusDep) logStatusDep(`File ${file.name} sent.`);
            const localMsgEntry = chatHistory.find(m => m.msgId === msgId);
            if (localMsgEntry && localMsgEntry.fileMeta) {
                delete localMsgEntry.fileMeta.receiving; 
                if (progressElem) progressElem.textContent = ` (Sent 100%)`;
            }
        }
    };
    reader.onerror = (error) => {
        if(logStatusDep) logStatusDep(`Error reading file: ${error}`, true);
        const safeLocalNickname = localCurrentNickname.replace(/\W/g, '');
        const safeFileName = fileMeta.name.replace(/\W/g, '');
        const progressId = `file-progress-${safeLocalNickname}-${safeFileName}`;
        const progressElem = document.getElementById(progressId);
        if (progressElem) progressElem.textContent = ` (Error sending)`;
    };
    function readNextChunk() {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
    }
    readNextChunk();
    chatFileInput.value = '';
}

export function handleChatMessage(msgData, peerId) {
    const senderNickname = (getPeerNicknamesDep && getPeerNicknamesDep()[peerId]) ? getPeerNicknamesDep()[peerId] : `Peer ${peerId.substring(0, 6)}`;
    const fullMsgObject = { ...msgData, senderNickname, senderPeerId: peerId, timestamp: msgData.timestamp || Date.now() };
    
    if (!chatHistory.some(m => m.msgId === fullMsgObject.msgId)) {
        chatHistory.push(fullMsgObject);
    }
     
    if (fullMsgObject.channelId === currentActiveChannelId) {
        displayChatForCurrentChannel(); // Re-render to place the new message correctly in its thread
    } else if (fullMsgObject.channelId && channelListDiv) {
        const channelDot = channelListDiv.querySelector(`.channel-list-item[data-channel-id="${fullMsgObject.channelId}"] .channel-notification-dot`);
        if (channelDot) {
            channelDot.classList.remove('hidden');
        }
    }
    if (peerId !== localGeneratedPeerIdDep && showNotificationDep) showNotificationDep('chatSection');
}
export function handlePrivateMessage(pmData, senderPeerId) {
    const sender = (getPeerNicknamesDep && getPeerNicknamesDep()[senderPeerId]) ? getPeerNicknamesDep()[senderPeerId] : `Peer ${senderPeerId.substring(0, 6)}`;
    // PMs are not part of threaded channels, just log them as a system message for now.
    displaySystemMessage(`Received PM from ${sender}: ${pmData.content}`);
    if (peerId !== localGeneratedPeerIdDep && showNotificationDep) showNotificationDep('chatSection'); 
}
export function handleFileMeta(meta, peerId) {
    const senderNickname = (getPeerNicknamesDep && getPeerNicknamesDep()[peerId]) ? getPeerNicknamesDep()[peerId] : `Peer ${peerId.substring(0, 6)}`;
    const bufferKey = `${peerId}_${meta.id}`;
    incomingFileBuffers.set(bufferKey, { meta, chunks: [], receivedBytes: 0 });
    
    const msgData = {
        senderNickname,
        fileMeta: { ...meta, receiving: true },
        senderPeerId: peerId,
        timestamp: Date.now(),
        msgId: meta.msgId,
        channelId: meta.channelId,
        parentId: meta.parentId
    };

    if (!chatHistory.some(m => m.msgId === msgData.msgId)) {
        chatHistory.push(msgData);
    }

    if (msgData.channelId === currentActiveChannelId) {
        displayChatForCurrentChannel();
    }

    if(logStatusDep) logStatusDep(`${senderNickname} is sending file: ${meta.name}`);
    if (peerId !== localGeneratedPeerIdDep && showNotificationDep) showNotificationDep('chatSection');
}
export function handleFileChunk(chunk, peerId, chunkMeta) {
    const senderNickname = (getPeerNicknamesDep && getPeerNicknamesDep()[peerId]) ? getPeerNicknamesDep()[peerId] : `Peer ${peerId.substring(0, 6)}`;
    const bufferKey = `${peerId}_${chunkMeta.fileId}`;
    const fileBuffer = incomingFileBuffers.get(bufferKey);

    if (fileBuffer) {
        fileBuffer.chunks.push(chunk);
        fileBuffer.receivedBytes += chunk.byteLength;
        const progress = Math.round((fileBuffer.receivedBytes / fileBuffer.meta.size) * 100);

        const safeSenderNickname = senderNickname.replace(/\W/g, '');
        const safeFileName = fileBuffer.meta.name.replace(/\W/g, '');
        const progressId = `file-progress-${safeSenderNickname}-${safeFileName}`;
        const progressElem = document.getElementById(progressId);
        if (progressElem) progressElem.textContent = ` (Receiving ${progress}%)`;

        if (chunkMeta.final || fileBuffer.receivedBytes >= fileBuffer.meta.size) {
            const completeFile = new Blob(fileBuffer.chunks, { type: fileBuffer.meta.type });
            const blobUrl = URL.createObjectURL(completeFile);

            const msgToUpdate = chatHistory.find(msg => 
                msg.msgId === fileBuffer.meta.msgId
            );
            if (msgToUpdate && msgToUpdate.fileMeta) {
                msgToUpdate.fileMeta.blobUrl = blobUrl;
                delete msgToUpdate.fileMeta.receiving;
            }

            if (chatArea && msgToUpdate.channelId === currentActiveChannelId) {
                displayChatForCurrentChannel();
            }
            if(logStatusDep) logStatusDep(`File ${fileBuffer.meta.name} from ${senderNickname} received.`);
            incomingFileBuffers.delete(bufferKey);
        }
    } else {
        console.warn(`Received chunk for unknown file: ${chunkMeta.fileName} from ${senderNickname}`);
    }
}
export function handleChatHistory(history, peerId) {
    if (getIsHostDep && !getIsHostDep()) {
        chatHistory = history;
        chatHistory.forEach(msg => {
            if (!msg.msgId) { // Backwards compatibility for old chat histories
                msg.msgId = `msg-${msg.timestamp || Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            }
            if (msg.isSystem === undefined && (msg.message?.includes("joined") || msg.message?.includes("left") || msg.message?.startsWith("Error:") || msg.message?.includes("now known as") || msg.message?.includes("You joined room:") )) {
                msg.isSystem = true;
            }
        });
        if (currentActiveChannelId) {
            displayChatForCurrentChannel();
        }
        if(logStatusDep) logStatusDep(`Received chat history from ${(getPeerNicknamesDep && getPeerNicknamesDep()[peerId]) ? getPeerNicknamesDep()[peerId] : 'host'}.`);
    }
}
export function updateChatMessageInputPlaceholder() {
    if(messageInput) {
        const activeChannel = channels.find(c => c.id === currentActiveChannelId);
        messageInput.placeholder = `Message ${activeChannel?.name || (currentRoomIdDep || 'current channel')}`;
    }
}
export function primePrivateMessage(nickname) {
    if (messageInput) {
        messageInput.value = `/pm ${nickname} `;
        messageInput.focus();
    }
}

export function handleCreateChannel(newChannelData, peerId) {
    if (!channels.find(ch => ch.id === newChannelData.id)) {
        channels.push(newChannelData);
        renderChannelList();
        if (peerId !== localGeneratedPeerIdDep && logStatusDep) {
            const senderName = (getPeerNicknamesDep && getPeerNicknamesDep()[peerId]) ? getPeerNicknamesDep()[peerId] : 'another user';
            logStatusDep(`Channel "${newChannelData.name}" created by ${senderName}.`);
        }
        if (!currentActiveChannelId && channels.length === 1) {
            setActiveChannel(newChannelData.id, false);
        }
    }
}

export function handleInitialChannels(receivedChannels, peerId) {
    if (getIsHostDep && !getIsHostDep()) {
        channels = receivedChannels || [];
        
        const generalChannelExists = channels.some(ch => ch.name === "#general");
        if (!generalChannelExists) {
             _createAndBroadcastChannel("#general", channels.length === 0);
        }

        if (channels.length > 0 && (!currentActiveChannelId || !channels.find(c => c.id === currentActiveChannelId))) {
            currentActiveChannelId = channels[0].id;
        }
        
        renderChannelList();
        if (chatHistory.length > 0) {
             displayChatForCurrentChannel();
        }
        if(logStatusDep) logStatusDep(`Received channel list from ${(getPeerNicknamesDep && getPeerNicknamesDep()[peerId]) ? getPeerNicknamesDep()[peerId] : 'host'}.`);
    }
}

export function sendFullStateToPeer(peerId) {
    if (getIsHostDep && getIsHostDep()) {
        if (sendInitialChannelsDep) sendInitialChannelsDep(channels, peerId);
        if (sendChatHistoryDep && chatHistory.length > 0) sendChatHistoryDep(chatHistory, peerId);
    }
}

export function displaySystemMessage(message) {
    const msgData = { 
        message, 
        timestamp: Date.now(), 
        isSystem: true,
        channelId: currentActiveChannelId, // Show system message in the current channel
        msgId: `msg-sys-${Date.now()}`
    };
    addMessageToHistoryAndDisplay(msgData, false, true);
}

export function resetShareModuleStates(isCreatingHost = false) {
    chatHistory = [];
    if (chatArea) chatArea.innerHTML = '';
    if (messageInput) messageInput.value = '';
    incomingFileBuffers.clear();

    channels = [];
    currentActiveChannelId = null;
    cancelReply(); // NEW: Reset reply state
    if(channelListDiv) channelListDiv.innerHTML = '';
    if(newChannelNameInput) newChannelNameInput.value = '';
}
