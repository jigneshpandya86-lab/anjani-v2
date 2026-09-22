/**
 * Utility functions for text processing, digit normalization,
 * and guaranteed English transliteration for client creation.
 */

// Digit mapping for Gujarati and Devanagari numerals
const DIGIT_MAP = {
  '૦': '0', '૧': '1', '૨': '2', '૩': '3', '૪': '4',
  '૫': '5', '૬': '6', '૭': '7', '૮': '8', '૯': '9',
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
}

// Common business, religious, and geographic vocabulary (Gujarati & Hindi)
// Order rules from most specific / multi-word to single word to prevent partial prefix replacements
const VOCABULARY_RULES = [
  // Multi-word phrases and locations FIRST
  [/ચાર\s*રસ્તા/gi, 'Char Rasta'],
  [/ચાર\s*રાસ્તા/gi, 'Char Rasta'],
  [/શાક\s*માર્કેટ|શાકભાજી\s*માર્કેટ/gi, 'Vegetable Market'],
  [/સુપર\s*માર્કેટ|સુપરમાર્કેટ/gi, 'Super Market'],
  [/પ્રોવિઝન\s*સ્ટોર્સ?/gi, 'Provision Store'],
  [/જનરલ\s*સ્ટોર્સ?/gi, 'General Store'],
  [/કિરાણા\s*સ્ટોર્સ?/gi, 'Kirana Store'],
  [/દુકાન\s*નં(?:\.|\s*|બર)/gi, 'Shop No. '],
  [/પ્લોટ\s*નં(?:\.|\s*)/gi, 'Plot No. '],
  [/બ્લોક\s*નં(?:\.|\s*)/gi, 'Block No. '],
  [/દુક\s*નં(?:\.|\s*)/gi, 'Shop No. '],
  [/દુકાન\s*नं(?:\.|\s*)/gi, 'Shop No. '],
  [/આઈસ્ક્રીમ|આઇસ્ક્રીમ/gi, 'Ice Cream'],
  [/ડેરી\s*ફાર્મ/gi, 'Dairy Farm'],
  [/મેડિકલ\s*સ્ટોર/gi, 'Medical Store'],
  [/કોલ્ડ્રિંક્સ|કોલ્ડ\s*ડ્રિંક્સ/gi, 'Cold Drinks'],
  [/પાન\s*(?:સેન્ટર|પાર્લર|પેલેસ)/gi, 'Paan Parlour'],
  [/ટી\s*સ્ટોલ/gi, 'Tea Stall'],
  [/ચા\s*(?:સ્ટોલ|સેન્ટર|પાર્લર)/gi, 'Tea Stall'],
  [/(?:^|\s)ચા(?:\s|$)/gi, ' Tea '],
  [/રેલ્વે\s*સ્ટેશન/gi, 'Railway Station'],
  [/બસ\s*સ્ટેન્ડ|બસ\s*સ્ટેશન/gi, 'Bus Stand'],
  [/જય\s*અંબે|જયઅંબે|जय\s*अम्बे/gi, 'Jay Ambe '],
  [/શિવ\s*શક્તિ|शिव\s*शक्ति/gi, 'Shiv Shakti'],
  [/રાધા\s*કૃષ્ણ|राधा\s*कृष्ण/gi, 'Radha Krishna'],

  // Common prefixes & deities
  [/શ્રી/g, 'Shree '],
  [/श्री/g, 'Shree '],
  [/ૐ|ॐ/g, 'Om '],
  [/અંબે|अम्बे/gi, 'Ambe'],
  [/મહાદેવ|महादेव/gi, 'Mahadev'],
  [/ગણેશ|गणेश/gi, 'Ganesh'],
  [/બાલાજી|बालाजी/gi, 'Balaji'],
  [/હનુમાન|हनुमान/gi, 'Hanuman'],
  [/શક્તિ|शक्ति/gi, 'Shakti'],
  [/કૃષ્ણ|कृष्ण/gi, 'Krishna'],
  [/રાધા|राधा/gi, 'Radha'],
  [/શ્યામ|श्याम/gi, 'Shyam'],
  [/મહાલક્ષ્મી|महालक्ष्मी/gi, 'Mahalakshmi'],
  [/લક્ષ્મી|लक्ष्मी/gi, 'Lakshmi'],
  [/સરસ્વતી|सरस्वती/gi, 'Saraswati'],
  [/ચામુંડા|ચામુન્ડા/gi, 'Chamunda'],
  [/ખોડિયાર|ખોડીયાર/gi, 'Khodiyar'],
  [/મેલડી/gi, 'Meldi'],
  [/ઉમિયા/gi, 'Umiya'],
  [/આશાપુરા/gi, 'Ashapura'],
  [/તિરુપતિ/gi, 'Tirupati'],
  [/સાંઈ|સાઈ|साईं|साई/gi, 'Sai '],
  [/માતાજી/gi, 'Mataji'],

  // Store & business types
  [/પ્રોવિઝન/gi, 'Provision'],
  [/પ્રોવિજન/gi, 'Provision'],
  [/કિરાણા/gi, 'Kirana'],
  [/સુપર|सुपर/gi, 'Super'],
  [/સ્ટોર(?:્સાં|્સા|્સ)?|સ્ટોર્સ/gi, 'Store'],
  [/રેસ્ટોરન્ટ|રેસ્ટોરેન્ટ/gi, 'Restaurant'],
  [/હોટેલ|હોટલ/gi, 'Hotel'],
  [/ડેરી/gi, 'Dairy'],
  [/પાર્લર/gi, 'Parlour'],
  [/એન્ટરપ્રાઈઝ|એન્ટરપ્રાઇઝ/gi, 'Enterprise'],
  [/ટ્રેડર્સ|ટ્રેડિંગ/gi, 'Traders'],
  [/એજન્સી[સઝ]?/gi, 'Agency'],
  [/મેડિકલ/gi, 'Medical'],
  [/કાફે|કેફે/gi, 'Cafe'],
  [/ઢોસા|ડોસા/gi, 'Dosa'],
  [/ઢાબા|ધાબા/gi, 'Dhaba'],
  [/ભોજનાલય/gi, 'Bhojanalaya'],
  [/ફરસણ/gi, 'Farsan'],
  [/સ્વીટ્સ|સ્વીટ/gi, 'Sweets'],
  [/બેકરી|બેકર્સ/gi, 'Bakery'],
  [/કેટરર્સ|કેટરિંગ/gi, 'Caterers'],

  // Directions & locations
  [/સામે/gi, 'Opp.'],
  [/પાસે|નજીક/gi, 'Near'],
  [/પાછળ/gi, 'Behind'],
  [/બાજુમાં/gi, 'Beside'],
  [/અંદર/gi, 'Inside'],
  [/રોડ|માર્ગ/gi, 'Road'],
  [/સર્કલ/gi, 'Circle'],
  [/બ્રિજ|પુલ/gi, 'Bridge'],
  [/ઓવરબ્રિજ/gi, 'Overbridge'],
  [/સ્ટેશન/gi, 'Station'],
  [/સોસાયટી/gi, 'Society'],
  [/નગર/gi, 'Nagar'],
  [/કોમ્પ્લેક્સ/gi, 'Complex'],
  [/પ્લાઝા/gi, 'Plaza'],
  [/સેન્ટર/gi, 'Center'],
  [/એવન્યુ/gi, 'Avenue'],
  [/હાઇટ્સ|હાઈટ્સ/gi, 'Heights'],
  [/રેસીડેન્સી|રેસિડેન્સી/gi, 'Residency'],
  [/ટાઉનશીપ/gi, 'Township'],
  [/દુકાન/gi, 'Shop'],
  [/શેરી|ગલી/gi, 'Street'],
  [/માર્કેટ|બજાર/gi, 'Market'],

  // Vadodara & Gujarat local areas
  [/માંજલપુર/gi, 'Manjalpur'],
  [/વડોદરા/gi, 'Vadodara'],
  [/મકરપુરા/gi, 'Makarpura'],
  [/ગોરવા/gi, 'Gorwa'],
  [/અલકાપુરી/gi, 'Alkapuri'],
  [/સુભાનપુરા/gi, 'Subhanpura'],
  [/વાઘોડિયા|વાઘોડીયા/gi, 'Waghodia'],
  [/ગોત્રી/gi, 'Gotri'],
  [/વાસણા/gi, 'Vasna'],
  [/તરસાળી/gi, 'Tarsali'],
  [/બાજવા/gi, 'Bajwa'],
  [/છાણી/gi, 'Chhani'],
  [/નિઝામપુરા/gi, 'Nizampura'],
  [/અટલાદરા/gi, 'Atladara'],
  [/સયાજીગંજ/gi, 'Sayajigunj'],
  [/રાવપુરા/gi, 'Raopura'],
  [/માંડવી/gi, 'Mandvi'],
  [/પાણીગેટ/gi, 'Panigate'],
  [/ગેંડીગેટ/gi, 'Gendiget'],
  [/ફતેહગંજ/gi, 'Fatehgunj'],
  [/કલાલી/gi, 'Kalali'],
  [/ભાયલી/gi, 'Bhayli'],
  [/સેવાસી/gi, 'Sevasi'],
  [/વારસિયા|વારસીયા/gi, 'Warasia'],
  [/હરણી/gi, 'Harni'],
  [/સમા/gi, 'Sama'],
  [/અકોટા/gi, 'Akota'],
  [/કારેલીબાગ/gi, 'Karelibaug'],

  // Conjunctions & Surnames
  [/અને/gi, '&'],
  [/પટેલ/gi, 'Patel'],
  [/શાહ/gi, 'Shah'],
  [/જોષી|જોશી/gi, 'Joshi'],
  [/પંડ્યા/gi, 'Pandya'],
  [/દેસાઈ|દેસાઇ/gi, 'Desai'],
  [/પરમાર/gi, 'Parmar'],
  [/સોલંકી/gi, 'Solanki'],
  [/રાવલ/gi, 'Raval'],
  [/પ્રજાપતિ/gi, 'Prajapati'],
  [/પંચાલ/gi, 'Panchal'],
  [/સુથાર/gi, 'Suthar'],
  [/દરબાર/gi, 'Darbar'],
  [/ચૌહાણ/gi, 'Chauhan'],
  [/યાદવ/gi, 'Yadav'],
  [/શર્મા/gi, 'Sharma'],
  [/વર્મા/gi, 'Verma'],
  [/ગુપ્તા/gi, 'Gupta'],
  [/સિંહ/gi, 'Singh'],
  [/ભાઈ|ભાઇ/gi, 'bhai'],
  [/બેન|બહેન/gi, 'ben'],
  [/કુમાર/gi, 'kumar'],

  // Hindi / Devanagari rules
  [/प्रोविजन\s*स्टोर/gi, 'Provision Store'],
  [/जनरल\s*स्टोर/gi, 'General Store'],
  [/किराना\s*स्टोर/gi, 'Kirana Store'],
  [/किराना/gi, 'Kirana'],
  [/स्टोर/gi, 'Store'],
  [/रेस्टोरेंट/gi, 'Restaurant'],
  [/होटल/gi, 'Hotel'],
  [/डेयरी/gi, 'Dairy'],
  [/रोड|मार्ग/gi, 'Road'],
  [/सामने/gi, 'Opp.'],
  [/पास|नजदीक/gi, 'Near'],
  [/पीछे/gi, 'Behind'],
  [/दुकान/gi, 'Shop'],
  [/बड़ौदा|वडोदरा/gi, 'Vadodara'],
  [/अजवा/gi, 'Ajwa'],
  [/और/gi, '&'],
  [/पटेल/gi, 'Patel'],
  [/शाह/gi, 'Shah'],
  [/कुमार/gi, 'kumar'],
  [/भाई/gi, 'bhai'],
  [/बहन/gi, 'ben'],
]

// Phonetic Character Map for Gujarati & Devanagari
const CHAR_MAP = {
  // Gujarati independent vowels
  '\u0A85': 'a', '\u0A86': 'aa', '\u0A87': 'i', '\u0A88': 'ee', '\u0A89': 'u', '\u0A8A': 'oo',
  '\u0A8B': 'ru', '\u0A8F': 'e', '\u0A90': 'ai', '\u0A93': 'o', '\u0A94': 'au',

  // Gujarati consonants
  '\u0A95': 'k', '\u0A96': 'kh', '\u0A97': 'g', '\u0A98': 'gh', '\u0A99': 'ng',
  '\u0A9A': 'ch', '\u0A9B': 'chh', '\u0A9C': 'j', '\u0A9D': 'z', '\u0A9E': 'ny',
  '\u0A9F': 't', '\u0AA0': 'th', '\u0AA1': 'd', '\u0AA2': 'dh', '\u0AA3': 'n',
  '\u0AA4': 't', '\u0AA5': 'th', '\u0AA6': 'd', '\u0AA7': 'dh', '\u0AA8': 'n',
  '\u0AAA': 'p', '\u0AAB': 'f', '\u0AAC': 'b', '\u0AAD': 'bh', '\u0AAE': 'm',
  '\u0AAF': 'y', '\u0AB0': 'r', '\u0AB2': 'l', '\u0AB3': 'l', '\u0AB5': 'v',
  '\u0AB6': 'sh', '\u0AB7': 'sh', '\u0AB8': 's', '\u0AB9': 'h',

  // Gujarati matras / vowel signs
  '\u0ABE': 'a', '\u0ABF': 'i', '\u0AC0': 'i', '\u0AC1': 'u', '\u0AC2': 'u',
  '\u0AC3': 'ru', '\u0AC4': 'ru', '\u0AC7': 'e', '\u0AC8': 'ai', '\u0ACB': 'o', '\u0ACC': 'au',
  '\u0A82': 'n', '\u0A81': 'n', '\u0A83': 'h',

  // Devanagari independent vowels
  '\u0905': 'a', '\u0906': 'aa', '\u0907': 'i', '\u0908': 'ee', '\u0909': 'u', '\u090A': 'oo',
  '\u090B': 'ru', '\u090F': 'e', '\u0910': 'ai', '\u0913': 'o', '\u0914': 'au',

  // Devanagari consonants
  '\u0915': 'k', '\u0916': 'kh', '\u0917': 'g', '\u0918': 'gh', '\u0919': 'ng',
  '\u091A': 'ch', '\u091B': 'chh', '\u091C': 'j', '\u091D': 'jh', '\u091E': 'ny',
  '\u091F': 't', '\u0920': 'th', '\u0921': 'd', '\u0922': 'dh', '\u0923': 'n',
  '\u0924': 't', '\u0925': 'th', '\u0926': 'd', '\u0927': 'dh', '\u0928': 'n',
  '\u092A': 'p', '\u092B': 'f', '\u092C': 'b', '\u092D': 'bh', '\u092E': 'm',
  '\u092F': 'y', '\u0930': 'r', '\u0932': 'l', '\u0935': 'v',
  '\u0936': 'sh', '\u0937': 'sh', '\u0938': 's', '\u0939': 'h',
  '\u0958': 'q', '\u0959': 'kh', '\u095A': 'g', '\u095B': 'z', '\u095C': 'd', '\u095D': 'dh', '\u095E': 'f',

  // Devanagari matras
  '\u093E': 'a', '\u093F': 'i', '\u0940': 'i', '\u0941': 'u', '\u0942': 'u',
  '\u0943': 'ru', '\u0947': 'e', '\u0948': 'ai', '\u094B': 'o', '\u094C': 'au',
  '\u0902': 'n', '\u0901': 'n', '\u0903': 'h',
}

const isConsonant = (c) =>
  (c >= '\u0A95' && c <= '\u0AB9') || (c >= '\u0915' && c <= '\u0939') || (c >= '\u0958' && c <= '\u095F')

const isMatra = (c) =>
  (c >= '\u0ABE' && c <= '\u0ACC') ||
  c === '\u0AC3' ||
  c === '\u0AC4' ||
  (c >= '\u093E' && c <= '\u094C') ||
  c === '\u0943'

const isVirama = (c) => c === '\u0ACD' || c === '\u094D'
const isAnusvara = (c) => c === '\u0A82' || c === '\u0A81' || c === '\u0902' || c === '\u0901'

/**
 * Normalizes all Gujarati & Hindi numerals to standard ASCII 0-9 digits.
 */
export function normalizeDigits(str) {
  if (!str) return ''
  let out = String(str)
  for (const [k, v] of Object.entries(DIGIT_MAP)) {
    out = out.split(k).join(v)
  }
  return out
}

/**
 * Checks if a string contains Indic scripts (Gujarati, Devanagari, Bengali, etc.).
 */
export function hasIndicScript(str) {
  if (!str) return false
  return /[\u0900-\u0DFF]/.test(String(str))
}

/**
 * Transliterates Gujarati and Devanagari text into phonetic English (Roman script).
 */
export function transliterateIndicToEnglish(str) {
  if (!str) return ''
  let out = normalizeDigits(str)

  // 1. Apply vocabulary substitutions for clean idioms & locations
  for (const [pattern, repl] of VOCABULARY_RULES) {
    out = out.replace(pattern, repl)
  }

  // 2. Character-by-character phonetic mapping with schwa handling
  let res = ''
  for (let i = 0; i < out.length; i++) {
    const ch = out[i]
    const next = out[i + 1]

    if (CHAR_MAP[ch]) {
      res += CHAR_MAP[ch]
      if (isConsonant(ch)) {
        // Schwa deletion: add inherent 'a' unless followed by matra, virama, anusvara, or word boundary
        const hasNextModifier = next && (isVirama(next) || isMatra(next) || isAnusvara(next))
        const isEndWord = !next || /[\s,.;:!?'"()[\]{}/\\-]/.test(next)
        if (!hasNextModifier && !isEndWord) {
          res += 'a'
        }
      }
    } else if (isVirama(ch)) {
      // Virama suppresses inherent vowel
    } else {
      res += ch
    }
  }

  // 3. Clean up non-ASCII residue, preserve punctuation & numbers, format to Title Case
  return res
    .replace(/[^\x20-\x7E\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (l) => l.toUpperCase())
}

/**
 * Guarantees a string is returned in English / Roman script.
 * If text contains Indic characters, transliterates and standardizes it.
 */
export function ensureEnglishText(str) {
  if (!str) return ''
  const normalized = normalizeDigits(str)
  if (!hasIndicScript(normalized)) {
    return String(normalized).replace(/\s+/g, ' ').trim()
  }
  return transliterateIndicToEnglish(normalized)
}

/**
 * Sanitizes all client fields to ensure the client is stored in English only.
 */
export function sanitizeClientForEnglish(client) {
  if (!client || typeof client !== 'object') return client
  return {
    ...client,
    name: ensureEnglishText(client.name),
    mobile: normalizeDigits(client.mobile || client.phone || '').replace(/\D/g, ''),
    phone: normalizeDigits(client.phone || client.mobile || '').replace(/\D/g, ''),
    address: ensureEnglishText(client.address),
    location: ensureEnglishText(client.location || client.address),
    contactPerson: ensureEnglishText(client.contactPerson),
    notes: ensureEnglishText(client.notes),
  }
}
