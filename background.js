let mediaRecorder = null;
let recordedChunks = [];
let currentStream = null;

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Street Savvy extension installed');
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'storeImage') {
    chrome.storage.local.set({ lastCapture: request.imageData }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startRecording') {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // Inject content script if not already injected
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['content.js']
        }, () => {
          // Send message to content script
          chrome.tabs.sendMessage(tabs[0].id, { action: 'startRecording' }, (response) => {
            if (response && response.success) {
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: response?.error || 'Unknown error' });
            }
          });
        });
      }
    });
    return true; // Keep the message channel open for async response
  } else if (request.action === 'stopRecording') {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // Send message to content script
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stopRecording' }, (response) => {
          sendResponse(response || { success: true });
        });
      }
    });
    return true; // Keep the message channel open for async response
  } else if (request.action === 'getRecordingStatus') {
    // For now, we'll assume recording is not in progress
    // In a real implementation, you might want to track this state
    sendResponse({ isRecording: false });
  }
});

async function startRecording() {
  try {
    // Get screen stream
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        mediaSource: 'screen'
      }
    });

    currentStream = stream;
    recordedChunks = [];
    
    // Create media recorder
    mediaRecorder = new MediaRecorder(stream);
    
    // Handle data available
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    // Handle recording stop
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      
      // Store the recording
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        chrome.storage.local.set({ lastRecording: reader.result });
      };
    };

    // Start recording
    mediaRecorder.start();
    
    // Notify popup that recording has started
    chrome.runtime.sendMessage({ action: 'recordingStarted' });
  } catch (error) {
    console.error('Error starting recording:', error);
    chrome.runtime.sendMessage({ action: 'recordingError', error: error.message });
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
    chrome.runtime.sendMessage({ action: 'recordingStopped' });
  }
} 