if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
  const pasteButton = document.querySelector('[data-paste]');
  const textarea = document.querySelector('textarea[name="text"]');
  if (pasteButton && textarea) {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      pasteButton.hidden = true;
    } else {
      pasteButton.addEventListener('click', async () => {
        try {
          textarea.value = await navigator.clipboard.readText();
          textarea.focus();
        } catch {
          alert('Kein Zugriff auf die Zwischenablage – bitte lange tippen und „Einfügen“ wählen.');
        }
      });
    }
  }

  const form = document.getElementById('event-form');
  if (!form) return;
  const allDay = form.querySelector('[data-allday]');
  const time = form.elements.namedItem('time');
  const endTime = form.elements.namedItem('endTime');
  const date = form.elements.namedItem('date');

  const syncAllDay = () => {
    const disabled = allDay.checked;
    time.disabled = disabled;
    endTime.disabled = disabled;
    form.querySelector('.times').classList.toggle('disabled', disabled);
  };
  allDay.addEventListener('change', syncAllDay);
  time.addEventListener('input', () => {
    if (time.value) allDay.checked = false;
    syncAllDay();
  });
  syncAllDay();

  form.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      date.value = chip.dataset.date;
      time.value = chip.dataset.time;
      endTime.value = chip.dataset.end;
      allDay.checked = !chip.dataset.time;
      syncAllDay();
    });
  });

  form.addEventListener('submit', () => {
    form.querySelector('button[type="submit"]').disabled = true;
  });
});
