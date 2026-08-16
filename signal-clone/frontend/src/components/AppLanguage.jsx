import { useEffect, useRef } from 'react';
import axios from 'axios';

export const INDIAN_LANGUAGES = [
    ['en', 'English'], ['as', 'Assamese'], ['bn', 'Bengali'], ['brx', 'Bodo'],
    ['doi', 'Dogri'], ['gu', 'Gujarati'], ['hi', 'Hindi'], ['kn', 'Kannada'],
    ['ks', 'Kashmiri'], ['kok', 'Konkani'], ['mai', 'Maithili'], ['ml', 'Malayalam'],
    ['mni', 'Manipuri'], ['mr', 'Marathi'], ['ne', 'Nepali'], ['or', 'Odia'],
    ['pa', 'Punjabi'], ['sa', 'Sanskrit'], ['sat', 'Santali'], ['sd', 'Sindhi'],
    ['ta', 'Tamil'], ['te', 'Telugu'], ['ur', 'Urdu'],
];

const ignoredTags = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA']);
const isUiText = value => value && /[A-Za-z]/.test(value) && value.trim().length > 1;

export default function AppLanguage() {
    const records = useRef(new Map());
    const timer = useRef(null);
    const running = useRef(false);
    const rerun = useRef(false);

    useEffect(() => {
        let disposed = false;
        const translatePage = async () => {
            if (running.current) { rerun.current = true; return; }
            running.current = true;
            const language = localStorage.getItem('app_language') || 'en';
            document.documentElement.lang = language;
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            const nodes = [];
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const parent = node.parentElement;
                if (!parent || ignoredTags.has(parent.tagName) || parent.closest('[data-no-translate], [contenteditable="true"]')) continue;
                const current = node.nodeValue;
                const record = records.current.get(node);
                if (record && current !== record.translated && current !== record.original) records.current.set(node, { original: current, translated: null });
                else if (!record && isUiText(current)) records.current.set(node, { original: current, translated: null });
                if (records.current.has(node)) nodes.push(node);
            }
            if (language === 'en') {
                nodes.forEach(node => { const item = records.current.get(node); if (item && node.nodeValue === item.translated) node.nodeValue = item.original; item.translated = null; });
            } else {
                const pending = nodes.filter(node => { const item = records.current.get(node); return item && node.nodeValue !== item.translated; });
                const unique = [...new Set(pending.map(node => records.current.get(node).original.trim()))];
                for (let index = 0; index < unique.length && !disposed; index += 75) {
                    const source = unique.slice(index, index + 75);
                    try {
                        const { data } = await axios.post('/api/ui/translate', { language, texts: source });
                        const translated = new Map(source.map((text, i) => [text, data.translations?.[i] || text]));
                        pending.forEach(node => {
                            const item = records.current.get(node); const key = item?.original.trim();
                            if (!item || !translated.has(key)) return;
                            const leading = item.original.match(/^\s*/)?.[0] || ''; const trailing = item.original.match(/\s*$/)?.[0] || '';
                            item.translated = `${leading}${translated.get(key)}${trailing}`; node.nodeValue = item.translated;
                        });
                    } catch { break; }
                }
            }
            running.current = false;
            if (rerun.current && !disposed) { rerun.current = false; translatePage(); }
        };
        const schedule = () => { clearTimeout(timer.current); timer.current = setTimeout(translatePage, 180); };
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        window.addEventListener('cheetchat-language-changed', translatePage);
        translatePage();
        return () => { disposed = true; observer.disconnect(); clearTimeout(timer.current); window.removeEventListener('cheetchat-language-changed', translatePage); };
    }, []);
    return null;
}
