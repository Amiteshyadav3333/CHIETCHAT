import React, { useEffect, useState } from 'react';
import {
  ArrowTopRightOnSquareIcon, BriefcaseIcon, ChatBubbleLeftRightIcon,
  CheckCircleIcon, FilmIcon, LanguageIcon, LockClosedIcon,
  SparklesIcon, UserGroupIcon, VideoCameraIcon
} from '@heroicons/react/24/outline';

const copy = {
  en: {
    nav: ['Features', 'Security', 'Projects', 'Pricing', 'Legal', 'FAQ'],
    badge: 'A little more room for college life',
    title: 'College life has a group chat for everything.',
    intro: 'Classes, new friends, late-night ideas, creator plans and the shop around the corner. Ducor gives your college crew one place to keep it all moving.',
    explore: 'Explore every feature', android: 'Get Android beta', shop: 'Shop without signing in',
    trusted: 'Private by design', india: 'India-first infrastructure', languages: 'Indian languages supported',
    featureTitle: 'The things you do together, in one place.',
    featureIntro: 'Catch up, share something funny, learn a new word, find a local shop or go live. Here are a few ways people can make Ducor their own.',
    securityTitle: 'Privacy you can verify — not just a promise.',
    securityBody: 'Ducor private messages use hybrid end-to-end encryption. A fresh AES-GCM key protects message content and is securely wrapped for each participant using their public key. Safety numbers help people compare keys. Encrypted media is protected before upload, while calls use secure WebRTC transport.',
    retentionTitle: 'India-hosted, privacy-minded data handling',
    retentionBody: 'The product is designed to minimise retained private communication data and to delete eligible temporary data according to configured retention rules. Public social and reels content may remain available so it can be delivered to audiences, with access controls, moderation and storage safeguards. Exact retention depends on content type, account settings and the published privacy policy.',
    founderTitle: 'Built by a student, for students.',
    founderBody: 'Ducor was founded by Amitesh Kumar Yadav as a social platform for people across India to discover information, publish stories and build communities. The product prioritises language diversity and user choice.',
    projectsTitle: 'More products by Amitesh Kumar Yadav',
    pricingTitle: 'Simple plans for every stage',
    pricingIntro: 'Start free, then choose the monthly or yearly plan that fits your campus life.',
    faqTitle: 'Questions, answered clearly',
    legalTitle: 'Clear rules. Honest privacy. Control stays with you.',
    legalIntro: 'Before creating an account, every user can understand what Ducor collects, why it is needed, how public and private content differ, and how to delete content or the entire account.',
    termsCard: 'Terms & Conditions', privacyCard: 'Privacy Policy', fullPolicy: 'Read the complete policy',
    finalTitle: 'Bring your people along.',
    finalBody: 'Make a group for class, start a creator idea, or just see what your friends are up to. There is room for all of it here.',
  },
  hi: {
    nav: ['फीचर्स', 'सुरक्षा', 'प्रोजेक्ट्स', 'प्राइसिंग', 'कानूनी', 'सवाल'],
    badge: 'भारत के लिए सोशल प्लेटफॉर्म',
    title: 'खोजें। साझा करें। जुड़ें।',
    intro: 'Ducor भारत भर के लोगों को खबरें और संसाधन खोजने, कहानियाँ प्रकाशित करने, वीडियो साझा करने और समुदायों से जुड़ने में मदद करता है।',
    explore: 'सभी फीचर्स देखें', android: 'Android बीटा पाएं', shop: 'बिना लॉगिन खरीदारी करें',
    trusted: 'डिज़ाइन से प्राइवेट', india: 'भारत-केंद्रित इंफ्रास्ट्रक्चर', languages: 'भारतीय भाषाओं का समर्थन',
    featureTitle: 'खबरें, कहानियाँ और समुदाय।',
    featureIntro: 'स्रोत और क्रिएटर फॉलो करें, उपयोगी संसाधन खोजें और अपने समुदायों के साथ विचार साझा करें।',
    securityTitle: 'ऐसी प्राइवेसी जिसे आप सत्यापित कर सकते हैं।',
    securityBody: 'Ducor के निजी संदेश हाइब्रिड एंड-टू-एंड एन्क्रिप्शन का उपयोग करते हैं। नया AES-GCM key संदेश की सामग्री सुरक्षित करता है और हर सहभागी की public key से सुरक्षित रूप से wrap होता है। Safety number से keys verify की जा सकती हैं। मीडिया upload से पहले encrypt होता है और calls secure WebRTC transport इस्तेमाल करती हैं।',
    retentionTitle: 'भारत में होस्ट, प्राइवेसी-केंद्रित डेटा हैंडलिंग',
    retentionBody: 'उत्पाद निजी communication data को कम रखने और configured retention rules के अनुसार eligible temporary data मिटाने के लिए बनाया गया है। Social और reels का public content audience तक पहुँचाने के लिए access controls, moderation और storage safeguards के साथ रह सकता है। सही retention content type, settings और privacy policy पर निर्भर है।',
    founderTitle: 'एक छात्र द्वारा, छात्रों के लिए बनाया गया।',
    founderBody: 'Ducor की स्थापना Amitesh Kumar Yadav ने भारतीय कॉलेज छात्रों को बातचीत, पढ़ाई, creation, communities और small business growth के लिए एक जगह देने के उद्देश्य से की। लक्ष्य language diversity और user choice का सम्मान करने वाला India-first ecosystem है।',
    projectsTitle: 'Amitesh Kumar Yadav के अन्य प्रोडक्ट्स',
    pricingTitle: 'हर चरण के लिए सरल प्लान',
    pricingIntro: 'Free से शुरू करें और अधिक AI, creation और communication के लिए upgrade करें।',
    faqTitle: 'आपके सवाल, साफ जवाब',
    legalTitle: 'साफ नियम। ईमानदार प्राइवेसी। नियंत्रण आपके पास।',
    legalIntro: 'Account बनाने से पहले हर user समझ सकता है कि Ducor कौन-सा data लेता है, क्यों जरूरी है, public और private content में क्या अंतर है और content या account कैसे delete करना है।',
    termsCard: 'नियम और शर्तें', privacyCard: 'प्राइवेसी पॉलिसी', fullPolicy: 'पूरी पॉलिसी पढ़ें',
    finalTitle: 'आपके लोग, विचार और लक्ष्य — एक जगह।',
    finalBody: 'भारतीय छात्रों, creators, communities और बढ़ते businesses के लिए बने platform से जुड़ें।',
  }
};

const features = [
  [ChatBubbleLeftRightIcon, 'Smart multilingual chat', 'स्मार्ट बहुभाषी चैट', 'Translate individual messages, communicate across languages, use AI Grammar, Smart Replies and AI chat summaries. Pin, mute, archive, schedule, react, forward, search and verify encryption — plus universal messages, custom nicknames and reply reminders.', 'संदेश translate करें, AI Grammar, Smart Replies और chat summaries इस्तेमाल करें। Pin, mute, archive, schedule, react, forward, search और encryption verify करें।'],
  [SparklesIcon, 'Draw, Snap & expressive profiles', 'Draw, Snap और expressive profiles', 'Draw directly on a chat or message, send disappearing content with Snap Mode, create special DPs for selected contacts, publish special stories, use avatars, themes, wallpapers, fonts, birthday experiences and real-time photo reactions.', 'Chat या message पर draw करें, Snap Mode से disappearing content भेजें, selected contacts के लिए special DP, stories, avatar, theme, wallpaper और birthday experiences बनाएं।'],
  [UserGroupIcon, 'Social, the way your friends use it', 'Social, tweets और communities', 'Share quick posts, photo and video galleries, links, polls or longer articles. Follow people and creators, reply in conversations, react, repost with a note, bookmark and send a post to a friend. Explore communities and spaces, and shape your feed around the people and topics you care about.', 'Tweet-style posts, photos, videos और articles publish करें। Creators को follow करें, reply, repost, bookmark और share करें; community और spaces बनाएं।'],
  [FilmIcon, 'Reels for watching and making', 'Reaction video वाली reels', 'Scroll a short-video feed, follow creators and tune your For You or Following feed by interests. Like, comment, share to chat, repost or save a Reel. Make your own with camera or an upload, captions, filters, music search and preview, or clips from the meme library. Add a reaction video, choose a category and playback or data-saver settings; eligible creators can enable earnings and view analytics.', 'Vertical reels बनाएं, reel पर live reaction video record करें, autoplay और data control करें तथा अपनी पसंद का feed बनाएं।'],
  [VideoCameraIcon, 'HD calls & advanced voice connection', 'HD calls और advanced voice connection', 'Make secure HD voice and video calls, group calls and real-time rooms. WebRTC media transport, connection recovery and call controls are designed for clear communication across devices.', 'Secure HD voice/video और group calls करें। WebRTC transport, connection recovery और call controls clear communication के लिए बनाए गए हैं।'],
  [SparklesIcon, 'AI for the little things and the big ideas', 'भावना समझने वाला AI companion', 'Ask the AI companion to explain a topic, practise an idea, help with writing or coding, brainstorm, plan, or create an image. Chat by text or have a voice conversation, choose from supported response languages, use speech input, live captions and spoken replies. Smart Replies, grammar help and summaries make everyday chats easier. AI can get things wrong, so check important answers.', 'भावनात्मक संदर्भ के अनुसार जवाब देने वाले AI से बात करें, study, brainstorming, writing और planning में मदद लें। महत्वपूर्ण सलाह को independently verify करें।'],
  [BriefcaseIcon, 'Business tools that stay personal', 'Personal business tools', 'Create a business profile, product catalogue and storefront. Add pricing and stock, welcome and away messages, keyword auto-replies, customer chats and useful activity insights — ideal for student founders and local businesses.', 'Business profile, product catalogue और storefront बनाएं। Pricing, stock, welcome/away message, auto-replies, customer chat और activity insights जोड़ें।'],
  [BriefcaseIcon, 'Shop your local market & pay with UPI', 'Local shopping और UPI payment', 'Discover participating neighborhood shops and shop directly from Ducor. Send UPI payments to friends, family and shops, with a simple flow for everyday college life.', 'Discover participating neighborhood shops and shop directly from Ducor. Send UPI payments to friends, family and shops.'],
  [UserGroupIcon, 'Play together, vote together', 'साथ खेलें, साथ वोट करें', 'Challenge friends to Ludo, vocabulary games, tic-tac-toe, chess and Snake. Run a group poll, rally your community and let everyone vote for the leader they support.', 'Challenge friends to Ludo, vocabulary games, tic-tac-toe, chess and Snake. Run a group poll and let everyone vote for their community leader.'],
  [ChatBubbleLeftRightIcon, 'Little moments that feel personal', 'Personal moments और live chat', 'Share live location for a time limit, send a gift, make someone’s birthday special, or keep a live Noteit space with your favorite person. Give every contact a special DP, set a custom ringtone by profile or message, choose a universal default for all chats, or let Ring Mode play your own voice or a built-in sound.', 'Share live location for a time limit, send gifts and birthday wishes, use live Noteit with your favorite person, set a special DP, and personalize Ring Mode and ringtones for each contact or message.'],
  [SparklesIcon, 'AI Smart Space, camera & documents', 'AI Smart Space, camera और documents', 'Bring your messages together in AI Smart Space to organize and manage conversations. Capture from the in-built camera, read documents in chat, and draw directly on a conversation. Snap Mode gives you an incognito-style space for supported temporary chats.', 'Organize conversations in AI Smart Space, capture with the in-built camera, read documents in chat, draw on messages and use Snap Mode for supported temporary chats.'],
  [VideoCameraIcon, 'Study rooms, watch parties & calls', 'Study rooms, watch parties और calls', 'Start audio or video calls with built-in echo and background-noise cancellation. Study together in a live class room, use quiet whisper chat, or stream a movie privately with friends and talk along. Save call recordings directly on your device when recording is supported and everyone has agreed.', 'Start calls with noise cancellation, study in live class rooms with quiet whisper chat, or watch movies privately with friends. Save supported call recordings on-device with everyone’s agreement.'],
  [FilmIcon, 'Create, react, podcast & earn', 'Create, react, podcast और earn', 'Make direct reaction videos on Reels, publish videos for everyone, host a podcast, or share a private video with a price you set so fans can buy your content on Ducor.', 'Make reaction videos on Reels, publish public videos, host podcasts, and set a price for private videos fans can buy on Ducor.'],
  [VideoCameraIcon, 'PodLive: take the mic, bring your people', 'PodLive: live जाएं और लोगों को जोड़ें', 'Go live with a public podcast, invite guests onto the stage and talk with viewers in a live chat beside or over the video. Browse live shows by category, see who is watching, and find creators by searching. Upload videos with a title, description and thumbnail; viewers can watch, comment, like, follow and share. Creator Studio keeps an eye on followers, views, live sessions, videos, likes and eligible earnings.', 'Go live with a public podcast, invite guests, chat with viewers, browse categories, upload videos and follow views and audience activity in Creator Studio.'],
  [SparklesIcon, 'AI Smart Space keeps the day together', 'AI Smart Space में दिन व्यवस्थित रखें', 'Get a daily brief with chats that may need a reply, follow-ups and birthdays. Keep personal tasks, saved notes and reminders in one place, then jump straight into a chat that needs your attention. Refresh the brief when plans change.', 'AI Smart Space में daily chat brief, pending replies, tasks, notes और reminders रखें।'],
  [BriefcaseIcon, 'A local shop, right inside the conversation', 'आपकी पसंद की local shops', 'Find shops by name, category or location. Browse seller profiles, opening details, product photos, prices and stock; choose delivery or pickup, add an address, ask a question, or call the shop by voice or video. Sellers can list a shop, manage a catalogue and share trackable product links. Follow your order in the order list. Where secure checkout is enabled, pay through Razorpay with UPI options; where it is not, send an order request and arrange payment with the seller.', 'Find local shops, browse products and stock, choose delivery or pickup, chat or call sellers, share product links and place orders. Secure checkout appears where enabled.'],
  [ChatBubbleLeftRightIcon, 'The chat tools you reach for every day', 'Chat में काम आने वाले tools', 'Keep conversations tidy with search, pin, mute, archive, scheduled messages, reminders and custom nicknames. Translate a message, get a quick reply suggestion or summary, react, forward, and share photos, videos and documents. Private messages use end-to-end encryption; public posts stay public to their audience.', 'Translate messages, use AI replies and summaries, pin, mute, archive, schedule, search, react, forward and share files.'],
  [LanguageIcon, 'A friendly place to practise English', 'English practice के लिए friendly जगह', 'Learning English feels easier when you can use it every day. Girls and boys can join conversations, share posts, ask questions and practise with friends at their own pace. Use translation and AI language help when you get stuck, then try the sentence again with confidence.', 'A friendly space for girls and boys to practise English together through chats, posts, translation and AI language help.'],
  [BriefcaseIcon, 'For people who like building things', 'Developers और builders के लिए', 'Developers and student makers can share a project, post progress, find people with similar interests and keep a community around what they are building. Start small, show your work and find your next collaborator through conversation.', 'Developers and student makers can share projects, post progress, meet collaborators and build a community around their work.'],
];

const projects = [
  ['IndiaSearch', 'AI voice search engine for India with multilingual discovery.', 'AI voice search engine', 'https://indiasearch.site/', '/marketing/indiasearch.png'],
  ['Anuvandini', 'A real-time language translation product for communication across languages.', 'Live language translator', 'https://downloader.indiasearch.site/', '/marketing/translator.png'],
  ['Amitesh Portfolio', 'The founder’s portfolio, work and product-building journey.', 'Founder portfolio', 'https://amiteshyadav3333.github.io/', '/marketing/founder.jpg'],
];

const founderSocials = [
  ['GitHub', 'https://github.com/Amiteshyadav3333'],
  ['X', 'https://x.com/Amiteshyad7898'],
  ['Facebook', 'https://www.facebook.com/profile.php?id=100028854681021'],
  ['LinkedIn', 'https://www.linkedin.com/in/amitesh-kumar-yadav-b55b10293/'],
  ['Instagram', 'https://www.instagram.com/iamamiteshky/'],
];

const plans = [
  ['Free', '₹0', 'Forever', ['Private messaging', 'Social & reels access', 'Standard calls', 'Core translation'], false],
  ['Basic Monthly', '₹199', 'Once a month', ['Basic tier', 'One month of Premium access', 'Razorpay checkout', 'Server verified payment'], false],
  ['Medium Monthly', '₹499', 'Once a month', ['Medium tier', 'One month of Premium access', 'Razorpay checkout', 'Server verified payment'], false],
  ['Max Monthly', '₹999', 'Once a month', ['Max tier', 'One month of Premium access', 'Razorpay checkout', 'Server verified payment'], false],
  ['Basic Yearly', '₹2,388', 'Once a year', ['Basic tier', '12 months of Premium access', 'Razorpay checkout', 'Server verified payment'], false],
  ['Medium Yearly', '₹5,988', 'Once a year', ['Medium tier', '12 months of Premium access', 'Razorpay checkout', 'Server verified payment'], false],
  ['Max Yearly', '₹11,988', 'Once a year', ['Max tier', '12 months of Premium access', 'Razorpay checkout', 'Server verified payment'], false],
];

const faqs = [
  ['Is Ducor end-to-end encrypted?', 'Private message content is designed to use hybrid end-to-end encryption with AES-GCM content encryption and participant public keys. Users can compare safety numbers to verify a conversation. Public posts and reels are not private messages and must remain server-readable for delivery and moderation.'],
  ['Where is my data stored?', 'Ducor is designed as an Indian platform with India-focused data hosting. The exact storage region and subprocessors should always be confirmed in the current Privacy Policy before publishing a legal guarantee.'],
  ['Does Ducor delete my data?', 'Eligible temporary and private communication data can be removed under configured retention and deletion rules. Public social and reels content may remain until the owner deletes it or policy requires removal. Backups and security logs may follow separate limited retention periods.'],
  ['Which languages are supported?', 'The interface includes English and Hindi and can select a default from the device language. In-chat translation is designed for communication across many Indian and international languages; availability and quality can vary by language.'],
  ['What is Snap Mode?', 'Snap Mode is a more private temporary session where supported messages and media disappear after the configured session or timer. No app can stop someone using a second device to record a screen, so sensitive sharing still requires care.'],
  ['Can I build a community or post tweets?', 'Yes. Social supports short text posts, photos, video, articles, replies, reactions, reposts, follows, communities, spaces and feed customization.'],
  ['What can businesses do?', 'Businesses can create a profile, catalogue and storefront, add inventory details, use welcome or away messages and keyword auto-replies, chat with customers and review activity insights.'],
  ['How are Premium payments verified?', 'Razorpay confirms payments with the backend before Premium access is granted. Monthly and yearly AutoPay availability depends on the corresponding Razorpay plan being configured.'],
  ['Is AI always accurate?', 'No. AI Grammar, summaries, Smart Replies and the emotional AI companion can make mistakes. Users should verify important academic, medical, legal and financial information independently.'],
  ['Who created Ducor?', 'Ducor was founded by Amitesh Kumar Yadav and designed especially for Indian college students, creators, communities and small businesses.'],
];

const appScreens = [
  ['/marketing/social.jpg', 'Ducor social feed'], ['/marketing/social-profile.jpg', 'Creator profile and posts'],
  ['/marketing/chat.jpg', 'Private multilingual chat'], ['/marketing/smart.jpg', 'AI Grammar and smart replies'],
  ['/marketing/chat-actions.jpg', 'Draw, translate and message actions'], ['/marketing/chat-list.jpg', 'Chats, stories, groups and calls'],
  ['/marketing/social-compose.jpg', 'Social posts and communities'], ['/marketing/social-video.jpg', 'Social video publishing'],
  ['/marketing/chat-attachments.jpg', 'Rich chat attachments'], ['/marketing/desktop-chat.jpg', 'Ducor desktop experience'],
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
      <div className="hero-copy"><span className="hero-badge">🇮🇳 {t.badge}</span><h1>{t.title}</h1><p>{t.intro}</p><div className="hero-actions"><a href="#features" className="primary-cta">{t.explore}</a><a href="/shopping" className="secondary-cta">{t.shop}</a><a href="https://docs.google.com/uc?export=download&id=1Ljn280n5VmWfD1kEl7u_AAyZ-2S6L1s9" className="secondary-cta">{t.android}</a></div><div className="trust-row"><span><LockClosedIcon/>{t.trusted}</span><span>🇮🇳 {t.india}</span><span><LanguageIcon/>{t.languages}</span></div></div>
      <div className="hero-visual" aria-label="Ducor app screens"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><Phone src="/marketing/chat.jpg" alt="Ducor multilingual private chat" className="phone-left"/><Phone src="/marketing/social.jpg" alt="Ducor social feed" className="phone-center"/><Phone src="/marketing/smart.jpg" alt="Ducor AI smart chat tools" className="phone-right"/><div className="floating-chip chip-one">AI Grammar <SparklesIcon/></div><div className="floating-chip chip-two">HD Call <VideoCameraIcon/></div></div>
    </section>


    <section className="screen-gallery-section"><div className="section-shell gallery-heading"><span className="eyebrow">INSIDE THE APP</span><h2>A cinematic look at the complete Ducor experience.</h2><p>Explore social, private chat, AI tools, creator profiles, rich attachments and desktop communication through real product screens.</p></div><div className="screen-gallery-track">{appScreens.map(([src, alt], index) => <figure className={`gallery-phone gallery-phone-${index % 4}`} key={src}><img src={src} alt={alt}/><figcaption>{alt}</figcaption></figure>)}</div></section>


    <section className="feature-section section-shell" id="features"><div className="section-heading"><span>DUCOR SOCIAL</span><h2>{t.featureTitle}</h2><p>{t.featureIntro}</p></div><div className="feature-grid">{features.map(([Icon, enTitle, hiTitle, enBody, hiBody], index) => <article className="feature-card" key={enTitle}><div className="feature-number">0{index + 1}</div><Icon/><h3>{lang === 'hi' ? hiTitle : enTitle}</h3><p>{lang === 'hi' ? hiBody : enBody}</p></article>)}</div></section>

    <section className="security-section section-shell" id="security"><div className="security-copy"><span className="eyebrow">SECURITY ARCHITECTURE</span><h2>{t.securityTitle}</h2><p>{t.securityBody}</p><div className="security-points"><span><CheckCircleIcon/>AES-GCM message content</span><span><CheckCircleIcon/>Public-key wrapping</span><span><CheckCircleIcon/>Verifiable safety numbers</span><span><CheckCircleIcon/>Secure WebRTC calls</span></div><div className="retention-card"><h3>{t.retentionTitle}</h3><p>{t.retentionBody}</p></div></div><div className="security-art"><div className="security-ring ring-a"/><div className="security-ring ring-b"/><div className="lock-core"><LockClosedIcon/><strong>E2EE</strong><span>Verify every private chat</span></div></div></section>

    <section className="projects-section section-shell" id="projects"><div className="section-heading"><span>INDIA-FIRST ECOSYSTEM</span><h2>{t.projectsTitle}</h2></div><div className="project-grid">{projects.map(([name, desc, tag, href, image]) => <a className="project-card" href={href} target="_blank" rel="noreferrer" key={name}><img src={image} alt=""/><div><span>{tag}</span><h3>{name}</h3><p>{desc}</p><strong>Visit project <ArrowTopRightOnSquareIcon/></strong></div></a>)}</div></section>

    <section className="pricing-section section-shell" id="pricing"><div className="section-heading"><span>TRANSPARENT PRICING</span><h2>{t.pricingTitle}</h2><p>{t.pricingIntro}</p></div><div className="pricing-grid">{plans.map(([name, price, cadence, items, popular]) => <article className={`price-card ${popular ? 'popular' : ''}`} key={name}>{popular && <span className="popular-label">BEST VALUE</span>}<h3>{name}</h3><div className="price"><strong>{price}</strong><span>{cadence}</span></div><ul>{items.map(item => <li key={item}><CheckCircleIcon/>{item}</li>)}</ul><a href="#auth-top">Choose {name}</a></article>)}</div><p className="pricing-note">One-time payments are verified by Razorpay before Premium access is enabled. AutoPay is available where the matching Razorpay subscription plan is configured.</p></section>

    <section className="legal-section section-shell" id="legal"><div className="section-heading"><span>TRUST & LEGAL</span><h2>{t.legalTitle}</h2><p>{t.legalIntro}</p></div><div className="legal-grid">
      <article className="legal-card terms-card"><div className="legal-icon"><CheckCircleIcon/></div><span>Effective August 2, 2026</span><h3>{t.termsCard}</h3><p>{lang === 'hi' ? 'Ducor का उपयोग कानूनी और जिम्मेदार तरीके से करें। Account security आपकी जिम्मेदारी है। आप अपने content के owner रहते हैं और Ducor को केवल service चलाने के लिए उसे host, process और deliver करने की अनुमति देते हैं। Spam, harassment, fraud, illegal content और service को नुकसान पहुँचाने की कोशिश मना है।' : 'Use Ducor lawfully and responsibly. You remain responsible for account security and retain ownership of your content. You permit Ducor to host, process and deliver that content only as required to operate the service. Spam, harassment, fraud, illegal content and attempts to compromise the platform are prohibited.'}</p><ul><li><CheckCircleIcon/>You keep ownership of your content</li><li><CheckCircleIcon/>Clear community and safety rules</li><li><CheckCircleIcon/>Transparent service and fair-use limits</li><li><CheckCircleIcon/>Permanent account deletion control</li></ul><a href="/terms">{t.fullPolicy} <ArrowTopRightOnSquareIcon/></a></article>
      <article className="legal-card privacy-card"><div className="legal-icon"><LockClosedIcon/></div><span>Effective August 2, 2026</span><h3>{t.privacyCard}</h3><p>{lang === 'hi' ? 'Policy account, message metadata, calls, media, social activity और device permissions के use को साफ करती है। Private communication और public social content अलग तरीके से process होते हैं। Ducor personal information बेचने का दावा नहीं करता और profile, permission, blocking, reporting, content deletion तथा account deletion controls देता है।' : 'The policy explains account data, message metadata, calls, media, social activity and device permissions. Private communication and public social content are processed differently. Ducor states that it does not sell personal information and provides controls for profiles, permissions, blocking, reporting, content deletion and account deletion.'}</p><ul><li><LockClosedIcon/>No sale of personal information</li><li><LockClosedIcon/>Private-message encryption controls</li><li><LockClosedIcon/>Permission and visibility choices</li><li><LockClosedIcon/>Access, correction and deletion controls</li></ul><a href="/privacy">{t.fullPolicy} <ArrowTopRightOnSquareIcon/></a></article>
    </div><div className="legal-promise"><strong>Our plain-language promise</strong><span>Public posts, reels and channels are visible to their selected audience and require server processing for delivery and moderation. Private chats use encryption features and should never be described as public content. No online service is perfectly secure; users should protect passwords, OTPs and recovery codes.</span></div></section>

    <section className="faq-section section-shell" id="faq"><div className="section-heading"><span>FAQ</span><h2>{t.faqTitle}</h2></div><div className="faq-list">{faqs.map(([q, a]) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>

    <section className="final-cta section-shell"><img src="/ducor-lion-mark.svg" alt=""/><h2>{t.finalTitle}</h2><p>{t.finalBody}</p><a href="#auth-top">Create your Ducor account</a></section>
    <footer className="marketing-footer">
      <div className="marketing-footer-grid">
        <div className="marketing-footer-intro"><div className="marketing-brand"><img src="/ducor-lion-mark.svg" alt=""/><span>Ducor</span></div><p>A social space for college life, local shops, creators and the ideas people build together.</p><strong>Amitesh Kumar Yadav · he/him<br/>Founder & developer of IndiaSearch.site · Haridwar, India</strong><h3>Follow along</h3><div className="marketing-footer-socials">{founderSocials.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer">{label}</a>)}</div></div>
        <div className="marketing-footer-column"><h3>Product</h3><a href="#features">Social & chat</a><a href="#features">Reels</a><a href="#features">PodLive</a><a href="#features">AI Smart Space</a><a href="/shopping">Shop without signing in</a><a href="#pricing">Plans & pricing</a></div>
        <div className="marketing-footer-column"><h3>Made for</h3><a href="#features">College students</a><a href="#features">English practice</a><a href="#features">Developers</a><a href="#features">Creators & podcasters</a><a href="#features">Local businesses</a></div>
        <div className="marketing-footer-column"><h3>Resources</h3><a href="#faq">FAQs</a><a href="/about">About Ducor</a><a href="/founder">Founder profile</a><a href="https://github.com/Amiteshyadav3333/CHIETCHAT" target="_blank" rel="noreferrer">Source on GitHub</a><a href="https://indiasearch.site/" target="_blank" rel="noreferrer">IndiaSearch.site</a><a href="https://amiteshyadav3333.github.io/" target="_blank" rel="noreferrer">Developer portfolio</a></div>
        <div className="marketing-footer-updates"><h3>Get product updates</h3><p>Follow Ducor’s development and releases on GitHub.</p><a href="https://github.com/Amiteshyadav3333/CHIETCHAT" target="_blank" rel="noreferrer">Follow the project <ArrowTopRightOnSquareIcon/></a><div className="marketing-footer-legal"><a href="/privacy">Privacy policy</a><a href="/terms">Terms of use</a><a href="/about">Legal & about</a></div></div>
      </div>
      <div className="marketing-footer-bottom"><span>© {new Date().getFullYear()} Ducor · Built in India 🇮🇳</span><span>Private by design. Made for people.</span></div>
    </footer>
  </div>;
}
