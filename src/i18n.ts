export type Lang = 'en' | 'el';

const en = {
  title: 'Trick-or-treat map',
  when: 'Saturday 31 October, from 18:00',
  switchTo: 'ΕΛ',
  switchLabel: 'Ελληνικά',

  bannerText: "Enter the group code from Viber to see who's taking part and to add your home.",
  bannerButton: 'Enter code',
  groupCodeTitle: 'Group code',
  groupCodeHelp: 'You can find it in the Viber group message.',
  groupCodeContinue: 'Continue',
  groupCodeWrong: "That group code isn't right. Check the Viber message.",

  addHome: 'Add my home',
  mapView: 'Map view',
  satellite: 'Satellite',
  streetMap: 'Map',
  myLocation: 'Show my location',
  locationOutside: "You're outside the map area.",
  locationOff: 'Location is off for this page. You can still find homes on the map.',
  locationTimeout: "Couldn't find your location yet. Try again in a moment, ideally outdoors.",
  locHelpTitle: 'Turn on location',
  locHelpIntro: "Your phone isn't sharing its location with this page. Websites can't change this themselves, so here's how to do it on this phone:",
  locHelpRetry: 'Try again',
  locHelpWithout: 'You can still use the map without it; only the blue "you are here" dot is missing.',

  homesHere: (n: number) => (n === 1 ? '1 home taking part here' : `${n} homes taking part here`),
  detailsLocked: 'Enter the group code to see names and details.',
  apartmentShort: 'Apt / floor',
  ringShort: 'Ring',
  edit: 'Edit',
  yours: 'Yours',
  close: 'Close',
  emptyMap: 'No homes yet. Be the first to add yours.',

  placeTap: 'Tap your home on the map.',
  placeDrag: 'Drag the pumpkin to the exact spot.',
  placeOutside: 'That spot is outside the map area.',
  sameBuilding: 'Same building as the pin next to it',
  useMyLocation: 'Use my location',
  cancel: 'Cancel',
  next: 'Next',
  back: 'Back',

  formNew: 'Your home',
  formEdit: 'Edit your home',
  formEditAdmin: 'Edit this home',
  optional: 'optional',
  apartment: 'Apartment / floor',
  homeKind: 'Type of home',
  streetName: 'Street name',
  streetNameHint: 'e.g. Lykavitou',
  streetNumber: 'Street number',
  streetNumberHint: 'e.g. 12',
  addressShort: 'Address',
  streetNumberShort: 'No.',
  streetNumberMissing: 'Please enter the street number.',
  printTitle: 'Print or save the map',
  printPrint: 'Print / save as PDF',
  printSaveImage: 'Save as image',
  printUpdated: 'updated',
  printLatLng: 'Latitude, longitude',
  printViberHint: "Viber's browser may not print. Tap ••• / ⋮ and open the link in Safari or Chrome to print.",
  printImageFailed: "Couldn't create the image here. Take a screenshot, or use Print / save as PDF.",
  kindHouse: 'House',
  kindApartment: 'Apartment',
  aptNumber: 'Apartment number',
  aptNumberHint: 'e.g. 302',
  floor: 'Floor',
  floorHint: 'e.g. 3',
  aptNumberMissing: 'Please enter the apartment number.',
  aptShort: 'Apt',
  floorShort: 'Floor',
  apartmentHint: 'e.g. 302 or 3rd floor',
  names: "Parents' first names",
  namesHint: 'e.g. Eleni & Andreas',
  buzzer: 'Which bell to ring',
  buzzerHint: 'Name on the bell or intercom',
  notes: 'Notes',
  notesHint: 'e.g. side gate, ring twice',
  consent:
    'I agree that this location will be visible to anyone with the link, and the details above to anyone with the group code. Everything is deleted automatically from 8 November 2026.',
  addToMap: 'Add to map',
  added: 'Added to the map',
  saveChanges: 'Save changes',
  saved: 'Changes saved',
  movePin: 'Move pin',
  remove: 'Remove my home',
  removeConfirm: "Remove your home from the map? This can't be undone.",
  removeYes: 'Yes, remove',
  removeAdmin: 'Remove this home',
  removeConfirmAdmin: "Remove this home from the map? This can't be undone.",
  admin: 'Admin',
  adminExit: 'Leave admin mode on this phone',
  adminOwnerCode: "Admin view. This home's own edit code:",
  removed: 'Removed from the map',

  codeTitle: 'Your edit code',
  codeHelp: "Keep this code. You'll need it to change or remove your home.",
  copyCode: 'Copy code',
  copied: 'Code copied',
  copyManual: 'Press and hold the code to copy it.',
  viber: 'Send to myself on Viber',
  share: 'Share…',
  done: 'Done',
  shareText: (code: string, link: string) => `My edit code for the trick-or-treat map: ${code}\n${link}`,

  askCodeTitle: 'Enter your edit code',
  askCodeHelp: 'It was shown when the home was added, for example PUMPKIN-417. The organiser can also use the admin code.',
  askCodeLabel: 'Edit code',
  askCodeContinue: 'Continue',

  closed: 'Trick-or-treat is over. Thank you for taking part!',
  loadFailed: "Couldn't load the map. Check your connection and try again.",
  retry: 'Try again',

  err: {
    WRONG_CODE: (n: number) =>
      n > 0
        ? `That code doesn't match this home. ${n} ${n === 1 ? 'try' : 'tries'} left.`
        : "That code doesn't match this home. Too many tries, try again later.",
    LOCKED: (m: number) =>
      m >= 120 ? `Too many wrong codes. Try again in ${Math.ceil(m / 60)} hours.` : `Too many wrong codes. Try again in ${m} minutes.`,
    BUSY: 'Too many tries at once. Wait a moment and try again.',
    NOT_FOUND: 'This home is no longer on the map.',
    OUTSIDE_AREA: 'That spot is outside the map area.',
    TOO_LONG: 'One of the fields is too long.',
    BAD_GROUP_CODE: "That group code isn't right. Check the Viber message.",
    CONSENT_REQUIRED: 'Please tick the box to agree.',
    STREET_NUMBER_REQUIRED: 'Please enter the street number.',
    CLOSED: 'Trick-or-treat is over. The map is closed.',
    NETWORK: "Couldn't reach the map. Check your connection and try again.",
    OTHER: 'Something went wrong. Please try again.',
  },
};

type Dict = typeof en;

const el: Dict = {
  title: 'Χάρτης trick-or-treat',
  when: 'Σάββατο 31 Οκτωβρίου, από τις 18:00',
  switchTo: 'EN',
  switchLabel: 'English',

  bannerText: 'Βάλτε τον κωδικό της ομάδας από το Viber για να δείτε ποιοι συμμετέχουν και να προσθέσετε το σπίτι σας.',
  bannerButton: 'Κωδικός',
  groupCodeTitle: 'Κωδικός ομάδας',
  groupCodeHelp: 'Θα τον βρείτε στο μήνυμα της ομάδας στο Viber.',
  groupCodeContinue: 'Συνέχεια',
  groupCodeWrong: 'Ο κωδικός ομάδας δεν είναι σωστός. Ελέγξτε το μήνυμα στο Viber.',

  addHome: 'Προσθήκη του σπιτιού μου',
  mapView: 'Προβολή χάρτη',
  satellite: 'Δορυφόρος',
  streetMap: 'Χάρτης',
  myLocation: 'Η τοποθεσία μου',
  locationOutside: 'Βρίσκεστε έξω από την περιοχή του χάρτη.',
  locationOff: 'Η τοποθεσία είναι απενεργοποιημένη για αυτή τη σελίδα. Μπορείτε να βρείτε τα σπίτια στον χάρτη.',
  locationTimeout: 'Δεν βρέθηκε ακόμα η τοποθεσία σας. Δοκιμάστε ξανά σε λίγο, καλύτερα σε εξωτερικό χώρο.',
  locHelpTitle: 'Ενεργοποίηση τοποθεσίας',
  locHelpIntro: 'Το κινητό σας δεν μοιράζεται την τοποθεσία του με αυτή τη σελίδα. Οι ιστότοποι δεν μπορούν να το αλλάξουν μόνοι τους, οπότε δείτε πώς γίνεται σε αυτό το κινητό:',
  locHelpRetry: 'Δοκιμάστε ξανά',
  locHelpWithout: 'Μπορείτε να χρησιμοποιήσετε τον χάρτη και χωρίς αυτό· λείπει μόνο η μπλε κουκκίδα «είστε εδώ».',

  homesHere: (n: number) => (n === 1 ? '1 σπίτι συμμετέχει εδώ' : `${n} σπίτια συμμετέχουν εδώ`),
  detailsLocked: 'Βάλτε τον κωδικό ομάδας για να δείτε ονόματα και λεπτομέρειες.',
  apartmentShort: 'Διαμ. / όροφος',
  ringShort: 'Κουδούνι',
  edit: 'Επεξεργασία',
  yours: 'Δικό σας',
  close: 'Κλείσιμο',
  emptyMap: 'Δεν υπάρχουν ακόμα σπίτια. Προσθέστε πρώτοι το δικό σας.',

  placeTap: 'Πατήστε στο σπίτι σας στον χάρτη.',
  placeDrag: 'Σύρετε την κολοκύθα στο σωστό σημείο.',
  placeOutside: 'Αυτό το σημείο είναι έξω από την περιοχή του χάρτη.',
  sameBuilding: 'Ίδιο κτίριο με την καρφίτσα δίπλα',
  useMyLocation: 'Η τοποθεσία μου',
  cancel: 'Ακύρωση',
  next: 'Επόμενο',
  back: 'Πίσω',

  formNew: 'Το σπίτι σας',
  formEdit: 'Επεξεργασία σπιτιού',
  formEditAdmin: 'Επεξεργασία αυτού του σπιτιού',
  optional: 'προαιρετικό',
  apartment: 'Διαμέρισμα / όροφος',
  homeKind: 'Τύπος κατοικίας',
  streetName: 'Όνομα οδού',
  streetNameHint: 'π.χ. Λυκαβηττού',
  streetNumber: 'Αριθμός οδού',
  streetNumberHint: 'π.χ. 12',
  addressShort: 'Διεύθυνση',
  streetNumberShort: 'Αρ.',
  streetNumberMissing: 'Συμπληρώστε τον αριθμό οδού.',
  printTitle: 'Εκτύπωση ή αποθήκευση του χάρτη',
  printPrint: 'Εκτύπωση / αποθήκευση PDF',
  printSaveImage: 'Αποθήκευση ως εικόνα',
  printUpdated: 'ενημέρωση',
  printLatLng: 'Γεωγρ. πλάτος, μήκος',
  printViberHint: 'Το πρόγραμμα περιήγησης του Viber μπορεί να μην εκτυπώνει. Πατήστε ••• / ⋮ και ανοίξτε τον σύνδεσμο στο Safari ή στο Chrome για εκτύπωση.',
  printImageFailed: 'Δεν ήταν δυνατή η δημιουργία εικόνας εδώ. Τραβήξτε στιγμιότυπο οθόνης ή χρησιμοποιήστε Εκτύπωση / αποθήκευση PDF.',
  kindHouse: 'Σπίτι',
  kindApartment: 'Διαμέρισμα',
  aptNumber: 'Αριθμός διαμερίσματος',
  aptNumberHint: 'π.χ. 302',
  floor: 'Όροφος',
  floorHint: 'π.χ. 3',
  aptNumberMissing: 'Συμπληρώστε τον αριθμό του διαμερίσματος.',
  aptShort: 'Διαμ.',
  floorShort: 'Όροφος',
  apartmentHint: 'π.χ. 302 ή 3ος όροφος',
  names: 'Μικρά ονόματα γονιών',
  namesHint: 'π.χ. Ελένη & Ανδρέας',
  buzzer: 'Ποιο κουδούνι να πατήσουν',
  buzzerHint: 'Όνομα στο κουδούνι ή θυροτηλέφωνο',
  notes: 'Σημειώσεις',
  notesHint: 'π.χ. πλαϊνή πόρτα, χτυπήστε δύο φορές',
  consent:
    'Συμφωνώ ότι αυτή η τοποθεσία θα είναι ορατή σε όποιον έχει τον σύνδεσμο και τα παραπάνω στοιχεία σε όποιον έχει τον κωδικό της ομάδας. Όλα διαγράφονται αυτόματα από τις 8 Νοεμβρίου 2026.',
  addToMap: 'Προσθήκη στον χάρτη',
  added: 'Προστέθηκε στον χάρτη',
  saveChanges: 'Αποθήκευση αλλαγών',
  saved: 'Οι αλλαγές αποθηκεύτηκαν',
  movePin: 'Μετακίνηση',
  remove: 'Αφαίρεση του σπιτιού μου',
  removeConfirm: 'Να αφαιρεθεί το σπίτι σας από τον χάρτη; Δεν μπορεί να αναιρεθεί.',
  removeYes: 'Ναι, αφαίρεση',
  removeAdmin: 'Αφαίρεση αυτού του σπιτιού',
  removeConfirmAdmin: 'Να αφαιρεθεί αυτό το σπίτι από τον χάρτη; Δεν μπορεί να αναιρεθεί.',
  admin: 'Διαχείριση',
  adminExit: 'Έξοδος από τη διαχείριση σε αυτό το κινητό',
  adminOwnerCode: 'Προβολή διαχειριστή. Ο κωδικός επεξεργασίας αυτού του σπιτιού:',
  removed: 'Αφαιρέθηκε από τον χάρτη',

  codeTitle: 'Ο κωδικός επεξεργασίας σας',
  codeHelp: 'Κρατήστε αυτόν τον κωδικό. Θα τον χρειαστείτε για να αλλάξετε ή να αφαιρέσετε το σπίτι σας.',
  copyCode: 'Αντιγραφή κωδικού',
  copied: 'Ο κωδικός αντιγράφηκε',
  copyManual: 'Πατήστε παρατεταμένα τον κωδικό για να τον αντιγράψετε.',
  viber: 'Αποστολή στον εαυτό μου στο Viber',
  share: 'Κοινοποίηση…',
  done: 'Τέλος',
  shareText: (code: string, link: string) => `Ο κωδικός επεξεργασίας μου για τον χάρτη trick-or-treat: ${code}\n${link}`,

  askCodeTitle: 'Βάλτε τον κωδικό επεξεργασίας',
  askCodeHelp: 'Εμφανίστηκε όταν προστέθηκε το σπίτι, για παράδειγμα PUMPKIN-417. Ο διοργανωτής μπορεί να χρησιμοποιήσει και τον κωδικό διαχείρισης.',
  askCodeLabel: 'Κωδικός επεξεργασίας',
  askCodeContinue: 'Συνέχεια',

  closed: 'Το trick-or-treat τελείωσε. Ευχαριστούμε για τη συμμετοχή!',
  loadFailed: 'Ο χάρτης δεν φόρτωσε. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.',
  retry: 'Δοκιμάστε ξανά',

  err: {
    WRONG_CODE: (n: number) =>
      n > 0
        ? `Ο κωδικός δεν ταιριάζει με αυτό το σπίτι. ${n === 1 ? 'Απομένει 1 προσπάθεια' : `Απομένουν ${n} προσπάθειες`}.`
        : 'Ο κωδικός δεν ταιριάζει με αυτό το σπίτι. Πολλές προσπάθειες, δοκιμάστε ξανά αργότερα.',
    LOCKED: (m: number) =>
      m >= 120
        ? `Πάρα πολλοί λάθος κωδικοί. Δοκιμάστε ξανά σε ${Math.ceil(m / 60)} ώρες.`
        : `Πάρα πολλοί λάθος κωδικοί. Δοκιμάστε ξανά σε ${m} λεπτά.`,
    BUSY: 'Πολλές προσπάθειες ταυτόχρονα. Περιμένετε λίγο και δοκιμάστε ξανά.',
    NOT_FOUND: 'Αυτό το σπίτι δεν είναι πια στον χάρτη.',
    OUTSIDE_AREA: 'Αυτό το σημείο είναι έξω από την περιοχή του χάρτη.',
    TOO_LONG: 'Ένα από τα πεδία είναι πολύ μεγάλο.',
    BAD_GROUP_CODE: 'Ο κωδικός ομάδας δεν είναι σωστός. Ελέγξτε το μήνυμα στο Viber.',
    CONSENT_REQUIRED: 'Τσεκάρετε το κουτάκι για να συμφωνήσετε.',
    STREET_NUMBER_REQUIRED: 'Συμπληρώστε τον αριθμό οδού.',
    CLOSED: 'Το trick-or-treat τελείωσε. Ο χάρτης έκλεισε.',
    NETWORK: 'Δεν υπάρχει σύνδεση με τον χάρτη. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.',
    OTHER: 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.',
  },
};

export const dict: Record<Lang, Dict> = { en, el };
export type T = Dict;

export function errorText(t: T, e: unknown): string {
  const err = e as { type?: string; info?: Record<string, unknown> | null };
  switch (err?.type) {
    case 'WRONG_CODE':
      return t.err.WRONG_CODE(Number(err.info?.triesLeft ?? 0));
    case 'LOCKED':
      return t.err.LOCKED(Number(err.info?.waitMinutes ?? 15));
    case 'BUSY':
    case 'NOT_FOUND':
    case 'OUTSIDE_AREA':
    case 'TOO_LONG':
    case 'BAD_GROUP_CODE':
    case 'CONSENT_REQUIRED':
    case 'STREET_NUMBER_REQUIRED':
    case 'CLOSED':
    case 'NETWORK':
      return t.err[err.type];
    default:
      return t.err.OTHER;
  }
}
