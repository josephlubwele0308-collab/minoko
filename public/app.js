const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatIso(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatFr(iso) {
  if (!iso) return 'Choisir';
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return 'Choisir';
  return `${parts[2]} ${MONTHS[parts[1] - 1]} ${parts[0]}`;
}

function closePicker(picker) {
  const panel = picker.querySelector('.date-panel');
  const button = picker.querySelector('.date-button');
  if (panel) panel.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
  picker.classList.remove('is-open');
}

function paintPicker(picker) {
  const grid = picker.querySelector('.date-grid');
  const label = picker.querySelector('[data-month-label]');
  const cursor = picker._cursor;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  label.textContent = `${MONTHS[month]} ${year}`;
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const selected = picker.querySelector('input[type="hidden"]').value;
  grid.replaceChildren();
  for (let index = 0; index < offset; index += 1) grid.appendChild(document.createElement('span'));
  for (let day = 1; day <= days; day += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(day);
    const iso = formatIso(new Date(year, month, day));
    if (iso === selected) button.classList.add('is-selected');
    button.addEventListener('click', () => {
      const input = picker.querySelector('input[type="hidden"]');
      input.value = iso;
      picker.querySelector('.date-value').textContent = formatFr(iso);
      closePicker(picker);
    });
    grid.appendChild(button);
  }
}

function openPicker(picker) {
  document.querySelectorAll('.dropdown[open]').forEach((menu) => { menu.open = false; });
  document.querySelectorAll('.date-picker.is-open').forEach((other) => {
    if (other !== picker) closePicker(other);
  });
  const input = picker.querySelector('input[type="hidden"]');
  const base = input.value ? new Date(`${input.value}T12:00:00`) : new Date();
  picker._cursor = new Date(base.getFullYear(), base.getMonth(), 1);
  paintPicker(picker);
  picker.querySelector('.date-panel').hidden = false;
  picker.querySelector('.date-button').setAttribute('aria-expanded', 'true');
  picker.classList.add('is-open');
}

const stateNode = document.getElementById('page-state');
if (stateNode) {
  const state = JSON.parse(stateNode.textContent);
  const query = document.getElementById('q');
  if (query) query.value = state.q || '';
  ['source', 'theme', 'langue'].forEach((name) => {
    const menu = document.getElementById(`${name}-menu`);
    if (!menu) return;
    const wanted = state[name] || '';
    menu.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.checked = input.value === wanted;
      if (input.checked) {
        const text = input.parentElement.querySelector('span');
        const valueNode = menu.querySelector('.dropdown-value');
        if (text && valueNode) valueNode.textContent = text.textContent;
      }
    });
  });
  ['du', 'au'].forEach((name) => {
    const picker = document.querySelector(`[data-date="${name}"]`);
    if (!picker) return;
    const input = picker.querySelector('input[type="hidden"]');
    input.value = state[name] || '';
    picker.querySelector('.date-value').textContent = formatFr(input.value);
  });
}

document.querySelectorAll('.date-picker').forEach((picker) => {
  picker.querySelector('.date-button').addEventListener('click', () => {
    if (picker.classList.contains('is-open')) closePicker(picker);
    else openPicker(picker);
  });
  picker.querySelectorAll('[data-shift]').forEach((button) => {
    button.addEventListener('click', () => {
      const shift = Number(button.getAttribute('data-shift'));
      const cursor = picker._cursor;
      picker._cursor = new Date(cursor.getFullYear(), cursor.getMonth() + shift, 1);
      paintPicker(picker);
    });
  });
  picker.querySelector('[data-clear]').addEventListener('click', () => {
    picker.querySelector('input[type="hidden"]').value = '';
    picker.querySelector('.date-value').textContent = 'Choisir';
    closePicker(picker);
  });
});

document.querySelectorAll('form').forEach((form) => {
  form.addEventListener('submit', () => {
    if (form.classList.contains('filters')) {
      form.querySelectorAll('input').forEach((input) => {
        if (!input.value) input.disabled = true;
      });
    }
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.setAttribute('aria-busy', 'true');
      const label = button.querySelector('span');
      if (label) label.textContent = form.method.toLowerCase() === 'get' ? 'Filtrage…' : 'Envoi en cours…';
    }
    if (!form.classList.contains('filters')) return;
    const template = document.getElementById('skeleton-cards');
    const list = form.parentElement.querySelector('.grid:not(.skeleton-grid), .state-empty');
    if (template && list) list.replaceWith(template.content.cloneNode(true));
  });
});

document.querySelectorAll('.dropdown').forEach((menu) => {
  const valueNode = menu.querySelector('.dropdown-value');
  const markCurrent = () => {
    menu.querySelectorAll('.dropdown-menu label').forEach((label) => {
      const input = label.querySelector('input');
      label.classList.toggle('is-current', Boolean(input && input.checked));
    });
  };
  markCurrent();
  menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    document.querySelectorAll('.date-picker.is-open').forEach(closePicker);
    document.querySelectorAll('.dropdown[open]').forEach((other) => {
      if (other !== menu) other.open = false;
    });
  });
  menu.querySelectorAll('.dropdown-menu label').forEach((label) => {
    label.addEventListener('click', () => {
      const text = label.querySelector('span');
      if (valueNode && text) valueNode.textContent = text.textContent;
      markCurrent();
      menu.open = false;
    });
  });
});

document.addEventListener('click', (event) => {
  document.querySelectorAll('.dropdown[open]').forEach((menu) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  document.querySelectorAll('.date-picker.is-open').forEach((picker) => {
    if (!picker.contains(event.target)) closePicker(picker);
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('.dropdown[open]').forEach((menu) => {
    menu.open = false;
  });
  document.querySelectorAll('.date-picker.is-open').forEach(closePicker);
});

document.querySelectorAll('[data-toggle-password]').forEach((button) => {
  const input = document.getElementById(button.getAttribute('aria-controls'));
  if (!input) return;
  button.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    const label = button.querySelector('span');
    if (label) label.textContent = show ? 'Masquer' : 'Afficher';
    button.setAttribute('aria-pressed', show ? 'true' : 'false');
    input.focus();
  });
});

const dataNode = document.getElementById('chart-data');
if (dataNode && window.Chart) {
  const data = JSON.parse(dataNode.textContent);
  const font = '"Segoe UI", "Helvetica Neue", sans-serif';
  Chart.defaults.font.family = font;
  Chart.defaults.color = '#1c1915';

  const sources = document.getElementById('chart-sources');
  if (sources) {
    new Chart(sources, {
      type: 'bar',
      data: {
        labels: data.sources.map((row) => row.label),
        datasets: [{
          label: 'Contenus',
          data: data.sources.map((row) => row.count),
          backgroundColor: '#1c3d34',
          borderRadius: 0,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  const themes = document.getElementById('chart-themes');
  if (themes) {
    new Chart(themes, {
      type: 'doughnut',
      data: {
        labels: data.themes.map((row) => row.label),
        datasets: [{
          data: data.themes.map((row) => row.count),
          backgroundColor: ['#1c3d34', '#8d3d24', '#c9842a', '#24556b', '#3f3428', '#6d6458'],
          borderWidth: 0,
        }],
      },
      options: {
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }
}
