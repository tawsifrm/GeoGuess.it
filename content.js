let mediaRecorder = null;
let recordedChunks = [];
let currentStream = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startRecording') {
    startRecording().then(sendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === 'stopRecording') {
    stopRecording();
    sendResponse({ success: true });
  }
});

async function startRecording() {
  try {
    // Get screen stream
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        mediaSource: 'screen',
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    // Handle when user stops sharing
    stream.getVideoTracks()[0].onended = () => {
      stopRecording();
    };

    currentStream = stream;
    recordedChunks = [];
    
    // Create media recorder with higher quality settings
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 2500000
    });
    
    // Handle data available
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
        console.log('Chunk received:', event.data.size);
      }
    };

    // Handle recording stop
    mediaRecorder.onstop = async () => {
      console.log('Recording stopped, chunks:', recordedChunks.length);
      if (recordedChunks.length > 0) {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        console.log('Blob created:', blob.size);
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          console.log('Base64 conversion complete');
          // Store the recording
          chrome.storage.local.set({ 
            lastRecording: reader.result,
            recordingSize: blob.size,
            recordingType: blob.type
          }, () => {
            console.log('Recording stored in chrome.storage');
            // Notify popup that recording is ready
            chrome.runtime.sendMessage({ 
              action: 'recordingReady',
              size: blob.size
            });
          });
        };
        reader.readAsDataURL(blob);
      } else {
        console.error('No chunks recorded');
        chrome.runtime.sendMessage({ 
          action: 'recordingError',
          error: 'No recording data available'
        });
      }
    };

    // Start recording with a small timeslice to ensure we don't lose data
    mediaRecorder.start(100);
    console.log('Recording started');
    
    return { success: true };
  } catch (error) {
    console.error('Error starting recording:', error);
    return { success: false, error: error.message };
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    console.log('Stopping recording...');
    mediaRecorder.stop();
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
  }
} 