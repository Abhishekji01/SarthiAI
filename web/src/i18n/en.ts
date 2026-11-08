/** English (source) strings. Keys are grouped by screen. Add a language by copying this file. */
export const en = {
  'nav.home': 'Home', 'nav.find': 'Find', 'nav.ask': 'Ask', 'nav.askSarthi': 'Ask Sarthi', 'nav.applied': 'Applied', 'nav.roadmap': 'Roadmap', 'nav.admin': 'Campus admin', 'nav.main': 'Main',

  'common.retry': 'Retry', 'common.save': 'Save', 'common.cancel': 'Cancel', 'common.back': 'Back', 'common.continue': 'Continue', 'common.finish': 'Finish', 'common.saving': 'Saving…',
  'common.loading': 'Loading…', 'common.close': 'Close', 'common.optional': 'optional', 'common.preferNotToSay': 'Prefer not to say', 'common.yes': 'Yes', 'common.no': 'No',

  'welcome.tagline1': 'Your future,', 'welcome.tagline2': 'guided.',
  'welcome.point1': 'Verified scholarships, internships & fellowships — every listing cites its official source',
  'welcome.point2': 'Criterion-by-criterion eligibility checks you can trust',
  'welcome.point3': 'Sarthi, an AI guide that only answers from real data',
  'welcome.create': 'Create a free account', 'welcome.haveAccount': 'I already have an account',
  'welcome.fullName': 'Full name', 'welcome.email': 'Email', 'welcome.password': 'Password',
  'welcome.signIn': 'Sign in', 'welcome.createAccount': 'Create account', 'welcome.wait': 'Please wait…',
  'welcome.forgot': 'Forgot password?', 'welcome.newHere': 'New to SarthiAI? ', 'welcome.already': 'Already have an account? ', 'welcome.createLink': 'Create an account',
  'welcome.privacyNote': 'Your profile stays private. Income, home state and other private details are optional and never shared with the AI or your college.',
  'welcome.google': 'Continue with Google',
  'welcome.resetTitle': 'Reset your password', 'welcome.resetHelp': 'Enter the email you signed up with. We’ll send a link to choose a new password.',
  'welcome.sendLink': 'Send reset link', 'welcome.sending': 'Sending…', 'welcome.backToSignIn': 'Back to sign in',
  'welcome.checkEmail': 'Check your email', 'welcome.noEmail': 'Didn’t get it? Check spam, or wait a minute and try again.',

  'home.morning': 'Good morning', 'home.afternoon': 'Good afternoon', 'home.evening': 'Good evening',
  'home.scholarships': 'Scholarships', 'home.internships': 'Internships', 'home.research': 'Research', 'home.hackathons': 'Hackathons',
  'home.nothingOpen': 'Nothing open right now', 'home.openNow': 'Open now', 'home.fitYou': '{n} fit you', 'home.needDetails': '{n} need your details', 'home.closeSoon': '{n} close within 30 days',
  'home.ask': 'Ask Sarthi', 'home.askExample': '“Which scholarships can I apply to this month?”',
  'home.comingUp': 'Coming up', 'home.all': 'All', 'home.matched': 'Matched for you', 'home.seeAll': 'See all', 'home.continue': 'Continue',
  'home.noDates': 'No dates in the next 60 days. Save or track an opportunity to see its deadline here.',
  'home.drafts': 'Drafts', 'home.plan': '90-day plan', 'home.oneSkillAway': '{n} one skill away',

  'find.title': 'Find', 'find.search': 'Search opportunities', 'find.placeholder': 'Try "ML internship" or "girls"', 'find.all': 'All',
  'find.nearMe': 'Near me', 'find.thisWeek': 'This week', 'find.thisMonth': 'This month', 'find.soonest': 'Soonest deadline', 'find.hideIneligible': 'Hide likely not eligible',
  'find.results': '{n} results', 'find.result': '1 result', 'find.filters': 'Filters', 'find.saveSearch': 'Save this search', 'find.savedSearches': 'Saved searches', 'find.clear': 'Clear',

  'profile.title': 'Profile', 'profile.edit': 'Edit profile', 'profile.language': 'Language', 'profile.languageHint': 'Sarthi also replies in the language you write in.',
  'profile.reminders': 'Reminders', 'profile.signOut': 'Sign out', 'profile.signOutAll': 'Sign out of all devices', 'profile.delete': 'Delete account',
  'profile.privacy': 'Privacy & data', 'profile.saved': 'Saved opportunities', 'profile.drafts': 'Drafts', 'profile.documents': 'Your documents',

  'onboarding.step': 'Step {n} of {total}', 'onboarding.skip': 'Skip for now', 'onboarding.welcome': 'Welcome, {name}. ',
  'onboarding.s1': 'Where do you study?', 'onboarding.s1sub': 'Campus notices and college-only opportunities depend on this.',
  'onboarding.s2': 'Your course', 'onboarding.s2sub': 'Eligibility checks compare these with each listing’s official criteria.',
  'onboarding.s3': 'Skills & goals', 'onboarding.s3sub': 'Sarthi ranks matches by what you know and where you want to go.',
  'onboarding.s4': 'Preferences', 'onboarding.s4sub': 'All optional. You can change everything later in Profile.',

  'notFound.title': 'Page not found', 'notFound.body': 'This link may be old or mistyped. Nothing was changed.', 'notFound.home': 'Go to Home', 'notFound.find': 'Find opportunities', 'notFound.site': 'Go to SarthiAI',
  'verify.banner': 'Confirm {email} so SarthiAI can email you reminders and alerts.', 'verify.resend': 'Resend link', 'verify.hide': 'Hide for now',
};

export type MessageKey = keyof typeof en;
