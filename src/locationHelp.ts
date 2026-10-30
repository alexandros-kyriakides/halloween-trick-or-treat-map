// Works out which phone/browser the page is running in, so the location help can show the
// exact steps for it. Websites can't open phone settings, so these steps are the best we can do.
import type { Lang } from './i18n';

export type Platform = 'ios-viber' | 'ios-safari' | 'ios-chrome' | 'ios-other' | 'android-viber' | 'android-chrome' | 'android-other' | 'other';

export function detectPlatform(ua: string = navigator.userAgent, touchMac = navigator.maxTouchPoints > 1): Platform {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchMac);
  const android = /Android/i.test(ua);
  const viber = /Viber/i.test(ua);
  if (ios) {
    if (viber) return 'ios-viber';
    if (/CriOS/i.test(ua)) return 'ios-chrome';
    if (/FxiOS|EdgiOS|OPiOS/i.test(ua)) return 'ios-other';
    if (/Safari/i.test(ua)) return 'ios-safari';
    return 'ios-other'; // other in-app browsers
  }
  if (android) {
    if (viber) return 'android-viber';
    if (/Chrome/i.test(ua) && !/SamsungBrowser|Firefox|EdgA|OPR|; wv\)/i.test(ua)) return 'android-chrome';
    return 'android-other';
  }
  return 'other';
}

const STEPS: Record<Lang, Record<Platform, string[]>> = {
  en: {
    'ios-viber': [
      'Open the iPhone Settings app → Privacy & Security → Location Services, and turn it on.',
      'In the same list, tap Viber → While Using the App.',
      'Come back here and tap Try again. Or tap ••• at the bottom and choose Open in Safari.',
    ],
    'ios-safari': [
      'Open the iPhone Settings app → Privacy & Security → Location Services, and turn it on.',
      'In the same list, tap Safari Websites → While Using the App.',
      'Back here, tap aA in the address bar → Website Settings → Location → Allow.',
      'Tap Try again.',
    ],
    'ios-chrome': [
      'Open the iPhone Settings app → Privacy & Security → Location Services, and turn it on.',
      'In the same list, tap Chrome → While Using the App.',
      'Come back here and tap Try again.',
    ],
    'ios-other': [
      'Open the iPhone Settings app → Privacy & Security → Location Services, and turn it on.',
      'In the same list, find this app and choose While Using the App.',
      'Come back here and tap Try again, or open the link in Safari.',
    ],
    'android-viber': [
      'Swipe down from the top of the screen and turn on Location.',
      'Open Settings → Apps → Viber → Permissions → Location → Allow only while using the app.',
      'Come back here and tap Try again. Or tap ⋮ and open the link in Chrome.',
    ],
    'android-chrome': [
      'Swipe down from the top of the screen and turn on Location.',
      'In Chrome, tap the icon at the left of the address bar → Permissions → Location → Allow.',
      'If Chrome itself is blocked: Settings → Apps → Chrome → Permissions → Location → Allow.',
      'Tap Try again.',
    ],
    'android-other': [
      'Swipe down from the top of the screen and turn on Location.',
      'Open Settings → Apps → this browser → Permissions → Location → Allow.',
      'Come back here and tap Try again, or open the link in Chrome.',
    ],
    other: [
      'Turn on location for this device.',
      "Allow location for this website in the browser's site settings (usually the icon left of the address).",
      'Tap Try again.',
    ],
  },
  el: {
    'ios-viber': [
      'Ανοίξτε τις Ρυθμίσεις του iPhone → Απόρρητο και ασφάλεια → Υπηρεσίες τοποθεσίας και ενεργοποιήστε τις.',
      'Στην ίδια λίστα, πατήστε Viber → Κατά τη χρήση της εφαρμογής.',
      'Επιστρέψτε εδώ και πατήστε Δοκιμάστε ξανά. Ή πατήστε ••• κάτω και επιλέξτε Άνοιγμα στο Safari.',
    ],
    'ios-safari': [
      'Ανοίξτε τις Ρυθμίσεις του iPhone → Απόρρητο και ασφάλεια → Υπηρεσίες τοποθεσίας και ενεργοποιήστε τις.',
      'Στην ίδια λίστα, πατήστε Ιστότοποι Safari → Κατά τη χρήση της εφαρμογής.',
      'Εδώ, πατήστε aA στη γραμμή διεύθυνσης → Ρυθμίσεις ιστότοπου → Τοποθεσία → Να επιτρέπεται.',
      'Πατήστε Δοκιμάστε ξανά.',
    ],
    'ios-chrome': [
      'Ανοίξτε τις Ρυθμίσεις του iPhone → Απόρρητο και ασφάλεια → Υπηρεσίες τοποθεσίας και ενεργοποιήστε τις.',
      'Στην ίδια λίστα, πατήστε Chrome → Κατά τη χρήση της εφαρμογής.',
      'Επιστρέψτε εδώ και πατήστε Δοκιμάστε ξανά.',
    ],
    'ios-other': [
      'Ανοίξτε τις Ρυθμίσεις του iPhone → Απόρρητο και ασφάλεια → Υπηρεσίες τοποθεσίας και ενεργοποιήστε τις.',
      'Στην ίδια λίστα, βρείτε αυτή την εφαρμογή και επιλέξτε Κατά τη χρήση της εφαρμογής.',
      'Επιστρέψτε εδώ και πατήστε Δοκιμάστε ξανά, ή ανοίξτε τον σύνδεσμο στο Safari.',
    ],
    'android-viber': [
      'Σύρετε από το πάνω μέρος της οθόνης και ενεργοποιήστε την Τοποθεσία.',
      'Ανοίξτε Ρυθμίσεις → Εφαρμογές → Viber → Άδειες → Τοποθεσία → Να επιτρέπεται μόνο κατά τη χρήση.',
      'Επιστρέψτε εδώ και πατήστε Δοκιμάστε ξανά. Ή πατήστε ⋮ και ανοίξτε τον σύνδεσμο στο Chrome.',
    ],
    'android-chrome': [
      'Σύρετε από το πάνω μέρος της οθόνης και ενεργοποιήστε την Τοποθεσία.',
      'Στο Chrome, πατήστε το εικονίδιο αριστερά της διεύθυνσης → Άδειες → Τοποθεσία → Να επιτρέπεται.',
      'Αν είναι μπλοκαρισμένο το ίδιο το Chrome: Ρυθμίσεις → Εφαρμογές → Chrome → Άδειες → Τοποθεσία → Να επιτρέπεται.',
      'Πατήστε Δοκιμάστε ξανά.',
    ],
    'android-other': [
      'Σύρετε από το πάνω μέρος της οθόνης και ενεργοποιήστε την Τοποθεσία.',
      'Ανοίξτε Ρυθμίσεις → Εφαρμογές → αυτό το πρόγραμμα περιήγησης → Άδειες → Τοποθεσία → Να επιτρέπεται.',
      'Επιστρέψτε εδώ και πατήστε Δοκιμάστε ξανά, ή ανοίξτε τον σύνδεσμο στο Chrome.',
    ],
    other: [
      'Ενεργοποιήστε την τοποθεσία στη συσκευή.',
      'Επιτρέψτε την τοποθεσία για αυτόν τον ιστότοπο στις ρυθμίσεις ιστότοπου του προγράμματος περιήγησης.',
      'Πατήστε Δοκιμάστε ξανά.',
    ],
  },
};

export function locationSteps(lang: Lang, platform: Platform = detectPlatform()): string[] {
  return STEPS[lang][platform];
}
