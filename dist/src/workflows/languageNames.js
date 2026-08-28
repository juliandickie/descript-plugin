// The iDD language filename vocabulary, locked 2026-08-28.
//
// Canonical language code -> the exact segment written into deliverable
// filenames per the iDD course production naming standard (the "Course
// production" tab of the iDD naming standard Google Doc is the canonical
// record). Segments are code + simplified bracket-free English name.
// Latin American Spanish is written plain "ES" in filenames while its
// canonical code stays es-419 - mapping records (translate reports,
// LANGUAGE-INDEX files) always carry the canonical code.
//
// Generated from the standard's computed data set (Desktop/iDD-Naming-
// Convention/generate-options-doc.mjs), not hand-typed. English plus the
// 64 translation languages in the UISC set.
const SEGMENTS = new Map([
    ["af", "AF Afrikaans"],
    ["as", "AS Assamese"],
    ["az", "AZ Azerbaijani"],
    ["be", "BE Belarusian"],
    ["bg", "BG Bulgarian"],
    ["bn", "BN Bengali"],
    ["bs", "BS Bosnian"],
    ["ca", "CA Catalan"],
    ["cs", "CS Czech"],
    ["cy", "CY Welsh"],
    ["da", "DA Danish"],
    ["de", "DE German"],
    ["el", "EL Greek"],
    ["en", "EN English"],
    ["es-419", "ES Spanish Latino"],
    ["es-ES", "ES-ES Spanish Spain"],
    ["et", "ET Estonian"],
    ["fi", "FI Finnish"],
    ["fil", "FIL Filipino"],
    ["fr-CA", "FR-CA French Canada"],
    ["fr-FR", "FR-FR French France"],
    ["gl", "GL Galician"],
    ["ha", "HA Hausa"],
    ["hi", "HI Hindi"],
    ["hr", "HR Croatian"],
    ["hu", "HU Hungarian"],
    ["hy", "HY Armenian"],
    ["id", "ID Indonesian"],
    ["it", "IT Italian"],
    ["ja", "JA Japanese"],
    ["jv", "JV Javanese"],
    ["ka", "KA Georgian"],
    ["kk", "KK Kazakh"],
    ["ko", "KO Korean"],
    ["lb", "LB Luxembourgish"],
    ["lt", "LT Lithuanian"],
    ["lv", "LV Latvian"],
    ["mk", "MK Macedonian"],
    ["ml", "ML Malayalam"],
    ["mr", "MR Marathi"],
    ["ms", "MS Malay"],
    ["ne", "NE Nepali"],
    ["nl", "NL Dutch"],
    ["no", "NO Norwegian"],
    ["pa", "PA Punjabi"],
    ["pl", "PL Polish"],
    ["pt-BR", "PT-BR Portuguese Brazil"],
    ["pt-PT", "PT-PT Portuguese Portugal"],
    ["ro", "RO Romanian"],
    ["ru", "RU Russian"],
    ["sd", "SD Sindhi"],
    ["sk", "SK Slovak"],
    ["sl", "SL Slovenian"],
    ["so", "SO Somali"],
    ["sr-Latn", "SR-Latn Serbian Latin"],
    ["sv", "SV Swedish"],
    ["sw", "SW Swahili"],
    ["ta", "TA Tamil"],
    ["te", "TE Telugu"],
    ["th", "TH Thai"],
    ["tr", "TR Turkish"],
    ["uk", "UK Ukrainian"],
    ["vi", "VI Vietnamese"],
    ["zh-Hans", "ZH-Hans Chinese Simplified"],
    ["zh-Hant", "ZH-Hant Chinese Traditional"]
]);
// Case-insensitive lookup index. Codes arrive from hand-maintained mapping
// files, so "FR-CA", "fr-ca", and "fr-CA" must all resolve.
const BY_LOWER = new Map();
for (const [code, segment] of SEGMENTS)
    BY_LOWER.set(code.toLowerCase(), segment);
/**
 * Resolve a language code to its filename segment, or undefined when the
 * code is not in the vocabulary. Bare "es" is deliberately absent - the iDD
 * set carries two Spanish variants, so callers must say which.
 */
export function segmentForCode(code) {
    return BY_LOWER.get(code.trim().toLowerCase());
}
/** All canonical codes, for error messages and docs. */
export function knownLanguageCodes() {
    return [...SEGMENTS.keys()];
}
/**
 * Hint appended to unknown-code errors. Special-cases bare "es" because it
 * is the one code users will reach for that is ambiguous on purpose.
 */
export function unknownCodeHint(code) {
    if (code.trim().toLowerCase() === "es") {
        return `"es" is ambiguous - use "es-419" (Spanish Latino) or "es-ES" (Spanish Spain)`;
    }
    return `known codes: ${knownLanguageCodes().join(", ")}`;
}
