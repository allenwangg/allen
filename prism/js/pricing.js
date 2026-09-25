/* Prism — pricing. The one file to edit to start charging.

   What is free, always: the first lesson of every course, the courses listed in
   freeCourses end to end, reviews on anything you have learned, search, paths,
   practice, backup. What Pro unlocks: every other lesson in the library.

   To sell:
   1. Create a Stripe Payment Link. Under "After payment", redirect to your app
      URL with the session id appended, exactly like this:
        https://your-app.example/?session_id={CHECKOUT_SESSION_ID}
   2. Deploy prism/ on Vercel with STRIPE_SECRET_KEY set. api/verify.js is the
      entire backend: it confirms the session was paid and issues a signed
      license token the app keeps. Nothing else to run.
   3. Set provider to 'stripe' and put the Payment Link in the lifetime plan
      below. To offer a second option — a monthly plan makes a lifetime price
      look like the obvious choice — add another plan with its own Payment
      Link; the checkout must be a subscription for the app to treat it as one.
   4. Set siteUrl to where the app lives, so shared links carry a preview card.

   Until then provider is 'none': the app runs as a free preview, and the key
   PRISM-DEMO unlocks Pro locally so the whole flow can be tried. */
window.PRICING = {
  provider: 'none',            // 'stripe' | 'none'
  siteUrl: '',                 // e.g. 'https://prism.example' — used for social preview cards
  verifyUrl: 'api/verify',     // relative, so it works under any deploy path
  plans: [
    // The first plan is the headline. featured: true marks the one to steer to.
    { id: 'lifetime', label: 'Lifetime', amount: '$29', term: 'once — yours forever, on every device',
      checkoutUrl: '', featured: true }
    // , { id: 'month', label: 'Monthly', amount: '$5', term: 'a month, cancel any time', checkoutUrl: '' }
  ],
  freeLessonsPerCourse: 1,
  freeCourses: [
    'cognitive-biases', 'learning-how-to-learn', 'stoicism', 'psychology-of-money',
    'big-ideas-physics', 'science-of-sleep', 'how-to-live-forever', 'story-of-evolution',
    'art-of-storytelling', 'islamic-golden-age', 'how-internet-works', 'music-theory'
  ]
};
