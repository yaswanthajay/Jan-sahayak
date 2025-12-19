
import React from 'react';
import { AgentState } from '../types';

interface VoiceAgentProps {
  state: AgentState;
}

const VoiceAgent: React.FC<VoiceAgentProps> = ({ state }) => {
  if (state === AgentState.IDLE) return null;

  return (
    <div className="fixed bottom-10 right-10 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
      <div className="relative flex items-center justify-center">
        {state === AgentState.SPEAKING && (
          <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-25"></div>
        )}
        {state === AgentState.LISTENING && (
          <div className="absolute inset-0 bg-green-400 rounded-full animate-pulse opacity-25"></div>
        )}
        <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-colors duration-500 ${
          state === AgentState.SPEAKING ? 'bg-blue-600' :
          state === AgentState.LISTENING ? 'bg-green-600' :
          state === AgentState.THINKING ? 'bg-orange-500' : 'bg-red-600'
        }`}>
          {state === AgentState.SPEAKING && (
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
          {state === AgentState.LISTENING && (
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
          {state === AgentState.THINKING && (
            <svg className="w-8 h-8 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          {state === AgentState.ERROR && (
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
        </div>
      </div>
      <span className="bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest shadow-lg">
        {state}
      </span>
    </div>
  );
};

export default VoiceAgent;
