/**
 * Country + language reference data — the source of truth for the
 * `/super-admin/languages` picker.
 *
 * Standards:
 *   - Country codes: ISO 3166-1 alpha-2 (e.g. "GB", "US", "CH", "DK").
 *   - Language codes: ISO 639-1 (e.g. "en", "de", "da").
 *
 * The country → languages map lists the official / nationally-used
 * languages of each country. It is intentionally curated rather than
 * generated from CLDR so we ship a small, reviewable dataset.
 */

export type CountryCode = string;
export type LanguageCode = string;

export type Country = {
  /** ISO 3166-1 alpha-2 */
  code: CountryCode;
  /** English name */
  name: string;
  /** Official / nationally-used language codes (ISO 639-1) */
  languages: LanguageCode[];
};

export type Language = {
  /** ISO 639-1 */
  code: LanguageCode;
  /** English name */
  name: string;
};

/**
 * Languages we map countries to, keyed by ISO 639-1 code.
 */
export const LANGUAGES: ReadonlyArray<Language> = [
  { code: "af", name: "Afrikaans" },
  { code: "am", name: "Amharic" },
  { code: "ar", name: "Arabic" },
  { code: "az", name: "Azerbaijani" },
  { code: "be", name: "Belarusian" },
  { code: "bg", name: "Bulgarian" },
  { code: "bn", name: "Bengali" },
  { code: "bs", name: "Bosnian" },
  { code: "ca", name: "Catalan" },
  { code: "cs", name: "Czech" },
  { code: "da", name: "Danish" },
  { code: "de", name: "German" },
  { code: "dv", name: "Dhivehi" },
  { code: "dz", name: "Dzongkha" },
  { code: "el", name: "Greek" },
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "et", name: "Estonian" },
  { code: "eu", name: "Basque" },
  { code: "fa", name: "Persian" },
  { code: "ff", name: "Fula" },
  { code: "fi", name: "Finnish" },
  { code: "fil", name: "Filipino" },
  { code: "fj", name: "Fijian" },
  { code: "fo", name: "Faroese" },
  { code: "fr", name: "French" },
  { code: "ga", name: "Irish" },
  { code: "gn", name: "Guaraní" },
  { code: "gl", name: "Galician" },
  { code: "ha", name: "Hausa" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "hr", name: "Croatian" },
  { code: "ht", name: "Haitian Creole" },
  { code: "hu", name: "Hungarian" },
  { code: "hy", name: "Armenian" },
  { code: "id", name: "Indonesian" },
  { code: "is", name: "Icelandic" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "ka", name: "Georgian" },
  { code: "kk", name: "Kazakh" },
  { code: "kl", name: "Greenlandic" },
  { code: "km", name: "Khmer" },
  { code: "ko", name: "Korean" },
  { code: "ku", name: "Kurdish" },
  { code: "ky", name: "Kyrgyz" },
  { code: "lb", name: "Luxembourgish" },
  { code: "lo", name: "Lao" },
  { code: "lt", name: "Lithuanian" },
  { code: "lv", name: "Latvian" },
  { code: "mg", name: "Malagasy" },
  { code: "mh", name: "Marshallese" },
  { code: "mi", name: "Māori" },
  { code: "mk", name: "Macedonian" },
  { code: "ml", name: "Malayalam" },
  { code: "mn", name: "Mongolian" },
  { code: "ms", name: "Malay" },
  { code: "mt", name: "Maltese" },
  { code: "my", name: "Burmese" },
  { code: "nb", name: "Norwegian Bokmål" },
  { code: "ne", name: "Nepali" },
  { code: "nl", name: "Dutch" },
  { code: "nn", name: "Norwegian Nynorsk" },
  { code: "no", name: "Norwegian" },
  { code: "ny", name: "Chichewa" },
  { code: "pa", name: "Punjabi" },
  { code: "pl", name: "Polish" },
  { code: "ps", name: "Pashto" },
  { code: "pt", name: "Portuguese" },
  { code: "qu", name: "Quechua" },
  { code: "rm", name: "Romansh" },
  { code: "rn", name: "Kirundi" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "rw", name: "Kinyarwanda" },
  { code: "sg", name: "Sango" },
  { code: "si", name: "Sinhala" },
  { code: "sk", name: "Slovak" },
  { code: "sl", name: "Slovenian" },
  { code: "sm", name: "Samoan" },
  { code: "sn", name: "Shona" },
  { code: "so", name: "Somali" },
  { code: "sq", name: "Albanian" },
  { code: "sr", name: "Serbian" },
  { code: "ss", name: "Swati" },
  { code: "st", name: "Sotho" },
  { code: "sv", name: "Swedish" },
  { code: "sw", name: "Swahili" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "tg", name: "Tajik" },
  { code: "th", name: "Thai" },
  { code: "ti", name: "Tigrinya" },
  { code: "tk", name: "Turkmen" },
  { code: "tn", name: "Tswana" },
  { code: "to", name: "Tongan" },
  { code: "tr", name: "Turkish" },
  { code: "ts", name: "Tsonga" },
  { code: "uk", name: "Ukrainian" },
  { code: "ur", name: "Urdu" },
  { code: "uz", name: "Uzbek" },
  { code: "ve", name: "Venda" },
  { code: "vi", name: "Vietnamese" },
  { code: "xh", name: "Xhosa" },
  { code: "zh", name: "Chinese" },
  { code: "zu", name: "Zulu" },
];

/**
 * Countries with their official / nationally-used languages.
 * Order in the `languages` array is by primacy (most-used first).
 */
export const COUNTRIES: ReadonlyArray<Country> = [
  { code: "AD", name: "Andorra", languages: ["ca"] },
  { code: "AE", name: "United Arab Emirates", languages: ["ar"] },
  { code: "AF", name: "Afghanistan", languages: ["ps", "fa"] },
  { code: "AG", name: "Antigua and Barbuda", languages: ["en"] },
  { code: "AI", name: "Anguilla", languages: ["en"] },
  { code: "AL", name: "Albania", languages: ["sq"] },
  { code: "AM", name: "Armenia", languages: ["hy"] },
  { code: "AO", name: "Angola", languages: ["pt"] },
  { code: "AR", name: "Argentina", languages: ["es"] },
  { code: "AS", name: "American Samoa", languages: ["en", "sm"] },
  { code: "AT", name: "Austria", languages: ["de"] },
  { code: "AU", name: "Australia", languages: ["en"] },
  { code: "AW", name: "Aruba", languages: ["nl"] },
  { code: "AX", name: "Åland Islands", languages: ["sv"] },
  { code: "AZ", name: "Azerbaijan", languages: ["az"] },
  { code: "BA", name: "Bosnia and Herzegovina", languages: ["bs", "hr", "sr"] },
  { code: "BB", name: "Barbados", languages: ["en"] },
  { code: "BD", name: "Bangladesh", languages: ["bn"] },
  { code: "BE", name: "Belgium", languages: ["nl", "fr", "de"] },
  { code: "BF", name: "Burkina Faso", languages: ["fr"] },
  { code: "BG", name: "Bulgaria", languages: ["bg"] },
  { code: "BH", name: "Bahrain", languages: ["ar"] },
  { code: "BI", name: "Burundi", languages: ["rn", "fr", "en"] },
  { code: "BJ", name: "Benin", languages: ["fr"] },
  { code: "BL", name: "Saint Barthélemy", languages: ["fr"] },
  { code: "BM", name: "Bermuda", languages: ["en"] },
  { code: "BN", name: "Brunei", languages: ["ms"] },
  { code: "BO", name: "Bolivia", languages: ["es", "qu"] },
  { code: "BQ", name: "Caribbean Netherlands", languages: ["nl"] },
  { code: "BR", name: "Brazil", languages: ["pt"] },
  { code: "BS", name: "Bahamas", languages: ["en"] },
  { code: "BT", name: "Bhutan", languages: ["dz"] },
  { code: "BW", name: "Botswana", languages: ["en", "tn"] },
  { code: "BY", name: "Belarus", languages: ["be", "ru"] },
  { code: "BZ", name: "Belize", languages: ["en", "es"] },
  { code: "CA", name: "Canada", languages: ["en", "fr"] },
  { code: "CC", name: "Cocos (Keeling) Islands", languages: ["en"] },
  { code: "CD", name: "Democratic Republic of the Congo", languages: ["fr"] },
  { code: "CF", name: "Central African Republic", languages: ["fr", "sg"] },
  { code: "CG", name: "Republic of the Congo", languages: ["fr"] },
  { code: "CH", name: "Switzerland", languages: ["de", "fr", "it", "rm"] },
  { code: "CI", name: "Côte d'Ivoire", languages: ["fr"] },
  { code: "CK", name: "Cook Islands", languages: ["en", "mi"] },
  { code: "CL", name: "Chile", languages: ["es"] },
  { code: "CM", name: "Cameroon", languages: ["fr", "en"] },
  { code: "CN", name: "China", languages: ["zh"] },
  { code: "CO", name: "Colombia", languages: ["es"] },
  { code: "CR", name: "Costa Rica", languages: ["es"] },
  { code: "CU", name: "Cuba", languages: ["es"] },
  { code: "CV", name: "Cape Verde", languages: ["pt"] },
  { code: "CW", name: "Curaçao", languages: ["nl", "en"] },
  { code: "CX", name: "Christmas Island", languages: ["en"] },
  { code: "CY", name: "Cyprus", languages: ["el", "tr"] },
  { code: "CZ", name: "Czech Republic", languages: ["cs"] },
  { code: "DE", name: "Germany", languages: ["de"] },
  { code: "DJ", name: "Djibouti", languages: ["fr", "ar"] },
  { code: "DK", name: "Denmark", languages: ["da"] },
  { code: "DM", name: "Dominica", languages: ["en"] },
  { code: "DO", name: "Dominican Republic", languages: ["es"] },
  { code: "DZ", name: "Algeria", languages: ["ar"] },
  { code: "EC", name: "Ecuador", languages: ["es", "qu"] },
  { code: "EE", name: "Estonia", languages: ["et"] },
  { code: "EG", name: "Egypt", languages: ["ar"] },
  { code: "EH", name: "Western Sahara", languages: ["ar", "es"] },
  { code: "ER", name: "Eritrea", languages: ["ti", "ar", "en"] },
  { code: "ES", name: "Spain", languages: ["es", "ca", "gl", "eu"] },
  { code: "ET", name: "Ethiopia", languages: ["am"] },
  { code: "FI", name: "Finland", languages: ["fi", "sv"] },
  { code: "FJ", name: "Fiji", languages: ["en", "fj", "hi"] },
  { code: "FK", name: "Falkland Islands", languages: ["en"] },
  { code: "FM", name: "Micronesia", languages: ["en"] },
  { code: "FO", name: "Faroe Islands", languages: ["fo", "da"] },
  { code: "FR", name: "France", languages: ["fr"] },
  { code: "GA", name: "Gabon", languages: ["fr"] },
  { code: "GB", name: "United Kingdom", languages: ["en"] },
  { code: "GD", name: "Grenada", languages: ["en"] },
  { code: "GE", name: "Georgia", languages: ["ka"] },
  { code: "GF", name: "French Guiana", languages: ["fr"] },
  { code: "GG", name: "Guernsey", languages: ["en"] },
  { code: "GH", name: "Ghana", languages: ["en"] },
  { code: "GI", name: "Gibraltar", languages: ["en"] },
  { code: "GL", name: "Greenland", languages: ["kl", "da"] },
  { code: "GM", name: "Gambia", languages: ["en"] },
  { code: "GN", name: "Guinea", languages: ["fr"] },
  { code: "GP", name: "Guadeloupe", languages: ["fr"] },
  { code: "GQ", name: "Equatorial Guinea", languages: ["es", "fr", "pt"] },
  { code: "GR", name: "Greece", languages: ["el"] },
  { code: "GT", name: "Guatemala", languages: ["es"] },
  { code: "GU", name: "Guam", languages: ["en"] },
  { code: "GW", name: "Guinea-Bissau", languages: ["pt"] },
  { code: "GY", name: "Guyana", languages: ["en"] },
  { code: "HK", name: "Hong Kong", languages: ["zh", "en"] },
  { code: "HN", name: "Honduras", languages: ["es"] },
  { code: "HR", name: "Croatia", languages: ["hr"] },
  { code: "HT", name: "Haiti", languages: ["fr", "ht"] },
  { code: "HU", name: "Hungary", languages: ["hu"] },
  { code: "ID", name: "Indonesia", languages: ["id"] },
  { code: "IE", name: "Ireland", languages: ["en", "ga"] },
  { code: "IL", name: "Israel", languages: ["he", "ar"] },
  { code: "IM", name: "Isle of Man", languages: ["en"] },
  { code: "IN", name: "India", languages: ["hi", "en", "bn", "ta", "te", "ml", "pa", "ur"] },
  { code: "IO", name: "British Indian Ocean Territory", languages: ["en"] },
  { code: "IQ", name: "Iraq", languages: ["ar", "ku"] },
  { code: "IR", name: "Iran", languages: ["fa"] },
  { code: "IS", name: "Iceland", languages: ["is"] },
  { code: "IT", name: "Italy", languages: ["it"] },
  { code: "JE", name: "Jersey", languages: ["en"] },
  { code: "JM", name: "Jamaica", languages: ["en"] },
  { code: "JO", name: "Jordan", languages: ["ar"] },
  { code: "JP", name: "Japan", languages: ["ja"] },
  { code: "KE", name: "Kenya", languages: ["sw", "en"] },
  { code: "KG", name: "Kyrgyzstan", languages: ["ky", "ru"] },
  { code: "KH", name: "Cambodia", languages: ["km"] },
  { code: "KI", name: "Kiribati", languages: ["en"] },
  { code: "KM", name: "Comoros", languages: ["ar", "fr"] },
  { code: "KN", name: "Saint Kitts and Nevis", languages: ["en"] },
  { code: "KP", name: "North Korea", languages: ["ko"] },
  { code: "KR", name: "South Korea", languages: ["ko"] },
  { code: "KW", name: "Kuwait", languages: ["ar"] },
  { code: "KY", name: "Cayman Islands", languages: ["en"] },
  { code: "KZ", name: "Kazakhstan", languages: ["kk", "ru"] },
  { code: "LA", name: "Laos", languages: ["lo"] },
  { code: "LB", name: "Lebanon", languages: ["ar", "fr"] },
  { code: "LC", name: "Saint Lucia", languages: ["en"] },
  { code: "LI", name: "Liechtenstein", languages: ["de"] },
  { code: "LK", name: "Sri Lanka", languages: ["si", "ta"] },
  { code: "LR", name: "Liberia", languages: ["en"] },
  { code: "LS", name: "Lesotho", languages: ["en", "st"] },
  { code: "LT", name: "Lithuania", languages: ["lt"] },
  { code: "LU", name: "Luxembourg", languages: ["lb", "fr", "de"] },
  { code: "LV", name: "Latvia", languages: ["lv"] },
  { code: "LY", name: "Libya", languages: ["ar"] },
  { code: "MA", name: "Morocco", languages: ["ar", "fr"] },
  { code: "MC", name: "Monaco", languages: ["fr"] },
  { code: "MD", name: "Moldova", languages: ["ro"] },
  { code: "ME", name: "Montenegro", languages: ["sr"] },
  { code: "MF", name: "Saint Martin", languages: ["fr"] },
  { code: "MG", name: "Madagascar", languages: ["mg", "fr"] },
  { code: "MH", name: "Marshall Islands", languages: ["en", "mh"] },
  { code: "MK", name: "North Macedonia", languages: ["mk"] },
  { code: "ML", name: "Mali", languages: ["fr"] },
  { code: "MM", name: "Myanmar", languages: ["my"] },
  { code: "MN", name: "Mongolia", languages: ["mn"] },
  { code: "MO", name: "Macao", languages: ["zh", "pt"] },
  { code: "MP", name: "Northern Mariana Islands", languages: ["en"] },
  { code: "MQ", name: "Martinique", languages: ["fr"] },
  { code: "MR", name: "Mauritania", languages: ["ar"] },
  { code: "MS", name: "Montserrat", languages: ["en"] },
  { code: "MT", name: "Malta", languages: ["mt", "en"] },
  { code: "MU", name: "Mauritius", languages: ["en", "fr"] },
  { code: "MV", name: "Maldives", languages: ["dv"] },
  { code: "MW", name: "Malawi", languages: ["en", "ny"] },
  { code: "MX", name: "Mexico", languages: ["es"] },
  { code: "MY", name: "Malaysia", languages: ["ms", "en"] },
  { code: "MZ", name: "Mozambique", languages: ["pt"] },
  { code: "NA", name: "Namibia", languages: ["en"] },
  { code: "NC", name: "New Caledonia", languages: ["fr"] },
  { code: "NE", name: "Niger", languages: ["fr"] },
  { code: "NF", name: "Norfolk Island", languages: ["en"] },
  { code: "NG", name: "Nigeria", languages: ["en", "ha"] },
  { code: "NI", name: "Nicaragua", languages: ["es"] },
  { code: "NL", name: "Netherlands", languages: ["nl"] },
  { code: "NO", name: "Norway", languages: ["nb", "nn"] },
  { code: "NP", name: "Nepal", languages: ["ne"] },
  { code: "NR", name: "Nauru", languages: ["en"] },
  { code: "NU", name: "Niue", languages: ["en"] },
  { code: "NZ", name: "New Zealand", languages: ["en", "mi"] },
  { code: "OM", name: "Oman", languages: ["ar"] },
  { code: "PA", name: "Panama", languages: ["es"] },
  { code: "PE", name: "Peru", languages: ["es", "qu"] },
  { code: "PF", name: "French Polynesia", languages: ["fr"] },
  { code: "PG", name: "Papua New Guinea", languages: ["en"] },
  { code: "PH", name: "Philippines", languages: ["fil", "en"] },
  { code: "PK", name: "Pakistan", languages: ["ur", "en"] },
  { code: "PL", name: "Poland", languages: ["pl"] },
  { code: "PM", name: "Saint Pierre and Miquelon", languages: ["fr"] },
  { code: "PN", name: "Pitcairn", languages: ["en"] },
  { code: "PR", name: "Puerto Rico", languages: ["es", "en"] },
  { code: "PS", name: "Palestine", languages: ["ar"] },
  { code: "PT", name: "Portugal", languages: ["pt"] },
  { code: "PW", name: "Palau", languages: ["en"] },
  { code: "PY", name: "Paraguay", languages: ["es", "gn"] },
  { code: "QA", name: "Qatar", languages: ["ar"] },
  { code: "RE", name: "Réunion", languages: ["fr"] },
  { code: "RO", name: "Romania", languages: ["ro"] },
  { code: "RS", name: "Serbia", languages: ["sr"] },
  { code: "RU", name: "Russia", languages: ["ru"] },
  { code: "RW", name: "Rwanda", languages: ["rw", "en", "fr"] },
  { code: "SA", name: "Saudi Arabia", languages: ["ar"] },
  { code: "SB", name: "Solomon Islands", languages: ["en"] },
  { code: "SC", name: "Seychelles", languages: ["fr", "en"] },
  { code: "SD", name: "Sudan", languages: ["ar", "en"] },
  { code: "SE", name: "Sweden", languages: ["sv"] },
  { code: "SG", name: "Singapore", languages: ["en", "zh", "ms", "ta"] },
  { code: "SH", name: "Saint Helena", languages: ["en"] },
  { code: "SI", name: "Slovenia", languages: ["sl"] },
  { code: "SJ", name: "Svalbard and Jan Mayen", languages: ["nb"] },
  { code: "SK", name: "Slovakia", languages: ["sk"] },
  { code: "SL", name: "Sierra Leone", languages: ["en"] },
  { code: "SM", name: "San Marino", languages: ["it"] },
  { code: "SN", name: "Senegal", languages: ["fr"] },
  { code: "SO", name: "Somalia", languages: ["so", "ar"] },
  { code: "SR", name: "Suriname", languages: ["nl"] },
  { code: "SS", name: "South Sudan", languages: ["en"] },
  { code: "ST", name: "São Tomé and Príncipe", languages: ["pt"] },
  { code: "SV", name: "El Salvador", languages: ["es"] },
  { code: "SX", name: "Sint Maarten", languages: ["nl", "en"] },
  { code: "SY", name: "Syria", languages: ["ar"] },
  { code: "SZ", name: "Eswatini", languages: ["en", "ss"] },
  { code: "TC", name: "Turks and Caicos Islands", languages: ["en"] },
  { code: "TD", name: "Chad", languages: ["fr", "ar"] },
  { code: "TG", name: "Togo", languages: ["fr"] },
  { code: "TH", name: "Thailand", languages: ["th"] },
  { code: "TJ", name: "Tajikistan", languages: ["tg", "ru"] },
  { code: "TK", name: "Tokelau", languages: ["en"] },
  { code: "TL", name: "Timor-Leste", languages: ["pt"] },
  { code: "TM", name: "Turkmenistan", languages: ["tk"] },
  { code: "TN", name: "Tunisia", languages: ["ar", "fr"] },
  { code: "TO", name: "Tonga", languages: ["to", "en"] },
  { code: "TR", name: "Turkey", languages: ["tr"] },
  { code: "TT", name: "Trinidad and Tobago", languages: ["en"] },
  { code: "TV", name: "Tuvalu", languages: ["en"] },
  { code: "TW", name: "Taiwan", languages: ["zh"] },
  { code: "TZ", name: "Tanzania", languages: ["sw", "en"] },
  { code: "UA", name: "Ukraine", languages: ["uk"] },
  { code: "UG", name: "Uganda", languages: ["en", "sw"] },
  { code: "US", name: "United States", languages: ["en", "es"] },
  { code: "UY", name: "Uruguay", languages: ["es"] },
  { code: "UZ", name: "Uzbekistan", languages: ["uz", "ru"] },
  { code: "VA", name: "Vatican City", languages: ["it"] },
  { code: "VC", name: "Saint Vincent and the Grenadines", languages: ["en"] },
  { code: "VE", name: "Venezuela", languages: ["es"] },
  { code: "VG", name: "British Virgin Islands", languages: ["en"] },
  { code: "VI", name: "U.S. Virgin Islands", languages: ["en"] },
  { code: "VN", name: "Vietnam", languages: ["vi"] },
  { code: "VU", name: "Vanuatu", languages: ["en", "fr"] },
  { code: "WF", name: "Wallis and Futuna", languages: ["fr"] },
  { code: "WS", name: "Samoa", languages: ["sm", "en"] },
  { code: "YE", name: "Yemen", languages: ["ar"] },
  { code: "YT", name: "Mayotte", languages: ["fr"] },
  { code: "ZA", name: "South Africa", languages: ["en", "af", "zu", "xh"] },
  { code: "ZM", name: "Zambia", languages: ["en"] },
  { code: "ZW", name: "Zimbabwe", languages: ["en", "sn"] },
];

const COUNTRIES_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
const LANGUAGES_BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

/** Look up a country by ISO 3166-1 alpha-2 code. */
export function getCountry(code: string): Country | undefined {
  return COUNTRIES_BY_CODE.get(code);
}

/** Look up a language by ISO 639-1 code. */
export function getLanguage(code: string): Language | undefined {
  return LANGUAGES_BY_CODE.get(code);
}

/**
 * True iff `languageCode` is one of the official languages we have on
 * record for `countryCode`. Used by the `/api/super-admin/languages`
 * POST handler to keep DB rows aligned with the curated dataset.
 */
export function isValidCountryLanguage(countryCode: string, languageCode: string): boolean {
  const country = COUNTRIES_BY_CODE.get(countryCode);
  if (!country) return false;
  return country.languages.includes(languageCode);
}

/**
 * The `(country, language)` pair the app seeds on first boot and that
 * super-admins may never delete. English / United Kingdom is chosen so
 * the rest of the codebase's British spelling stays consistent — admins
 * can add `en-US`, `en-AU`, etc. on top.
 */
export const DEFAULT_LANGUAGE = { countryCode: "GB", languageCode: "en" } as const;

/**
 * Render a row as "English (United Kingdom)" — falls back to the raw
 * codes when the dataset doesn't know one of them, so older rows stay
 * displayable if we ever prune the curated list.
 */
export function formatLocaleLabel(countryCode: string, languageCode: string): string {
  const country = COUNTRIES_BY_CODE.get(countryCode);
  const language = LANGUAGES_BY_CODE.get(languageCode);
  return `${language?.name ?? languageCode} (${country?.name ?? countryCode})`;
}

/**
 * Country code → flag emoji. Each ASCII letter is shifted into the
 * Regional Indicator Symbol range (U+1F1E6–U+1F1FF), so "GB" becomes
 * 🇬🇧, "DK" becomes 🇩🇰, etc. Returns an empty string for invalid input.
 */
export function flagEmoji(countryCode: string): string {
  if (!/^[A-Za-z]{2}$/.test(countryCode)) return "";
  const cc = countryCode.toUpperCase();
  const A = 0x41;
  const RI = 0x1f1e6;
  return String.fromCodePoint(RI + (cc.charCodeAt(0) - A), RI + (cc.charCodeAt(1) - A));
}
