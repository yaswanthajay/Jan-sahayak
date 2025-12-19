
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AgentState, TranscriptionEntry, Language, SUPPORTED_LANGUAGES, UserProfile, Scheme, INDIAN_STATES } from './types';
import { searchSchemesTool, validateEligibilityTool, applyForSchemeTool, changeLanguageTool, updateUserProfileTool, toolHandlers, MOCK_SCHEMES } from './services/tools';
import Header from './components/Header';
import VoiceAgent from './components/VoiceAgent';

const App: React.FC = () => {
  const [agentState, setAgentState] = useState<AgentState>(AgentState.AWAITING_LOCATION);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [history, setHistory] = useState<TranscriptionEntry[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(SUPPORTED_LANGUAGES[0]);
  const [userProfile, setUserProfile] = useState<UserProfile>({ state: 'Andhra Pradesh' });
  const [visibleSchemes, setVisibleSchemes] = useState<Scheme[]>([]);
  
  const [liveUserText, setLiveUserText] = useState("");
  const [liveModelText, setLiveModelText] = useState("");
  const userBufferRef = useRef("");
  const modelBufferRef = useRef("");

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Location mapping
  const getStateFromCoords = (lat: number, lng: number): string => {
    if (lat > 28) return "Delhi";
    if (lat > 25) return "Uttar Pradesh";
    if (lat > 21) return "West Bengal";
    if (lat > 18.5) return "Maharashtra";
    if (lat > 17.0) return "Telangana";
    return "Andhra Pradesh";
  };

  const updateStateAndSchemes = (stateName: string, lat?: number, lng?: number) => {
    setUserProfile(prev => ({ ...prev, state: stateName, lat, lng }));
    const relevant = MOCK_SCHEMES.filter(s => s.state === 'All' || s.state.toLowerCase() === stateName.toLowerCase());
    setVisibleSchemes(relevant);
    setAgentState(AgentState.IDLE);
  };

  const requestLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const detectedState = getStateFromCoords(position.coords.latitude, position.coords.longitude);
          updateStateAndSchemes(detectedState, position.coords.latitude, position.coords.longitude);
        },
        () => {
          setLocationError("Location timeout. Manual selection ready.");
          setAgentState(AgentState.IDLE);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      setAgentState(AgentState.IDLE);
    }
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) => {
    const dataInt16 = new Int16Array(data.buffer);
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
    return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  };

  const stopAllAudio = useCallback(() => {
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const commitTurn = useCallback(() => {
    const uText = userBufferRef.current.trim();
    const mText = modelBufferRef.current.trim();
    if (uText || mText) {
      setHistory(prev => [...prev, 
        ...(uText ? [{ text: uText, role: 'user', timestamp: Date.now() } as TranscriptionEntry] : []),
        ...(mText ? [{ text: mText, role: 'model', timestamp: Date.now() } as TranscriptionEntry] : [])
      ]);
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
        sourcesRef.current.delete(source);
        if (sourcesRef.current.size === 0) setAgentState(AgentState.LISTENING);
      };
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      sourcesRef.current.add(source);
    }

    if (message.serverContent?.inputTranscription) {
      userBufferRef.current += message.serverContent.inputTranscription.text;
      setLiveUserText(userBufferRef.current);
    }
    if (message.serverContent?.outputTranscription) {
      modelBufferRef.current += message.serverContent.outputTranscription.text;
      setLiveModelText(modelBufferRef.current);
    }
    if (message.serverContent?.interrupted) {
      stopAllAudio();
      setAgentState(AgentState.LISTENING);
    }
    if (message.serverContent?.turnComplete) commitTurn();

    if (message.toolCall) {
      setAgentState(AgentState.THINKING);
      for (const fc of message.toolCall.functionCalls) {
        let result: any;
        if (fc.name === 'update_user_profile') {
          result = await toolHandlers.update_user_profile(fc.args, (update) => setUserProfile(p => ({ ...p, ...update })));
        } else if (fc.name === 'validate_eligibility') {
          result = await toolHandlers.validate_eligibility(fc.args, userProfile);
        } else if (fc.name === 'search_schemes') {
          const results = await toolHandlers.search_schemes(fc.args);
          if (fc.args.state?.toLowerCase() === userProfile.state?.toLowerCase()) setVisibleSchemes(results);
          result = results;
        } else if (fc.name === 'change_language') {
          result = await toolHandlers.change_language(fc.args, (code) => {
            const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
            if (lang) setSelectedLanguage(lang);
          });
        } else {
          result = await (toolHandlers as any)[fc.name]?.(fc.args);
        }
        
        sessionPromiseRef.current?.then(session => session.sendToolResponse({
          functionResponses: { id: fc.id, name: fc.name, response: { result: JSON.stringify(result) } }
        }));
      }
    }
  };

  const startSession = async () => {
    try {
      setAgentState(AgentState.THINKING);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inCtx; outputAudioContextRef.current = outCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are "Jan Sahayak", an advanced Agentic AI Welfare Assistant for India.
          
          AGENTIC WORKFLOW (PLAN-EXECUTE-EVALUATE):
          - PLAN: When a user speaks, verbalize your intent (e.g. "I will search for education schemes in ${userProfile.state}").
          - EXECUTE: Use tools to fetch data or update memory. 
          - EVALUATE: If tool results are empty or don't fit, re-search or ask clarifying questions.
          
          NATIVE LANGUAGE POLICY:
          - Current Language: ${selectedLanguage.name}. You MUST speak and reason in this language ONLY.
          
          DYNAMIC MEMORY:
          - If the user provides info (age, job, income), call 'update_user_profile' immediately to persist it.
          - Use this memory to proactively check eligibility for schemes using 'validate_eligibility'.
          
          FAIL-SAFE:
          - If audio is unclear, politely ask in ${selectedLanguage.name} for clarification.
          - If tools are unavailable, explain the limitation clearly.
          
          User Context: State is ${userProfile.state}. Current Profile: ${JSON.stringify(userProfile)}.`,
          tools: [{ functionDeclarations: [searchSchemesTool, validateEligibilityTool, applyForSchemeTool, changeLanguageTool, updateUserProfileTool] }],
          inputAudioTranscription: {}, outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsLive(true); setAgentState(AgentState.LISTENING);
            const source = inCtx.createMediaStreamSource(stream);
            const processor = inCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const blob = createBlob(e.inputBuffer.getChannelData(0));
              sessionPromise.then(session => session.sendRealtimeInput({ media: blob }));
            };
            source.connect(processor); processor.connect(inCtx.destination);
          },
          onmessage: handleMessage,
          onerror: () => setAgentState(AgentState.ERROR),
          onclose: () => { setIsLive(false); setAgentState(AgentState.IDLE); }
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err) { setAgentState(AgentState.ERROR); }
  };

  const stopSession = () => {
    commitTurn();
    sessionPromiseRef.current?.then(s => s.close());
    stopAllAudio();
    setIsLive(false); setAgentState(AgentState.IDLE);
    sessionPromiseRef.current = null;
  };

  if (agentState === AgentState.AWAITING_LOCATION) {
    return (
      <div className="h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 mb-10 bg-gradient-to-t from-orange-500 via-white to-green-500 rounded-2xl flex items-center justify-center shadow-2xl animate-pulse">
           <span className="text-3xl">🇮🇳</span>
        </div>
        <h1 className="text-5xl font-black text-white mb-4 tracking-tighter">Jan Sahayak AI</h1>
        <p className="text-slate-400 max-w-md mb-12 text-lg">Agentic Welfare Gateway. Powered by Multimodal Native Reasoning.</p>
        <button onClick={requestLocation} className="px-12 py-5 bg-white text-slate-900 rounded-full font-black text-xl hover:bg-slate-100 transition-all shadow-2xl active:scale-95 flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
          Initialize Agent
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 font-sans overflow-hidden">
      <Header selectedLanguage={selectedLanguage} onLanguageChange={setSelectedLanguage} selectedState={userProfile.state || ""} onStateChange={updateStateAndSchemes} isLive={isLive} />
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col p-4 md:p-6 min-w-0 bg-slate-100/30">
          <div className="flex-1 bg-white rounded-[2rem] shadow-2xl border border-slate-200/50 overflow-hidden flex flex-col relative">
            <div className="absolute top-4 left-6 z-10 flex gap-2">
               <div className="px-3 py-1 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-full border border-blue-100 shadow-sm flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></div>
                  {userProfile.state} Portal
               </div>
               {userProfile.occupation && (
                 <div className="px-3 py-1 bg-orange-50 text-orange-700 text-[10px] font-black uppercase tracking-widest rounded-full border border-orange-100 shadow-sm">
                   Role: {userProfile.occupation}
                 </div>
               )}
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth custom-scrollbar">
              {history.length === 0 && !liveUserText && !liveModelText ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none">
                  <div className="w-24 h-24 mb-6 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </div>
                  <h2 className="text-2xl font-black text-slate-800 mb-2">Native Agent Online</h2>
                  <p className="max-w-xs text-sm font-medium">I plan, search, and verify eligibility autonomously. Start speaking in {selectedLanguage.nativeName}.</p>
                </div>
              ) : (
                <>
                  {history.map((e, i) => (
                    <div key={i} className={`flex ${e.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4`}>
                      <div className={`max-w-[85%] rounded-[1.5rem] px-6 py-4 text-base shadow-sm border ${e.role === 'user' ? 'bg-blue-600 text-white border-blue-500 shadow-lg' : 'bg-white text-slate-800 border-slate-100'}`}>
                        {e.text}
                      </div>
                    </div>
                  ))}
                  {liveUserText && <div className="flex justify-end opacity-60 italic"><div className="bg-blue-100 text-blue-800 px-5 py-3 rounded-full text-sm font-bold border border-blue-200">{liveUserText}</div></div>}
                  {liveModelText && <div className="flex justify-start"><div className="bg-white border-slate-200 border px-5 py-3 rounded-full text-sm font-medium shadow-sm animate-pulse">{liveModelText}</div></div>}
                </>
              )}
            </div>
            <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex justify-center">
              {!isLive ? (
                <button onClick={startSession} className="px-10 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-black text-lg shadow-xl shadow-blue-200 transition-all active:scale-95 flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" /></svg></div>
                  Start Agent Interaction
                </button>
              ) : (
                <button onClick={stopSession} className="px-10 py-5 bg-red-600 hover:bg-red-700 text-white rounded-full font-black text-lg shadow-xl shadow-red-200 transition-all active:scale-95 flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg></div>
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </main>
        <aside className="w-80 lg:w-[24rem] border-l border-slate-200 bg-white hidden md:flex flex-col p-6 shadow-2xl z-10">
          <div className="mb-8">
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-4">
               <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2" /></svg></div>
               Agent Intelligence
            </h3>
            <div className="flex gap-2">
               <span className="px-2.5 py-1 bg-slate-100 text-slate-500 text-[9px] font-black rounded-full border border-slate-200 uppercase tracking-tighter">Live Reasoning</span>
               <span className="px-2.5 py-1 bg-green-50 text-green-600 text-[9px] font-black rounded-full border border-green-100 uppercase tracking-tighter">{userProfile.state}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {visibleSchemes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-300 border-2 border-dashed rounded-3xl p-6 text-center">
                <p className="text-xs font-black uppercase tracking-widest mb-1">Awaiting Execution</p>
                <p className="text-[10px] opacity-70">The agent will populate this as it reasons about your needs.</p>
              </div>
            ) : (
              visibleSchemes.map(s => (
                <div key={s.id} className="group p-5 rounded-3xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-blue-200 hover:shadow-lg transition-all duration-300">
                  <div className="flex justify-between items-center mb-3">
                    <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border ${s.state === 'All' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>{s.state === 'All' ? 'Central' : s.state}</span>
                  </div>
                  <h4 className="font-black text-slate-800 text-sm mb-1.5 leading-tight group-hover:text-blue-600 transition-colors">{s.name}</h4>
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-4">{s.description}</p>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-blue-600 shadow-sm hover:border-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2">Official Portal</a>
                </div>
              ))
            )}
          </div>
          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-center opacity-40"><span className="text-[9px] font-black uppercase tracking-[0.2em]">Verified Welfare Agentic AI</span></div>
        </aside>
      </div>
      <VoiceAgent state={agentState} />
      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }`}</style>
    </div>
  );
};

export default App;
