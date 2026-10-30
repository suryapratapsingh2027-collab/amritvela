/**
 * Every customer-facing sentence the bot sends, in five languages:
 *   en = English, hi = Hindi (Devanagari), hing = Hinglish (Hindi in Roman letters), pa = Punjabi (Gurmukhi), mr = Marathi.
 * {placeholders} must be identical in all five languages (checked by test/i18n.test.ts, together with WhatsApp's
 * length limits for buttons / list rows). Punjabi and Marathi texts should be reviewed by a native speaker before launch.
 */
import { m, type L } from './helpers';
import { M2 } from './messages-shop';

const M1 = {
  /* ---------------------------------------------------------------- language picker (shown before a language is known) */
  lang_welcome_body: m(
    `Namaste! 🙏 Welcome to Amrit Vela Trust.\nPlease select your preferred language.\n\nकृपया अपनी भाषा चुनें।\nਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ।\nकृपया तुमची भाषा निवडा.`,
    `Namaste! 🙏 Welcome to Amrit Vela Trust.\nPlease select your preferred language.\n\nकृपया अपनी भाषा चुनें।\nਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ।\nकृपया तुमची भाषा निवडा.`,
    `Namaste! 🙏 Welcome to Amrit Vela Trust.\nPlease select your preferred language.\n\nकृपया अपनी भाषा चुनें।\nਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ।\nकृपया तुमची भाषा निवडा.`,
    `Namaste! 🙏 Welcome to Amrit Vela Trust.\nPlease select your preferred language.\n\nकृपया अपनी भाषा चुनें।\nਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ।\nकृपया तुमची भाषा निवडा.`,
    `Namaste! 🙏 Welcome to Amrit Vela Trust.\nPlease select your preferred language.\n\nकृपया अपनी भाषा चुनें।\nਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ।\nकृपया तुमची भाषा निवडा.`,
  ),
  lang_button: m('Select language', 'Select language', 'Select language', 'Select language', 'Select language'),
  lang_set: m(
    'Language set to English ✅',
    'भाषा हिन्दी चुन ली गई है ✅',
    'Language Hinglish set ho gayi hai ✅',
    'ਭਾਸ਼ਾ ਪੰਜਾਬੀ ਚੁਣ ਲਈ ਗਈ ਹੈ ✅',
    'भाषा मराठी निवडली आहे ✅',
  ),

  /* ---------------------------------------------------------------- main menu */
  menu_body: m(
    `How can I help you today? Tap the button below and choose an option.`,
    `मैं आपकी क्या सहायता कर सकता हूँ? नीचे दिए बटन को दबाकर कोई विकल्प चुनें।`,
    `Main aapki kya madad kar sakta hoon? Neeche button dabakar ek option chunein.`,
    `ਮੈਂ ਤੁਹਾਡੀ ਕੀ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ? ਹੇਠਾਂ ਦਿੱਤਾ ਬਟਨ ਦਬਾ ਕੇ ਕੋਈ ਵਿਕਲਪ ਚੁਣੋ।`,
    `मी तुमची काय मदत करू शकतो? खालील बटण दाबून एक पर्याय निवडा.`,
  ),
  menu_button: m('Open menu', 'मेनू खोलें', 'Menu kholein', 'ਮੀਨੂ ਖੋਲ੍ਹੋ', 'मेनू उघडा'),
  sec_trust: m('The Trust', 'ट्रस्ट', 'Trust', 'ਟਰੱਸਟ', 'ट्रस्ट'),
  sec_shop: m('Shop & payments', 'खरीदारी और भुगतान', 'Shop aur payments', 'ਖਰੀਦਦਾਰੀ ਤੇ ਭੁਗਤਾਨ', 'खरेदी व पेमेंट'),
  sec_help: m('Help', 'सहायता', 'Madad', 'ਮਦਦ', 'मदत'),
  m_info: m('About the Trust', 'ट्रस्ट की जानकारी', 'Trust ki jankari', 'ਟਰੱਸਟ ਬਾਰੇ ਜਾਣਕਾਰੀ', 'ट्रस्टची माहिती'),
  m_info_d: m('Seva, Kirtan, Langar & more', 'सेवा, कीर्तन, लंगर और अधिक', 'Seva, Kirtan, Langar aur bahut kuch', 'ਸੇਵਾ, ਕੀਰਤਨ, ਲੰਗਰ ਤੇ ਹੋਰ', 'सेवा, कीर्तन, लंगर व बरेच काही'),
  m_donate: m('Donate', 'दान करें', 'Donation karein', 'ਦਾਨ ਕਰੋ', 'देणगी द्या'),
  m_donate_d: m('Secure link, receipt on WhatsApp', 'सुरक्षित लिंक, रसीद WhatsApp पर', 'Secure link, receipt WhatsApp par', 'ਸੁਰੱਖਿਅਤ ਲਿੰਕ, ਰਸੀਦ WhatsApp ਤੇ', 'सुरक्षित लिंक, पावती WhatsApp वर'),
  m_contact: m('Contact us', 'संपर्क करें', 'Sampark karein', 'ਸੰਪਰਕ ਕਰੋ', 'संपर्क करा'),
  m_products: m('Our Products', 'हमारे उत्पाद', 'Hamare Products', 'ਸਾਡੇ ਉਤਪਾਦ', 'आमची उत्पादने'),
  m_products_d: m('See photos & order here', 'फोटो देखें और यहीं ऑर्डर करें', 'Photo dekhein aur yahin order karein', 'ਫੋਟੋ ਵੇਖੋ ਤੇ ਇੱਥੇ ਹੀ ਆਰਡਰ ਕਰੋ', 'फोटो पहा व इथेच ऑर्डर करा'),
  m_status: m('Order / Payment status', 'ऑर्डर / भुगतान स्थिति', 'Order / Payment status', 'ਆਰਡਰ / ਭੁਗਤਾਨ ਸਥਿਤੀ', 'ऑर्डर / पेमेंट स्थिती'),
  m_receipt: m('Donation receipt', 'दान की रसीद', 'Donation ki receipt', 'ਦਾਨ ਦੀ ਰਸੀਦ', 'देणगीची पावती'),
  m_social: m('Follow us', 'हमसे जुड़ें', 'Hamse judein', 'ਸਾਡੇ ਨਾਲ ਜੁੜੋ', 'आमच्याशी जोडा'),
  m_human: m('Talk to our team', 'टीम से बात करें', 'Team se baat karein', 'ਟੀਮ ਨਾਲ ਗੱਲ ਕਰੋ', 'टीमशी बोला'),
  m_lang: m('Change language', 'भाषा बदलें', 'Language badlein', 'ਭਾਸ਼ਾ ਬਦਲੋ', 'भाषा बदला'),

  /* ---------------------------------------------------------------- Trust information topics */
  info_body: m(
    `Which information about the Trust would you like? Tap the button and choose a topic.`,
    `ट्रस्ट के बारे में आप कौन सी जानकारी चाहते हैं? बटन दबाकर कोई विषय चुनें।`,
    `Trust ke baare mein aap kaun si jankari chahte hain? Button dabakar ek topic chunein.`,
    `ਟਰੱਸਟ ਬਾਰੇ ਤੁਸੀਂ ਕਿਹੜੀ ਜਾਣਕਾਰੀ ਚਾਹੁੰਦੇ ਹੋ? ਬਟਨ ਦਬਾ ਕੇ ਕੋਈ ਵਿਸ਼ਾ ਚੁਣੋ।`,
    `ट्रस्टबद्दल तुम्हाला कोणती माहिती हवी आहे? बटण दाबून एक विषय निवडा.`,
  ),
  info_button: m('Choose topic', 'विषय चुनें', 'Topic chunein', 'ਵਿਸ਼ਾ ਚੁਣੋ', 'विषय निवडा'),
  info_section: m('Trust information', 'ट्रस्ट की जानकारी', 'Trust ki jankari', 'ਟਰੱਸਟ ਜਾਣਕਾਰੀ', 'ट्रस्ट माहिती'),
  t_about: m('About & mission', 'परिचय और उद्देश्य', 'Parichay aur mission', 'ਜਾਣ-ਪਛਾਣ ਤੇ ਉਦੇਸ਼', 'परिचय व उद्दिष्ट'),
  t_kirtan: m('Kirtan & Langar', 'कीर्तन और लंगर', 'Kirtan aur Langar', 'ਕੀਰਤਨ ਤੇ ਲੰਗਰ', 'कीर्तन व लंगर'),
  t_dharamshala: m('Dharamshala (stay)', 'धर्मशाला (ठहरना)', 'Dharamshala (rehna)', 'ਧਰਮਸ਼ਾਲਾ (ਠਹਿਰਨਾ)', 'धर्मशाळा (निवास)'),
  t_medical: m('Medical & health camps', 'स्वास्थ्य शिविर', 'Medical aur health camps', 'ਮੈਡੀਕਲ ਤੇ ਸਿਹਤ ਕੈਂਪ', 'वैद्यकीय व आरोग्य शिबिरे'),
  t_achievements: m('Achievements', 'उपलब्धियाँ', 'Uplabdhiyan', 'ਪ੍ਰਾਪਤੀਆਂ', 'उपलब्ध्या'),
  t_plans: m('Future plans', 'भविष्य की योजनाएँ', 'Bhavishya ki yojanayein', 'ਭਵਿੱਖ ਦੀਆਂ ਯੋਜਨਾਵਾਂ', 'भविष्यातील योजना'),
  tx_about: m(
    `*About Amrit Vela Trust*\nAmrit Vela Trust is a public charitable trust (incorporated on 4 September 2014) based in Ulhasnagar, Maharashtra. It works for spiritual awakening, hunger eradication, healthcare, emergency relief and education.\n\nMission: to promote education for weaker sections, encourage devotees to observe Amrit Vela through Gurbani-based Katha and Kirtan, and provide food and healthcare support to people in need.\n\nRegistered under the Bombay Public Trust Act, 1950 and the Income Tax Act, 1961.`,
    `*अमृत वेला ट्रस्ट का परिचय*\nअमृत वेला ट्रस्ट उल्हासनगर, महाराष्ट्र में स्थित एक सार्वजनिक धर्मार्थ ट्रस्ट है (स्थापना: 4 सितंबर 2014)। यह आध्यात्मिक जागृति, भूख मिटाने, स्वास्थ्य सेवा, आपातकालीन राहत और शिक्षा के लिए काम करता है।\n\nउद्देश्य: कमज़ोर वर्गों में शिक्षा को बढ़ावा देना, श्रद्धालुओं को गुरबाणी आधारित कथा-कीर्तन के साथ अमृत वेला मनाने के लिए प्रेरित करना, और ज़रूरतमंदों को भोजन व स्वास्थ्य सहायता देना।\n\nबॉम्बे पब्लिक ट्रस्ट एक्ट, 1950 और आयकर अधिनियम, 1961 के अंतर्गत पंजीकृत।`,
    `*Amrit Vela Trust ka parichay*\nAmrit Vela Trust Ulhasnagar, Maharashtra mein sthit ek public charitable trust hai (sthapna: 4 September 2014). Yeh spiritual awakening, hunger eradication, healthcare, emergency relief aur education ke liye kaam karta hai.\n\nMission: kamzor vargon mein shiksha ko badhava dena, shraddhaluon ko Gurbani-adharit Katha-Kirtan ke saath Amrit Vela manane ke liye prerit karna, aur zaruratmandon ko bhojan va healthcare madad dena.\n\nBombay Public Trust Act, 1950 aur Income Tax Act, 1961 ke antargat registered.`,
    `*ਅੰਮ੍ਰਿਤ ਵੇਲਾ ਟਰੱਸਟ ਬਾਰੇ*\nਅੰਮ੍ਰਿਤ ਵੇਲਾ ਟਰੱਸਟ ਉਲਹਾਸਨਗਰ, ਮਹਾਰਾਸ਼ਟਰ ਵਿੱਚ ਸਥਿਤ ਇੱਕ ਜਨਤਕ ਚੈਰੀਟੇਬਲ ਟਰੱਸਟ ਹੈ (ਸਥਾਪਨਾ: 4 ਸਤੰਬਰ 2014)। ਇਹ ਅਧਿਆਤਮਿਕ ਜਾਗਰੂਕਤਾ, ਭੁੱਖ ਮਿਟਾਉਣ, ਸਿਹਤ ਸੇਵਾ, ਐਮਰਜੈਂਸੀ ਰਾਹਤ ਅਤੇ ਸਿੱਖਿਆ ਲਈ ਕੰਮ ਕਰਦਾ ਹੈ।\n\nਉਦੇਸ਼: ਕਮਜ਼ੋਰ ਵਰਗਾਂ ਵਿੱਚ ਸਿੱਖਿਆ ਨੂੰ ਉਤਸ਼ਾਹਿਤ ਕਰਨਾ, ਸ਼ਰਧਾਲੂਆਂ ਨੂੰ ਗੁਰਬਾਣੀ ਅਧਾਰਿਤ ਕਥਾ-ਕੀਰਤਨ ਨਾਲ ਅੰਮ੍ਰਿਤ ਵੇਲਾ ਮਨਾਉਣ ਲਈ ਪ੍ਰੇਰਿਤ ਕਰਨਾ, ਅਤੇ ਲੋੜਵੰਦਾਂ ਨੂੰ ਭੋਜਨ ਤੇ ਸਿਹਤ ਸਹਾਇਤਾ ਦੇਣਾ।\n\nਬੰਬੇ ਪਬਲਿਕ ਟਰੱਸਟ ਐਕਟ, 1950 ਅਤੇ ਇਨਕਮ ਟੈਕਸ ਐਕਟ, 1961 ਅਧੀਨ ਰਜਿਸਟਰਡ।`,
    `*अमृत वेला ट्रस्टबद्दल*\nअमृत वेला ट्रस्ट हा उल्हासनगर, महाराष्ट्र येथील सार्वजनिक धर्मादाय ट्रस्ट आहे (स्थापना: ४ सप्टेंबर २०१४). तो आध्यात्मिक जागृती, भूक निर्मूलन, आरोग्यसेवा, आपत्कालीन मदत आणि शिक्षण यासाठी कार्य करतो.\n\nउद्दिष्ट: दुर्बल घटकांमध्ये शिक्षणाला चालना देणे, भाविकांना गुरबाणीवर आधारित कथा-कीर्तनासह अमृत वेला पाळण्यास प्रेरित करणे, आणि गरजूंना अन्न व आरोग्य मदत पुरवणे.\n\nबॉम्बे पब्लिक ट्रस्ट कायदा, १९५० आणि आयकर कायदा, १९६१ अंतर्गत नोंदणीकृत.`,
  ),
  tx_kirtan: m(
    `*Kirtan & Langar*\n• Online Kirtan: 500+ centres stream daily Kirtan on projectors from 2:30 AM to 5:30 AM.\n• Langar & food seva: mobile vans and centres serve food to around 1,50,000 people every day across all centres.`,
    `*कीर्तन और लंगर*\n• ऑनलाइन कीर्तन: 500 से अधिक केंद्रों पर प्रतिदिन सुबह 2:30 से 5:30 बजे तक प्रोजेक्टर पर कीर्तन का प्रसारण होता है।\n• लंगर और भोजन सेवा: मोबाइल वैन और केंद्रों के माध्यम से सभी केंद्रों पर प्रतिदिन लगभग 1,50,000 लोगों को भोजन कराया जाता है।`,
    `*Kirtan aur Langar*\n• Online Kirtan: 500 se zyada centres par roz subah 2:30 se 5:30 baje tak projector par Kirtan ka prasaran hota hai.\n• Langar aur bhojan seva: mobile vans aur centres ke zariye sabhi centres par roz lagbhag 1,50,000 logon ko bhojan karaya jaata hai.`,
    `*ਕੀਰਤਨ ਤੇ ਲੰਗਰ*\n• ਔਨਲਾਈਨ ਕੀਰਤਨ: 500 ਤੋਂ ਵੱਧ ਕੇਂਦਰਾਂ ਵਿੱਚ ਹਰ ਰੋਜ਼ ਸਵੇਰੇ 2:30 ਤੋਂ 5:30 ਵਜੇ ਤੱਕ ਪ੍ਰੋਜੈਕਟਰ ਤੇ ਕੀਰਤਨ ਦਾ ਪ੍ਰਸਾਰਣ ਹੁੰਦਾ ਹੈ।\n• ਲੰਗਰ ਤੇ ਭੋਜਨ ਸੇਵਾ: ਮੋਬਾਈਲ ਵੈਨਾਂ ਅਤੇ ਕੇਂਦਰਾਂ ਰਾਹੀਂ ਸਾਰੇ ਕੇਂਦਰਾਂ ਵਿੱਚ ਹਰ ਰੋਜ਼ ਲਗਭਗ 1,50,000 ਲੋਕਾਂ ਨੂੰ ਭੋਜਨ ਛਕਾਇਆ ਜਾਂਦਾ ਹੈ।`,
    `*कीर्तन व लंगर*\n• ऑनलाइन कीर्तन: ५०० पेक्षा जास्त केंद्रांवर दररोज पहाटे २:३० ते ५:३० या वेळेत प्रोजेक्टरवर कीर्तनाचे प्रक्षेपण होते.\n• लंगर व अन्नसेवा: मोबाईल व्हॅन आणि केंद्रांमार्फत सर्व केंद्रांवर दररोज सुमारे १,५०,००० लोकांना अन्न दिले जाते.`,
  ),
  tx_dharamshala: m(
    `*Amrit Vela Dharamshala (stay)*\nThe Trust provides free accommodation in Ulhasnagar for Sangat from around the world, linked with the 2:30 AM Sukhmani Saheb Path.\n\nPlease confirm current availability with the Trust team (6913001300) before travelling.`,
    `*अमृत वेला धर्मशाला (ठहरने की सुविधा)*\nट्रस्ट उल्हासनगर में दुनिया भर की संगत के लिए निःशुल्क ठहरने की व्यवस्था करता है, जो सुबह 2:30 बजे के सुखमनी साहिब पाठ से जुड़ी है।\n\nयात्रा से पहले कृपया ट्रस्ट टीम (6913001300) से वर्तमान उपलब्धता की पुष्टि कर लें।`,
    `*Amrit Vela Dharamshala (rehne ki suvidha)*\nTrust Ulhasnagar mein duniya bhar ki Sangat ke liye free accommodation deta hai, jo subah 2:30 baje ke Sukhmani Saheb Path se judi hai.\n\nSafar se pehle kripya Trust team (6913001300) se current availability confirm kar lein.`,
    `*ਅੰਮ੍ਰਿਤ ਵੇਲਾ ਧਰਮਸ਼ਾਲਾ (ਠਹਿਰਨ ਦੀ ਸਹੂਲਤ)*\nਟਰੱਸਟ ਉਲਹਾਸਨਗਰ ਵਿੱਚ ਦੁਨੀਆ ਭਰ ਦੀ ਸੰਗਤ ਲਈ ਮੁਫ਼ਤ ਠਹਿਰਨ ਦਾ ਪ੍ਰਬੰਧ ਕਰਦਾ ਹੈ, ਜੋ ਸਵੇਰੇ 2:30 ਵਜੇ ਦੇ ਸੁਖਮਨੀ ਸਾਹਿਬ ਪਾਠ ਨਾਲ ਜੁੜਿਆ ਹੈ।\n\nਸਫ਼ਰ ਤੋਂ ਪਹਿਲਾਂ ਕਿਰਪਾ ਕਰਕੇ ਟਰੱਸਟ ਟੀਮ (6913001300) ਤੋਂ ਮੌਜੂਦਾ ਉਪਲਬਧਤਾ ਦੀ ਪੁਸ਼ਟੀ ਕਰ ਲਵੋ।`,
    `*अमृत वेला धर्मशाळा (निवासाची सोय)*\nट्रस्ट उल्हासनगरमध्ये जगभरातील संगतीसाठी मोफत निवासाची व्यवस्था करतो, जी पहाटे २:३० वाजताच्या सुखमनी साहिब पाठाशी जोडलेली आहे.\n\nप्रवासापूर्वी कृपया ट्रस्ट टीमकडे (6913001300) सध्याच्या उपलब्धतेची खात्री करा.`,
  ),
  tx_medical: m(
    `*Medical & health camps*\nThe Trust organises blood donation, eye checking, thalassemia support and eye-donation pledge camps as part of its healthcare and community support.`,
    `*चिकित्सा और स्वास्थ्य शिविर*\nट्रस्ट अपनी स्वास्थ्य व सामुदायिक सहायता के अंतर्गत रक्तदान, नेत्र जाँच, थैलेसीमिया सहायता और नेत्रदान संकल्प शिविर आयोजित करता है।`,
    `*Medical aur health camps*\nTrust apni healthcare aur community support ke antargat blood donation, eye checking, thalassemia support aur eye-donation pledge camps organise karta hai.`,
    `*ਮੈਡੀਕਲ ਤੇ ਸਿਹਤ ਕੈਂਪ*\nਟਰੱਸਟ ਆਪਣੀ ਸਿਹਤ ਤੇ ਭਾਈਚਾਰਕ ਸਹਾਇਤਾ ਅਧੀਨ ਖ਼ੂਨਦਾਨ, ਅੱਖਾਂ ਦੀ ਜਾਂਚ, ਥੈਲੇਸੀਮੀਆ ਸਹਾਇਤਾ ਅਤੇ ਅੱਖਾਂ ਦਾਨ ਦੇ ਪ੍ਰਣ ਕੈਂਪ ਲਗਾਉਂਦਾ ਹੈ।`,
    `*वैद्यकीय व आरोग्य शिबिरे*\nट्रस्ट आपल्या आरोग्य व सामाजिक मदतीचा भाग म्हणून रक्तदान, नेत्रतपासणी, थॅलेसेमिया सहाय्य आणि नेत्रदान संकल्प शिबिरे आयोजित करतो.`,
  ),
  tx_achievements: m(
    `*Achievements*\n• A Silent Kirtan gathering of about 50,000 people, recognised by the World Book of Records\n• A Prabhat Pheri of about 2.5 lakh people\n• Ready food served daily to 20,000+ people during COVID-19\n• 50 million+ digital views\n\nThe Trust has been recognised twice by the World Book of Records.`,
    `*उपलब्धियाँ*\n• लगभग 50,000 लोगों का मौन कीर्तन समागम, जिसे वर्ल्ड बुक ऑफ रिकॉर्ड्स ने मान्यता दी\n• लगभग 2.5 लाख लोगों की प्रभात फेरी\n• कोविड-19 के दौरान प्रतिदिन 20,000+ लोगों को तैयार भोजन\n• 5 करोड़ से अधिक डिजिटल व्यूज़\n\nट्रस्ट को वर्ल्ड बुक ऑफ रिकॉर्ड्स द्वारा दो बार मान्यता मिल चुकी है।`,
    `*Uplabdhiyan*\n• Lagbhag 50,000 logon ka Silent Kirtan samagam, jise World Book of Records ne manyata di\n• Lagbhag 2.5 lakh logon ki Prabhat Pheri\n• COVID-19 ke dauran roz 20,000+ logon ko taiyaar bhojan\n• 5 crore se zyada digital views\n\nTrust ko World Book of Records dwara do baar manyata mil chuki hai.`,
    `*ਪ੍ਰਾਪਤੀਆਂ*\n• ਲਗਭਗ 50,000 ਲੋਕਾਂ ਦਾ ਮੌਨ ਕੀਰਤਨ ਸਮਾਗਮ, ਜਿਸਨੂੰ ਵਰਲਡ ਬੁੱਕ ਆਫ਼ ਰਿਕਾਰਡਸ ਨੇ ਮਾਨਤਾ ਦਿੱਤੀ\n• ਲਗਭਗ 2.5 ਲੱਖ ਲੋਕਾਂ ਦੀ ਪ੍ਰਭਾਤ ਫੇਰੀ\n• ਕੋਵਿਡ-19 ਦੌਰਾਨ ਹਰ ਰੋਜ਼ 20,000+ ਲੋਕਾਂ ਨੂੰ ਤਿਆਰ ਭੋਜਨ\n• 5 ਕਰੋੜ ਤੋਂ ਵੱਧ ਡਿਜੀਟਲ ਵਿਊਜ਼\n\nਟਰੱਸਟ ਨੂੰ ਵਰਲਡ ਬੁੱਕ ਆਫ਼ ਰਿਕਾਰਡਸ ਵੱਲੋਂ ਦੋ ਵਾਰ ਮਾਨਤਾ ਮਿਲ ਚੁੱਕੀ ਹੈ।`,
    `*उपलब्ध्या*\n• सुमारे ५०,००० लोकांचा मौन कीर्तन समागम, ज्याला वर्ल्ड बुक ऑफ रेकॉर्ड्सने मान्यता दिली\n• सुमारे २.५ लाख लोकांची प्रभात फेरी\n• कोविड-१९ काळात दररोज २०,०००+ लोकांना तयार अन्न\n• ५ कोटींपेक्षा जास्त डिजिटल व्ह्यूज\n\nट्रस्टला वर्ल्ड बुक ऑफ रेकॉर्ड्सकडून दोनदा मान्यता मिळाली आहे.`,
  ),
  tx_plans: m(
    `*Future plans (planned, not yet completed)*\n• An Amritsar building near Harmandir Sahib with 150 free-rent rooms and a Langar hall\n• 113 Dukh Nivaran Isthans for Nanak Roti food distribution\n• An automated Global Kitchen\n• A free medical hospital\n• A Higher Secondary School and Junior College\n• A Women's Vocational Centre`,
    `*भविष्य की योजनाएँ (प्रस्तावित, अभी पूरी नहीं हुई)*\n• हरमंदिर साहिब के पास अमृतसर में 150 निःशुल्क किराये वाले कमरों और लंगर हॉल वाली इमारत\n• नानक रोटी भोजन वितरण के लिए 113 दुख निवारण स्थान\n• एक स्वचालित ग्लोबल किचन\n• एक निःशुल्क चिकित्सा अस्पताल\n• उच्च माध्यमिक विद्यालय और जूनियर कॉलेज\n• महिलाओं के लिए व्यावसायिक प्रशिक्षण केंद्र`,
    `*Bhavishya ki yojanayein (prastavit, abhi poori nahi hui)*\n• Harmandir Sahib ke paas Amritsar mein 150 free-rent kamron aur Langar hall wali building\n• Nanak Roti bhojan vitaran ke liye 113 Dukh Nivaran Isthan\n• Ek automated Global Kitchen\n• Ek free medical hospital\n• Higher Secondary School aur Junior College\n• Mahilaon ke liye Vocational Centre`,
    `*ਭਵਿੱਖ ਦੀਆਂ ਯੋਜਨਾਵਾਂ (ਪ੍ਰਸਤਾਵਿਤ, ਅਜੇ ਪੂਰੀਆਂ ਨਹੀਂ ਹੋਈਆਂ)*\n• ਹਰਮੰਦਿਰ ਸਾਹਿਬ ਕੋਲ ਅੰਮ੍ਰਿਤਸਰ ਵਿੱਚ 150 ਮੁਫ਼ਤ ਕਿਰਾਏ ਵਾਲੇ ਕਮਰਿਆਂ ਅਤੇ ਲੰਗਰ ਹਾਲ ਵਾਲੀ ਇਮਾਰਤ\n• ਨਾਨਕ ਰੋਟੀ ਭੋਜਨ ਵੰਡ ਲਈ 113 ਦੁਖ ਨਿਵਾਰਨ ਅਸਥਾਨ\n• ਇੱਕ ਆਟੋਮੈਟਿਕ ਗਲੋਬਲ ਕਿਚਨ\n• ਇੱਕ ਮੁਫ਼ਤ ਮੈਡੀਕਲ ਹਸਪਤਾਲ\n• ਹਾਇਰ ਸੈਕੰਡਰੀ ਸਕੂਲ ਅਤੇ ਜੂਨੀਅਰ ਕਾਲਜ\n• ਔਰਤਾਂ ਲਈ ਕਿੱਤਾ-ਮੁਖੀ ਕੇਂਦਰ`,
    `*भविष्यातील योजना (प्रस्तावित, अजून पूर्ण झालेल्या नाहीत)*\n• हरमंदिर साहिबजवळ अमृतसरमध्ये १५० मोफत भाडे खोल्या आणि लंगर हॉल असलेली इमारत\n• नानक रोटी अन्न वितरणासाठी ११३ दुःख निवारण स्थाने\n• एक स्वयंचलित ग्लोबल किचन\n• एक मोफत वैद्यकीय रुग्णालय\n• उच्च माध्यमिक विद्यालय आणि कनिष्ठ महाविद्यालय\n• महिलांसाठी व्यावसायिक प्रशिक्षण केंद्र`,
  ),
  tx_contact: m(
    `*Contact Amrit Vela Trust*\n📍 Amrit Vela Darbar, Section 26, Ulhasnagar-4, Maharashtra\n📞 6913001300\n✉️ amritvelatrustlive@gmail.com`,
    `*अमृत वेला ट्रस्ट से संपर्क करें*\n📍 अमृत वेला दरबार, सेक्शन 26, उल्हासनगर-4, महाराष्ट्र\n📞 6913001300\n✉️ amritvelatrustlive@gmail.com`,
    `*Amrit Vela Trust se sampark karein*\n📍 Amrit Vela Darbar, Section 26, Ulhasnagar-4, Maharashtra\n📞 6913001300\n✉️ amritvelatrustlive@gmail.com`,
    `*ਅੰਮ੍ਰਿਤ ਵੇਲਾ ਟਰੱਸਟ ਨਾਲ ਸੰਪਰਕ ਕਰੋ*\n📍 ਅੰਮ੍ਰਿਤ ਵੇਲਾ ਦਰਬਾਰ, ਸੈਕਸ਼ਨ 26, ਉਲਹਾਸਨਗਰ-4, ਮਹਾਰਾਸ਼ਟਰ\n📞 6913001300\n✉️ amritvelatrustlive@gmail.com`,
    `*अमृत वेला ट्रस्टशी संपर्क करा*\n📍 अमृत वेला दरबार, सेक्शन २६, उल्हासनगर-४, महाराष्ट्र\n📞 6913001300\n✉️ amritvelatrustlive@gmail.com`,
  ),
  tx_social: m(`*Follow us*`, `*हमसे जुड़ें*`, `*Hamse judein*`, `*ਸਾਡੇ ਨਾਲ ਜੁੜੋ*`, `*आमच्याशी जोडा*`),
  social_none: m(
    `Our social media links are not available right now. Please contact the Trust team on 6913001300.`,
    `हमारे सोशल मीडिया लिंक अभी उपलब्ध नहीं हैं। कृपया ट्रस्ट टीम से 6913001300 पर संपर्क करें।`,
    `Hamare social media links abhi available nahi hain. Kripya Trust team se 6913001300 par sampark karein.`,
    `ਸਾਡੇ ਸੋਸ਼ਲ ਮੀਡੀਆ ਲਿੰਕ ਹੁਣ ਉਪਲਬਧ ਨਹੀਂ ਹਨ। ਕਿਰਪਾ ਕਰਕੇ ਟਰੱਸਟ ਟੀਮ ਨਾਲ 6913001300 ਤੇ ਸੰਪਰਕ ਕਰੋ।`,
    `आमचे सोशल मीडिया दुवे सध्या उपलब्ध नाहीत. कृपया ट्रस्ट टीमशी 6913001300 वर संपर्क करा.`,
  ),
  after_topic: m(`Would you like anything else?`, `क्या आप और कुछ जानना चाहेंगे?`, `Kya aap aur kuch jaanna chahenge?`, `ਕੀ ਤੁਸੀਂ ਹੋਰ ਕੁਝ ਜਾਣਨਾ ਚਾਹੋਗੇ?`, `तुम्हाला आणखी काही जाणून घ्यायचे आहे का?`),
  b_donate: m('Donate', 'दान करें', 'Donation karein', 'ਦਾਨ ਕਰੋ', 'देणगी द्या'),
  b_more: m('More topics', 'और विषय', 'Aur topics', 'ਹੋਰ ਵਿਸ਼ੇ', 'आणखी विषय'),
  b_menu: m('Main menu', 'मुख्य मेनू', 'Main menu', 'ਮੁੱਖ ਮੀਨੂ', 'मुख्य मेनू'),

  /* ---------------------------------------------------------------- common */
  support: m(
    `If you face any problem, please contact the Trust team on 6913001300.`,
    `यदि कोई समस्या हो तो कृपया ट्रस्ट टीम से 6913001300 पर संपर्क करें।`,
    `Agar dikkat aaye to Trust team se 6913001300 par sampark karein.`,
    `ਜੇ ਕੋਈ ਸਮੱਸਿਆ ਆਵੇ ਤਾਂ ਕਿਰਪਾ ਕਰਕੇ ਟਰੱਸਟ ਟੀਮ ਨਾਲ 6913001300 ਤੇ ਸੰਪਰਕ ਕਰੋ।`,
    `काही अडचण आल्यास कृपया ट्रस्ट टीमशी 6913001300 वर संपर्क करा.`,
  ),
  cancelled_ok: m(
    `Okay, I have cancelled this process. Write "menu" any time to see the options.`,
    `ठीक है, मैंने यह प्रक्रिया रद्द कर दी है। विकल्प देखने के लिए कभी भी "menu" लिखें।`,
    `Theek hai, maine ye process cancel kar diya hai. Kuch aur chahiye to "menu" likhein.`,
    `ਠੀਕ ਹੈ, ਮੈਂ ਇਹ ਪ੍ਰਕਿਰਿਆ ਰੱਦ ਕਰ ਦਿੱਤੀ ਹੈ। ਵਿਕਲਪ ਵੇਖਣ ਲਈ ਕਦੇ ਵੀ "menu" ਲਿਖੋ।`,
    `ठीक आहे, मी ही प्रक्रिया रद्द केली आहे. पर्याय पाहण्यासाठी कधीही "menu" लिहा.`,
  ),
  human_ack: m(
    `Your request has been noted for the Trust team. They will contact you soon. You can also reach us directly on 6913001300 or amritvelatrustlive@gmail.com.\n\nWrite "menu" to return to the bot.`,
    `आपका अनुरोध ट्रस्ट टीम को नोट कर लिया गया है। टीम जल्द ही आपसे संपर्क करेगी। आप सीधे 6913001300 या amritvelatrustlive@gmail.com पर भी संपर्क कर सकते हैं।\n\nबॉट पर वापस आने के लिए "menu" लिखें।`,
    `Aapki request Trust team ko note kar li gayi hai. Team jaldi aapse sampark karegi. Aap seedha 6913001300 ya amritvelatrustlive@gmail.com par bhi sampark kar sakte hain.\n\nBot par wapas aane ke liye "menu" likhein.`,
    `ਤੁਹਾਡੀ ਬੇਨਤੀ ਟਰੱਸਟ ਟੀਮ ਨੂੰ ਨੋਟ ਕਰ ਲਈ ਗਈ ਹੈ। ਟੀਮ ਜਲਦੀ ਹੀ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰੇਗੀ। ਤੁਸੀਂ ਸਿੱਧਾ 6913001300 ਜਾਂ amritvelatrustlive@gmail.com ਤੇ ਵੀ ਸੰਪਰਕ ਕਰ ਸਕਦੇ ਹੋ।\n\nਬੌਟ ਤੇ ਵਾਪਸ ਆਉਣ ਲਈ "menu" ਲਿਖੋ।`,
    `तुमची विनंती ट्रस्ट टीमकडे नोंदवली आहे. टीम लवकरच तुमच्याशी संपर्क करेल. तुम्ही थेट 6913001300 किंवा amritvelatrustlive@gmail.com वरही संपर्क करू शकता.\n\nबॉटकडे परत येण्यासाठी "menu" लिहा.`,
  ),
  human_hold: m(
    `Your message has reached the Trust team and they will reply soon. Write "menu" to return to the bot. {support}`,
    `आपका संदेश ट्रस्ट टीम को मिल गया है, वे जल्द उत्तर देंगे। बॉट पर वापस आने के लिए "menu" लिखें। {support}`,
    `Aapka message Trust team ko mil gaya hai, woh jaldi jawab dengi. Bot par wapas aane ke liye "menu" likhein. {support}`,
    `ਤੁਹਾਡਾ ਸੁਨੇਹਾ ਟਰੱਸਟ ਟੀਮ ਨੂੰ ਮਿਲ ਗਿਆ ਹੈ, ਉਹ ਜਲਦੀ ਜਵਾਬ ਦੇਣਗੇ। ਬੌਟ ਤੇ ਵਾਪਸ ਆਉਣ ਲਈ "menu" ਲਿਖੋ। {support}`,
    `तुमचा संदेश ट्रस्ट टीमला मिळाला आहे, ते लवकरच उत्तर देतील. बॉटकडे परत येण्यासाठी "menu" लिहा. {support}`,
  ),
  unsupported_media: m(
    `I can only understand text messages right now. Please type your question. 🙏`,
    `मैं अभी केवल टेक्स्ट संदेश समझ सकता हूँ। कृपया अपना सवाल टाइप करके लिखें। 🙏`,
    `Abhi main sirf text messages samajh sakta hoon. Kripya apna sawaal text mein likhein. 🙏`,
    `ਮੈਂ ਹੁਣ ਸਿਰਫ਼ ਟੈਕਸਟ ਸੁਨੇਹੇ ਸਮਝ ਸਕਦਾ ਹਾਂ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਸਵਾਲ ਟਾਈਪ ਕਰੋ। 🙏`,
    `मला सध्या फक्त मजकूर संदेश समजतात. कृपया तुमचा प्रश्न टाईप करा. 🙏`,
  ),
  processing_error: m(
    `Sorry, I could not process your message right now. Please try again in a little while. {support}`,
    `क्षमा करें, अभी आपका संदेश प्रोसेस नहीं हो पाया। कृपया थोड़ी देर बाद पुनः प्रयास करें। {support}`,
    `Maaf kijiye, abhi aapka message process nahi ho paaya. Kripya thodi der baad dobara try karein. {support}`,
    `ਮਾਫ਼ ਕਰਨਾ, ਹੁਣ ਤੁਹਾਡਾ ਸੁਨੇਹਾ ਪ੍ਰੋਸੈਸ ਨਹੀਂ ਹੋ ਸਕਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਥੋੜ੍ਹੀ ਦੇਰ ਬਾਅਦ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ। {support}`,
    `क्षमस्व, आत्ता तुमचा संदेश प्रक्रिया होऊ शकला नाही. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा. {support}`,
  ),
  ai_footer: m(
    `For more information, please contact the Trust team on 6913001300.`,
    `अधिक जानकारी के लिए कृपया ट्रस्ट टीम से 6913001300 पर संपर्क करें।`,
    `Aur jaankari ke liye Trust team se 6913001300 par sampark karein.`,
    `ਹੋਰ ਜਾਣਕਾਰੀ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਟਰੱਸਟ ਟੀਮ ਨਾਲ 6913001300 ਤੇ ਸੰਪਰਕ ਕਰੋ।`,
    `अधिक माहितीसाठी कृपया ट्रस्ट टीमशी 6913001300 वर संपर्क करा.`,
  ),

  /* ---------------------------------------------------------------- donation */
  donate_body: m(
    `Thank you for wanting to donate to Amrit Vela Trust 🙏 Choose an amount, or tap "Other amount".`,
    `अमृत वेला ट्रस्ट को दान देने के लिए धन्यवाद 🙏 कोई राशि चुनें, या "अन्य राशि" दबाएँ।`,
    `Amrit Vela Trust ko donation dene ke liye dhanyavaad 🙏 Ek amount chunein, ya "Doosra amount" dabayein.`,
    `ਅੰਮ੍ਰਿਤ ਵੇਲਾ ਟਰੱਸਟ ਨੂੰ ਦਾਨ ਦੇਣ ਲਈ ਧੰਨਵਾਦ 🙏 ਕੋਈ ਰਕਮ ਚੁਣੋ, ਜਾਂ "ਹੋਰ ਰਕਮ" ਦਬਾਓ।`,
    `अमृत वेला ट्रस्टला देणगी देण्यासाठी धन्यवाद 🙏 एखादी रक्कम निवडा, किंवा "इतर रक्कम" दाबा.`,
  ),
  donate_button: m('Choose amount', 'राशि चुनें', 'Amount chunein', 'ਰਕਮ ਚੁਣੋ', 'रक्कम निवडा'),
  donate_section: m('Donation amount', 'दान राशि', 'Donation amount', 'ਦਾਨ ਰਕਮ', 'देणगी रक्कम'),
  amt_other: m('Other amount', 'अन्य राशि', 'Doosra amount', 'ਹੋਰ ਰਕਮ', 'इतर रक्कम'),
  donate_ask_amount: m(
    `How much would you like to donate to Amrit Vela Trust? Please send the amount, e.g. ₹500.`,
    `आप अमृत वेला ट्रस्ट को कितनी राशि दान करना चाहते हैं? कृपया राशि भेजें, जैसे ₹500।`,
    `Amrit Vela Trust ko donation dene ke liye kitni rakam donate karna chahte hain? Kripya amount bhejein, jaise ₹500.`,
    `ਤੁਸੀਂ ਅੰਮ੍ਰਿਤ ਵੇਲਾ ਟਰੱਸਟ ਨੂੰ ਕਿੰਨੀ ਰਕਮ ਦਾਨ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ? ਕਿਰਪਾ ਕਰਕੇ ਰਕਮ ਭੇਜੋ, ਜਿਵੇਂ ₹500।`,
    `तुम्हाला अमृत वेला ट्रस्टला किती रक्कम देणगी द्यायची आहे? कृपया रक्कम पाठवा, उदा. ₹500.`,
  ),
  donate_amount_retry: m(
    `Please send the donation amount as a number, e.g. ₹500. Write "cancel" to stop.`,
    `कृपया दान की राशि संख्या में भेजें, जैसे ₹500। रोकने के लिए "cancel" लिखें।`,
    `Kripya donation amount number mein bhejein, jaise ₹500. Cancel karne ke liye "cancel" likhein.`,
    `ਕਿਰਪਾ ਕਰਕੇ ਦਾਨ ਦੀ ਰਕਮ ਅੰਕਾਂ ਵਿੱਚ ਭੇਜੋ, ਜਿਵੇਂ ₹500। ਰੋਕਣ ਲਈ "cancel" ਲਿਖੋ।`,
    `कृपया देणगीची रक्कम अंकांत पाठवा, उदा. ₹500. थांबवण्यासाठी "cancel" लिहा.`,
  ),
  donate_decimal: m(
    `Please send the amount in whole rupees, e.g. ₹500.`,
    `कृपया राशि पूरे रुपयों में भेजें, जैसे ₹500।`,
    `Kripya poore rupaye mein amount bhejein, jaise ₹500.`,
    `ਕਿਰਪਾ ਕਰਕੇ ਰਕਮ ਪੂਰੇ ਰੁਪਇਆਂ ਵਿੱਚ ਭੇਜੋ, ਜਿਵੇਂ ₹500।`,
    `कृपया रक्कम पूर्ण रुपयांत पाठवा, उदा. ₹500.`,
  ),
  donate_range: m(
    `The donation amount must be between ₹1 and ₹{max}. Please send a valid amount.`,
    `दान की राशि ₹1 से ₹{max} के बीच होनी चाहिए। कृपया सही राशि भेजें।`,
    `Donation amount ₹1 se ₹{max} ke beech hona chahiye. Kripya sahi amount bhejein.`,
    `ਦਾਨ ਦੀ ਰਕਮ ₹1 ਤੋਂ ₹{max} ਦੇ ਵਿਚਕਾਰ ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਸਹੀ ਰਕਮ ਭੇਜੋ।`,
    `देणगीची रक्कम ₹1 ते ₹{max} दरम्यान असावी. कृपया योग्य रक्कम पाठवा.`,
  ),
  donate_ask_name: m(
    `Thank you for your ₹{amount} donation! Please send your full name to be written on the receipt.`,
    `₹{amount} के दान के लिए धन्यवाद! रसीद पर लिखने के लिए कृपया अपना पूरा नाम भेजें।`,
    `₹{amount} donation ke liye dhanyavaad! Receipt par naam likhne ke liye apna poora naam bhejein.`,
    `₹{amount} ਦੇ ਦਾਨ ਲਈ ਧੰਨਵਾਦ! ਰਸੀਦ ਤੇ ਲਿਖਣ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਪੂਰਾ ਨਾਮ ਭੇਜੋ।`,
    `₹{amount} च्या देणगीबद्दल धन्यवाद! पावतीवर लिहिण्यासाठी कृपया तुमचे पूर्ण नाव पाठवा.`,
  ),
  donate_name_retry: m(
    `Please send your full name for the receipt (name only, no numbers). Write "cancel" to stop.`,
    `कृपया रसीद के लिए अपना पूरा नाम भेजें (केवल नाम, अंक नहीं)। रोकने के लिए "cancel" लिखें।`,
    `Kripya receipt ke liye apna poora naam bhejein (sirf naam, number ke bina). Cancel ke liye "cancel".`,
    `ਕਿਰਪਾ ਕਰਕੇ ਰਸੀਦ ਲਈ ਆਪਣਾ ਪੂਰਾ ਨਾਮ ਭੇਜੋ (ਸਿਰਫ਼ ਨਾਮ, ਅੰਕ ਨਹੀਂ)। ਰੋਕਣ ਲਈ "cancel" ਲਿਖੋ।`,
    `कृपया पावतीसाठी तुमचे पूर्ण नाव पाठवा (फक्त नाव, अंक नाही). थांबवण्यासाठी "cancel" लिहा.`,
  ),
  donate_link: m(
    `Namaste{name}! To donate ₹{amount} to Amrit Vela Trust, please pay on this secure Razorpay link:\n{url}\n\nReference: {ref}\nAs soon as the payment is confirmed, your PDF receipt will be sent to this WhatsApp chat.`,
    `नमस्ते{name}! अमृत वेला ट्रस्ट को ₹{amount} दान करने के लिए कृपया इस सुरक्षित Razorpay लिंक पर भुगतान करें:\n{url}\n\nसंदर्भ: {ref}\nभुगतान की पुष्टि होते ही आपकी PDF रसीद इसी WhatsApp चैट पर भेज दी जाएगी।`,
    `Namaste{name}! Amrit Vela Trust ko ₹{amount} donation karne ke liye is secure Razorpay link par payment karein:\n{url}\n\nReference: {ref}\nPayment confirm hote hi aapki PDF receipt isi WhatsApp par bhej di jayegi.`,
    `ਸਤ ਸ੍ਰੀ ਅਕਾਲ{name}! ਅੰਮ੍ਰਿਤ ਵੇਲਾ ਟਰੱਸਟ ਨੂੰ ₹{amount} ਦਾਨ ਕਰਨ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਇਸ ਸੁਰੱਖਿਅਤ Razorpay ਲਿੰਕ ਤੇ ਭੁਗਤਾਨ ਕਰੋ:\n{url}\n\nਹਵਾਲਾ: {ref}\nਭੁਗਤਾਨ ਦੀ ਪੁਸ਼ਟੀ ਹੁੰਦੇ ਹੀ ਤੁਹਾਡੀ PDF ਰਸੀਦ ਇਸੇ WhatsApp ਤੇ ਭੇਜ ਦਿੱਤੀ ਜਾਵੇਗੀ।`,
    `नमस्कार{name}! अमृत वेला ट्रस्टला ₹{amount} देणगी देण्यासाठी कृपया या सुरक्षित Razorpay लिंकवर पेमेंट करा:\n{url}\n\nसंदर्भ: {ref}\nपेमेंटची खात्री होताच तुमची PDF पावती याच WhatsApp वर पाठवली जाईल.`,
  ),
  donate_mock: m(
    `A demo record {ref} was created, but MOCK_PROVIDERS is enabled. This is not a real payment link, please do not pay.`,
    `डेमो रिकॉर्ड {ref} बना है, लेकिन MOCK_PROVIDERS चालू है। यह असली भुगतान लिंक नहीं है, कृपया भुगतान न करें।`,
    `Donation {ref} ka demo record bana hai, lekin MOCK_PROVIDERS enabled hai. Yeh real payment link nahi hai, payment na karein.`,
    `ਡੈਮੋ ਰਿਕਾਰਡ {ref} ਬਣਿਆ ਹੈ, ਪਰ MOCK_PROVIDERS ਚਾਲੂ ਹੈ। ਇਹ ਅਸਲੀ ਭੁਗਤਾਨ ਲਿੰਕ ਨਹੀਂ ਹੈ, ਕਿਰਪਾ ਕਰਕੇ ਭੁਗਤਾਨ ਨਾ ਕਰੋ।`,
    `डेमो रेकॉर्ड {ref} तयार झाला आहे, पण MOCK_PROVIDERS चालू आहे. ही खरी पेमेंट लिंक नाही, कृपया पेमेंट करू नका.`,
  ),
  link_error: m(
    `The payment link could not be created right now, so please do not pay anything. Try again in a little while. {support}`,
    `अभी भुगतान लिंक नहीं बन सका, इसलिए कृपया कोई भुगतान न करें। थोड़ी देर बाद फिर प्रयास करें। {support}`,
    `Abhi payment link nahi ban saka, isliye koi payment na karein. Kripya thodi der baad dobara try karein. {support}`,
    `ਹੁਣ ਭੁਗਤਾਨ ਲਿੰਕ ਨਹੀਂ ਬਣ ਸਕਿਆ, ਇਸ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਕੋਈ ਭੁਗਤਾਨ ਨਾ ਕਰੋ। ਥੋੜ੍ਹੀ ਦੇਰ ਬਾਅਦ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ। {support}`,
    `सध्या पेमेंट लिंक तयार होऊ शकली नाही, त्यामुळे कृपया कोणतेही पेमेंट करू नका. थोड्या वेळाने पुन्हा प्रयत्न करा. {support}`,
  ),
} as const satisfies Record<string, L>;

export const M = { ...M1, ...M2 } as const;
export type MessageKey = keyof typeof M;
