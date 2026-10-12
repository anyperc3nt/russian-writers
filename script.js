(() => {
  'use strict';
  const START = 1700;
  const END = 2026;
  const ROW = 43;
  const GUTTER = 160;
  const EDGE_X = GUTTER - 4;
  const TYPES = {
    'дружба': '#8f3f36',
    'встреча': '#b3935e',
    'переписка': '#5f7386',
    'сотрудничество': '#577063',
    'полемика': '#827082'
  };
  const writers = window.WRITERS.slice().sort((a, b) => a.birth - b.birth || a.name.localeCompare(b.name, 'ru'));
  const links = window.RELATIONSHIPS;
  const groups = window.WRITER_GROUPS;
  const ANI_NAMES = new Set([
    'Михаил Ломоносов','Екатерина II','Николай Карамзин','Александр Пушкин',
    'Михаил Лермонтов','Николай Гоголь','Иван Тургенев','Фёдор Достоевский',
    'Лев Толстой','Антон Чехов','Максим Горький','Александр Куприн',
    'Владимир Маяковский','Михаил Булгаков','Александр Солженицын',
    'Борис Пастернак','Владимир Набоков','Юрий Трифонов','Виктор Астафьев',
    'Людмила Улицкая','Борис Васильев','Дмитрий Быков'
  ]);
  const aniWriters = writers.filter(writer => ANI_NAMES.has(writer.name));
  if (aniWriters.length !== ANI_NAMES.size) throw new Error('Имя из списка Ани отсутствует в данных');
  const PERIODS = [
    {name:'XVIII век',short:'XVIII',start:1700,end:1800},
    {name:'XIX век',short:'XIX',start:1800,end:1900},
    {name:'Начало ХХ века',short:'XX',start:1900,end:1920},
    {name:'Советский период',short:'СССР',start:1920,end:1991},
    {name:'Современность',short:'сейчас',start:1991,end:2026}
  ];
  const byName = new Map(writers.map((writer) => [writer.name, writer]));
  let listMode = 'ani';
  const listedWriters = () => listMode === 'ani' ? aniWriters : writers;
  const activeTypes = new Set(Object.keys(TYPES));
  const search = document.getElementById('search');
  const filters = document.getElementById('filters');
  const groupLegend = document.getElementById('group-legend');
  const rows = document.getElementById('rows');
  const svg = document.getElementById('connections');
  const body = document.getElementById('chart-body');
  const tooltip = document.getElementById('hover-card');
  const detailTitle = document.getElementById('detail-title');
  const detailText = document.getElementById('detail-text');
  const detailSource = document.getElementById('detail-source');
  let selectedWriter = null;
  let hoveredWriter = null;
  let hoveredLink = null;
  let visible = aniWriters;
  let drawn = [];

  function percent(year) { return (year - START) / (END - START) * 100; }
  function yearsOf(writer) { return `${writer.birth}—${writer.death ?? 'н. в.'}`; }

  const axis = document.getElementById('axis');
  PERIODS.forEach((period, index) => {
    const band = document.createElement('div');
    band.className = `period-band era-${index}`;
    band.style.left = percent(period.start) + '%';
    band.style.width = (percent(period.end) - percent(period.start)) + '%';
    band.title = period.end === END ? `${period.name} (${period.start}–наше время)` : `${period.name} (${period.start}–${period.end})`;
    const label = document.createElement('span');
    label.textContent = period.short;
    band.appendChild(label);
    axis.appendChild(band);
  });
  for (const year of [1700,1750,1800,1850,1900,1920,1950,1991,2026]) {
    const mark = document.createElement('div');
    mark.className = 'axis-mark' + (year === END ? ' last' : '');
    mark.style.left = percent(year) + '%';
    const label = document.createElement('span');
    label.textContent = year;
    mark.appendChild(label);
    axis.appendChild(mark);
  }

  for (const group of Object.values(groups)) {
    const item = document.createElement('span');
    item.className = 'group-legend-item';
    item.style.setProperty('--group-color', group.color);
    item.textContent = group.label;
    groupLegend.insertBefore(item, groupLegend.querySelector('.group-legend-note'));
  }

  for (const [type, color] of Object.entries(TYPES)) {
    const button = document.createElement('button');
    button.className = 'filter-btn active';
    button.type = 'button';
    button.textContent = type;
    button.style.setProperty('--c', color);
    button.setAttribute('aria-pressed', 'true');
    button.addEventListener('click', () => {
      if (activeTypes.has(type)) activeTypes.delete(type);
      else activeTypes.add(type);
      button.classList.toggle('active', activeTypes.has(type));
      button.setAttribute('aria-pressed', String(activeTypes.has(type)));
      drawLinks();
    });
    filters.appendChild(button);
  }

  function selectWriter(name) {
    selectedWriter = selectedWriter === name ? null : name;
    hoveredLink = null;
    tooltip.hidden = true;
    const listNames = new Set(listedWriters().map(writer => writer.name));
    const related = links.filter(link => listNames.has(link.a) && listNames.has(link.b) && (link.a === selectedWriter || link.b === selectedWriter));
    if (selectedWriter) {
      detailTitle.textContent = selectedWriter;
      const chosen = byName.get(selectedWriter);
      const contemporaries = listedWriters().filter(other => other !== chosen && other.birth <= (chosen.death ?? END) && (other.death ?? END) >= chosen.birth).length;
      if (related.length) {
        const people = related.map(link => link.a === selectedWriter ? link.b : link.a);
        detailText.textContent = `Современников в таблице: ${contemporaries}. Документированных связей в выбранном списке: ${related.length} (${people.join(', ')}). Наведите курсор или нажмите на дугу, чтобы узнать подробности.`;
      } else detailText.textContent = `Современников в таблице: ${contemporaries}. Для этого автора пока нет связи в нашей проверенной выборке.`;
    } else {
      detailTitle.textContent = 'Выберите дугу на шкале';
      detailText.textContent = 'Подсказка покажет краткую историю при наведении. Нажмите на дугу, чтобы открыть ссылку на источник здесь.';
    }
    detailSource.hidden = true;
    updateHighlight();
  }

  function showLink(link) {
    selectedWriter = null;
    detailTitle.textContent = `${link.a} и ${link.b}`;
    detailText.textContent = link.text;
    detailSource.href = link.source;
    detailSource.hidden = false;
    updateHighlight();
  }

  function renderRows() {
    const term = search.value.trim().toLocaleLowerCase('ru');
    const base = listedWriters();
    visible = base.filter(writer => writer.name.toLocaleLowerCase('ru').includes(term));
    if (selectedWriter && !visible.some(writer => writer.name === selectedWriter)) selectedWriter = null;
    rows.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const writer of visible) {
      const row = document.createElement('div');
      row.className = 'writer-row';
      row.dataset.name = writer.name;
      const rel = document.createElement('div');
      rel.className = 'rel-cell';
      const nameCell = document.createElement('div');
      nameCell.className = 'name-cell';
      const name = document.createElement('button');
      name.className = 'name-btn';
      name.type = 'button';
      name.textContent = writer.name;
      name.title = writer.note || `Выделить связи: ${writer.name}`;
      name.setAttribute('aria-label', `Выделить связи: ${writer.name}`);
      name.addEventListener('click', () => selectWriter(writer.name));
      nameCell.appendChild(name);
      if (writer.note) {
        const dot = document.createElement('span');
        dot.className = 'role-dot';
        dot.textContent = '·';
        dot.title = writer.note;
        nameCell.appendChild(dot);
      }
      const years = document.createElement('div');
      years.className = 'years-cell';
      years.textContent = yearsOf(writer);
      const track = document.createElement('div');
      track.className = 'track';
      PERIODS.forEach((period, index) => {
        const region = document.createElement('div');
        region.className = `period-region era-${index}`;
        region.style.left = percent(period.start) + '%';
        region.style.width = (percent(period.end) - percent(period.start)) + '%';
        region.title = period.end === END ? `${period.name}: ${period.start}–наше время` : `${period.name}: ${period.start}–${period.end}`;
        track.appendChild(region);
      });
      const bar = document.createElement('div');
      bar.className = 'bar' + (writer.death === null ? ' living' : '');
      bar.style.setProperty('--bar-color', groups[writer.group].color);
      bar.style.left = percent(writer.birth) + '%';
      bar.style.width = (percent(writer.death ?? END) - percent(writer.birth)) + '%';
      bar.title = `${writer.name}: ${yearsOf(writer)} · ${groups[writer.group].label}`;
      track.appendChild(bar);
      row.append(rel, nameCell, years, track);
      name.addEventListener('mouseenter', () => { hoveredWriter = writer.name; updateHighlight(); });
      name.addEventListener('mouseleave', () => { hoveredWriter = null; updateHighlight(); });
      fragment.appendChild(row);
    }
    rows.appendChild(fragment);
    document.getElementById('visible-count').textContent = term ? `Найдено: ${visible.length} из ${base.length}` : `${base.length} строк · сортировка по году рождения`;
    drawLinks();
  }

  function svgElement(tag, attributes) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function showTooltip(link, event, midpoint) {
    hoveredLink = link;
    const edge = drawn.find(item => item.link === link);
    if (edge && svg.lastChild !== edge.group) svg.appendChild(edge.group);
    tooltip.replaceChildren();
    const kind = document.createElement('small'); kind.textContent = link.type;
    const heading = document.createElement('strong'); heading.textContent = `${link.a} и ${link.b}`;
    const copy = document.createElement('span'); copy.textContent = link.text;
    tooltip.append(kind, heading, copy);
    tooltip.hidden = false;
    const rectangle = body.getBoundingClientRect();
    const fromMouse = event && event.clientY;
    const x = fromMouse ? event.clientX - rectangle.left + 18 : GUTTER + 2;
    const y = fromMouse ? event.clientY - rectangle.top + 10 : midpoint;
    tooltip.style.left = Math.min(Math.max(12, x), rectangle.width - 315) + 'px';
    tooltip.style.top = Math.min(Math.max(0, y), Math.max(0, body.offsetHeight - tooltip.offsetHeight - 8)) + 'px';
    updateHighlight();
  }

  function routeLinks(shown, index) {
    const routes = shown.map(link => {
      const first = index.get(link.a);
      const second = index.get(link.b);
      return {link, top:Math.min(first, second), bottom:Math.max(first, second), span:Math.abs(second - first)};
    }).sort((a, b) => b.span - a.span || a.top - b.top);

    const placed = [];
    for (const route of routes) {
      // Длинные связи уходят левее, а перекрывающиеся по высоте получают разные дорожки.
      const ideal = Math.min(132, 18 + 20 * Math.log2(route.span + 1));
      let bestReach = 18;
      let bestScore = Infinity;
      for (let reach = 18; reach <= 132; reach += 3) {
        let score = Math.abs(reach - ideal) * .4;
        for (const other of placed) {
          if (Math.min(route.bottom, other.bottom) <= Math.max(route.top, other.top)) continue;
          const gap = Math.abs(reach - other.reach);
          if (gap < 10) score += (10 - gap) ** 2 * 3;
        }
        if (score < bestScore) { bestScore = score; bestReach = reach; }
      }
      route.reach = bestReach;
      placed.push(route);
    }
    return placed;
  }

  function drawLinks() {
    tooltip.hidden = true;
    hoveredLink = null;
    svg.replaceChildren();
    const index = new Map(visible.map((writer, i) => [writer.name, i]));
    const shown = links.filter(link => activeTypes.has(link.type) && index.has(link.a) && index.has(link.b));
    const height = visible.length * ROW;
    svg.setAttribute('viewBox', `0 0 ${GUTTER} ${Math.max(height, 1)}`);
    svg.setAttribute('height', height);
    svg.style.height = height + 'px';
    drawn = [];
    document.getElementById('total-writers').textContent = visible.length;
    document.getElementById('total-links').textContent = shown.length;
    routeLinks(shown, index).forEach(route => {
      const {link, span, reach} = route;
      const y1 = route.top * ROW + ROW / 2;
      const y2 = route.bottom * ROW + ROW / 2;
      const bend = EDGE_X - reach / .75;
      const handle = Math.min(ROW * .9, (y2 - y1) * .22);
      const d = `M ${EDGE_X} ${y1} C ${bend.toFixed(1)} ${(y1 + handle).toFixed(1)}, ${bend.toFixed(1)} ${(y2 - handle).toFixed(1)}, ${EDGE_X} ${y2}`;
      const strokeWidth = (1.65 + Math.min(.7, Math.log2(span + 1) * .14)).toFixed(2);
      const group = svgElement('g', {'style': `--edge-color:${TYPES[link.type]};--edge-width:${strokeWidth}px`});
      const halo = svgElement('path', {'d':d,'class':'edge-halo'});
      const line = svgElement('path', {'d':d,'class':'edge-line'});
      const hit = svgElement('path', {'d':d,'class':'edge-hit','tabindex':'0','role':'button','aria-label':`${link.a} и ${link.b}. ${link.type}. ${link.text}`});
      const end1 = svgElement('circle', {'cx':EDGE_X,'cy':y1,'r':'2.4','class':'edge-end'});
      const end2 = svgElement('circle', {'cx':EDGE_X,'cy':y2,'r':'2.4','class':'edge-end'});
      hit.addEventListener('mouseenter', event => showTooltip(link, event, (y1 + y2) / 2));
      hit.addEventListener('mousemove', event => showTooltip(link, event, (y1 + y2) / 2));
      hit.addEventListener('mouseleave', () => { tooltip.hidden = true; hoveredLink = null; updateHighlight(); });
      hit.addEventListener('focus', () => showTooltip(link, null, (y1 + y2) / 2));
      hit.addEventListener('blur', () => { tooltip.hidden = true; hoveredLink = null; updateHighlight(); });
      hit.addEventListener('click', () => showLink(link));
      hit.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showLink(link); } });
      group.append(halo, line, hit, end1, end2);
      svg.appendChild(group);
      drawn.push({link,group,halo,line,hit,end1,end2});
    });
    updateHighlight();
  }

  function updateHighlight() {
    const focus = hoveredWriter || selectedWriter;
    for (const row of rows.children) {
      row.classList.toggle('is-selected', row.dataset.name === focus);
      row.classList.toggle('dimmed', !!focus && row.dataset.name !== focus);
    }
    for (const edge of drawn) {
      const highlight = edge.link === hoveredLink || !!focus && (edge.link.a === focus || edge.link.b === focus);
      const muted = (!!focus || !!hoveredLink) && !highlight;
      edge.line.classList.toggle('highlighted', highlight);
      edge.line.classList.toggle('muted', muted);
      edge.halo.classList.toggle('highlighted', highlight);
      edge.halo.classList.toggle('muted', muted);
      const inactive = !!selectedWriter && edge.link.a !== selectedWriter && edge.link.b !== selectedWriter;
      edge.hit.classList.toggle('inactive', inactive);
      edge.hit.setAttribute('tabindex', inactive ? '-1' : '0');
      edge.end1.classList.toggle('muted', muted);
      edge.end2.classList.toggle('muted', muted);
      edge.end1.classList.toggle('highlighted', highlight);
      edge.end2.classList.toggle('highlighted', highlight);
    }
  }

  search.addEventListener('input', renderRows);
  document.querySelectorAll('input[name="writer-list"]').forEach(input => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      listMode = input.value;
      search.value = '';
      selectedWriter = null;
      hoveredWriter = null;
      detailTitle.textContent = 'Выберите дугу на шкале';
      detailText.textContent = 'Подсказка покажет краткую историю при наведении. Нажмите на дугу, чтобы открыть ссылку на источник здесь.';
      detailSource.hidden = true;
      renderRows();
    });
  });
  document.getElementById('download').addEventListener('click', () => {
    const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
    const lines = [['Писатель','Год рождения','Год смерти','Группа','Примечание'], ...listedWriters().map(w => [w.name,w.birth,w.death ?? 'жив(а)',groups[w.group].label,w.note])];
    const csv = '\uFEFF' + lines.map(line => line.map(quote).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = listMode === 'ani' ? 'writers_ani.csv' : 'writers_extended.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Проверка ссылок и временной согласованности данных при разработке.
  for (const link of links) {
    if (!byName.has(link.a) || !byName.has(link.b)) console.warn('Неизвестное имя в связи:', link);
    if (!TYPES[link.type]) console.warn('Неизвестный тип связи:', link);
  }
  renderRows();
})();
