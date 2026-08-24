import React from 'react';
import { getSafeWebsiteUrl } from '../utils/safeUrl';

// Keep trailing sentence punctuation outside the link.
const URL_PATTERN = /(?:https:\/\/|www\.)[^\s<]+/gi;
const TRAILING_PUNCTUATION = /[),.!?:;]+$/;

export const splitLinkifiedText = (value = '') => {
    const parts = [];
    let cursor = 0;

    for (const match of String(value).matchAll(URL_PATTERN)) {
        const start = match.index;
        const rawMatch = match[0];
        const trailing = rawMatch.match(TRAILING_PUNCTUATION)?.[0] || '';
        const label = trailing ? rawMatch.slice(0, -trailing.length) : rawMatch;
        const href = getSafeWebsiteUrl(label);

        if (start > cursor) parts.push({ type: 'text', value: String(value).slice(cursor, start) });
        if (href) parts.push({ type: 'link', value: label, href });
        else parts.push({ type: 'text', value: label });
        if (trailing) parts.push({ type: 'text', value: trailing });
        cursor = start + rawMatch.length;
    }

    if (cursor < String(value).length) parts.push({ type: 'text', value: String(value).slice(cursor) });
    return parts;
};

const LinkifiedText = ({ children }) => splitLinkifiedText(children).map((part, index) => (
    part.type === 'link' ? (
        <a
            key={`${part.href}-${index}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={event => event.stopPropagation()}
            className="text-[#1d9bf0] hover:underline"
        >
            {part.value}
        </a>
    ) : <React.Fragment key={index}>{part.value}</React.Fragment>
));

export default LinkifiedText;
