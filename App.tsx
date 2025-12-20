
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AgentState, TranscriptionEntry, Language, SUPPORTED_LANGUAGES, UserProfile, Scheme, INDIAN_STATES, AgentThought, ChatSession } from './types';
import { searchSchemesTool, validateEligibilityTool, applyForSchemeTool, changeLanguageTool, updateUserProfileTool, toolHandlers, MOCK_SCHEMES } from './services/tools';
import Header from './components/Header';
import VoiceAgent from './components/VoiceAgent';

const App: React.FC = () => {
  const [agentState, setAgentState] = useState<AgentState>(AgentState.AWAITING_LOCATION);
  const [thoughts, setThoughts] = useState<AgentThought[]>([]);
  const [history, setHistory] = useState<TranscriptionEntry[]>([]);
  const [pastSessions, setPastSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(SUPPORTED_LANGUAGES[0]);
  const [userProfile, setUserProfile] = useState<UserProfile>({ state: 'Andhra Pradesh' });
  const [visibleSchemes, setVisibleSchemes] = useState<Scheme[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [systemAlert, setSystemAlert] = useState<{ type: 'error' | 'warning', message: string } | null>(null);
  
  const [liveUserText, setLiveUserText] = useState("");
  const [liveModelText, setLiveModelText] = useState("");
  const userBufferRef = useRef("");
  const modelBufferRef = useRef("");

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  const [audioLevel, setAudioLevel] = useState(0);
  const analyzerRef = useRef<AnalyserNode | null>(null);

  // --- SYSTEM HEALTH DIAGNOSTICS ---
  useEffect(() => {
    const checkEnvironment = async () => {
      // 1. Secure Context (HTTPS/Localhost)
      if (!window.isSecureContext) {
        setSystemAlert({
          type: 'error',
          message: "MICROPHONE BLOCKED: You are on an insecure link. Use 'https://' or 'localhost' to enable voice."
        });
        return;
      }

      // 2. API Key Check (Safe for production)
      const key = process.env.API_KEY;
      if (!key) {
        setSystemAlert({
          type: 'warning',
          message: "API KEY NOT DETECTED: Ensure process.env.API_KEY is configured in your settings."
        });
      }

      // 3. Permission State
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as any });
        if (status.state === 'denied') {
          setSystemAlert({
            type: 'error',
            message: "PERMISSION DENIED: Reset your browser microphone settings to use Jan Sahayak."
          });
        }
      } catch (e) {}
    };
    checkEnvironment();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('jan_sahayak_sessions');
    if (saved) {
      try { setPastSessions(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const saveSession = useCallback((finalHistory: TranscriptionEntry[]) => {
    if (finalHistory.length < 2) return; 
    const newSession: ChatSession = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      language: selectedLanguage.name,
      history: finalHistory,
      summary: finalHistory.find(h => h.role === 'user')?.text.substring(0, 40) + "..." || "Voice Call"
    };
    const updated = [newSession, ...pastSessions].slice(0, 20);
    setPastSessions(updated);
    localStorage.setItem('jan_sahayak_sessions', JSON.stringify(updated));
  }, [pastSessions, selectedLanguage.name]);

  useEffect(() => {
    const relevant = MOCK_SCHEMES.filter(s => 
      (s.language === selectedLanguage.code) &&
      (s.state === 'All' || s.state.toLowerCase() === userProfile.state?.toLowerCase())
    );
    setVisibleSchemes(relevant);
  }, [userProfile.state, selectedLanguage.code]);

  const addThought = (phase: AgentThought['phase'], message: string) => {
    setThoughts(prev => [{ phase, message, timestamp: Date.now() }, ...prev].slice(0, 10));
  };

  const updateStateAndSchemes = (stateName: string, lat?: number, lng?: number) => {
    setUserProfile(prev => ({ ...prev, state: stateName, lat, lng }));
    addThought('MEMORY', `Location set to ${stateName}.`);
    setAgentState(AgentState.IDLE);
    setErrorMessage(null);
  };

  const requestLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => updateStateAndSchemes("Andhra Pradesh"),
        () => updateStateAndSchemes("Andhra Pradesh"),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      updateStateAndSchemes("Andhra Pradesh");
    }
  };

  // --- AUDIO UTILS ---
  const decode = (base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) => {
    const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const encode = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const createBlob = (data: Float32Array) => {
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
    return { 
      data: encode(new Uint8Array(int16.buffer, 0, int16.byteLength)), 
      mimeType: 'audio/pcm;rate=16000' 
    };
  };

  const stopAllAudio = useCallback(() => {
    if (sourcesRef.current) {
      sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
      sourcesRef.current.clear();
    }
    nextStartTimeRef.current = 0;
  }, []);

  const commitTurn = useCallback(() => {
    const uText = userBufferRef.current.trim();
    const mText = modelBufferRef.current.trim();
    if (uText || mText) {
      const newEntries: TranscriptionEntry[] = [
        ...(uText ? [{ text: uText, role: 'user', timestamp: Date.now() } as TranscriptionEntry] : []),
        ...(mText ? [{ text: mText, role: 'model', timestamp: Date.now() } as TranscriptionEntry] : [])
      ];
      setHistory(prev => [...prev, ...newEntries]);
    }
    userBufferRef.current = ""; modelBufferRef.current = "";
    setLiveUserText(""); setLiveModelText("");
  }, []);

  const handleMessage = async (message: LiveServerMessage) => {
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && outputAudioContextRef.current) {
      setAgentState(AgentState.SPEAKING);
      const ctx = outputAudioContextRef.current;
      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
      const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (sourcesRef.current) sourcesRef.current.delete(source);
        if (sourcesRef.current && sourcesRef.current.size === 0) setAgentState(AgentState.LISTENING);
      };
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      // FIX: Use current.add
      if (sourcesRef.current) sourcesRef.current.add(source);
    }

    if (message.serverContent?.inputTranscription) {
      userBufferRef.current += message.serverContent.inputTranscription.text;
      setLiveUserText(userBufferRef.current);
    }
    if (message.serverContent?.outputTranscription) {
      modelBufferRef.current += message.serverContent.outputTranscription.text;
      setLiveModelText(modelBufferRef.current);
    }
    if (message.serverContent?.turnComplete) commitTurn();

    if (message.toolCall) {
      setAgentState(AgentState.THINKING);
      for (const fc of message.toolCall.functionCalls) {
        let result: any;
        if (fc.name === 'update_user_profile') {
          result = await toolHandlers.update_user_profile(fc.args, (update) => setUserProfile(p => ({ ...p, ...update })));
          addThought('MEMORY', 'Internal records updated.');
        } else if (fc.name === 'search_schemes') {
          const results = await toolHandlers.search_schemes({ ...fc.args, language_code: selectedLanguage.code });
          result = results;
          addThought('EVALUATE', `Found ${results.length} matched portals.`);
        } else {
          result = await (toolHandlers as any)[fc.name]?.(fc.args);
        }
        
        sessionPromiseRef.current?.then(session => {
            if (session) session.sendToolResponse({
                functionResponses: { id: fc.id, name: fc.name, response: { result: JSON.stringify(result) } }
            });
        });
      }
    }
  };

  const startSession = async () => {
    try {
      setAgentState(AgentState.THINKING);
      setErrorMessage(null);
      
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API_KEY_NOT_FOUND");

      const ai = new GoogleGenAI({ apiKey });
      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Force resume to satisfy browser autoplay policy
      if (inCtx.state === 'suspended') await inCtx.resume();
      if (outCtx.state === 'suspended') await outCtx.resume();

      inputAudioContextRef.current = inCtx; 
      outputAudioContextRef.current = outCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
        throw new Error("MIC_ACCESS_DENIED");
      });
      
      const analyzer = inCtx.createAnalyser();
      analyzerRef.current = analyzer;
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      const updateVisualizer = () => {
        if (!analyzerRef.current) return;
        analyzer.getByteFrequencyData(dataArray);
        setAudioLevel(dataArray.reduce((a, b) => a + b, 0) / dataArray.length);
        requestAnimationFrame(updateVisualizer);
      };
      updateVisualizer();

      addThought('PLAN', 'Establishing Native Voice Link...');

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are "Jan Sahayak", the official AI agent for welfare schemes in India.
          Language: ${selectedLanguage.name}. ALWAYS use the search_schemes tool to verify data.`,
          tools: [{ functionDeclarations: [searchSchemesTool, validateEligibilityTool, applyForSchemeTool, changeLanguageTool, updateUserProfileTool] }],
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsLive(true); 
            setAgentState(AgentState.LISTENING);
            const source = inCtx.createMediaStreamSource(stream);
            source.connect(analyzer);
            const processor = inCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const blob = createBlob(inputData);
              sessionPromise.then(session => {
                if (session) session.sendRealtimeInput({ media: blob });
              });
            };
            source.connect(processor); 
            processor.connect(inCtx.destination);
            addThought('PLAN', 'Secure Agentic Link: ACTIVE.');
          },
          onmessage: handleMessage,
          onerror: (e: any) => {
            setAgentState(AgentState.ERROR);
            setIsLive(false);
            setErrorMessage("Communication Error: WebSocket link to Gemini was interrupted. This usually means the API Key is invalid or rate limited.");
          },
          onclose: () => { setIsLive(false); setAgentState(AgentState.IDLE); }
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) { 
      setAgentState(AgentState.ERROR); 
      setIsLive(false);
      if (err.message === "MIC_ACCESS_DENIED") {
        setErrorMessage("Microphone Denied: Browsers block microphones on non-HTTPS sites. Use localhost or https.");
      } else if (err.message === "API_KEY_NOT_FOUND") {
        setErrorMessage("Configuration Missing: process.env.API_KEY is not defined.");
      } else {
        setErrorMessage("Agent Startup Failed: " + (err.message || "Unknown error."));
      }
    }
  };

  const stopSession = () => {
    commitTurn();
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(s => { try { s?.close(); } catch(e) {} });
    }
    stopAllAudio();
    setIsLive(false); 
    setAgentState(AgentState.IDLE);
    sessionPromiseRef.current = null;
    analyzerRef.current = null;
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    saveSession([...history]);
  };

  if (agentState === AgentState.AWAITING_LOCATION) {
    return (
      <div className="h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 mb-10 bg-gradient-to-t from-orange-500 via-white to-green-500 rounded-2xl flex items-center justify-center shadow-2xl animate-pulse">
           <span className="text-3xl">🇮🇳</span>
        </div>
        <h1 className="text-5xl font-black text-white mb-4 tracking-tighter italic">Jan Sahayak AI</h1>
        <p className="text-slate-400 max-w-md mb-12 text-lg">World-Class Agentic AI for Government Welfare. Powered by Multimodal Native Intelligence.</p>
        <button onClick={requestLocation} className="px-12 py-5 bg-white text-slate-900 rounded-full font-black text-xl hover:bg-slate-100 transition-all shadow-2xl active:scale-95">
          Enter AI Portal
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 font-sans overflow-hidden">
      <Header selectedLanguage={selectedLanguage} onLanguageChange={setSelectedLanguage} selectedState={userProfile.state || ""} onStateChange={updateStateAndSchemes} isLive={isLive} />
      
      {/* Alert Banner */}
      {systemAlert && (
        <div className={`py-2 px-6 text-center text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-4 ${systemAlert.type === 'error' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white shadow-lg'}`}>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          {systemAlert.message}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-72 border-r border-slate-200 bg-slate-50 hidden lg:flex flex-col p-6 overflow-y-auto custom-scrollbar">
           <div className="mb-8">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Memory Context</h3>
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                 <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-slate-500">Active State:</span>
                    <span className="text-blue-600 font-black uppercase tracking-tighter">{userProfile.state}</span>
                 </div>
              </div>
           </div>

           <div className="mb-8">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Chat History</h3>
              <div className="space-y-3">
                 {pastSessions.length === 0 ? (
                   <p className="text-[10px] text-slate-400 italic">No past sessions yet.</p>
                 ) : (
                   pastSessions.map(session => (
                     <button key={session.id} onClick={() => setSelectedSession(session)} className="w-full text-left p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-400 transition-all text-[11px] font-medium leading-tight">
                       {session.summary}
                     </button>
                   ))
                 )}
              </div>
           </div>

           <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Thinking Chain</h3>
              <div className="space-y-4">
                 {thoughts.map((t, i) => (
                   <div key={i} className="flex gap-3">
                      <div className={`w-1 rounded-full shrink-0 ${t.phase === 'PLAN' ? 'bg-blue-400' : 'bg-green-400'}`} />
                      <p className="text-[10px] font-medium text-slate-700 leading-tight">{t.message}</p>
                   </div>
                 ))}
              </div>
           </div>
        </aside>

        <main className="flex-1 flex flex-col p-4 md:p-6 min-w-0 bg-slate-100/30">
          {errorMessage && (
            <div className="mb-4 p-5 bg-red-100 border-2 border-red-200 text-red-800 text-sm font-bold rounded-2xl flex items-start gap-4 shadow-xl">
              <svg className="w-6 h-6 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
              <p className="opacity-90">{errorMessage}</p>
            </div>
          )}
          
          <div className="flex-1 bg-white rounded-[2rem] shadow-2xl border border-slate-200/50 overflow-hidden flex flex-col relative">
            <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth custom-scrollbar">
              {history.length === 0 && !liveUserText && !liveModelText ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                  <h2 className="text-3xl font-black text-slate-800 mb-2 italic">Agentic Portal Ready</h2>
                  <p className="text-sm font-medium">Native ${selectedLanguage.name} support is active.</p>
                </div>
              ) : (
                <>
                  {history.map((e, i) => (
                    <div key={i} className={`flex ${e.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-[1.5rem] px-6 py-4 text-base shadow-sm border ${e.role === 'user' ? 'bg-blue-600 text-white border-blue-500 font-medium' : 'bg-slate-50 text-slate-800 border-slate-200 leading-relaxed'}`}>
                        {e.text}
                      </div>
                    </div>
                  ))}
                  {liveUserText && <div className="flex justify-end opacity-50 italic"><div className="bg-blue-50 px-5 py-3 rounded-full text-sm font-bold border border-blue-100">{liveUserText}</div></div>}
                  {liveModelText && <div className="flex justify-start"><div className="bg-white border-blue-200 border-2 px-5 py-3 rounded-[1.5rem] text-sm font-medium shadow-md animate-pulse">{liveModelText}</div></div>}
                </>
              )}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-center">
              {!isLive ? (
                <button 
                  onClick={startSession} 
                  disabled={systemAlert?.type === 'error'}
                  className="px-14 py-6 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-full font-black text-xl shadow-2xl shadow-blue-200 transition-all active:scale-95 flex items-center gap-4 group"
                >
                   Start Voice Session
                </button>
              ) : (
                <button onClick={stopSession} className="px-14 py-6 bg-red-600 hover:bg-red-700 text-white rounded-full font-black text-xl shadow-2xl shadow-red-200 transition-all active:scale-95 flex items-center gap-4 group">
                   Disconnect Agent
                </button>
              )}
            </div>
          </div>
        </main>

        <aside className="w-96 border-l border-slate-200 bg-white hidden xl:flex flex-col shadow-xl z-10 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
             <h3 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Schemes Database</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/30">
            {visibleSchemes.length === 0 ? (
              <div className="h-40 border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center text-slate-300">
                <span className="text-[10px] font-black uppercase tracking-widest">Awaiting user query...</span>
              </div>
            ) : (
              visibleSchemes.map((s) => (
                <div key={s.id} className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm p-6 group hover:shadow-md transition-shadow">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider mb-3 bg-blue-100 text-blue-600">
                      {s.state} Portal
                    </span>
                    <h5 className="font-black text-slate-800 text-lg mb-2 leading-tight group-hover:text-blue-600 transition-colors">{s.name}</h5>
                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mb-5 italic">{s.description}</p>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="w-full py-3 bg-white border border-slate-200 text-blue-600 rounded-xl text-xs font-black text-center block hover:bg-blue-50">Official Portal</a>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md">
          <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden">
             <div className="p-8 border-b flex justify-between items-center bg-slate-50">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight italic">Memory Recall</h3>
                <button onClick={() => setSelectedSession(null)} className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center font-bold">X</button>
             </div>
             <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar bg-slate-100/20">
                {selectedSession.history.map((entry, idx) => (
                  <div key={idx} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-[1.8rem] px-8 py-5 text-base shadow-sm border-2 ${entry.role === 'user' ? 'bg-blue-600 text-white border-blue-500' : 'bg-white text-slate-800 border-white'}`}>
                      {entry.text}
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}

      <VoiceAgent state={agentState} />
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
