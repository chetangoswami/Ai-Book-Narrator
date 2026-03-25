import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (apiKey: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [apiKey, setApiKey] = useState('');
  const [ttsProvider, setTtsProvider] = useState('gemini');
  const [sarvamApiKey, setSarvamApiKey] = useState('');

  useEffect(() => {
    if (isOpen) {
      setApiKey(localStorage.getItem('gemini_api_key') || '');
      setTtsProvider(localStorage.getItem('tts_provider') || 'gemini');
      setSarvamApiKey(localStorage.getItem('sarvam_api_key') || '');
    }
  }, [isOpen]);

  const handleSave = () => {
    const key = apiKey.trim();
    if (key) {
      localStorage.setItem('gemini_api_key', key);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
    
    localStorage.setItem('tts_provider', ttsProvider);
    
    const sKey = sarvamApiKey.trim();
    if (sKey) {
      localStorage.setItem('sarvam_api_key', sKey);
    } else {
      localStorage.removeItem('sarvam_api_key');
    }

    if (onSave) onSave(key);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">Settings</h2>
        
        <div className="mb-6 space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-2">
              Gemini API Key (Required for Text Extraction)
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="AIzaSy..."
            />
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">
              Your key is stored locally in your browser.
            </p>
          </div>

          <div>
            <label htmlFor="ttsProvider" className="block text-sm font-medium text-gray-300 mb-2">
              Text-To-Speech Provider
            </label>
            <select
              id="ttsProvider"
              value={ttsProvider}
              onChange={(e) => setTtsProvider(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="gemini">Google Gemini (Free Tier Restricted)</option>
              <option value="sarvam">Sarvam AI (Indic Languages)</option>
            </select>
          </div>

          {ttsProvider === 'sarvam' && (
            <div>
              <label htmlFor="sarvamApiKey" className="block text-sm font-medium text-gray-300 mb-2">
                Sarvam API Key
              </label>
              <input
                id="sarvamApiKey"
                type="password"
                value={sarvamApiKey}
                onChange={(e) => setSarvamApiKey(e.target.value)}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Required for Sarvam Voices"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
