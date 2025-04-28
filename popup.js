document.addEventListener('DOMContentLoaded', function() {
  const captureBtn = document.getElementById('captureBtn');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const preview = document.getElementById('preview');
  const status = document.getElementById('status');
  const resultsContainer = document.getElementById('results');
  const analysisResults = document.getElementById('analysisResults');
  const apiKeyInput = document.getElementById('apiKey');
  const saveSettingsBtn = document.getElementById('saveSettings');
  
  let currentImageData = null;

  // Load saved API key when popup opens
  chrome.storage.local.get(['groqApiKey'], (result) => {
    if (result.groqApiKey) {
      apiKeyInput.value = result.groqApiKey;
    }
  });

  // Save API key when settings are saved
  saveSettingsBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.local.set({ groqApiKey: apiKey }, () => {
        status.textContent = 'Settings saved successfully!';
        setTimeout(() => {
          status.textContent = '';
        }, 3000);
      });
    } else {
      status.textContent = 'Please enter a valid API key';
    }
  });

  // Handle screen capture
  captureBtn.addEventListener('click', async () => {
    try {
      captureBtn.disabled = true;
      status.textContent = 'Capturing screen...';

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Capture with lower quality and smaller size
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { 
        format: 'jpeg', 
        quality: 30 // Reduced quality for smaller size
      });
      
      if (dataUrl) {
        // Create a canvas to resize the image
        const img = new Image();
        img.src = dataUrl;
        
        await new Promise((resolve, reject) => {
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Calculate new dimensions (max 800px width/height)
            const maxSize = 800;
            let width = img.width;
            let height = img.height;
            
            if (width > maxSize || height > maxSize) {
              if (width > height) {
                height = (height * maxSize) / width;
                width = maxSize;
              } else {
                width = (width * maxSize) / height;
                height = maxSize;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // Draw and compress the image
            ctx.drawImage(img, 0, 0, width, height);
            currentImageData = canvas.toDataURL('image/jpeg', 0.3); // Further reduced quality
            
            preview.src = currentImageData;
            preview.style.display = 'block';
            analyzeBtn.disabled = false;
            status.textContent = 'Screen captured successfully!';
            resolve();
          };
          
          img.onerror = () => {
            reject(new Error('Failed to process image'));
          };
        });
      } else {
        status.textContent = 'Failed to capture screen';
      }
    } catch (error) {
      console.error('Error capturing screen:', error);
      status.textContent = 'Error capturing screen. Please try again.';
    } finally {
      captureBtn.disabled = false;
    }
  });

  // Send image to Groq AI
  async function analyzeWithGroq(imageData) {
    try {
      if (!imageData) {
        throw new Error('No image to analyze');
      }

      // Get API key from storage
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['groqApiKey'], resolve);
      });

      if (!result.groqApiKey) {
        throw new Error('Please enter your Groq API key in the settings');
      }
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${result.groqApiKey}`
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: imageData }
                },
                {
                  type: 'text',
                  text: 'Please analyze this image and list the top 3 most likely countries it could have been taken in. Respond with only the country names, separated by commas, and nothing else.'
                }
              ]
            }
          ],
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 413) {
          throw new Error('The image is still too large to analyze. Please try capturing a smaller area of the screen.');
        } else if (response.status === 429) {
          throw new Error('You have reached your token limit. Please try again later or upgrade your plan.');
        }
        throw new Error(`Groq API error: ${response.status} ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response from Groq API');
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error analyzing with Groq:', error);
      throw error;
    }
  }

  // Handle analyze button click
  analyzeBtn.addEventListener('click', async () => {
    try {
      analyzeBtn.disabled = true;
      resultsContainer.style.display = 'block';
      analysisResults.innerHTML = '<p class="loading">Analyzing image... This may take a moment.</p>';
      
      if (currentImageData) {
        const analysis = await analyzeWithGroq(currentImageData);
        // Parse comma-separated countries and display as pill badges
        const countries = analysis.split(',').map(c => c.trim()).filter(Boolean);
        if (countries.length > 0) {
          analysisResults.innerHTML = `<div class="pill-badges">${countries.map(c => `<span class='pill'>${c}</span>`).join('')}</div>`;
        } else {
          analysisResults.innerHTML = '<p>No countries detected.</p>';
        }
      } else {
        analysisResults.innerHTML = '<p>No image captured. Please capture an image first.</p>';
      }
    } catch (error) {
      console.error('Error during analysis:', error);
      analysisResults.innerHTML = `<p>Error analyzing image: ${error.message}</p>`;
    } finally {
      analyzeBtn.disabled = false;
    }
  });
}); 