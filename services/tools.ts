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
      },
      language_code: {
        type: Type.STRING,
        description: 'The current ISO language code (e.g., "hi", "te").'
      }
    },
    required: ['category', 'state', 'language_code'],
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

// Base schemes data (English)
const BASE_SCHEMES = [
  // Central
  { id: 'c1', name: 'PM-KISAN', description: 'Direct income support of ₹6,000 for farmers.', eligibility: 'Landholding farmers', benefits: '₹6,000 yearly', state: 'All', url: 'https://pmkisan.gov.in/' },
  { id: 'c2', name: 'Ayushman Bharat', description: 'World largest health insurance scheme.', eligibility: 'Vulnerable families', benefits: '₹5 lakh health cover', state: 'All', url: 'https://nha.gov.in/' },
  { id: 'c3', name: 'Sukanya Samriddhi Yojana', description: 'Savings scheme for the girl child.', eligibility: 'Parents of girl child < 10', benefits: 'High interest rate', state: 'All', url: 'https://www.nsiindia.gov.in/' },
  { id: 'c4', name: 'PMAY-Urban', description: 'Housing for all in urban areas.', eligibility: 'EWS/LIG families', benefits: 'Interest subsidy / Financial aid', state: 'All', url: 'https://pmay-urban.gov.in/' },
  { id: 'c5', name: 'PM Ujjwala Yojana', description: 'Free LPG connection for women.', eligibility: 'BPL Women', benefits: 'Free Gas Connection', state: 'All', url: 'https://pmuy.gov.in/' },
  { id: 'c6', name: 'PM Vishwakarma', description: 'Support for traditional artisans.', eligibility: 'Artisans/Craftspeople', benefits: 'Loan upto ₹3 lakh', state: 'All', url: 'https://pmvishwakarma.gov.in/' },

  // Andhra Pradesh
  { id: 'ap1', name: 'YSR Rythu Bharosa', description: 'Financial assistance to farmers.', eligibility: 'Farmers', benefits: '₹13,500/year', state: 'Andhra Pradesh', url: 'https://ysrrythubharosa.ap.gov.in/' },
  { id: 'ap2', name: 'Jagananna Amma Vodi', description: 'Financial aid for mothers sending kids to school.', eligibility: 'BPL Mothers', benefits: '₹15,000/year', state: 'Andhra Pradesh', url: 'https://jaganannaammavodi.ap.gov.in/' },
  { id: 'ap3', name: 'YSR Cheyutha', description: 'Financial assistance for SC/ST/BC/Minority women.', eligibility: 'Women 45-60 years', benefits: '₹18,750/year', state: 'Andhra Pradesh', url: 'https://navasakam.ap.gov.in/' }
];

const SCHEME_TRANSLATIONS: Record<string, Record<string, Partial<Scheme>>> = {
  'c1': {
    'hi': { name: 'प्रधानमंत्री किसान सम्मान निधि', description: 'किसानों को ₹6,000 की वार्षिक आय सहायता।', eligibility: 'सभी किसान', benefits: '₹6,000 प्रति वर्ष' },
    'te': { name: 'ప్రధాన మంత్రి కిసాన్ సమ్మాన్ నిధి', description: 'రైతులకు ఏటా ₹6,000 ఆర్థిక సహాయం.', eligibility: 'రైతులందరూ', benefits: 'ఏటా ₹6,000' }
  },
  'c2': {
    'hi': { name: 'आयुष्मान भारत', description: 'दुनिया का सबसे बड़ा स्वास्थ्य बीमा।', eligibility: 'कमजोर परिवार', benefits: '₹5 लाख का कवर' },
    'te': { name: 'ఆయుష్మాన్ భారత్', description: 'ప్రపంచంలోనే అతిపెద్ద ఆరోగ్య బీమా.', eligibility: 'పేద కుటుంబాలు', benefits: '₹5 లక్షల కవరేజ్' }
  },
  'c3': {
    'hi': { name: 'सुकन्या समृद्धि योजना', description: 'बेटियों के भविष्य के लिए बचत योजना।', eligibility: '10 वर्ष से कम आयु की बालिकाएं', benefits: 'उच्च ब्याज दर' },
    'te': { name: 'సుకన్య సమృద్ధి యోజన', description: 'బాలికల కోసం పొదుపు పథకం.', eligibility: '10 ఏళ్లలోపు బాలికలు', benefits: 'అధిక వడ్డీ' }
  },
  'ap1': {
    'hi': { name: 'वाईएसआर रायथु भरोसा', description: 'किसानों को वित्तीय सहायता।', eligibility: 'किसान', benefits: '₹13,500 प्रति वर्ष' },
    'te': { name: 'వైఎస్ఆర్ రైతు భరోసా', description: 'రైతులకు పెట్టుబడి సాయం.', eligibility: 'అర్హులైన రైతులు', benefits: 'ఏటా ₹13,500' }
  },
  'ap2': {
    'hi': { name: 'जगनन्ना अम्मा वोडी', description: 'माताओं के लिए वित्तीय सहायता।', eligibility: 'बीपीएल माताएं', benefits: '₹15,000 प्रति वर्ष' },
    'te': { name: 'జగనన్న అమ్మ ఒడి', description: 'పిల్లలను పాఠశాలకు పంపే తల్లులకు ఆర్థిక సాయం.', eligibility: 'BPL తల్లులు', benefits: 'ఏటా ₹15,000' }
  },
  'ap3': {
    'hi': { name: 'वाईएसआर चेयुथा', description: 'एससी/एसटी/बीसी महिलाओं के लिए सहायता।', eligibility: '45-60 आयु वर्ग की महिलाएं', benefits: '₹18,750 प्रति वर्ष' },
    'te': { name: 'వైఎస్ఆర్ చేయూత', description: 'మహిళలకు ఆర్థిక చేయూత.', eligibility: '45-60 ఏళ్ల మహిళలు', benefits: 'ఏటా ₹18,750' }
  }
};

const SUPPORTED_LANGUAGE_CODES = ['hi', 'te', 'mr', 'ta', 'bn', 'kn', 'ml', 'gu', 'pa'];

function generateSchemes(): Scheme[] {
  const schemes: Scheme[] = [];
  BASE_SCHEMES.forEach(base => {
    SUPPORTED_LANGUAGE_CODES.forEach(lang => {
      let name = base.name;
      let desc = base.description;
      let elig = base.eligibility;
      let ben = base.benefits;

      const translation = SCHEME_TRANSLATIONS[base.id]?.[lang];
      if (translation) {
        name = translation.name || name;
        desc = translation.description || desc;
        elig = translation.eligibility || elig;
        ben = translation.benefits || ben;
      } else {
        // Fallback to Hindi if requested language doesn't have a translation for this specific scheme
        const hi = SCHEME_TRANSLATIONS[base.id]?.['hi'];
        if (hi && lang !== 'en') {
          name = hi.name || name;
          desc = hi.description || desc;
        }
      }

      schemes.push({
        ...base,
        id: `${base.id}_${lang}`,
        language: lang,
        name: name,
        description: desc,
        eligibility: elig,
        benefits: ben
      });
    });
  });
  return schemes;
}

export const MOCK_SCHEMES: Scheme[] = generateSchemes();

export const toolHandlers = {
  search_schemes: async (args: any) => {
    const query = args.category?.toLowerCase() || "";
    const state = args.state?.toLowerCase() || "all";
    const language = args.language_code || "hi";
    
    return MOCK_SCHEMES.filter(s => {
      // STRICT Language filtering: Only show schemes for the currently selected language
      const languageMatch = s.language === language;
      const stateMatch = s.state.toLowerCase() === state || s.state === 'All';
      const categoryMatch = s.name.toLowerCase().includes(query) || 
                          s.description.toLowerCase().includes(query) ||
                          s.eligibility.toLowerCase().includes(query);
      return languageMatch && stateMatch && categoryMatch;
    });
  },
  update_user_profile: async (args: any, setProfile: (update: any) => void) => {
    setProfile(args);
    return "User profile updated successfully in memory.";
  },
  validate_eligibility: async (args: any, profile: any) => {
    const scheme = MOCK_SCHEMES.find(s => s.id.startsWith(args.schemeId));
    if (!scheme) return "Scheme not found.";
    if (scheme.name.includes('Sukanya') && profile.gender === 'male') {
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
