import { m, type L } from './helpers';

/** Live Kirtan alerts, campaigns and the merged menu rows (see messages.ts for conventions). */
export const M3 = {
  /* ---------------------------------------------------------------- Live Kirtan */
  m_live: m('Live Kirtan', 'लाइव कीर्तन', 'Live Kirtan', 'ਲਾਈਵ ਕੀਰਤਨ'),
  m_live_d: m('Watch on YouTube', 'YouTube पर देखें', 'YouTube par dekhein', 'YouTube ਤੇ ਵੇਖੋ'),
  live_alert: m(
    `🔴 {title} is LIVE now!\n▶️ Watch: {url}\n\nReply STOP to stop these alerts.`,
    `🔴 {title} अभी लाइव है!\n▶️ यहाँ देखें: {url}\n\nये अलर्ट बंद करने के लिए STOP लिखें।`,
    `🔴 {title} abhi LIVE hai!\n▶️ Yahan dekhein: {url}\n\nAlerts band karne ke liye STOP likhein.`,
    `🔴 {title} ਹੁਣ ਲਾਈਵ ਹੈ!\n▶️ ਇੱਥੇ ਵੇਖੋ: {url}\n\nਇਹ ਅਲਰਟ ਬੰਦ ਕਰਨ ਲਈ STOP ਲਿਖੋ।`,
  ),
  live_now_reply: m(`🔴 {title} is live right now!\n▶️ Watch: {url}`, `🔴 {title} अभी लाइव है!\n▶️ यहाँ देखें: {url}`, `🔴 {title} abhi live hai!\n▶️ Yahan dekhein: {url}`, `🔴 {title} ਹੁਣ ਲਾਈਵ ਹੈ!\n▶️ ਇੱਥੇ ਵੇਖੋ: {url}`),
  live_next_reply: m(
    `{title}\n\nTimings (India time):\n{timings}\n\n▶️ YouTube: {url}\n\nYou will get an alert here when it goes live. Reply STOP to turn the alerts off.`,
    `{title}\n\nसमय (भारतीय समय):\n{timings}\n\n▶️ YouTube: {url}\n\nलाइव शुरू होते ही आपको यहाँ अलर्ट मिलेगा। अलर्ट बंद करने के लिए STOP लिखें।`,
    `{title}\n\nTimings (India time):\n{timings}\n\n▶️ YouTube: {url}\n\nLive shuru hote hi aapko yahan alert milega. Alerts band karne ke liye STOP likhein.`,
    `{title}\n\nਸਮਾਂ (ਭਾਰਤੀ ਸਮਾਂ):\n{timings}\n\n▶️ YouTube: {url}\n\nਲਾਈਵ ਸ਼ੁਰੂ ਹੁੰਦੇ ਹੀ ਤੁਹਾਨੂੰ ਇੱਥੇ ਅਲਰਟ ਮਿਲੇਗਾ। ਅਲਰਟ ਬੰਦ ਕਰਨ ਲਈ STOP ਲਿਖੋ।`,
  ),
  live_no_timings: m(`{title}\n\n▶️ YouTube: {url}\n\nYou will get an alert here when it goes live. Reply STOP to turn the alerts off.`, `{title}\n\n▶️ YouTube: {url}\n\nलाइव शुरू होते ही आपको यहाँ अलर्ट मिलेगा। अलर्ट बंद करने के लिए STOP लिखें।`, `{title}\n\n▶️ YouTube: {url}\n\nLive shuru hote hi aapko yahan alert milega. Alerts band karne ke liye STOP likhein.`, `{title}\n\n▶️ YouTube: {url}\n\nਲਾਈਵ ਸ਼ੁਰੂ ਹੁੰਦੇ ਹੀ ਤੁਹਾਨੂੰ ਇੱਥੇ ਅਲਰਟ ਮਿਲੇਗਾ। ਅਲਰਟ ਬੰਦ ਕਰਨ ਲਈ STOP ਲਿਖੋ।`),
  live_none: m(`Live Kirtan details are not available right now. {support}`, `लाइव कीर्तन की जानकारी अभी उपलब्ध नहीं है। {support}`, `Live Kirtan ki jankari abhi available nahi hai. {support}`, `ਲਾਈਵ ਕੀਰਤਨ ਦੀ ਜਾਣਕਾਰੀ ਹੁਣ ਉਪਲਬਧ ਨਹੀਂ ਹੈ। {support}`),
  alerts_off: m(`Live Kirtan alerts are now OFF. Reply SUBSCRIBE any time to turn them on again.`, `लाइव कीर्तन अलर्ट अब बंद हैं। दोबारा चालू करने के लिए कभी भी SUBSCRIBE लिखें।`, `Live Kirtan alerts ab band hain. Dobara chalu karne ke liye kabhi bhi SUBSCRIBE likhein.`, `ਲਾਈਵ ਕੀਰਤਨ ਅਲਰਟ ਹੁਣ ਬੰਦ ਹਨ। ਦੁਬਾਰਾ ਚਾਲੂ ਕਰਨ ਲਈ ਕਦੇ ਵੀ SUBSCRIBE ਲਿਖੋ।`),
  alerts_on: m(`Live Kirtan alerts are ON. You will get a message here when the kirtan goes live.`, `लाइव कीर्तन अलर्ट चालू हैं। कीर्तन लाइव होते ही आपको यहाँ संदेश मिलेगा।`, `Live Kirtan alerts chalu hain. Kirtan live hote hi aapko yahan message milega.`, `ਲਾਈਵ ਕੀਰਤਨ ਅਲਰਟ ਚਾਲੂ ਹਨ। ਕੀਰਤਨ ਲਾਈਵ ਹੁੰਦੇ ਹੀ ਤੁਹਾਨੂੰ ਇੱਥੇ ਸੁਨੇਹਾ ਮਿਲੇਗਾ।`),
  slot_daily: m('Daily', 'रोज़', 'Roz', 'ਹਰ ਰੋਜ਼'),
  slot_once: m('On {date}', '{date} को', '{date} ko', '{date} ਨੂੰ'),
  days_short: m('Sun,Mon,Tue,Wed,Thu,Fri,Sat', 'रवि,सोम,मंगल,बुध,गुरु,शुक्र,शनि', 'Ravi,Som,Mangal,Budh,Guru,Shukra,Shani', 'ਐਤ,ਸੋਮ,ਮੰਗਲ,ਬੁੱਧ,ਵੀਰ,ਸ਼ੁੱਕਰ,ਸ਼ਨੀ'),

  /* ---------------------------------------------------------------- donation campaigns */
  camp_row_d: m('₹{raised} of ₹{target} raised', '₹{target} में से ₹{raised} जमा', '₹{target} mein se ₹{raised} jama', '₹{target} ਵਿੱਚੋਂ ₹{raised} ਜਮ੍ਹਾਂ'),
  camp_body: m(
    `*{title}*\n\n{desc}\n\n🎯 Goal: ₹{target}\n💰 Raised: ₹{raised} ({percent}%)\n\nChoose an amount to donate.`,
    `*{title}*\n\n{desc}\n\n🎯 लक्ष्य: ₹{target}\n💰 जमा: ₹{raised} ({percent}%)\n\nदान की राशि चुनें।`,
    `*{title}*\n\n{desc}\n\n🎯 Goal: ₹{target}\n💰 Jama: ₹{raised} ({percent}%)\n\nDonation ki rakam chunein.`,
    `*{title}*\n\n{desc}\n\n🎯 ਟੀਚਾ: ₹{target}\n💰 ਜਮ੍ਹਾਂ: ₹{raised} ({percent}%)\n\nਦਾਨ ਦੀ ਰਕਮ ਚੁਣੋ।`,
  ),
  camp_gone: m(`This campaign is not accepting donations right now.`, `यह अभियान अभी दान स्वीकार नहीं कर रहा है।`, `Yeh campaign abhi donation nahi le raha hai.`, `ਇਹ ਮੁਹਿੰਮ ਹੁਣ ਦਾਨ ਸਵੀਕਾਰ ਨਹੀਂ ਕਰ ਰਹੀ।`),
  donate_link_campaign: m(
    `Namaste{name}! To donate ₹{amount} to “{campaign}” (Amrit Vela Trust), please pay on this secure Razorpay link:\n{url}\n\nReference: {ref}\nAs soon as the payment is confirmed, your PDF receipt will be sent to this WhatsApp chat.`,
    `नमस्ते{name}! अमृत वेला ट्रस्ट के “{campaign}” अभियान में ₹{amount} दान करने के लिए कृपया इस सुरक्षित Razorpay लिंक पर भुगतान करें:\n{url}\n\nसंदर्भ: {ref}\nभुगतान की पुष्टि होते ही आपकी PDF रसीद इसी WhatsApp चैट पर भेज दी जाएगी।`,
    `Namaste{name}! Amrit Vela Trust ke “{campaign}” campaign mein ₹{amount} donation karne ke liye is secure Razorpay link par payment karein:\n{url}\n\nReference: {ref}\nPayment confirm hote hi aapki PDF receipt isi WhatsApp par bhej di jayegi.`,
    `ਸਤ ਸ੍ਰੀ ਅਕਾਲ{name}! ਅੰਮ੍ਰਿਤ ਵੇਲਾ ਟਰੱਸਟ ਦੀ “{campaign}” ਮੁਹਿੰਮ ਵਿੱਚ ₹{amount} ਦਾਨ ਕਰਨ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਇਸ ਸੁਰੱਖਿਅਤ Razorpay ਲਿੰਕ ਤੇ ਭੁਗਤਾਨ ਕਰੋ:\n{url}\n\nਹਵਾਲਾ: {ref}\nਭੁਗਤਾਨ ਦੀ ਪੁਸ਼ਟੀ ਹੁੰਦੇ ਹੀ ਤੁਹਾਡੀ PDF ਰਸੀਦ ਇਸੇ WhatsApp ਤੇ ਭੇਜ ਦਿੱਤੀ ਜਾਵੇਗੀ।`,
  ),
  donate_campaigns_section: m('Campaigns', 'अभियान', 'Campaigns', 'ਮੁਹਿੰਮਾਂ'),
  donate_trusts_section: m('Trusts', 'ट्रस्ट', 'Trusts', 'ਟਰੱਸਟ'),
} as const satisfies Record<string, L>;
