const STOPWORDS = new Set([
    // Begrüßungen und Füllwörter
    'hey', 'hi', 'hallo', 'hallöchen', 'moin', 'servus', 'huhu', 'yo', 'na', 'liebe', 'lieber', 'guten',
    'ja', 'nein', 'ok', 'okay', 'oki', 'also', 'und', 'oder', 'aber', 'dann', 'denn', 'doch', 'noch', 'schon',
    'mal', 'nur', 'auch', 'eben', 'halt', 'gerne', 'gern', 'vielleicht', 'bitte', 'danke', 'super', 'cool',
    'klar', 'sicher', 'wie', 'was', 'wann', 'wo', 'ob', 'dass', 'so', 'ca', 'circa', 'etwa', 'ungefähr',
    'genau', 'sonst', 'nochmal', 'wieder', 'kurz', 'nicht', 'kein', 'keine', 'zeit', 'lust', 'erinnerung',
    'termin', 'info',
    // Pronomen
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mich', 'dich', 'uns', 'euch', 'mir', 'dir', 'ihm', 'ihnen',
    'man', 'mein', 'meine', 'dein', 'deine', 'unser', 'unsere',
    // Hilfs- und Modalverben
    'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'waren', 'habe', 'hab', 'hast', 'hat', 'haben', 'habt',
    'hätte', 'hättest', 'hätten', 'will', 'willst', 'wollen', 'wollt', 'möchte', 'möchtest', 'möchten', 'kann',
    'kannst', 'können', 'könnt', 'könnten', 'soll', 'sollen', 'sollten', 'muss', 'musst', 'müssen', 'würde',
    'würdest', 'würden', 'wäre', 'geht', 'gehts', 'passt', 'klappt', 'lass', 'lasst', 'vergessen', 'vergiss',
    'denk', 'denkt', 'dran', 'daran',
    // Reste von Zeitangaben
    'am', 'um', 'ab', 'bis', 'gegen', 'uhr', 'heute', 'morgen', 'übermorgen', 'früh', 'morgens',
    'vormittag', 'vormittags', 'mittag', 'mittags', 'nachmittag', 'nachmittags', 'abend', 'abends', 'nacht',
    'nachts',
]);
const EDGE_WORDS = new Set([
    'im', 'in', 'ins', 'beim', 'bei', 'zum', 'zur', 'zu', 'mit', 'auf', 'für', 'nach', 'an', 'der', 'die',
    'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'und', 'oder', 'von', 'vom',
]);
const ABBREVIATIONS = new Set(['dr', 'prof', 'hr', 'fr', 'st', 'nr', 'str']);
function cleanWord(word) {
    const cleaned = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    return ABBREVIATIONS.has(cleaned.toLowerCase()) && word.includes(`${cleaned}.`) ? `${cleaned}.` : cleaned;
}
const MAX_WORDS = 6;
const MAX_LENGTH = 60;
/**
 * Leitet einen Titel ab, indem erkannte Datums-/Zeitangaben, Füllwörter und Begrüßungen
 * entfernt werden. Bewusst einfach gehalten – der Titel ist im Formular editierbar.
 */
export function extractTitle(text, spans) {
    let remaining = text;
    for (const [start, end] of [...spans].sort((a, b) => b[0] - a[0])) {
        remaining = `${remaining.slice(0, start)} ${remaining.slice(end)}`;
    }
    remaining = remaining.replace(/https?:\/\/\S+/g, ' ');
    const words = remaining
        .split(/\s+/)
        .map(cleanWord)
        .filter((word) => word.length > 0 && !STOPWORDS.has(word.toLowerCase()));
    while (words.length > 0 && EDGE_WORDS.has(words[0].toLowerCase()))
        words.shift();
    while (words.length > 0 && EDGE_WORDS.has(words[words.length - 1].toLowerCase()))
        words.pop();
    let title = words.slice(0, MAX_WORDS).join(' ');
    if (title.length > MAX_LENGTH)
        title = `${title.slice(0, MAX_LENGTH - 1).trimEnd()}…`;
    if (!title)
        return 'Termin';
    return title.charAt(0).toUpperCase() + title.slice(1);
}
//# sourceMappingURL=title.js.map