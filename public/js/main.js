// Mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  const yearEl = document.querySelector('[data-current-year]');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  initNewsletterForms();
});

function initNewsletterForms() {
  document.querySelectorAll('[data-newsletter-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = form.querySelector('[data-form-status]');
      const submitBtn = form.querySelector('button[type="submit"]');
      const email = form.querySelector('input[name="email"]').value.trim();
      const firstName = form.querySelector('input[name="firstName"]')?.value.trim() || '';

      if (status) {
        status.textContent = '';
        status.className = 'form-helper';
      }

      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await fetch('/api/subscribers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, firstName }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Something went wrong. Please try again.');
        }

        form.reset();
        if (status) {
          status.textContent = "You're on the list! Thanks for signing up.";
          status.classList.add('form-helper');
        }
      } catch (err) {
        if (status) {
          status.textContent = err.message;
          status.classList.add('form-error');
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });
}
