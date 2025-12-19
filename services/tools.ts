
import { FunctionDeclaration, Type } from '@google/genai';
import { Scheme } from '../types';

export const searchSchemesTool: FunctionDeclaration = {
  name: 'search_schemes',
  parameters: {
    type: Type.OBJECT,
    description: 'Search for government schemes based on category and state. Returns verified portal URLs.',
    properties: {
      category: {
        type: Type.STRING,
        description: 'Category like "farmer", "student", "women", "disability".',
      },
      state: {
        type: Type.STRING,
        description: 'The Indian state name.',
      }
    },
    required: ['category', 'state'],
  },
};

export const updateUserProfileTool: FunctionDeclaration = {
  name: 'update_user_profile',
  parameters: {
    type: Type.OBJECT,
    description: 'Autonomously update the user profile with facts learned during conversation to maintain memory.',
    properties: {
      age: { type: Type.NUMBER, description: 'User age if mentioned.' },
      occupation: { type: Type.STRING, description: 'User profession (e.g. Farmer, Teacher).' },
      income: { type: Type.NUMBER, description: 'Annual income if mentioned.' },
      gender: { type: Type.STRING, description: 'User gender.' },
    },
  },
};

export const validateEligibilityTool: FunctionDeclaration = {
  name: 'validate_eligibility',
  parameters: {
    type: Type.OBJECT,
    description: 'Check if a user is eligible for a specific scheme based on their currently stored profile data.',
    properties: {
      schemeId: { type: Type.STRING },
    },
    required: ['schemeId'],
  },
};

export const applyForSchemeTool: FunctionDeclaration = {
  name: 'apply_for_scheme',
  parameters: {
    type: Type.OBJECT,
    description: 'Provide a direct application link and instructions for a scheme.',
    properties: {
      schemeName: { type: Type.STRING },
    },
    required: ['schemeName'],
  },
};

export const changeLanguageTool: FunctionDeclaration = {
  name: 'change_language',
  parameters: {
    type: Type.OBJECT,
    description: 'Change the language of the conversation.',
    properties: {
      language_code: { type: Type.STRING, description: 'ISO code (hi, te, mr, etc.)' },
    },
    required: ['language_code'],
  },
};

export const MOCK_SCHEMES: Scheme[] = [
  { id: '1', name: 'PM-KISAN', description: 'Direct income support of ₹6,000 for farmers.', eligibility: 'Landholding farmers', benefits: '₹6,000 yearly', state: 'All', url: 'https://pmkisan.gov.in/' },
  { id: '2', name: 'Sukanya Samriddhi Yojana', description: 'Savings scheme for the girl child.', eligibility: 'Parents of girl child < 10', benefits: 'High interest', state: 'All', url: 'https://www.nsiindia.gov.in/' },
  { id: '3', name: 'PMAY-Urban', description: 'Housing assistance for urban poor.', eligibility: 'EWS/LIG families', benefits: 'Subsidized loans', state: 'All', url: 'https://pmay-urban.gov.in/' },
  { id: '4', name: 'Ayushman Bharat', description: 'World largest health insurance.', eligibility: 'Vulnerable families', benefits: '₹5 lakh cover', state: 'All', url: 'https://nha.gov.in/' },
  { id: '11', name: 'Rythu Bharosa (AP)', description: 'Direct benefit for farmers in Andhra Pradesh.', eligibility: 'AP Farmers', benefits: '₹13,500 per year', state: 'Andhra Pradesh', url: 'https://ysrrythubharosa.ap.gov.in/' },
  { id: '12', name: 'Amma Vodi', description: 'Education support for mothers in AP.', eligibility: 'BPL families in AP with school-going kids', benefits: '₹15,000 yearly', state: 'Andhra Pradesh', url: 'https://jaganannaammavodi.ap.gov.in/' }
];

export const toolHandlers = {
  search_schemes: async (args: any) => {
    const query = args.category?.toLowerCase() || "";
    const state = args.state?.toLowerCase() || "all";
    return MOCK_SCHEMES.filter(s => {
      const stateMatch = s.state.toLowerCase() === state || s.state === 'All';
      const categoryMatch = s.name.toLowerCase().includes(query) || 
                          s.description.toLowerCase().includes(query) ||
                          s.eligibility.toLowerCase().includes(query);
      return stateMatch && categoryMatch;
    });
  },
  update_user_profile: async (args: any, setProfile: (update: any) => void) => {
    setProfile(args);
    return "User profile updated successfully in memory.";
  },
  validate_eligibility: async (args: any, profile: any) => {
    const scheme = MOCK_SCHEMES.find(s => s.id === args.schemeId);
    if (!scheme) return "Scheme not found.";
    // Simple logic check for demo purposes
    if (scheme.name === 'Sukanya Samriddhi Yojana' && profile.gender === 'male') {
      return "Evaluation Result: You are likely ineligible as this is for girl children.";
    }
    return `Evaluation Result: You meet basic criteria for ${scheme.name}. Verified application is recommended.`;
  },
  apply_for_scheme: async (args: any) => {
    const scheme = MOCK_SCHEMES.find(s => s.name.toLowerCase().includes(args.schemeName?.toLowerCase()));
    return { url: scheme?.url || "https://india.gov.in", instructions: "Click the verified portal link on the right sidebar." };
  },
  change_language: async (args: any, setLang: (code: string) => void) => {
    setLang(args.language_code);
    return "Language changed.";
  }
};
