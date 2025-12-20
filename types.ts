
export enum AgentState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR',
  AWAITING_LOCATION = 'AWAITING_LOCATION'
}

export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export interface Scheme {
  id: string;
  name: string;
  description: string;
  eligibility: string;
  benefits: string;
  state: string; // "All" or specific state
  url: string;
  language?: string;
}

export interface AgentThought {
  phase: 'PLAN' | 'EXECUTE' | 'EVALUATE' | 'MEMORY';
  message: string;
  timestamp: number;
}

export interface UserProfile {
  name?: string;
  age?: number;
  occupation?: string;
  income?: number;
  state?: string;
  gender?: string;
  lat?: number;
  lng?: number;
  disability?: boolean;
}

export interface TranscriptionEntry {
  text: string;
  role: 'user' | 'model';
  timestamp: number;
}

export interface ChatSession {
  id: string;
  timestamp: number;
  language: string;
  history: TranscriptionEntry[];
  summary: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'mr', name: 'Marathi', nativeName: 'మరాठी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
];

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", 
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", 
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", 
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", 
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", 
  "Uttarakhand", "West Bengal"
];
