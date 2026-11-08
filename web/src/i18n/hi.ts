import type { MessageKey } from './en';

/**
 * हिन्दी. Missing keys fall back to English. Please have a native speaker review
 * new strings; keep "SarthiAI" and "Sarthi" untranslated.
 */
export const hi: Partial<Record<MessageKey, string>> = {
  'nav.home': 'होम', 'nav.find': 'खोजें', 'nav.ask': 'पूछें', 'nav.askSarthi': 'सारथी से पूछें', 'nav.applied': 'आवेदन', 'nav.roadmap': 'रोडमैप', 'nav.admin': 'कैंपस एडमिन', 'nav.main': 'मुख्य',

  'common.retry': 'फिर कोशिश करें', 'common.save': 'सेव करें', 'common.cancel': 'रद्द करें', 'common.back': 'पीछे', 'common.continue': 'आगे बढ़ें', 'common.finish': 'पूरा करें', 'common.saving': 'सेव हो रहा है…',
  'common.loading': 'लोड हो रहा है…', 'common.close': 'बंद करें', 'common.optional': 'वैकल्पिक', 'common.preferNotToSay': 'नहीं बताना चाहते', 'common.yes': 'हाँ', 'common.no': 'नहीं',

  'welcome.tagline1': 'आपका भविष्य,', 'welcome.tagline2': 'सही दिशा में।',
  'welcome.point1': 'सत्यापित स्कॉलरशिप, इंटर्नशिप और फ़ेलोशिप — हर लिस्टिंग के साथ उसका आधिकारिक स्रोत',
  'welcome.point2': 'हर पात्रता शर्त की अलग-अलग जाँच, जिस पर आप भरोसा कर सकें',
  'welcome.point3': 'सारथी, एक AI गाइड जो सिर्फ़ असली जानकारी से जवाब देता है',
  'welcome.create': 'मुफ़्त अकाउंट बनाएँ', 'welcome.haveAccount': 'मेरा पहले से अकाउंट है',
  'welcome.fullName': 'पूरा नाम', 'welcome.email': 'ईमेल', 'welcome.password': 'पासवर्ड',
  'welcome.signIn': 'साइन इन करें', 'welcome.createAccount': 'अकाउंट बनाएँ', 'welcome.wait': 'कृपया रुकें…',
  'welcome.forgot': 'पासवर्ड भूल गए?', 'welcome.newHere': 'SarthiAI पर नए हैं? ', 'welcome.already': 'पहले से अकाउंट है? ', 'welcome.createLink': 'अकाउंट बनाएँ',
  'welcome.privacyNote': 'आपकी प्रोफ़ाइल निजी रहती है। आय, गृह राज्य और अन्य निजी जानकारी वैकल्पिक है और AI या आपके कॉलेज के साथ कभी साझा नहीं की जाती।',
  'welcome.google': 'Google से जारी रखें',
  'welcome.resetTitle': 'पासवर्ड रीसेट करें', 'welcome.resetHelp': 'जिस ईमेल से साइन अप किया था, वह लिखें। हम नया पासवर्ड चुनने का लिंक भेजेंगे।',
  'welcome.sendLink': 'रीसेट लिंक भेजें', 'welcome.sending': 'भेजा जा रहा है…', 'welcome.backToSignIn': 'साइन इन पर वापस जाएँ',
  'welcome.checkEmail': 'अपना ईमेल देखें', 'welcome.noEmail': 'ईमेल नहीं मिला? स्पैम फ़ोल्डर देखें, या एक मिनट बाद फिर कोशिश करें।',

  'home.morning': 'सुप्रभात', 'home.afternoon': 'नमस्कार', 'home.evening': 'शुभ संध्या',
  'home.scholarships': 'स्कॉलरशिप', 'home.internships': 'इंटर्नशिप', 'home.research': 'रिसर्च', 'home.hackathons': 'हैकाथॉन',
  'home.nothingOpen': 'अभी कुछ खुला नहीं है', 'home.openNow': 'अभी खुला है', 'home.fitYou': '{n} आपके लिए सही', 'home.needDetails': '{n} में आपकी जानकारी चाहिए', 'home.closeSoon': '{n} अगले 30 दिनों में बंद',
  'home.ask': 'सारथी से पूछें', 'home.askExample': '“इस महीने मैं किन स्कॉलरशिप के लिए आवेदन कर सकता/सकती हूँ?”',
  'home.comingUp': 'आने वाली तारीखें', 'home.all': 'सभी', 'home.matched': 'आपके लिए मिलान', 'home.seeAll': 'सभी देखें', 'home.continue': 'जारी रखें',
  'home.noDates': 'अगले 60 दिनों में कोई तारीख नहीं। किसी अवसर को सेव या ट्रैक करें, उसकी अंतिम तिथि यहाँ दिखेगी।',
  'home.drafts': 'ड्राफ़्ट', 'home.plan': '90-दिन की योजना', 'home.oneSkillAway': '{n} बस एक स्किल दूर',

  'find.title': 'खोजें', 'find.search': 'अवसर खोजें', 'find.placeholder': 'जैसे "ML internship" या "girls"', 'find.all': 'सभी',
  'find.nearMe': 'मेरे पास', 'find.thisWeek': 'इस हफ़्ते', 'find.thisMonth': 'इस महीने', 'find.soonest': 'सबसे नज़दीकी अंतिम तिथि', 'find.hideIneligible': 'शायद अपात्र वाले छिपाएँ',
  'find.results': '{n} नतीजे', 'find.result': '1 नतीजा', 'find.filters': 'फ़िल्टर', 'find.saveSearch': 'यह खोज सेव करें', 'find.savedSearches': 'सेव की गई खोजें', 'find.clear': 'हटाएँ',

  'profile.title': 'प्रोफ़ाइल', 'profile.edit': 'प्रोफ़ाइल बदलें', 'profile.language': 'भाषा', 'profile.languageHint': 'आप जिस भाषा में लिखेंगे, सारथी उसी में जवाब देगा।',
  'profile.reminders': 'रिमाइंडर', 'profile.signOut': 'साइन आउट', 'profile.signOutAll': 'सभी डिवाइस से साइन आउट', 'profile.delete': 'अकाउंट हटाएँ',
  'profile.privacy': 'निजता और डेटा', 'profile.saved': 'सेव किए गए अवसर', 'profile.drafts': 'ड्राफ़्ट', 'profile.documents': 'आपके दस्तावेज़',

  'onboarding.step': 'चरण {n} / {total}', 'onboarding.skip': 'अभी छोड़ें', 'onboarding.welcome': 'स्वागत है, {name}। ',
  'onboarding.s1': 'आप कहाँ पढ़ते हैं?', 'onboarding.s1sub': 'कैंपस सूचनाएँ और कॉलेज-विशेष अवसर इसी पर निर्भर करते हैं।',
  'onboarding.s2': 'आपका कोर्स', 'onboarding.s2sub': 'पात्रता जाँच इन्हें हर लिस्टिंग की आधिकारिक शर्तों से मिलाती है।',
  'onboarding.s3': 'स्किल और लक्ष्य', 'onboarding.s3sub': 'सारथी आपकी जानकारी और लक्ष्य के हिसाब से अवसर क्रम में रखता है।',
  'onboarding.s4': 'पसंद', 'onboarding.s4sub': 'सब वैकल्पिक है। बाद में प्रोफ़ाइल में सब बदल सकते हैं।',

  'notFound.title': 'पेज नहीं मिला', 'notFound.body': 'यह लिंक पुराना या गलत हो सकता है। कुछ भी बदला नहीं गया।', 'notFound.home': 'होम पर जाएँ', 'notFound.find': 'अवसर खोजें', 'notFound.site': 'SarthiAI पर जाएँ',
  'verify.banner': '{email} की पुष्टि करें, ताकि SarthiAI आपको रिमाइंडर और अलर्ट ईमेल कर सके।', 'verify.resend': 'लिंक फिर भेजें', 'verify.hide': 'अभी छिपाएँ',
};
