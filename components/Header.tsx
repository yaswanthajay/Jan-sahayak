
import React from 'react';
import { Language, SUPPORTED_LANGUAGES, INDIAN_STATES } from '../types';

interface HeaderProps {
  selectedLanguage: Language;
  onLanguageChange: (lang: Language) => void;
  selectedState: string;
  onStateChange: (state: string) => void;
  isLive: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
  selectedLanguage, 
  onLanguageChange, 
  selectedState, 
  onStateChange, 
  isLive 
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm shrink-0">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 via-white to-green-500 rounded-xl flex items-center justify-center border shadow-sm">
             <span className="text-slate-900 font-black text-xl">🇮🇳</span>
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-slate-800">
              Jan <span className="text-blue-600">Sahayak</span>
            </h1>
            <div className="flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              Verified Portal
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* State Selector */}
          <div className="hidden sm:block relative">
            <select
              disabled={isLive}
              value={selectedState}
              onChange={(e) => onStateChange(e.target.value)}
              className="text-[10px] font-black uppercase tracking-wider px-3 py-2 bg-slate-50 border border-slate-100 rounded-full text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-all cursor-pointer hover:bg-slate-100"
            >
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>

          {/* Language Selector */}
          <select
            id="lang-select"
            disabled={isLive}
            value={selectedLanguage.code}
            onChange={(e) => {
              const lang = SUPPORTED_LANGUAGES.find(l => l.code === e.target.value);
              if (lang) onLanguageChange(lang);
            }}
            className="text-[10px] font-black px-4 py-2 bg-blue-600 rounded-full text-white border-none outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-all cursor-pointer hover:bg-blue-700 shadow-md shadow-blue-100"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
};

export default Header;
