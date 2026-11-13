import { m } from './helpers';

/** Round 7: the client's 7-option main menu, per-trust donations (+QR), room booking. Greeting style follows the client's approved flow. */
export const M4 = {
  /* ---------------------------------------------------------------- main menu rows (titles <= 24, descriptions <= 72) */
  sec_menu: m('Menu', 'मेनू', 'Menu', 'ਮੀਨੂ'),
  m_channel: m('WhatsApp Channel', 'WhatsApp चैनल', 'WhatsApp Channel', 'WhatsApp ਚੈਨਲ'),
  m_channel_d: m('Join our official channel', 'हमारे आधिकारिक चैनल से जुड़ें', 'Hamare official channel se judein', 'ਸਾਡੇ ਅਧਿਕਾਰਤ ਚੈਨਲ ਨਾਲ ਜੁੜੋ'),
  m_pm: m('Pendrive & Mala', 'पेनड्राइव और माला', 'Pendrive aur Mala', 'ਪੈਨਡ੍ਰਾਈਵ ਅਤੇ ਮਾਲਾ'),
  m_pm_d: m('Gurbani pendrive, mala', 'गुरबाणी पेनड्राइव, माला', 'Gurbani pendrive, mala', 'ਗੁਰਬਾਣੀ ਪੈਨਡ੍ਰਾਈਵ, ਮਾਲਾ'),
  m_otherprod: m('Other Products', 'अन्य उत्पाद', 'Other Products', 'ਹੋਰ ਉਤਪਾਦ'),
  m_otherprod_d: m('All other items', 'अन्य सभी सामान', 'Baaki sab saman', 'ਬਾਕੀ ਸਾਰਾ ਸਮਾਨ'),
  m_rooms: m('Room Booking', 'कमरा बुकिंग', 'Room Booking', 'ਕਮਰਾ ਬੁਕਿੰਗ'),
  m_rooms_d: m('Request a room', 'कमरे का अनुरोध करें', 'Room ke liye request karein', 'ਕਮਰੇ ਲਈ ਬੇਨਤੀ ਕਰੋ'),
  m_social: m('Social Media', 'सोशल मीडिया', 'Social Media', 'ਸੋਸ਼ਲ ਮੀਡੀਆ'),
  m_social_d: m('Instagram, Facebook, YouTube', 'इंस्टाग्राम, फ़ेसबुक, यूट्यूब', 'Instagram, Facebook, YouTube', 'ਇੰਸਟਾਗ੍ਰਾਮ, ਫੇਸਬੁੱਕ, ਯੂਟਿਊਬ'),
  m_more: m('Other Information', 'अन्य जानकारी', 'Other Information', 'ਹੋਰ ਜਾਣਕਾਰੀ'),
  m_more_d: m('About us, status, support', 'हमारे बारे में, स्थिति, सहायता', 'About, status, madad', 'ਸਾਡੇ ਬਾਰੇ, ਸਥਿਤੀ, ਮਦਦ'),
  more_body: m(`Ji ❤️, what information do you need?\nYou can also simply type your question.`, `जी ❤️, आपको क्या जानकारी चाहिए?\nआप सीधे अपना सवाल भी लिख सकते हैं।`, `Ji ❤️, aapko kya jankari chahiye?\nAap seedha apna sawaal bhi likh sakte hain.`, `ਜੀ ❤️, ਤੁਹਾਨੂੰ ਕੀ ਜਾਣਕਾਰੀ ਚਾਹੀਦੀ ਹੈ?\nਤੁਸੀਂ ਸਿੱਧਾ ਆਪਣਾ ਸਵਾਲ ਵੀ ਲਿਖ ਸਕਦੇ ਹੋ।`),
  more_button: m('Choose', 'चुनें', 'Chunein', 'ਚੁਣੋ'),

  /* ---------------------------------------------------------------- WhatsApp channel */
  tx_channel: m(
    `🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, to join the official WhatsApp Channel of Amrit Vela Trust, tap the link below.\n\n👇 JOIN OUR OFFICIAL WHATSAPP CHANNEL:\n{url}\n\nDHAN GURU NANAK 🙏`,
    `🙏 धन गुरु नानक 🙏\n\nजी ❤️, अमृत वेला ट्रस्ट के आधिकारिक WhatsApp चैनल से जुड़ने के लिए नीचे दिए लिंक पर क्लिक करें।\n\n👇 हमारे आधिकारिक WhatsApp चैनल से जुड़ें:\n{url}\n\nधन गुरु नानक 🙏`,
    `🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, Amrit Vela Trust ke official WhatsApp Channel se judne ke liye neeche diye gaye link par click karein.\n\n👇 JOIN OUR OFFICIAL WHATSAPP CHANNEL:\n{url}\n\nDHAN GURU NANAK 🙏`,
    `🙏 ਧੰਨ ਗੁਰੂ ਨਾਨਕ 🙏\n\nਜੀ ❤️, ਅੰਮ੍ਰਿਤ ਵੇਲਾ ਟਰੱਸਟ ਦੇ ਅਧਿਕਾਰਤ WhatsApp ਚੈਨਲ ਨਾਲ ਜੁੜਨ ਲਈ ਹੇਠਾਂ ਦਿੱਤੇ ਲਿੰਕ ਤੇ ਕਲਿੱਕ ਕਰੋ।\n\n👇 ਸਾਡੇ ਅਧਿਕਾਰਤ WhatsApp ਚੈਨਲ ਨਾਲ ਜੁੜੋ:\n{url}\n\nਧੰਨ ਗੁਰੂ ਨਾਨਕ 🙏`,
  ),
  channel_none: m(`The WhatsApp Channel link will be shared very soon. {support}`, `WhatsApp चैनल का लिंक जल्द ही साझा किया जाएगा। {support}`, `WhatsApp Channel ka link jaldi hi share kiya jayega. {support}`, `WhatsApp ਚੈਨਲ ਦਾ ਲਿੰਕ ਜਲਦੀ ਸਾਂਝਾ ਕੀਤਾ ਜਾਵੇਗਾ। {support}`),

  /* ---------------------------------------------------------------- products */
  pm_body: m(`🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, which of our products would you like?\nPlease select:`, `🙏 धन गुरु नानक 🙏\n\nजी ❤️, आप हमारे उत्पादों में से क्या लेना चाहते हैं?\nकृपया चुनें:`, `🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, Amrit Vela Trust ke products mein aap kya lena chahte hain?\nKripya apni pasand select karein:`, `🙏 ਧੰਨ ਗੁਰੂ ਨਾਨਕ 🙏\n\nਜੀ ❤️, ਤੁਸੀਂ ਸਾਡੇ ਉਤਪਾਦਾਂ ਵਿੱਚੋਂ ਕੀ ਲੈਣਾ ਚਾਹੁੰਦੇ ਹੋ?\nਕਿਰਪਾ ਕਰਕੇ ਚੁਣੋ:`),
  pm_none: m(`Pendrive and Mala are not available right now. {support}`, `पेनड्राइव और माला अभी उपलब्ध नहीं हैं। {support}`, `Pendrive aur Mala abhi available nahi hain. {support}`, `ਪੈਨਡ੍ਰਾਈਵ ਅਤੇ ਮਾਲਾ ਹੁਣੇ ਉਪਲਬਧ ਨਹੀਂ ਹਨ। {support}`),
  other_none: m(`No other products are available right now. {support}`, `अभी कोई अन्य उत्पाद उपलब्ध नहीं है। {support}`, `Abhi koi doosra product available nahi hai. {support}`, `ਹੁਣੇ ਕੋਈ ਹੋਰ ਉਤਪਾਦ ਉਪਲਬਧ ਨਹੀਂ ਹੈ। {support}`),

  /* ---------------------------------------------------------------- donations per trust */
  donate_link_d: m('Pay online, QR also available', 'ऑनलाइन भुगतान, QR भी उपलब्ध', 'Online payment, QR bhi available', 'ਔਨਲਾਈਨ ਭੁਗਤਾਨ, QR ਵੀ ਉਪਲਬਧ'),
  trust_amount_body: m(`🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, how much seva would you like to do for {trust}?`, `🙏 धन गुरु नानक 🙏\n\nजी ❤️, आप {trust} के लिए कितनी सेवा करना चाहते हैं?`, `🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, aap {trust} ke liye kitni seva karna chahte hain?`, `🙏 ਧੰਨ ਗੁਰੂ ਨਾਨਕ 🙏\n\nਜੀ ❤️, ਤੁਸੀਂ {trust} ਲਈ ਕਿੰਨੀ ਸੇਵਾ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ?`),
  trust_amount_type: m(`🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, how much seva would you like to do for {trust}?\n\nPlease type your donation amount, e.g. 501.\n\nDHAN GURU NANAK 🙏`, `🙏 धन गुरु नानक 🙏\n\nजी ❤️, आप {trust} के लिए कितनी सेवा करना चाहते हैं?\n\nकृपया अपनी दान राशि लिखें, जैसे 501।\n\nधन गुरु नानक 🙏`, `🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, aap {trust} ke liye kitni seva karna chahte hain?\n\nKripya apni donation amount type karein, jaise 501.\n\nDHAN GURU NANAK 🙏`, `🙏 ਧੰਨ ਗੁਰੂ ਨਾਨਕ 🙏\n\nਜੀ ❤️, ਤੁਸੀਂ {trust} ਲਈ ਕਿੰਨੀ ਸੇਵਾ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ?\n\nਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਦਾਨ ਰਕਮ ਲਿਖੋ, ਜਿਵੇਂ 501।\n\nਧੰਨ ਗੁਰੂ ਨਾਨਕ 🙏`),
  trust_amount_button: m('Choose amount', 'राशि चुनें', 'Amount chunein', 'ਰਕਮ ਚੁਣੋ'),
  donate_link_trust: m(
    `🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, thank you from the heart for your seva of ₹{amount} for {trust}.\n\nTo complete the donation, tap the link below:\n\n👇 DONATE NOW\n{url}\n\nReference: {ref}\nAs soon as the payment is confirmed, your PDF receipt will be sent to this chat.\n\nDHAN GURU NANAK 🙏`,
    `🙏 धन गुरु नानक 🙏\n\nजी ❤️, {trust} के लिए ₹{amount} की आपकी सेवा के लिए दिल से धन्यवाद।\n\nदान पूरा करने के लिए नीचे दिए लिंक पर क्लिक करें:\n\n👇 अभी दान करें\n{url}\n\nसंदर्भ: {ref}\nभुगतान की पुष्टि होते ही आपकी PDF रसीद इसी चैट में भेज दी जाएगी।\n\nधन गुरु नानक 🙏`,
    `🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, {trust} ke liye ₹{amount} ki aapki seva ke liye dil se dhanyavaad.\n\nDonation complete karne ke liye neeche diye gaye link par click karein:\n\n👇 DONATE NOW\n{url}\n\nReference: {ref}\nPayment confirm hote hi aapki PDF receipt isi chat mein bhej di jayegi.\n\nDHAN GURU NANAK 🙏`,
    `🙏 ਧੰਨ ਗੁਰੂ ਨਾਨਕ 🙏\n\nਜੀ ❤️, {trust} ਲਈ ₹{amount} ਦੀ ਤੁਹਾਡੀ ਸੇਵਾ ਲਈ ਦਿਲੋਂ ਧੰਨਵਾਦ।\n\nਦਾਨ ਪੂਰਾ ਕਰਨ ਲਈ ਹੇਠਾਂ ਦਿੱਤੇ ਲਿੰਕ ਤੇ ਕਲਿੱਕ ਕਰੋ:\n\n👇 ਹੁਣੇ ਦਾਨ ਕਰੋ\n{url}\n\nਹਵਾਲਾ: {ref}\nਭੁਗਤਾਨ ਦੀ ਪੁਸ਼ਟੀ ਹੁੰਦਿਆਂ ਹੀ ਤੁਹਾਡੀ PDF ਰਸੀਦ ਇਸੇ ਚੈਟ ਵਿੱਚ ਭੇਜ ਦਿੱਤੀ ਜਾਵੇਗੀ।\n\nਧੰਨ ਗੁਰੂ ਨਾਨਕ 🙏`,
  ),
  b_qr: m('Pay by QR code', 'QR कोड से दें', 'QR code se dein', 'QR ਕੋਡ ਨਾਲ ਦਿਓ'),
  qr_fallback: m(`The online payment link could not be created right now. You can still donate to {trust} by scanning the QR code below with any UPI app.`, `ऑनलाइन भुगतान लिंक अभी नहीं बन पाया। आप नीचे दिया QR कोड किसी भी UPI ऐप से स्कैन करके {trust} को दान दे सकते हैं।`, `Online payment link abhi nahi ban paya. Aap neeche diya QR code kisi bhi UPI app se scan karke {trust} ko donation de sakte hain.`, `ਔਨਲਾਈਨ ਭੁਗਤਾਨ ਲਿੰਕ ਹੁਣੇ ਨਹੀਂ ਬਣ ਸਕਿਆ। ਤੁਸੀਂ ਹੇਠਾਂ ਦਿੱਤਾ QR ਕੋਡ ਕਿਸੇ ਵੀ UPI ਐਪ ਨਾਲ ਸਕੈਨ ਕਰਕੇ {trust} ਨੂੰ ਦਾਨ ਦੇ ਸਕਦੇ ਹੋ।`),
  trust_closed: m(`This Trust is not accepting donations right now. {support}`, `यह ट्रस्ट अभी दान स्वीकार नहीं कर रहा है। {support}`, `Yeh Trust abhi donation nahi le raha hai. {support}`, `ਇਹ ਟਰੱਸਟ ਹੁਣੇ ਦਾਨ ਸਵੀਕਾਰ ਨਹੀਂ ਕਰ ਰਿਹਾ। {support}`),

  /* ---------------------------------------------------------------- room booking */
  b_room_req: m('Request booking', 'बुकिंग अनुरोध', 'Booking request', 'ਬੁਕਿੰਗ ਬੇਨਤੀ'),
  room_info_default: m(
    `🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, you can request a room at our Dharamshala. Tap "Request booking", send a few details, and our team will confirm your booking by phone.`,
    `🙏 धन गुरु नानक 🙏\n\nजी ❤️, आप हमारी धर्मशाला में कमरे के लिए अनुरोध कर सकते हैं। "बुकिंग अनुरोध" दबाएँ और कुछ जानकारी भेजें; हमारी टीम फ़ोन पर आपकी बुकिंग की पुष्टि करेगी।`,
    `🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, aap hamari Dharamshala mein room ke liye request kar sakte hain. "Booking request" dabayein aur thodi jankari bhejein; hamari team phone par aapki booking confirm karegi.`,
    `🙏 ਧੰਨ ਗੁਰੂ ਨਾਨਕ 🙏\n\nਜੀ ❤️, ਤੁਸੀਂ ਸਾਡੀ ਧਰਮਸ਼ਾਲਾ ਵਿੱਚ ਕਮਰੇ ਲਈ ਬੇਨਤੀ ਕਰ ਸਕਦੇ ਹੋ। "ਬੁਕਿੰਗ ਬੇਨਤੀ" ਦਬਾਓ ਅਤੇ ਕੁਝ ਜਾਣਕਾਰੀ ਭੇਜੋ; ਸਾਡੀ ਟੀਮ ਫ਼ੋਨ ਤੇ ਤੁਹਾਡੀ ਬੁਕਿੰਗ ਦੀ ਪੁਸ਼ਟੀ ਕਰੇਗੀ।`,
  ),
  room_ask_name: m(`Please send your full name for the booking.`, `बुकिंग के लिए कृपया अपना पूरा नाम भेजें।`, `Booking ke liye kripya apna poora naam bhejein.`, `ਬੁਕਿੰਗ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਪੂਰਾ ਨਾਮ ਭੇਜੋ।`),
  room_ask_date: m(`On which date will you arrive (check-in)? For example 25 Dec or 25/12/2026.`, `आप किस तारीख को पहुँचेंगे (चेक-इन)? जैसे 25 दिसंबर या 25/12/2026।`, `Aap kis date ko pahunchenge (check-in)? Jaise 25 Dec ya 25/12/2026.`, `ਤੁਸੀਂ ਕਿਸ ਤਾਰੀਖ ਨੂੰ ਪਹੁੰਚੋਗੇ (ਚੈੱਕ-ਇਨ)? ਜਿਵੇਂ 25 ਦਸੰਬਰ ਜਾਂ 25/12/2026।`),
  room_date_retry: m(`I could not read that date. Please send it like 25 Dec or 25/12/2026.`, `मैं वह तारीख़ नहीं समझ पाया। कृपया 25 दिसंबर या 25/12/2026 जैसे लिखें।`, `Main woh date samajh nahi paya. Kripya 25 Dec ya 25/12/2026 jaise likhein.`, `ਮੈਂ ਉਹ ਤਾਰੀਖ ਸਮਝ ਨਹੀਂ ਸਕਿਆ। ਕਿਰਪਾ ਕਰਕੇ 25 ਦਸੰਬਰ ਜਾਂ 25/12/2026 ਵਰਗਾ ਲਿਖੋ।`),
  room_ask_guests: m(`How many people (guests) will stay? Send a number, e.g. 4.`, `कितने लोग रुकेंगे? एक संख्या भेजें, जैसे 4।`, `Kitne log rukenge? Ek number bhejein, jaise 4.`, `ਕਿੰਨੇ ਲੋਕ ਰੁਕਣਗੇ? ਇੱਕ ਨੰਬਰ ਭੇਜੋ, ਜਿਵੇਂ 4।`),
  room_guests_retry: m(`Please send the number of guests between 1 and 50, e.g. 4.`, `कृपया 1 से 50 के बीच मेहमानों की संख्या भेजें, जैसे 4।`, `Kripya 1 se 50 ke beech guests ki sankhya bhejein, jaise 4.`, `ਕਿਰਪਾ ਕਰਕੇ 1 ਤੋਂ 50 ਦੇ ਵਿਚਕਾਰ ਮਹਿਮਾਨਾਂ ਦੀ ਗਿਣਤੀ ਭੇਜੋ, ਜਿਵੇਂ 4।`),
  room_ask_nights: m(`For how many nights? Send a number, e.g. 2.`, `कितनी रातों के लिए? एक संख्या भेजें, जैसे 2।`, `Kitni raat ke liye? Ek number bhejein, jaise 2.`, `ਕਿੰਨੀਆਂ ਰਾਤਾਂ ਲਈ? ਇੱਕ ਨੰਬਰ ਭੇਜੋ, ਜਿਵੇਂ 2।`),
  room_nights_retry: m(`Please send the number of nights between 1 and 60, e.g. 2.`, `कृपया 1 से 60 के बीच रातों की संख्या भेजें, जैसे 2।`, `Kripya 1 se 60 ke beech raaton ki sankhya bhejein, jaise 2.`, `ਕਿਰਪਾ ਕਰਕੇ 1 ਤੋਂ 60 ਦੇ ਵਿਚਕਾਰ ਰਾਤਾਂ ਦੀ ਗਿਣਤੀ ਭੇਜੋ, ਜਿਵੇਂ 2।`),
  room_done: m(
    `🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, your room booking request is received.\n\nReference: {ref}\nName: {name}\nCheck-in: {date}\nGuests: {guests}\nNights: {nights}\n\nOur team will call you on this number to confirm. The booking is confirmed only after that call.`,
    `🙏 धन गुरु नानक 🙏\n\nजी ❤️, आपका कमरा बुकिंग अनुरोध मिल गया है।\n\nसंदर्भ: {ref}\nनाम: {name}\nचेक-इन: {date}\nमेहमान: {guests}\nरातें: {nights}\n\nहमारी टीम पुष्टि के लिए इसी नंबर पर आपको फ़ोन करेगी। उस फ़ोन के बाद ही बुकिंग पक्की मानी जाएगी।`,
    `🙏 DHAN GURU NANAK 🙏\n\nJi ❤️, aapka room booking request mil gaya hai.\n\nReference: {ref}\nNaam: {name}\nCheck-in: {date}\nGuests: {guests}\nRaatein: {nights}\n\nHamari team confirm karne ke liye isi number par aapko call karegi. Us call ke baad hi booking pakki maani jayegi.`,
    `🙏 ਧੰਨ ਗੁਰੂ ਨਾਨਕ 🙏\n\nਜੀ ❤️, ਤੁਹਾਡੀ ਕਮਰਾ ਬੁਕਿੰਗ ਬੇਨਤੀ ਮਿਲ ਗਈ ਹੈ।\n\nਹਵਾਲਾ: {ref}\nਨਾਮ: {name}\nਚੈੱਕ-ਇਨ: {date}\nਮਹਿਮਾਨ: {guests}\nਰਾਤਾਂ: {nights}\n\nਸਾਡੀ ਟੀਮ ਪੁਸ਼ਟੀ ਲਈ ਇਸੇ ਨੰਬਰ ਤੇ ਤੁਹਾਨੂੰ ਫ਼ੋਨ ਕਰੇਗੀ। ਉਸ ਫ਼ੋਨ ਤੋਂ ਬਾਅਦ ਹੀ ਬੁਕਿੰਗ ਪੱਕੀ ਮੰਨੀ ਜਾਵੇਗੀ।`,
  ),
} as const;
