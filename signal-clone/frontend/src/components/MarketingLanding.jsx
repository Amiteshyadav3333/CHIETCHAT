import React, { useEffect, useState } from 'react';
import {
  ArrowTopRightOnSquareIcon, BriefcaseIcon, ChatBubbleLeftRightIcon,
  CheckCircleIcon, FilmIcon, LanguageIcon, LockClosedIcon, MicrophoneIcon,
  SparklesIcon, UserGroupIcon, VideoCameraIcon
} from '@heroicons/react/24/outline';

const copy = {
  en: {
    nav: ['Features', 'Security', 'Projects', 'Pricing', 'Legal', 'FAQ'],
    badge: 'Made in India · Built for college life',
    title: 'One Indian app for every way you connect.',
    intro: 'CHEETCHAT combines private messaging, social posts, communities, reels, HD calls, multilingual communication, creator video and practical AI in one student-friendly experience.',
    explore: 'Explore every feature', android: 'Get Android beta',
    trusted: 'Private by design', india: 'India-first infrastructure', languages: 'Indian languages supported',
    featureTitle: 'More than chat. Your complete digital campus.',
    featureIntro: 'Move from a private conversation to a community, reel, live room or study video without switching apps.',
    securityTitle: 'Privacy you can verify — not just a promise.',
    securityBody: 'CHEETCHAT private messages use hybrid end-to-end encryption. A fresh AES-GCM key protects message content and is securely wrapped for each participant using their public key. Safety numbers help people compare keys. Encrypted media is protected before upload, while calls use secure WebRTC transport.',
    retentionTitle: 'India-hosted, privacy-minded data handling',
    retentionBody: 'The product is designed to minimise retained private communication data and to delete eligible temporary data according to configured retention rules. Public social and reels content may remain available so it can be delivered to audiences, with access controls, moderation and storage safeguards. Exact retention depends on content type, account settings and the published privacy policy.',
    founderTitle: 'Built by a student, for students.',
    founderBody: 'CHEETCHAT was founded by Amitesh Kumar Yadav to give Indian college students one place to communicate, learn, create, build communities and grow small businesses. The vision is an India-first digital ecosystem that respects language diversity and user choice.',
    projectsTitle: 'More products by Amitesh Kumar Yadav',
    pricingTitle: 'Simple plans for every stage',
    pricingIntro: 'Start free, upgrade when you need more creation, AI and communication power.',
    faqTitle: 'Questions, answered clearly',
    legalTitle: 'Clear rules. Honest privacy. Control stays with you.',
    legalIntro: 'Before creating an account, every user can understand what CHEETCHAT collects, why it is needed, how public and private content differ, and how to delete content or the entire account.',
    termsCard: 'Terms & Conditions', privacyCard: 'Privacy Policy', fullPolicy: 'Read the complete policy',
    finalTitle: 'Your people, ideas and ambitions — in one place.',
    finalBody: 'Join a platform designed for Indian students, creators, communities and growing businesses.',
  },
  hi: {
    nav: ['फीचर्स', 'सुरक्षा', 'प्रोजेक्ट्स', 'प्राइसिंग', 'कानूनी', 'सवाल'],
    badge: 'भारत में निर्मित · कॉलेज जीवन के लिए',
    title: 'कनेक्ट होने के हर तरीके के लिए एक भारतीय ऐप।',
    intro: 'CHEETCHAT निजी चैट, सोशल पोस्ट, कम्युनिटी, रील्स, HD कॉल, बहुभाषी बातचीत, वीडियो और उपयोगी AI को एक छात्र-अनुकूल अनुभव में जोड़ता है।',
    explore: 'सभी फीचर्स देखें', android: 'Android बीटा पाएं',
    trusted: 'डिज़ाइन से प्राइवेट', india: 'भारत-केंद्रित इंफ्रास्ट्रक्चर', languages: 'भारतीय भाषाओं का समर्थन',
    featureTitle: 'सिर्फ चैट नहीं। आपका पूरा डिजिटल कैंपस।',
    featureIntro: 'ऐप बदले बिना निजी बातचीत से कम्युनिटी, रील, लाइव रूम या स्टडी वीडियो पर जाएँ।',
    securityTitle: 'ऐसी प्राइवेसी जिसे आप सत्यापित कर सकते हैं।',
    securityBody: 'CHEETCHAT के निजी संदेश हाइब्रिड एंड-टू-एंड एन्क्रिप्शन का उपयोग करते हैं। नया AES-GCM key संदेश की सामग्री सुरक्षित करता है और हर सहभागी की public key से सुरक्षित रूप से wrap होता है। Safety number से keys verify की जा सकती हैं। मीडिया upload से पहले encrypt होता है और calls secure WebRTC transport इस्तेमाल करती हैं।',
    retentionTitle: 'भारत में होस्ट, प्राइवेसी-केंद्रित डेटा हैंडलिंग',
    retentionBody: 'उत्पाद निजी communication data को कम रखने और configured retention rules के अनुसार eligible temporary data मिटाने के लिए बनाया गया है। Social और reels का public content audience तक पहुँचाने के लिए access controls, moderation और storage safeguards के साथ रह सकता है। सही retention content type, settings और privacy policy पर निर्भर है।',
    founderTitle: 'एक छात्र द्वारा, छात्रों के लिए बनाया गया।',
    founderBody: 'CHEETCHAT की स्थापना Amitesh Kumar Yadav ने भारतीय कॉलेज छात्रों को बातचीत, पढ़ाई, creation, communities और small business growth के लिए एक जगह देने के उद्देश्य से की। लक्ष्य language diversity और user choice का सम्मान करने वाला India-first ecosystem है।',
    projectsTitle: 'Amitesh Kumar Yadav के अन्य प्रोडक्ट्स',
    pricingTitle: 'हर चरण के लिए सरल प्लान',
    pricingIntro: 'Free से शुरू करें और अधिक AI, creation और communication के लिए upgrade करें।',
    faqTitle: 'आपके सवाल, साफ जवाब',
    legalTitle: 'साफ नियम। ईमानदार प्राइवेसी। नियंत्रण आपके पास।',
    legalIntro: 'Account बनाने से पहले हर user समझ सकता है कि CHEETCHAT कौन-सा data लेता है, क्यों जरूरी है, public और private content में क्या अंतर है और content या account कैसे delete करना है।',
    termsCard: 'नियम और शर्तें', privacyCard: 'प्राइवेसी पॉलिसी', fullPolicy: 'पूरी पॉलिसी पढ़ें',
    finalTitle: 'आपके लोग, विचार और लक्ष्य — एक जगह।',
    finalBody: 'भारतीय छात्रों, creators, communities और बढ़ते businesses के लिए बने platform से जुड़ें।',
  }
};

const features = [
  [ChatBubbleLeftRightIcon, 'Smart multilingual chat', 'स्मार्ट बहुभाषी चैट', 'Translate individual messages, communicate across languages, use AI Grammar, Smart Replies and AI chat summaries. Pin, mute, archive, schedule, react, forward, search and verify encryption — plus universal messages, custom nicknames and reply reminders.', 'संदेश translate करें, AI Grammar, Smart Replies और chat summaries इस्तेमाल करें। Pin, mute, archive, schedule, react, forward, search और encryption verify करें।'],
  [SparklesIcon, 'Draw, Snap & expressive profiles', 'Draw, Snap और expressive profiles', 'Draw directly on a chat or message, send disappearing content with Snap Mode, create special DPs for selected contacts, publish special stories, use avatars, themes, wallpapers, fonts, birthday experiences and real-time photo reactions.', 'Chat या message पर draw करें, Snap Mode से disappearing content भेजें, selected contacts के लिए special DP, stories, avatar, theme, wallpaper और birthday experiences बनाएं।'],
  [UserGroupIcon, 'Social, tweets & communities', 'Social, tweets और communities', 'Publish tweet-style posts, photos, videos and articles. Follow creators, reply, repost, bookmark and share. Build communities and spaces, customize your feed and keep control over what you discover.', 'Tweet-style posts, photos, videos और articles publish करें। Creators को follow करें, reply, repost, bookmark और share करें; community और spaces बनाएं।'],
  [FilmIcon, 'Reels with reaction videos', 'Reaction video वाली reels', 'Create vertical reels, record a live reaction video over a reel, manage autoplay and data use, discover creators and customize the type of reels you want to see.', 'Vertical reels बनाएं, reel पर live reaction video record करें, autoplay और data control करें तथा अपनी पसंद का feed बनाएं।'],
  [VideoCameraIcon, 'HD calls & advanced voice connection', 'HD calls और advanced voice connection', 'Make secure HD voice and video calls, group calls and real-time rooms. WebRTC media transport, connection recovery and call controls are designed for clear communication across devices.', 'Secure HD voice/video और group calls करें। WebRTC transport, connection recovery और call controls clear communication के लिए बनाए गए हैं।'],
  [MicrophoneIcon, 'PodLive & creator video', 'PodLive और creator video', 'Watch educational videos, creator content and legally available entertainment. Start live podcast rooms, invite audience members to talk, build a channel, upload videos and engage through live chat.', 'Educational और creator videos देखें, live podcast room शुरू करें, audience को talk mode में लाएं, channel बनाएं और videos upload करें।'],
  [SparklesIcon, 'Emotion-aware AI companion', 'भावना समझने वाला AI companion', 'Talk to a human-like AI assistant that can respond to the emotional context of your conversation, help you study, brainstorm, write and plan. AI responses can be imperfect and important advice should be independently verified.', 'भावनात्मक संदर्भ के अनुसार जवाब देने वाले AI से बात करें, study, brainstorming, writing और planning में मदद लें। महत्वपूर्ण सलाह को independently verify करें।'],
  [BriefcaseIcon, 'Business tools that stay personal', 'Personal business tools', 'Create a business profile, product catalogue and storefront. Add pricing and stock, welcome and away messages, keyword auto-replies, customer chats and useful activity insights — ideal for student founders and local businesses.', 'Business profile, product catalogue और storefront बनाएं। Pricing, stock, welcome/away message, auto-replies, customer chat और activity insights जोड़ें।'],
];

const projects = [
  ['IndiaSearch', 'AI voice search engine for India with multilingual discovery.', 'AI voice search engine', 'https://indiasearch.site/', '/marketing/indiasearch.png'],
  ['India PodLive', 'An Indian video-sharing and creator platform for learning and entertainment.', 'Indian video platform', 'https://indiapodlive.vercel.app', '/marketing/podlive.png'],
  ['Anuvandini', 'A real-time language translation product for communication across languages.', 'Live language translator', 'https://downloader.indiasearch.site/', '/marketing/translator.png'],
  ['Amitesh Portfolio', 'The founder’s portfolio, work and product-building journey.', 'Founder portfolio', 'https://amiteshyadav3333.github.io/', '/marketing/founder.jpg'],
];

const plans = [
  ['Free', '₹0', 'Forever', ['Private messaging', 'Social & reels access', 'Standard calls', 'Core translation'], false],
  ['Basic', '₹199', '/ month', ['More AI tools', 'Enhanced creator controls', 'Longer HD calls', 'Priority experience'], false],
  ['Unlimited', '₹499', '/ month', ['Unlimited eligible features', 'Advanced AI suite', 'Premium creator & business tools', 'Highest available limits'], true],
];

const faqs = [
  ['Is CHEETCHAT end-to-end encrypted?', 'Private message content is designed to use hybrid end-to-end encryption with AES-GCM content encryption and participant public keys. Users can compare safety numbers to verify a conversation. Public posts and reels are not private messages and must remain server-readable for delivery and moderation.'],
  ['Where is my data stored?', 'CHEETCHAT is designed as an Indian platform with India-focused data hosting. The exact storage region and subprocessors should always be confirmed in the current Privacy Policy before publishing a legal guarantee.'],
  ['Does CHEETCHAT delete my data?', 'Eligible temporary and private communication data can be removed under configured retention and deletion rules. Public social and reels content may remain until the owner deletes it or policy requires removal. Backups and security logs may follow separate limited retention periods.'],
  ['Which languages are supported?', 'The interface includes English and Hindi and can select a default from the device language. In-chat translation is designed for communication across many Indian and international languages; availability and quality can vary by language.'],
  ['What is Snap Mode?', 'Snap Mode is a more private temporary session where supported messages and media disappear after the configured session or timer. No app can stop someone using a second device to record a screen, so sensitive sharing still requires care.'],
  ['Can I build a community or post tweets?', 'Yes. Social supports short text posts, photos, video, articles, replies, reactions, reposts, follows, communities, spaces and feed customization.'],
  ['What can businesses do?', 'Businesses can create a profile, catalogue and storefront, add inventory details, use welcome or away messages and keyword auto-replies, chat with customers and review activity insights.'],
  ['Is the ₹499 plan truly unlimited?', 'It provides unlimited use of eligible features subject to fair-use, safety, technical and legal limits. The checkout and plan terms should show any media, AI or call limits that apply at launch.'],
  ['Is AI always accurate?', 'No. AI Grammar, summaries, Smart Replies and the emotional AI companion can make mistakes. Users should verify important academic, medical, legal and financial information independently.'],
  ['Who created CHEETCHAT?', 'CHEETCHAT was founded by Amitesh Kumar Yadav and designed especially for Indian college students, creators, communities and small businesses.'],
];

const appScreens = [
  ['/marketing/social.jpg', 'CHEETCHAT social feed'], ['/marketing/social-profile.jpg', 'Creator profile and posts'],
  ['/marketing/chat.jpg', 'Private multilingual chat'], ['/marketing/smart.jpg', 'AI Grammar and smart replies'],
  ['/marketing/chat-actions.jpg', 'Draw, translate and message actions'], ['/marketing/chat-list.jpg', 'Chats, stories, groups and calls'],
  ['/marketing/social-compose.jpg', 'Social posts and communities'], ['/marketing/social-video.jpg', 'Social video publishing'],
  ['/marketing/chat-attachments.jpg', 'Rich chat attachments'], ['/marketing/desktop-chat.jpg', 'CHEETCHAT desktop experience'],
];

const productOverview = [
  ['/marketing/chat-list.jpg', 'Connect', 'Chats, groups, stories and calls in one familiar inbox.'],
  ['/marketing/chat-actions.jpg', 'Express', 'Translate, draw, react and use smart actions inside every conversation.'],
  ['/marketing/social-profile.jpg', 'Create', 'Build a creator identity with posts, videos and community activity.'],
  ['/marketing/social-video.jpg', 'Watch', 'Discover vertical video and publish rich social content.'],
  ['/marketing/podlive.png', 'Go live', 'Host podcasts, invite speakers and grow an audience with PodLive.'],
  ['/marketing/indiasearch-ui.png', 'Discover', 'Search the web and explore India-first multilingual products.'],
  ['/marketing/indiasearch-ai.png', 'Ask AI', 'Get concise AI answers and continue the conversation naturally.'],
  ['/marketing/cheetchat-splash.jpg', 'One ecosystem', 'A consistent India-first identity across mobile and desktop.'],
];

const Phone = ({ src, alt, className = '' }) => <div className={`phone-3d ${className}`}><div className="phone-speaker"/><img src={src} alt={alt}/></div>;

export default function MarketingLanding() {
  const [lang, setLang] = useState('en');
  useEffect(() => {
    const saved = localStorage.getItem('cheetchat-marketing-language');
    setLang(saved || (navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en'));
    const syncLanguage = event => setLang(event.detail === 'hi' ? 'hi' : 'en');
    window.addEventListener('cheetchat-language-change', syncLanguage);
    return () => window.removeEventListener('cheetchat-language-change', syncLanguage);
  }, []);
  const t = copy[lang];

  return <div className="marketing-site" lang={lang === 'hi' ? 'hi' : 'en'}>
    <section className="marketing-hero" id="top">
      <div className="hero-copy"><span className="hero-badge">🇮🇳 {t.badge}</span><h1>{t.title}</h1><p>{t.intro}</p><div className="hero-actions"><a href="#features" className="primary-cta">{t.explore}</a><a href="https://docs.google.com/uc?export=download&id=1Ljn280n5VmWfD1kEl7u_AAyZ-2S6L1s9" className="secondary-cta">{t.android}</a></div><div className="trust-row"><span><LockClosedIcon/>{t.trusted}</span><span>🇮🇳 {t.india}</span><span><LanguageIcon/>{t.languages}</span></div></div>
      <div className="hero-visual" aria-label="CHEETCHAT app screens"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><Phone src="/marketing/chat.jpg" alt="CHEETCHAT multilingual private chat" className="phone-left"/><Phone src="/marketing/social.jpg" alt="CHEETCHAT social feed" className="phone-center"/><Phone src="/marketing/smart.jpg" alt="CHEETCHAT AI smart chat tools" className="phone-right"/><div className="floating-chip chip-one">AI Grammar <SparklesIcon/></div><div className="floating-chip chip-two">HD Call <VideoCameraIcon/></div></div>
    </section>

    <section className="founder-section founder-top section-shell" id="founder"><div className="founder-photo"><img src="/marketing/founder.jpg" alt="CHEETCHAT founder Amitesh Kumar Yadav"/><span>Founder</span></div><div><span className="eyebrow">FOUNDER OF CHEETCHAT</span><h2>{t.founderTitle}</h2><p>{t.founderBody}</p><div className="founder-facts"><article><strong>India-first products</strong><span>CHEETCHAT, IndiaSearch, India PodLive and Anuvandini</span></article><article><strong>Android + AI</strong><span>Completed Android App Development with AI with Grade A</span></article><article><strong>Cloud & AI foundations</strong><span>Oracle Cloud Infrastructure Foundations and AI Foundations certified</span></article><article><strong>Student-focused mission</strong><span>Communication, learning, creation and business tools in one ecosystem</span></article></div><div className="founder-quote">“Technology becomes meaningful when it helps people speak in their own language, create with confidence and stay in control of their identity.”</div></div></section>

    <section className="screen-gallery-section"><div className="section-shell gallery-heading"><span className="eyebrow">INSIDE THE APP</span><h2>A cinematic look at the complete CHEETCHAT experience.</h2><p>Explore social, private chat, AI tools, creator profiles, rich attachments and desktop communication through real product screens.</p></div><div className="screen-gallery-track">{appScreens.map(([src, alt], index) => <figure className={`gallery-phone gallery-phone-${index % 4}`} key={src}><img src={src} alt={alt}/><figcaption>{alt}</figcaption></figure>)}</div></section>

    <section className="overview-section section-shell" id="overview"><div className="section-heading"><span>COMPLETE PRODUCT TOUR</span><h2>See how the whole CHEETCHAT ecosystem fits together.</h2><p>Real screens from messaging, social, creator video, PodLive and IndiaSearch give new users a clear overview before they create an account.</p></div><div className="overview-grid">{productOverview.map(([src, title, body], index) => <article className={`overview-card overview-card-${index + 1}`} key={src}><img src={src} alt={`${title} — CHEETCHAT product screen`}/><div><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></div></article>)}</div></section>

    <section className="feature-section section-shell" id="features"><div className="section-heading"><span>SUPER APP</span><h2>{t.featureTitle}</h2><p>{t.featureIntro}</p></div><div className="feature-grid">{features.map(([Icon, enTitle, hiTitle, enBody, hiBody], index) => <article className="feature-card" key={enTitle}><div className="feature-number">0{index + 1}</div><Icon/><h3>{lang === 'hi' ? hiTitle : enTitle}</h3><p>{lang === 'hi' ? hiBody : enBody}</p></article>)}</div></section>

    <section className="security-section section-shell" id="security"><div className="security-copy"><span className="eyebrow">SECURITY ARCHITECTURE</span><h2>{t.securityTitle}</h2><p>{t.securityBody}</p><div className="security-points"><span><CheckCircleIcon/>AES-GCM message content</span><span><CheckCircleIcon/>Public-key wrapping</span><span><CheckCircleIcon/>Verifiable safety numbers</span><span><CheckCircleIcon/>Secure WebRTC calls</span></div><div className="retention-card"><h3>{t.retentionTitle}</h3><p>{t.retentionBody}</p></div></div><div className="security-art"><div className="security-ring ring-a"/><div className="security-ring ring-b"/><div className="lock-core"><LockClosedIcon/><strong>E2EE</strong><span>Verify every private chat</span></div></div></section>

    <section className="projects-section section-shell" id="projects"><div className="section-heading"><span>INDIA-FIRST ECOSYSTEM</span><h2>{t.projectsTitle}</h2></div><div className="project-grid">{projects.map(([name, desc, tag, href, image]) => <a className="project-card" href={href} target="_blank" rel="noreferrer" key={name}><img src={image} alt=""/><div><span>{tag}</span><h3>{name}</h3><p>{desc}</p><strong>Visit project <ArrowTopRightOnSquareIcon/></strong></div></a>)}</div></section>

    <section className="pricing-section section-shell" id="pricing"><div className="section-heading"><span>TRANSPARENT PRICING</span><h2>{t.pricingTitle}</h2><p>{t.pricingIntro}</p></div><div className="pricing-grid">{plans.map(([name, price, cadence, items, popular]) => <article className={`price-card ${popular ? 'popular' : ''}`} key={name}>{popular && <span className="popular-label">BEST VALUE</span>}<h3>{name}</h3><div className="price"><strong>{price}</strong><span>{cadence}</span></div><ul>{items.map(item => <li key={item}><CheckCircleIcon/>{item}</li>)}</ul><a href="#auth-top">Choose {name}</a></article>)}</div><p className="pricing-note">Plan inclusions are product positioning for launch and should be reflected in checkout terms. Fair-use, safety and platform limits may apply.</p></section>

    <section className="legal-section section-shell" id="legal"><div className="section-heading"><span>TRUST & LEGAL</span><h2>{t.legalTitle}</h2><p>{t.legalIntro}</p></div><div className="legal-grid">
      <article className="legal-card terms-card"><div className="legal-icon"><CheckCircleIcon/></div><span>Effective August 2, 2026</span><h3>{t.termsCard}</h3><p>{lang === 'hi' ? 'CHEETCHAT का उपयोग कानूनी और जिम्मेदार तरीके से करें। Account security आपकी जिम्मेदारी है। आप अपने content के owner रहते हैं और CHEETCHAT को केवल service चलाने के लिए उसे host, process और deliver करने की अनुमति देते हैं। Spam, harassment, fraud, illegal content और service को नुकसान पहुँचाने की कोशिश मना है।' : 'Use CHEETCHAT lawfully and responsibly. You remain responsible for account security and retain ownership of your content. You permit CHEETCHAT to host, process and deliver that content only as required to operate the service. Spam, harassment, fraud, illegal content and attempts to compromise the platform are prohibited.'}</p><ul><li><CheckCircleIcon/>You keep ownership of your content</li><li><CheckCircleIcon/>Clear community and safety rules</li><li><CheckCircleIcon/>Transparent service and fair-use limits</li><li><CheckCircleIcon/>Permanent account deletion control</li></ul><a href="/terms">{t.fullPolicy} <ArrowTopRightOnSquareIcon/></a></article>
      <article className="legal-card privacy-card"><div className="legal-icon"><LockClosedIcon/></div><span>Effective August 2, 2026</span><h3>{t.privacyCard}</h3><p>{lang === 'hi' ? 'Policy account, message metadata, calls, media, social activity और device permissions के use को साफ करती है। Private communication और public social content अलग तरीके से process होते हैं। CHEETCHAT personal information बेचने का दावा नहीं करता और profile, permission, blocking, reporting, content deletion तथा account deletion controls देता है।' : 'The policy explains account data, message metadata, calls, media, social activity and device permissions. Private communication and public social content are processed differently. CHEETCHAT states that it does not sell personal information and provides controls for profiles, permissions, blocking, reporting, content deletion and account deletion.'}</p><ul><li><LockClosedIcon/>No sale of personal information</li><li><LockClosedIcon/>Private-message encryption controls</li><li><LockClosedIcon/>Permission and visibility choices</li><li><LockClosedIcon/>Access, correction and deletion controls</li></ul><a href="/privacy">{t.fullPolicy} <ArrowTopRightOnSquareIcon/></a></article>
    </div><div className="legal-promise"><strong>Our plain-language promise</strong><span>Public posts, reels and channels are visible to their selected audience and require server processing for delivery and moderation. Private chats use encryption features and should never be described as public content. No online service is perfectly secure; users should protect passwords, OTPs and recovery codes.</span></div></section>

    <section className="faq-section section-shell" id="faq"><div className="section-heading"><span>FAQ</span><h2>{t.faqTitle}</h2></div><div className="faq-list">{faqs.map(([q, a]) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>

    <section className="final-cta section-shell"><img src="/cheetchat-logo.png" alt=""/><h2>{t.finalTitle}</h2><p>{t.finalBody}</p><a href="#auth-top">Create your CHEETCHAT account</a></section>
    <footer className="marketing-footer"><div className="marketing-brand"><img src="/cheetchat-logo.png" alt=""/><span>CHEETCHAT</span></div><p>Founded by Amitesh Kumar Yadav · Designed and developed in India 🇮🇳</p><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/about">About</a></div></footer>
  </div>;
}
