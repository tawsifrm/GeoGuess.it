# GeoGuess.it

GeoGuess.it is a Chrome extension that allows users to capture and analyze street views. The extension captures the visible tab and uses Groq AI to analyze the image and provide the top 3 most likely countries where the image could have been taken.

## Installation

To install the extension, follow these steps:

1. Clone the repository:
   ```
   git clone https://github.com/tawsifrm/GeoGuess.it.git
   ```
2. Navigate to the project directory:
   ```
   cd GeoGuess.it
   ```
3. Install the dependencies:
   ```
   npm install
   ```
4. Generate the icons:
   ```
   npm run generate-icons
   ```
5. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked" and select the project directory

## Usage

To use the extension, follow these steps:

1. Click on the extension icon in the Chrome toolbar.
2. In the popup, click the "Capture Screen" button to capture the visible tab.
3. Once the screen is captured, click the "Analyze" button to send the image to Groq AI for analysis.
4. The top 3 most likely countries where the image could have been taken will be displayed in the popup.

