/**
 * Verified Trust information used by the WhatsApp assistant. Every fact below comes from the Trust's own website
 * pages (About, Activities, Achievements, Future Plans, Contact, Legal) or from how this system actually behaves.
 * Admins can edit/replace this from Admin > Knowledge; bootstrap only auto-updates documents that still carry
 * a KB_VERSION marker (i.e. were never hand-edited).
 */
export const TRUST_KNOWLEDGE_VERSION = 2;
export const TRUST_KNOWLEDGE_TITLE = 'Trust FAQ & Policies';

export const trustKnowledge = `KB_VERSION:${TRUST_KNOWLEDGE_VERSION}

## About Amrit Vela Trust
Amrit Vela Trust is a public charitable trust incorporated on 04 September 2014, based in Ulhasnagar, Maharashtra. It works across spiritual awakening, hunger eradication, healthcare, emergency relief and education.
The Trust is registered under the Bombay Public Trust Act, 1950 and the Income Tax Act, 1961. The website states it has Section 12A / 80G recognition and an 80G exemption certificate issued by the Commissioner of Income Tax, Pune. For tax-benefit or legal questions, ask the Trust team (6913001300) instead of giving tax advice.

## Mission and vision
The mission is to promote education for weaker sections, encourage devotees to observe Amrit Vela (the early morning hours) through Gurbani-based Katha and Kirtan, and provide essential food and healthcare support to people in need. The Trust aims to make spiritual values visible in everyday life through seva (service).

## Spiritual inspiration
The website names Bhai Sahib Gurpreetsinghji (Rinkuji) as the spiritual inspiration of the Trust, associated with Gurbani-based Katha and Kirtan.

## Online Kirtan relays
More than 500 centres stream daily Kirtan programs on projectors from 2:30 AM to 5:30 AM, helping communities begin the day in Amrit Vela.

## Daily Langar and food seva
Mobile vans and centres distribute food to around 1,50,000 people daily across all centres, as part of hunger eradication.

## Amrit Vela Dharamshala (free accommodation)
The Trust provides free accommodation in Ulhasnagar for worldwide Sangat, connected with participation in the 2:30 AM Sukhmani Saheb Path. Please confirm current availability and arrangements with the Trust team (6913001300) before travelling.

## Medical camps and healthcare
Blood donation, eye checking, thalassemia support and eye donation pledge camps are part of the Trust's healthcare and community support.

## Achievements
The website lists: a Silent Kirtan gathering of about 50,000 people recognised by the World Book of Records; a Prabhat Pheri gathering of about 2.5 lakh people, described as one of the largest reported gatherings; ready food distributed daily to 20,000+ people during COVID-19; and 50 million+ digital views across the Trust's digital reach. The Trust has been recognised twice by the World Book of Records.

## Future plans (planned, not completed)
These are planned projects, not completed facilities: an Amritsar building near Harmandir Sahib with 150 free-rent rooms and a Langar hall; a network of 113 Dukh Nivaran Isthans for Nanak Roti food distribution; an automated Global Kitchen; a free medical hospital; a Higher Secondary School and Junior College; and a Women's Vocational Centre for skills and empowerment.

## Contact details, address, phone, email
Phone / WhatsApp: 6913001300
Email: amritvelatrustlive@gmail.com
Address: Amrit Vela Darbar, Section 26, Ulhasnagar-4, Maharashtra.
No office hours or response time are published; do not promise any. For anything needing a person, write "human" on WhatsApp.

## How to donate
Write "Donation 500" (any amount in whole rupees) on WhatsApp and the bot sends a secure Razorpay payment link. After the payment is confirmed, the PDF receipt is sent on the same WhatsApp chat automatically. Donations can also be made on the Trust website's Donate page. A message mentioning an amount is not a completed donation; it is complete only after the payment is confirmed. To get the receipt again, write "receipt".

## Donation receipts and 80G
Receipts are generated from the donor details and transaction details supplied during the donation. Questions about 80G or tax benefit should go to the Trust team at 6913001300 or amritvelatrustlive@gmail.com.

## Refund and cancellation policy
Donations are meant to support the Trust's charitable work. If a payment was made in error, contact the Trust promptly with the transaction reference. Refund requests, where applicable, are reviewed against the transaction record and payment-provider rules. No refund is guaranteed unless the Trust confirms eligibility.

## Products, shop and orders
The Trust may distribute spiritual or Trust-related resources such as malas, pendrives, dupattas and rumals, subject to availability. Current products, prices and stock are always taken live from the database. To order on WhatsApp write the product name, for example "Nariyal kharidna hai"; the bot asks for name, full address with 6-digit PIN code, shows a summary to confirm, then sends a Razorpay payment link. An order is confirmed only after payment is verified. Write "products" to see the list, or "Nariyal photo" to see a product's photo.

## Shipping and delivery
Delivery on WhatsApp orders costs INR 80, and is free when the product total is INR 1000 or more. Tracking details (courier and AWB) are shared on WhatsApp after dispatch. Delivery timelines depend on the product, destination and courier; the Trust has not published fixed timelines, so do not promise any. For delivery questions contact 6913001300 or amritvelatrustlive@gmail.com. To check an order, send the order number (ORD-...).

## Customer support
For questions that need a person, write "human" on WhatsApp or contact 6913001300 / amritvelatrustlive@gmail.com. Write "menu" at any time to see what the bot can do.
`;
