SCHOLARDRAFT - ULTRA SIMPLE VERSION
====================================

This version uses simple file storage (no electron-store dependency).
Should work on all Windows systems without permission issues.


QUICK START
-----------

1. Open terminal/command prompt in this folder

2. Run:
   npm install

3. Run:
   npm start

4. In the app:
   - Click Settings (gear icon)
   - Paste your OpenAI API key
   - Click "Save Key"
   - Start polishing!


BUILD EXECUTABLE
----------------

Windows EXE:
   npm run build-win

Mac DMG:
   npm run build-mac

Look in the "dist" folder for your file.


FEATURES
--------

✓ 9 Field-Specific Modes
  - Standard Academic
  - Medical & Clinical
  - Computer Science
  - Engineering
  - Humanities
  - Legal
  - Grant Proposal
  - Statement of Purpose
  - Simple Clarity

✓ Multiple Export Formats
  - Text (.txt) - Simple text file
  - Word (.docx) - Formatted Microsoft Word document
  - PDF (.pdf) - Professional PDF with formatting
  - JSON (.json) - Includes original, polished text, and metadata

✓ Safety Features
  - Citations preserved
  - Data unchanged
  - LaTeX protected
  - No hallucination

✓ Cost Tracking
  - Real-time estimates
  - Statistics tracking
  - GPT-4o-mini: ~$0.0001 per 500 words
  - GPT-4o: ~$0.002 per 500 words


HOW TO EXPORT
-------------

After polishing your text:
1. Click the export button (💾 ▼)
2. Choose your format:
   - .txt for simple text
   - .docx for Word (includes formatting)
   - .pdf for PDF (includes formatting)
   - .json for data with metadata
3. For PDF/DOCX: Enter title, author, subject (optional)
4. Save to your preferred location

JSON export includes:
- Original text
- Polished text
- Mode used
- Model used
- Word counts
- Timestamp


CUSTOMIZATION
-------------

Edit "prompts.json" to add your own modes.
The app will automatically load them.


STORAGE LOCATION
----------------

Your API key and settings are saved in:
Windows: C:\Users\YourName\AppData\Roaming\scholardraft-simple\config.json
Mac: ~/Library/Application Support/scholardraft-simple/config.json


TROUBLESHOOTING
---------------

"npm not found"
→ Install Node.js from nodejs.org

"Polish Text disabled"
→ Set API key in Settings first

"API key invalid"
→ Get new key at platform.openai.com/api-keys

Permission errors
→ Run terminal as administrator (right-click → Run as administrator)


WHAT'S DIFFERENT
----------------

This version uses simple JSON file storage instead of electron-store.
This avoids Windows permission issues that can occur with some setups.

Everything else works exactly the same!


Happy Polishing! 📚✨
