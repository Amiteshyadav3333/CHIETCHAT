import React from 'react';
import { ArrowLeftIcon, LockClosedIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const LEGAL_CONTENT = {
    terms: {
        title: 'Terms and Conditions',
        updated: 'Effective June 6, 2026',
        intro: 'These terms explain the basic rules for using CHEETCHAT. By creating an account or using the app, you agree to use it responsibly and lawfully.',
        sections: [
            ['Using CHEETCHAT', 'You must use CHEETCHAT lawfully, respect other users, and keep your account credentials secure. You are responsible for activity performed through your account.'],
            ['Your content', 'You retain ownership of content you share. You grant CHEETCHAT permission to host, process, display, and deliver that content only as needed to operate messaging, status, social, reel, channel, and business features.'],
            ['Safety', 'Spam, harassment, fraud, illegal content, and attempts to compromise the service are prohibited. Accounts may be limited or removed when these rules are violated.'],
            ['Service availability', 'Features may change or be temporarily unavailable for maintenance, security, or technical reasons.'],
            ['Account deletion', 'You can request permanent account deletion from Settings > Account > Delete account. Deletion removes your profile and associated app data from active systems, except information we must keep for security, legal, or abuse-prevention reasons.'],
            ['Contact', 'Questions about these terms can be sent to the CHEETCHAT support team using the contact email provided in the Play Store listing.'],
        ],
    },
    privacy: {
        title: 'Privacy Policy',
        updated: 'Effective June 6, 2026',
        intro: 'CHEETCHAT is a chat, calling, status, reels, and social sharing app. This policy explains what data the app collects, why it is used, how it is protected, and how you can control or delete it.',
        sections: [
            ['Information we collect', 'We collect account information such as username, email address, phone number, password hash, public encryption key, profile photo, bio, website, verification status, and account settings. We also collect contacts or users you add inside CHEETCHAT, blocked users, group and channel membership, and support or safety reports you submit.'],
            ['Messages, calls, and chats', 'CHEETCHAT processes messages, attachments, reactions, read receipts, delivery status, pinned messages, disappearing-message settings, group information, join requests, and call signaling data so chats and calls can work. Message content is encrypted for participants when encryption keys are available. Voice or video call media is transmitted using real-time communication technology and is not intentionally recorded by CHEETCHAT.'],
            ['Media and social features', 'If you upload avatars, chat attachments, statuses, reels, posts, comments, replies, likes, reactions, channel covers, or other media, we store and process that content so it can be shown to the people or audiences you choose. View counts, status views, shares, notifications, and interaction counts may be stored to operate these features.'],
            ['Device permissions', 'CHEETCHAT may ask for camera, microphone, photos/files, notifications, and location permissions. Camera and files are used for photos, videos, avatars, posts, reels, and attachments. Microphone is used for voice messages and calls. Location is used only when you choose to share a location message or live location. Notifications are used for messages, calls, and app alerts. You can change permissions in your device settings.'],
            ['How we use data', 'We use data to create and secure accounts, verify email, deliver messages and calls, sync contacts you add, provide status, reels and social features, personalize visible profile information, prevent spam and abuse, maintain the service, troubleshoot issues, and comply with legal obligations.'],
            ['Sharing and third-party services', 'Your profile, posts, reels, statuses, messages, reactions, and interaction data are shared with other users according to the feature you use and your privacy choices. We may use service providers for hosting, database, authentication, media storage, email verification, real-time communication, and analytics or diagnostics. These providers process data only to help operate CHEETCHAT. We do not sell your personal information.'],
            ['Security', 'We use reasonable technical and organizational safeguards, including encrypted transport, password hashing, account verification, access controls, and encryption features for private communication. No online service can be guaranteed completely secure, so never share your password or verification codes.'],
            ['Retention', 'We keep account data while your account is active. Messages, posts, reels, statuses, and other content are retained as needed to provide the app, unless deleted by you, expired by a feature, removed for safety reasons, or deleted with your account. Some logs, backups, security records, or legal records may be kept for a limited period where necessary.'],
            ['Your controls and deletion', 'You can edit your profile, block or report users, hide last seen, manage chat preferences, control device permissions, delete chats or content where supported, and permanently delete your account from Settings > Account > Delete account. Account deletion removes your profile, messages, contacts, posts, reels, statuses, account relationships, and related app data from active systems, except limited information retained for legal, safety, fraud-prevention, or backup purposes.'],
            ['Children', 'CHEETCHAT is not directed to children under 13. If you believe a child has provided personal information, contact us so we can review and delete it where required.'],
            ['International processing', 'Your information may be processed and stored in countries where our servers or service providers operate. We take steps designed to protect your information according to this policy.'],
            ['Changes to this policy', 'We may update this policy when the app, legal requirements, or our practices change. The effective date above shows when this policy was last updated.'],
            ['Contact us', 'For privacy questions or data deletion help, contact the CHEETCHAT support team using the developer contact email shown on the Google Play Store listing.'],
        ],
    },
};

const LegalPage = ({ type }) => {
    const content = LEGAL_CONTENT[type] || LEGAL_CONTENT.privacy;

    return (
        <main className="min-h-screen bg-[#f0f2f5] px-4 py-8 text-[#111b21]">
            <article className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
                <header className="flex items-center gap-3 bg-[#008069] px-5 py-4 text-white">
                    <button onClick={() => window.history.length > 1 ? window.history.back() : window.close()} title="Go back" className="rounded-full p-2 hover:bg-white/10">
                        <ArrowLeftIcon className="h-5 w-5" />
                    </button>
                    <ShieldCheckIcon className="h-7 w-7" />
                    <div>
                        <h1 className="text-xl font-semibold">{content.title}</h1>
                        <p className="text-xs text-white/75">{content.updated}</p>
                    </div>
                </header>
                <div className="space-y-7 p-6 sm:p-8">
                    <div className="flex gap-3 rounded-lg bg-[#e7fce8] p-4 text-sm">
                        <LockClosedIcon className="h-5 w-5 shrink-0 text-[#008069]" />
                        <p>{content.intro}</p>
                    </div>
                    {content.sections.map(([title, text]) => (
                        <section key={title}>
                            <h2 className="mb-2 text-base font-semibold text-[#008069]">{title}</h2>
                            <p className="text-sm leading-7 text-[#54656f]">{text}</p>
                        </section>
                    ))}
                </div>
            </article>
        </main>
    );
};

export default LegalPage;
