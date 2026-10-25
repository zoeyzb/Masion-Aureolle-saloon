const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    imageCache.set(src, img.decode().catch(() => {}));
  }
  return imageCache.get(src);
}

/* ---------- Navigation ---------- */
const topbar = document.getElementById('topbar');
addEventListener('scroll', () => topbar.classList.toggle('scrolled', scrollY > 30), { passive: true });
const menu = document.getElementById('menu');
const navlinks = document.getElementById('navlinks');
menu.addEventListener('click', () => {
  const open = navlinks.classList.toggle('open');
  menu.setAttribute('aria-expanded', open);
});
navlinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
  navlinks.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
}));

/* ---------- Scroll reveals ---------- */
document.querySelectorAll('[data-stagger]').forEach((group) => {
  [...group.children].forEach((child, i) => child.style.setProperty('--d', `${(i * 0.09).toFixed(2)}s`));
});
const revealTargets = document.querySelectorAll('.reveal, .reveal-title, .reveal-media');
if (reduceMotion) {
  revealTargets.forEach((el) => el.classList.add('visible'));
} else {
  const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('visible');
    revealObserver.unobserve(entry.target);
  }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  revealTargets.forEach((el) => revealObserver.observe(el));
}

/* ---------- Depth engine: scroll parallax, zoom and hero pointer depth ----------
   Hero layers   data-hero-y="0.2"     translate by scrollY * value (negative = faster than the page)
                 data-hero-zoom="0.1"  scale up to 1 + value while the hero scrolls away
                 data-hero-fade        fade out while the hero scrolls away
                 data-pointer="8"      follow the pointer by up to ±value/2 px
   Page items    data-speed="40"       drift ±value px across the viewport (positive = foreground)
                 data-media="0.08"     image inside a cropped frame: slow push-out zoom + drift
                 data-sheet="0.05"     panel scales up from 1 - value as it arrives
                 data-lean="8"         panel tilts back by value deg as it arrives, then settles flat */
function initDepth() {
  if (reduceMotion) return;
  const hero = document.querySelector('.hero');
  const mobileFactor = finePointer ? 1 : 0.6;
  const heroLayers = [...document.querySelectorAll('[data-hero-y], [data-hero-zoom], [data-pointer], [data-hero-fade]')].map((el) => ({
    el,
    y: Number(el.dataset.heroY || 0) * mobileFactor,
    zoom: Number(el.dataset.heroZoom || 0),
    fade: 'heroFade' in el.dataset,
    pointer: finePointer ? Number(el.dataset.pointer || 0) : 0,
  }));
  const items = [...document.querySelectorAll('[data-speed], [data-media], [data-sheet], [data-lean]')].map((el) => ({
    el,
    anchor: 'media' in el.dataset ? el.parentElement : el,
    speed: Number(el.dataset.speed || 0) * mobileFactor,
    media: 'media' in el.dataset ? Number(el.dataset.media || 0.08) : 0,
    sheet: Number(el.dataset.sheet || 0),
    lean: Number(el.dataset.lean || 0) * mobileFactor,
    top: 0,
    height: 0,
    active: false,
  }));

  let viewport = innerHeight;
  let heroHeight = hero.offsetHeight;
  let queued = false;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  // offsetTop ignores transforms, so measuring never feeds back into the motion we apply.
  const pageTop = (el) => {
    let y = 0;
    for (let node = el; node; node = node.offsetParent) y += node.offsetTop;
    return y;
  };
  function measure() {
    viewport = innerHeight;
    heroHeight = hero.offsetHeight;
    items.forEach((item) => {
      item.top = pageTop(item.anchor);
      item.height = item.anchor.offsetHeight;
    });
    request();
  }

  function frame() {
    queued = false;
    const y = scrollY;
    pointer.x += (pointer.tx - pointer.x) * 0.07;
    pointer.y += (pointer.ty - pointer.y) * 0.07;
    const settling = Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > 0.0005;

    if (y < heroHeight * 1.1) {
      const progress = clamp(y / heroHeight, 0, 1);
      for (const layer of heroLayers) {
        const tx = pointer.x * layer.pointer;
        const ty = pointer.y * layer.pointer * 0.6 + y * layer.y;
        layer.el.style.translate = `${tx.toFixed(2)}px ${ty.toFixed(2)}px`;
        if (layer.zoom) layer.el.style.scale = (1 + progress * layer.zoom).toFixed(4);
        if (layer.fade) layer.el.style.opacity = clamp(1 - progress * 1.2, 0, 1).toFixed(3);
      }
    }

    for (const item of items) {
      if (!item.active) continue;
      // t: 1 as the element enters at the bottom, 0 when centred, -1 as it leaves at the top.
      const centre = item.top - y + item.height / 2 - viewport / 2;
      const t = clamp(centre / ((viewport + item.height) / 2), -1, 1);
      const { style } = item.el;
      if (item.speed) style.translate = `0 ${(t * item.speed).toFixed(2)}px`;
      if (item.media) {
        style.scale = (1.06 + item.media * (t + 1) / 2).toFixed(4);
        style.translate = `0 ${(t * item.height * 0.03).toFixed(2)}px`;
      }
      if (item.sheet) style.scale = (1 - item.sheet * clamp((t - 0.3) / 0.7, 0, 1)).toFixed(4);
      if (item.lean) style.rotate = `x ${(item.lean * clamp((t - 0.05) / 0.75, 0, 1)).toFixed(2)}deg`;
    }

    if (settling) request();
  }
  function request() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  }

  const visibility = new IntersectionObserver((entries) => entries.forEach((entry) => {
    items.filter((item) => item.anchor === entry.target).forEach((item) => { item.active = entry.isIntersecting; });
    request();
  }), { rootMargin: '25% 0px' });
  items.forEach((item) => visibility.observe(item.anchor));

  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', measure);
  addEventListener('load', measure);
  document.fonts?.ready.then(measure);
  new ResizeObserver(measure).observe(document.body);
  if (finePointer) {
    addEventListener('pointermove', (e) => {
      if (scrollY > heroHeight) return;
      pointer.tx = e.clientX / innerWidth - 0.5;
      pointer.ty = e.clientY / innerHeight - 0.5;
      request();
    }, { passive: true });
  }
  measure();
}

/* ---------- Pointer tilt for framed cards ---------- */
function initTilt() {
  if (reduceMotion || !finePointer) return;
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    const max = Number(el.dataset.tilt || 5);
    const glare = document.createElement('span');
    glare.className = 'glare';
    el.classList.add('tilt');
    el.append(glare);
    el.addEventListener('pointerenter', () => el.classList.add('is-tilting'));
    el.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      el.style.setProperty('--rx', `${((0.5 - y) * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((x - 0.5) * max).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('is-tilting');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  });
}

initDepth();
initTilt();

/* ---------- Consultation steps ---------- */
const steps = {
  service: ['Hair artistry', 'Hair, makeup, or nails — start where the mood begins.'],
  experience: ['The full atelier ritual', 'A slower appointment with room to exhale between details.'],
  finish: ['Luminous + lived-in', 'A finish that catches the light without asking for attention.'],
};
const consultSteps = [...document.querySelectorAll('.consult-step')];
const consultLine = document.getElementById('consultLine');
let consultIndex = 0;
let consultTimer;
function activateConsult(index) {
  consultIndex = index;
  consultSteps.forEach((step, i) => {
    const active = i === index;
    step.classList.toggle('active', active);
    step.setAttribute('aria-pressed', String(active));
  });
  document.getElementById('selectionText').textContent = steps[consultSteps[index].dataset.step][0];
}
function startConsultRotation() {
  clearInterval(consultTimer);
  consultTimer = setInterval(() => activateConsult((consultIndex + 1) % consultSteps.length), 4000);
}
consultSteps.forEach((step, index) => step.addEventListener('click', () => { activateConsult(index); startConsultRotation(); }));
consultLine.addEventListener('mouseenter', () => clearInterval(consultTimer));
consultLine.addEventListener('mouseleave', startConsultRotation);
consultLine.addEventListener('focusin', () => clearInterval(consultTimer));
consultLine.addEventListener('focusout', startConsultRotation);
startConsultRotation();

/* ---------- Visual atelier: one comparison slider for every look ----------
   Third-party photographic references, credited in the caption. Nothing here is presented as
   Maison Aurelle client work. Each pair shares one geometry; the frame ratio and focal point
   for each look live in styles.css under `.compare[data-look]`. */
const LOOKS = {
  hair: {
    kind: 'Real result · same client',
    title: 'Smoothing ritual',
    description: 'One client photographed before and after a smoothing treatment: the same hair, the same light, the same angle.',
    before: { src: 'assets/hair-before.webp', alt: 'Long, wavy hair with visible frizz, photographed from behind before a smoothing treatment' },
    after: { src: 'assets/hair-after.webp', alt: 'The same client’s hair from behind after smoothing: straight, glossy and even' },
    labels: ['Before', 'After'],
    legend: ['Natural wave and frizz', 'Smoothing treatment, same client'],
    credit: 'OWA Colors',
    source: 'https://owa-colors.com/en/gallery/',
  },
  makeup: {
    kind: 'Look comparison · two clients',
    title: 'Two finishes, side by side',
    description: 'Not a transformation. Two different clients and two different looks, so you can compare a soft day glam with a luminous bridal finish.',
    before: { src: 'assets/makeup-before.jpg', alt: 'Studio portrait of a client wearing soft, polished day glam makeup with long brunette waves' },
    after: { src: 'assets/makeup-after.jpg', alt: 'A different client in a white strapless dress receiving a luminous bridal makeup finish' },
    labels: ['Look A · Soft glam', 'Look B · Bridal'],
    legend: ['Soft glam: defined brows, warm matte skin', 'Bridal glow: sculpted lids, luminous skin'],
    credit: 'Freckle Face Makeup',
    source: 'https://www.frecklefacemakeup.com/before-and-after.html',
  },
  nails: {
    kind: 'Real result · same client',
    title: 'Natural nail restoration',
    description: 'One documented nail-care case: the same two thumbnails before and after a course of restorative care, without colour or extensions.',
    before: { src: 'assets/nails-case-before.jpg', alt: 'Two thumbnails with ridges, dry cuticles and uneven free edges before nail care' },
    after: { src: 'assets/nails-case-after.jpg', alt: 'The same thumbnails after restorative care: smoother surface, neat cuticles and a natural shine' },
    labels: ['Before', 'After'],
    legend: ['Ridged surface, dry cuticles', 'Smoothed, conditioned, natural shine'],
    credit: 'LOI Nail',
    source: 'https://loi-nail.com/menu/ikusei.html',
  },
};

function initComparison() {
  const compare = document.getElementById('compare');
  const stage = document.getElementById('lookPanel');
  const handle = document.getElementById('compareHandle');
  const beforeImage = document.getElementById('beforeImage');
  const afterImage = document.getElementById('afterImage');
  const beforeLabel = document.getElementById('lookLeftLabel');
  const afterLabel = document.getElementById('lookRightLabel');
  const caption = document.getElementById('lookCaption');
  const tabs = [...document.querySelectorAll('.atelier-tab')];
  let current = 'hair';
  let split = 50;
  let interacted = false;
  let switchToken = 0;

  function setSplit(value, glide = false) {
    split = clamp(value, 0, 100);
    compare.classList.toggle('is-gliding', glide);
    compare.style.setProperty('--split', `${split.toFixed(2)}%`);
    const shown = Math.round(split);
    handle.setAttribute('aria-valuenow', String(shown));
    handle.setAttribute('aria-valuetext', `${shown}% ${LOOKS[current].labels[0]}, ${100 - shown}% ${LOOKS[current].labels[1]}`);
    beforeLabel.classList.toggle('is-hidden', split < 22);
    afterLabel.classList.toggle('is-hidden', split > 78);
  }

  function applyLook(key) {
    const look = LOOKS[key];
    compare.dataset.look = key;
    beforeImage.src = look.before.src;
    beforeImage.alt = look.before.alt;
    afterImage.src = look.after.src;
    afterImage.alt = look.after.alt;
    beforeLabel.textContent = look.labels[0];
    afterLabel.textContent = look.labels[1];
    document.getElementById('lookKind').textContent = look.kind;
    document.getElementById('lookTitle').textContent = look.title;
    document.getElementById('lookDescription').textContent = look.description;
    document.getElementById('legendLeft').textContent = look.legend[0];
    document.getElementById('legendRight').textContent = look.legend[1];
    const source = document.getElementById('atelierSource');
    source.href = look.source;
    source.textContent = `Source: ${look.credit} ↗`;
    handle.setAttribute('aria-label', `Compare ${look.labels[0]} and ${look.labels[1]}`);
    stage.setAttribute('aria-labelledby', `tab-${key}`);
  }

  async function showLook(key) {
    if (key === current) return;
    current = key;
    const token = ++switchToken;
    tabs.forEach((tab) => {
      const selected = tab.dataset.look === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    compare.classList.add('is-switching');
    caption.classList.add('is-switching');
    const look = LOOKS[key];
    await Promise.all([loadImage(look.before.src), loadImage(look.after.src), wait(reduceMotion ? 0 : 320)]);
    if (token !== switchToken) return;
    applyLook(key);
    setSplit(50);
    requestAnimationFrame(() => {
      compare.classList.remove('is-switching');
      caption.classList.remove('is-switching');
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showLook(tab.dataset.look));
    tab.addEventListener('keydown', (e) => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!delta) return;
      e.preventDefault();
      const next = tabs[(index + delta + tabs.length) % tabs.length];
      next.focus();
      showLook(next.dataset.look);
    });
  });

  // Mouse presses act immediately; touch waits for a clearly horizontal gesture so vertical page scrolling never moves the slider.
  const percentAt = (clientX) => {
    const rect = compare.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  };
  let drag = null;
  compare.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    interacted = true;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, engaged: e.pointerType === 'mouse' };
    if (drag.engaged) {
      e.preventDefault();
      compare.setPointerCapture(e.pointerId);
      compare.classList.add('is-dragging');
      setSplit(percentAt(e.clientX), true);
      handle.focus({ preventScroll: true });
    }
  });
  compare.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.engaged) {
      const dx = Math.abs(e.clientX - drag.x);
      if (dx < 6 || dx < Math.abs(e.clientY - drag.y)) return;
      drag.engaged = true;
      compare.setPointerCapture(e.pointerId);
      compare.classList.add('is-dragging');
    }
    setSplit(percentAt(e.clientX));
  });
  const endDrag = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const tapped = !drag.engaged && e.type === 'pointerup';
    drag = null;
    compare.classList.remove('is-dragging');
    if (tapped) setSplit(percentAt(e.clientX), true);
  };
  compare.addEventListener('pointerup', endDrag);
  compare.addEventListener('pointercancel', endDrag);

  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    const next = {
      ArrowLeft: split - step, ArrowDown: split - step, ArrowRight: split + step, ArrowUp: split + step,
      PageDown: split - 10, PageUp: split + 10, Home: 0, End: 100,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    interacted = true;
    setSplit(next, true);
  });

  const preload = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    Object.values(LOOKS).forEach((look) => { loadImage(look.before.src); loadImage(look.after.src); });
    preload.disconnect();
  }, { rootMargin: '800px 0px' });
  preload.observe(compare);

  // A single, gentle sweep the first time the slider is seen, so the interaction explains itself.
  if (!reduceMotion) {
    const invite = new IntersectionObserver(async (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      invite.disconnect();
      for (const value of [38, 62, 50]) {
        await wait(value === 38 ? 650 : 760);
        if (interacted) return;
        setSplit(value, true);
      }
    }, { threshold: 0.6 });
    invite.observe(compare);
  }

  applyLook(current);
  setSplit(50);
}
initComparison();

/* ---------- Client notes ---------- */
const reviews = [
  { text: 'I came in wanting a change. I left feeling like I had finally met my own reflection.', name: 'Noor A.', service: 'Colour + finish / London', image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1000&q=84', caption: 'Client portrait / Noor' },
  { text: 'There is a rare kind of calm here. Every detail felt intentional, never rushed, never overdone.', name: 'Elena M.', service: 'Makeup ritual / Brighton', image: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1000&q=84', caption: 'Client portrait / Elena' },
  { text: 'My hair finally looks like the version I have been trying to describe for years. Soft, strong, completely mine.', name: 'Maya R.', service: 'Cut + movement / Manchester', image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=1000&q=84', caption: 'Client portrait / Maya' },
];
const quoteText = document.getElementById('quoteText');
const quoteImage = document.getElementById('quoteImage');
let reviewIndex = 0;
let reviewToken = 0;
async function renderReview() {
  const review = reviews[reviewIndex];
  const token = ++reviewToken;
  quoteText.classList.add('is-fading');
  quoteImage.classList.add('is-fading');
  await Promise.all([loadImage(review.image), wait(reduceMotion ? 0 : 380)]);
  if (token !== reviewToken) return;
  quoteText.textContent = review.text;
  document.getElementById('quoteName').textContent = review.name;
  document.getElementById('quoteService').textContent = review.service;
  document.getElementById('quoteImageCaption').textContent = review.caption;
  quoteImage.src = review.image;
  quoteText.classList.remove('is-fading');
  quoteImage.classList.remove('is-fading');
}
document.getElementById('quotePrev').addEventListener('click', () => { reviewIndex = (reviewIndex + reviews.length - 1) % reviews.length; renderReview(); });
document.getElementById('quoteNext').addEventListener('click', () => { reviewIndex = (reviewIndex + 1) % reviews.length; renderReview(); });
const reviewPreload = new IntersectionObserver((entries) => {
  if (!entries.some((entry) => entry.isIntersecting)) return;
  reviews.forEach((review) => loadImage(review.image));
  reviewPreload.disconnect();
}, { rootMargin: '600px 0px' });
reviewPreload.observe(quoteImage);

/* ---------- Booking request ---------- */
const bookingModal = document.getElementById('bookingModal');
const openBooking = document.getElementById('openBooking');
const closeBooking = document.getElementById('closeBooking');
const bookingForm = document.getElementById('bookingForm');
const bookingSteps = [...document.querySelectorAll('[data-booking-step]')];
const progressSteps = [...document.querySelectorAll('[data-progress]')];
const bookingState = { service: '', date: '', time: '' };
let bookingStep = 1;
function showBookingStep(step) {
  bookingStep = step;
  bookingSteps.forEach((el) => el.classList.toggle('active', Number(el.dataset.bookingStep) === step));
  progressSteps.forEach((el) => el.classList.toggle('active', Number(el.dataset.progress) <= step));
}
function resetBooking() {
  bookingForm.reset();
  bookingState.service = '';
  bookingState.date = '';
  bookingState.time = '';
  document.querySelectorAll('.booking-option').forEach((o) => o.setAttribute('aria-checked', 'false'));
  document.querySelectorAll('.booking-error').forEach((e) => { e.textContent = ''; });
  document.getElementById('bookingSuccess').hidden = true;
  bookingSteps.forEach((el) => { el.style.display = ''; });
  showBookingStep(1);
}
function openBookingModal() {
  resetBooking();
  bookingModal.classList.add('open');
  bookingModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setTimeout(() => document.querySelector('.booking-option')?.focus(), 250);
}
function closeBookingModal() {
  bookingModal.classList.remove('open');
  bookingModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}
openBooking?.addEventListener('click', openBookingModal);
closeBooking?.addEventListener('click', closeBookingModal);
bookingModal?.querySelectorAll('[data-close-booking]').forEach((el) => el.addEventListener('click', closeBookingModal));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && bookingModal.classList.contains('open')) closeBookingModal(); });
document.querySelectorAll('.booking-option').forEach((option) => option.addEventListener('click', () => {
  document.querySelectorAll('.booking-option').forEach((o) => o.setAttribute('aria-checked', 'false'));
  option.setAttribute('aria-checked', 'true');
  bookingState.service = option.dataset.service;
  document.getElementById('serviceError').textContent = '';
}));
document.querySelectorAll('.booking-next').forEach((button) => button.addEventListener('click', () => {
  if (bookingStep === 1 && !bookingState.service) {
    document.getElementById('serviceError').textContent = 'Choose a service to continue.';
    return;
  }
  if (bookingStep === 2) {
    const date = document.getElementById('bookingDate');
    const time = document.getElementById('bookingTime');
    if (!date.value || !time.value) {
      document.getElementById('dateError').textContent = 'Choose a date and preferred time window.';
      return;
    }
    bookingState.date = date.value;
    bookingState.time = time.value;
    document.getElementById('dateError').textContent = '';
  }
  showBookingStep(bookingStep + 1);
}));
document.querySelectorAll('.booking-back').forEach((button) => button.addEventListener('click', () => showBookingStep(bookingStep - 1)));
const dateField = document.getElementById('bookingDate');
if (dateField) dateField.min = new Date().toISOString().split('T')[0];
bookingForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('bookingName');
  const email = document.getElementById('bookingEmail');
  const error = document.getElementById('detailsError');
  const submit = bookingForm.querySelector('button[type="submit"]');
  if (submit.disabled) return;
  if (!bookingState.service || !bookingState.date || !bookingState.time || !name.value.trim() || !email.validity.valid) {
    error.textContent = 'Complete your service, date, time, name and valid email first.';
    return;
  }
  error.textContent = '';
  submit.disabled = true;
  const oldText = submit.innerHTML;
  submit.textContent = 'Sending request…';
  try {
    const response = await fetch('/api/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: bookingState.service,
        date: bookingState.date,
        time: bookingState.time,
        name: name.value.trim(),
        email: email.value.trim(),
        note: document.getElementById('bookingNote').value.trim(),
        website: document.getElementById('bookingWebsite').value,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'The request could not be sent.');
    bookingSteps.forEach((el) => el.classList.remove('active'));
    document.getElementById('bookingSuccess').hidden = false;
    progressSteps.forEach((el) => el.classList.add('active'));
    document.getElementById('successCopy').textContent = `Your ${bookingState.service.toLowerCase()} request for ${bookingState.date} / ${bookingState.time} has been sent. We'll email you about availability; your appointment is not confirmed yet.`;
  } catch (err) {
    error.textContent = `${err.message || 'Could not send your request.'} You can also email sierra@recoverrevenue.company.`;
  } finally {
    submit.disabled = false;
    submit.innerHTML = oldText;
  }
});
