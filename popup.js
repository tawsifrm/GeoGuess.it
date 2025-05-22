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
                  text: `You are an expert in geolocation and visual analysis. Please analyze this image carefully and provide the most likely countries where this photo could have been taken, ordered by probability. Consider the following factors in your analysis:
                  
                  1. Architecture and building styles
                  2. Road signs, license plates, and text language
                  3. Vehicle types and their configurations (steering wheel side, etc.)
                  4. Vegetation and natural landscape
                  5. Weather and climate indicators
                  6. Any visible flags, symbols, or landmarks
                  7. Street furniture and infrastructure
                  8. People's clothing and appearance
                  
                  For each country, provide:
                  - The full official country name
                  - A detailed explanation of the visual evidence supporting this guess
                  - A confidence percentage (1-100%)
                  
                  Format your response as valid JSON with this exact structure:
                  {
                    "countries": [
                      {
                        "name": "Full Country Name",
                        "reasoning": "Detailed analysis of visual evidence including specific elements that indicate this location. Mention any distinctive features, signs, or environmental factors that support this conclusion.",
                        "confidence": 85
                      },
                      ...
                    ]
                  }
                  
                  Be precise and specific in your analysis. If you see text, mention what it says and what language it appears to be in. Note any unique architectural styles, vehicle types, or environmental features that are characteristic of specific regions.`
                }
              ]
            }
          ],
          response_format: { type: "json_object" },
          max_tokens: 1500
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
      
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response from Groq API');
      }

      try {
        // Parse the JSON response from the model
        const content = JSON.parse(data.choices[0].message.content);
        return content.countries || [];
      } catch (e) {
        console.error('Error parsing API response:', e);
        throw new Error('Failed to parse the analysis results');
      }
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
        if (analysis.length > 0) {
          // Using HTML entities for emojis for better compatibility
          const countryEmojis = ['&#x31;&#xFE0F;&#x20E3;', '&#x32;&#xFE0F;&#x20E3;', '&#x33;&#xFE0F;&#x20E3;'];
          
          // Create a function to safely escape HTML
          const escapeHtml = (unsafe) => {
            return unsafe
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
          };

          analysisResults.innerHTML = `
            <div class="pill-badges">
              ${analysis.map((country, index) => {
                const safeReasoning = escapeHtml(country.reasoning);
                const confidence = country.confidence ? ` (${Math.round(country.confidence)}% confidence)` : '';
                return `
                  <div class="country-container">
                    <div class="pill" data-reasoning="${safeReasoning}" data-confidence="${country.confidence || 0}">
                      <span class="emoji" aria-hidden="true">${countryEmojis[index] || '🌍'}</span>
                      <span class="country-name">${country.name}${confidence}</span>
                      <span class="info-icon">V</span>
                    </div>
                    <div class="reasoning" style="display: none;"></div>
                  </div>`;
              }).join('')}
            </div>
          `;
          
          // Add click handlers for the pills
          document.querySelectorAll('.pill').forEach(pill => {
            pill.addEventListener('click', function() {
              const reasoningDiv = this.nextElementSibling;
              const isVisible = reasoningDiv.style.display === 'block';
              
              // Hide all reasoning divs first
              document.querySelectorAll('.reasoning').forEach(el => {
                el.style.display = 'none';
                el.previousElementSibling.classList.remove('active');
              });
              
              // Toggle the clicked one if it wasn't already visible
              if (!isVisible) {
                reasoningDiv.style.display = 'block';
                // Use innerHTML to properly render any HTML entities
                reasoningDiv.innerHTML = this.dataset.reasoning
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#039;/g, "'");
                this.classList.add('active');
              }
            });
          });
        } else {
          analysisResults.innerHTML = '<p class="no-results">No countries detected. Try capturing a different image.</p>';
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